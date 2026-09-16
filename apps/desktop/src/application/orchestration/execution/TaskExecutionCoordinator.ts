import { AgentRuntimeError } from '../../runtime/AgentRuntimeError';
import { retryableTask, runtimePreparationRetryCandidate } from '../../../domain/orchestration/taskAttempts';
import type { ExecutionFailure, ExecutionPhase } from '../../../domain/orchestration/models';
import { applyOrchestrationCommand } from '../../../domain/orchestration';
import type { AgentTask, OrchestrationCommand, OrchestrationState, TeamRun } from '../../../domain/orchestration';
import type { OrchestrationRepository } from '../OrchestrationRepository';
import type { TeamPromptSource } from '../TeamPromptSource';
import { TaskExecutionError, type AgentTaskExecutor } from './AgentTaskExecutor';
export interface TaskWorkspaces {
  prepare(run: TeamRun, baseBranch: string, projectPath: string, retry?: boolean): Promise<string>;
  retryablePreparation?(run: TeamRun, projectPath: string): Promise<boolean>;
  changedFiles(cwd: string): Promise<readonly string[]>;
}
export function nextReadyTask(state: OrchestrationState): AgentTask | undefined {
  if (state.run.status !== 'running' || state.tasks.some(task => task.status === 'working')) return;
  return state.plans.at(-1)?.taskIds.map(id => state.tasks.find(task => task.id === id)).find(task => task?.status === 'ready' && task.dependsOn.every(id => state.tasks.find(dependency => dependency.id === id)?.status === 'completed'));
}
export interface ConditionalRetryCheck {
 check(context: { run: TeamRun; task: AgentTask; agent: import('../TeamPromptSource').PlanningAgent; projectPath: string; branch: string }, signal: AbortSignal): Promise<{ cwd: string; runtimeIdentity: { sourceId: string; version: string } }>;
}
export class TaskExecutionCoordinator {
  private active = new Map<string, Promise<void>>();
  constructor(private repository: OrchestrationRepository, private source: TeamPromptSource, private workspaces: TaskWorkspaces,
    private executor: Pick<AgentTaskExecutor, 'execute' | 'assertSupported'>, private clock: { now(): string; newId(): string }, private conditionalRetry?: ConditionalRetryCheck) {}
  execute(runId: string, signal: AbortSignal, retry = false): Promise<void> {
    const existing = this.active.get(runId); if (existing) return existing;
    const operation = Promise.resolve().then(() => this.perform(runId, signal, retry)).finally(() => this.active.delete(runId)); this.active.set(runId, operation); return operation;
  }
  private change(runId: string, agentId: string, command: OrchestrationCommand) {
    return this.repository.update(runId, state => applyOrchestrationCommand(state, command, { id: this.clock.newId(), agentId, occurredAt: this.clock.now() }));
  }
  async retryCandidate(runId: string) {
    const snapshot = await this.repository.rehydrate(runId);
    if (snapshot.state.run.status !== 'running' || snapshot.state.tasks.some(task => task.status === 'working')) return null;
    const legacy = snapshot.state.tasks.some(task => task.status === 'failed' && !task.attempts?.length && !task.session)
      ? await this.legacyRetry(snapshot.state.run) : false;
    const task = snapshot.currentPlan?.taskIds.map(id => snapshot.state.tasks.find(task => task.id === id)).find(task => task && (retryableTask(task, legacy) || !!this.conditionalRetry && runtimePreparationRetryCandidate(task)));
    return task ? { task, legacy, conditional: runtimePreparationRetryCandidate(task) } : null;
  }
  async legacyRetry(run: TeamRun): Promise<boolean> {
    const project = await this.source.getProject(run.projectId);
    return !!project && !!await this.workspaces.retryablePreparation?.(run, project.path);
  }
  private async perform(runId: string, signal: AbortSignal, retry: boolean): Promise<void> {
    const snapshot = await this.repository.rehydrate(runId), { run } = snapshot.state;
    const candidate = retry ? await this.retryCandidate(runId) : null;
    if (retry && !candidate) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
    const task = retry ? candidate?.task : nextReadyTask(snapshot.state); if (!task || !snapshot.currentPlan) throw new TaskExecutionError('NO_READY_TASK');
    const team = await this.source.getTeam(run.teamId), agent = (await this.source.getAgents()).find(agent => agent.id === task.ownerAgentId);
    if (!team?.agentIds.includes(task.ownerAgentId) || !agent?.enabled) throw new TaskExecutionError('OWNER_UNAVAILABLE');
    this.executor.assertSupported(agent);
    const conversation = await this.source.getConversation(run.conversationId), project = await this.source.getProject(run.projectId);
    if (!conversation || !project || conversation.projectId !== run.projectId) throw new TaskExecutionError('UNSAFE_WORKTREE');
    if (signal.aborted) return;
    if (!task.dependsOn.every(id => snapshot.state.tasks.find(task => task.id === id)?.status === 'completed')) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
    const prepared = candidate?.conditional ? await this.conditionalRetry!.check({ run, task, agent, projectPath: project.path, branch: conversation.branchName }, signal) : undefined;
    if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED');
    if (prepared) {
      const currentTeam = await this.source.getTeam(run.teamId), currentAgent = (await this.source.getAgents()).find(item => item.id === agent.id);
      if (!currentTeam?.agentIds.includes(agent.id) || !currentAgent?.enabled || JSON.stringify(currentAgent) !== JSON.stringify(agent) || (await this.source.getProject(run.projectId))?.path !== project.path) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
      if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED');
      await this.repository.update(runId, state => {
        if (JSON.stringify(state) !== JSON.stringify(snapshot.state)) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
        const decision = { id: this.clock.newId(), agentId: run.organizerAgentId, occurredAt: this.clock.now() };
        const retried = applyOrchestrationCommand(state, { type: 'task.retry', taskId: task.id, verifiedRuntimePreparationFailure: true }, decision);
        const started = applyOrchestrationCommand(retried.state, { type: 'task.transition', taskId: task.id, status: 'working' }, { ...decision, id: this.clock.newId(), agentId: agent.id });
        return { state: started.state, events: [...retried.events, ...started.events] };
      });
    }
    if (retry && !prepared) await this.change(runId, run.organizerAgentId, { type: 'task.retry', taskId: task.id, verifiedLegacyPreparationFailure: candidate!.legacy });
    if (!prepared) await this.change(runId, agent.id, { type: 'task.transition', taskId: task.id, status: 'working' });
    const started = Date.now(); let cwd: string | undefined; let phase: ExecutionPhase = 'worktree_preparation';
    try {
      cwd = prepared?.cwd ?? await this.workspaces.prepare(run, conversation.branchName, project.path, retry);
      if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED');
      phase = 'runtime_preparation';
      await this.change(runId, agent.id, { type: 'task.execution_phase', taskId: task.id, phase });
      const result = await this.executor.execute({ run, plan: snapshot.currentPlan, task, agent, cwd, ...(prepared ? { runtimeIdentity: prepared.runtimeIdentity } : {}),
        dependencies: snapshot.state.tasks.filter(dependency => task.dependsOn.includes(dependency.id)) }, signal,
        async session => { if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED'); await this.change(runId, agent.id, { type: 'task.set_session', taskId: task.id, session }); },
        async () => { if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED'); phase = 'model_execution'; await this.change(runId, agent.id, { type: 'task.execution_phase', taskId: task.id, phase }); });
      const changedFiles = await this.workspaces.changedFiles(cwd);
      if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED');
      await this.change(runId, agent.id, { type: 'task.finish', taskId: task.id, status: result.status, ...(result.status === 'blocked' ? { reason: 'AGENT_BLOCKED' } : {}),
        report: { summary: result.summary, evidence: result.evidence, changedFiles, durationMs: Date.now() - started, agentName: agent.name } });
    } catch (error) {
      const saved = await this.repository.rehydrate(runId);
      if (saved.state.tasks.find(value => value.id === task.id)?.status !== 'working') return; // First terminal transition wins.
      const failure = executionFailure(error, phase, signal.aborted);
      const changedFiles = cwd ? await this.workspaces.changedFiles(cwd).catch(() => []) : [];
      await this.change(runId, agent.id, { type: 'task.finish', taskId: task.id, status: signal.aborted ? 'cancelled' : 'failed', reason: failure, failure,
        report: { summary: signal.aborted ? 'Task execution stopped. Partial changes were preserved.' : !cwd ? 'The isolated workspace could not be prepared. The agent was not started.' : 'Task execution could not finish. Inspect the preserved work before trying again.', evidence: [], changedFiles, durationMs: Date.now() - started, agentName: agent.name } });
    }
    const final = await this.repository.rehydrate(runId);
    if (final.state.tasks.every(task => task.status === 'completed')) await this.change(runId, run.organizerAgentId, { type: 'run.transition', status: 'completed' });
  }
  async recover(): Promise<void> {
    for (const run of await this.repository.listAllRuns()) {
      const snapshot = await this.repository.rehydrate(run.id);
      for (const task of snapshot.state.tasks.filter(task => task.status === 'working')) {
        await this.change(run.id, task.ownerAgentId, { type: 'task.finish', taskId: task.id, status: 'failed', reason: 'EXECUTION_INTERRUPTED', failure: 'EXECUTION_INTERRUPTED', report: {
          summary: 'Task execution was interrupted. Partial work was preserved; no automatic retry was started.', evidence: [], changedFiles: [], durationMs: 0, agentName: (await this.source.getAgents()).find(a => a.id === task.ownerAgentId)?.name ?? 'Agent' } });
      }
    }
  }
}

export function executionFailure(error: unknown, phase: ExecutionPhase, cancelled: boolean): ExecutionFailure {
  if (error instanceof TaskExecutionError && error.code === 'UNSAFE_WORKTREE') return 'SECURITY_VIOLATION';
  if (error instanceof AgentRuntimeError && ['UNEXPECTED_TOOL_REQUEST','RUNTIME_CAPABILITY_MISSING','RUNTIME_NOT_SUPPORTED'].includes(error.code)) return 'SECURITY_VIOLATION';
  if (error instanceof TaskExecutionError && error.code === 'EXECUTION_FAILED' || error instanceof AgentRuntimeError && ['INVALID_STRUCTURED_RESULT','RUNTIME_PROTOCOL_ERROR'].includes(error.code)) return 'VALIDATION_FAILED';
  if (cancelled) return 'EXECUTION_INTERRUPTED';
  if (phase === 'worktree_preparation' && error instanceof TaskExecutionError && error.code === 'WORKTREE_PREPARATION_FAILED') return 'WORKTREE_PREPARATION_FAILED';
  if (phase === 'runtime_preparation' && error instanceof AgentRuntimeError && ['RUNTIME_NOT_READY','RUNTIME_TIMEOUT','RUNTIME_PROCESS_EXITED'].includes(error.code)) return 'RUNTIME_PREPARATION_FAILED';
  return 'RUNTIME_FAILED';
}
