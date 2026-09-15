import { applyOrchestrationCommand, createTeamRun, type AgentTask, type ExecutionPlan, type OrchestrationCommand, type TeamRun } from '../../domain/orchestration';
import type { AgentSessionReference } from '../../shared/agent-runtime';
import { AgentRuntimeError } from '../runtime/AgentRuntimeError';
import type { OrchestrationRepository, RehydratedOrchestration } from './OrchestrationRepository';
import { OrchestrationPersistenceError } from './OrchestrationPersistenceError';
import type { OrganizerDecisionExecutor } from './organizer/OrganizerDecisionExecutor';
import { createOrganizerRuntimeContext } from './organizer/OrganizerRuntimeContext';
import { validateOrganizerDecision } from './organizer/validateOrganizerDecision';
import type { TeamPromptSource } from './TeamPromptSource';
import { TeamPromptError } from './TeamPromptError';

export type TeamPromptResult =
  | Readonly<{ type: 'respond'; runId: string; message: string }>
  | Readonly<{ type: 'ask_user'; runId: string; message: string; questions: readonly string[] }>
  | Readonly<{ type: 'plan_created'; runId: string; message: string; plan: ExecutionPlan; tasks: readonly AgentTask[] }>;
export type TeamPromptRequest = Readonly<{ projectId: string; conversationId: string; teamId: string; prompt: string; signal?: AbortSignal }>;
type Executor = Pick<OrganizerDecisionExecutor, 'execute' | 'assertSupported'>;
type ClockAndIds = Readonly<{ now(): string; newId(): string }>;

/** No runtime protocol, disk access, or renderer contract belongs in this service. */
export class TeamPromptCoordinator {
  // Process-wide ownership prevents separate coordinator instances continuing one run twice.
  private static continuing = new Set<string>();
  constructor(private source: TeamPromptSource, private repository: OrchestrationRepository,
    private executor: Executor, private values: ClockAndIds) {}

  private decision(agentId: string) {
    return { id: this.values.newId(), agentId, occurredAt: this.values.now() };
  }
  private async resolve(request: Omit<TeamPromptRequest, 'signal'>) {
    if (!request.prompt.trim()) throw new TeamPromptError('INVALID_REQUEST');
    const selectedId = await this.source.getSelectedProjectId();
    const project = await this.source.getProject(request.projectId);
    if (!project || project.id !== request.projectId || selectedId !== project.id) throw new TeamPromptError('PROJECT_UNAVAILABLE');
    const conversation = await this.source.getConversation(request.conversationId);
    if (!conversation || conversation.id !== request.conversationId || conversation.projectId !== project.id) throw new TeamPromptError('CONVERSATION_UNAVAILABLE');
    const team = await this.source.getTeam(request.teamId), agents = await this.source.getAgents();
    if (!team || team.id !== request.teamId || team.agentIds.length < 2 || new Set(team.agentIds).size !== team.agentIds.length
      || !team.organizerAgentId || !team.agentIds.includes(team.organizerAgentId)
      || team.agentIds.some(id => agents.filter(agent => agent.id === id).length !== 1)) throw new TeamPromptError('INVALID_TEAM');
    const organizer = agents.find(agent => agent.id === team.organizerAgentId)!;
    if (!organizer.enabled) throw new TeamPromptError('ORGANIZER_DISABLED');
    try { this.executor.assertSupported(organizer.runtime.type); }
    catch { throw new TeamPromptError('RUNTIME_UNSUPPORTED'); }
    const context = createOrganizerRuntimeContext(team, agents, {
      userRequest: request.prompt, conversationId: conversation.id, projectId: project.id, projectName: project.name, branch: conversation.branchName,
    });
    return { context, organizer: structuredClone(organizer), cwd: project.path };
  }

  async start(request: TeamPromptRequest): Promise<TeamPromptResult> {
    request = { ...request };
    const resolved = await this.resolve(request);
    const result = createTeamRun({ id: this.values.newId(), conversationId: request.conversationId, projectId: request.projectId,
      teamId: request.teamId, organizerAgentId: resolved.organizer.id, goal: request.prompt }, this.decision(resolved.organizer.id));
    try { await this.repository.create(result); }
    catch { throw new TeamPromptError('PERSISTENCE_FAILED', result.state.run.id); }
    return this.execute(result.state.run, resolved, request.signal);
  }

  async continueRun(runId: string, userAnswer: string, signal?: AbortSignal): Promise<TeamPromptResult> {
    if (TeamPromptCoordinator.continuing.has(runId)) throw new TeamPromptError('RUN_BUSY', runId);
    TeamPromptCoordinator.continuing.add(runId);
    try {
      let saved: RehydratedOrchestration;
      try { saved = await this.repository.rehydrate(runId); }
      catch { throw new TeamPromptError('RUN_UNAVAILABLE', runId); }
      const run = saved.state.run;
      if (run.status !== 'waiting_input' && (!['completed', 'failed', 'cancelled'].includes(run.status) || saved.state.tasks.length || saved.state.plans.length)) throw new TeamPromptError('RUN_NOT_WAITING', runId);
      if (!run.organizerSession) throw new TeamPromptError('SESSION_UNAVAILABLE', runId);
      const resolved = await this.resolve({ projectId: run.projectId, conversationId: run.conversationId, teamId: run.teamId, prompt: userAnswer });
      if (resolved.organizer.id !== run.organizerAgentId || resolved.organizer.runtime.type !== run.organizerSession.runtime)
        throw new TeamPromptError('SESSION_UNAVAILABLE', runId);
      // The answer only enters the runtime context, never status reasons or event payloads.
      await this.apply(run, run.status === 'waiting_input' ? { type: 'run.transition', status: 'planning' } : { type: 'run.resume_planning' });
      return await this.execute(run, resolved, signal);
    } finally { TeamPromptCoordinator.continuing.delete(runId); }
  }

  private async apply(run: TeamRun, command: OrchestrationCommand) {
    try { return await this.repository.update(run.id, state => applyOrchestrationCommand(state, command, this.decision(run.organizerAgentId))); }
    catch (error) {
      if (error instanceof OrchestrationPersistenceError) throw new TeamPromptError('PERSISTENCE_FAILED', run.id);
      throw error;
    }
  }

  private async execute(run: TeamRun, resolved: Awaited<ReturnType<TeamPromptCoordinator['resolve']>>, signal?: AbortSignal): Promise<TeamPromptResult> {
    const activeSignal = signal ?? new AbortController().signal;
    let retained = run.organizerSession, acceptingSession = true, sessionError: unknown;
    const retain = async (session: AgentSessionReference): Promise<void> => {
      if (!acceptingSession) throw new TeamPromptError('SESSION_UNAVAILABLE', run.id);
      try {
        if (session.runtime !== resolved.organizer.runtime.type || !session.externalSessionId?.trim()
          || (retained && (retained.runtime !== session.runtime || retained.externalSessionId !== session.externalSessionId)))
          throw new TeamPromptError('SESSION_UNAVAILABLE', run.id);
        if (!retained) {
          await this.apply(run, { type: 'run.set_organizer_session', session });
          retained = { ...session };
        }
      } catch (error) { sessionError = error; throw error; }
    };
    try {
      if (activeSignal.aborted) throw new TeamPromptError('CANCELLED', run.id);
      const result = await this.executor.execute({ context: resolved.context, instruction: resolved.organizer.instructions,
        runtime: resolved.organizer.runtime.type, settings: { model: resolved.organizer.runtime.model, reasoningEffort: resolved.organizer.runtime.reasoningEffort },
        cwd: resolved.cwd, ...(retained ? { session: retained } : {}), signal: activeSignal, onSession: retain });
      if (sessionError) throw sessionError;
      await retain(result.session);
      if (activeSignal.aborted) throw new TeamPromptError('CANCELLED', run.id);
      const decision = validateOrganizerDecision(result.decision, resolved.context);
      if (decision.type === 'create_plan') {
        const ids = new Map(decision.tasks.map(task => [task.key, this.values.newId()]));
        const saved = await this.apply(run, { type: 'plan.initialize', id: this.values.newId(), summary: decision.planSummary,
          tasks: decision.tasks.map(task => ({ id: ids.get(task.key)!, title: task.title, description: task.description,
            assigneeAgentId: task.assigneeAgentId, dependsOn: task.dependsOn.map(key => ids.get(key)!),
            acceptanceCriteria: task.acceptanceCriteria, requiresReview: task.requiresReview })) });
        return { type: 'plan_created', runId: run.id, message: decision.message, plan: saved.currentPlan!, tasks: saved.state.tasks };
      }
      await this.apply(run, decision.type === 'respond' ? { type: 'run.respond' } : { type: 'run.transition', status: 'waiting_input' });
      return decision.type === 'respond' ? { type: 'respond', runId: run.id, message: decision.message }
        : { type: 'ask_user', runId: run.id, message: decision.message, questions: decision.questions };
    } catch (error) {
      const actual = sessionError ?? error;
      const failure = actual instanceof TeamPromptError ? actual
        : new TeamPromptError(activeSignal.aborted || (actual instanceof AgentRuntimeError && actual.code === 'RUNTIME_CANCELLED') ? 'CANCELLED' : 'RUNTIME_FAILED', run.id);
      await this.apply(run, { type: 'run.transition', status: failure.code === 'CANCELLED' ? 'cancelled' : 'failed', reason: failure.message });
      throw failure;
    } finally { acceptingSession = false; }
  }
}
