import { attentionTask, currentIntervention } from '../../application/orchestration/organizer/OrganizerFollowUp';
import { executionAttempts, retryableTask } from '../../domain/orchestration/taskAttempts';
import type { TeamRun } from '../../domain/orchestration';
import { nextReadyTask } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import type { TeamConversationJournal } from './TeamConversationJournal';
import type { AgentService } from '../management/AgentService';
import type { RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';
import type { ConversationOrchestrationView, OrchestrationChange } from '../../shared/orchestration-api';

export class OrchestrationViews {
  private checking = new Set<string>();
  async setChecking(snapshot: RehydratedOrchestration, value: boolean): Promise<void> { if (value) this.checking.add(snapshot.state.run.id); else this.checking.delete(snapshot.state.run.id); await this.publish(snapshot); }
  private listeners = new Set<(change: OrchestrationChange) => void>();
  private pending: Promise<void> = Promise.resolve();
  constructor(private agents: Pick<AgentService, 'getAgents'>, private journal?: TeamConversationJournal, private legacyRetry: (run: TeamRun) => Promise<boolean> = async () => false, private conditionalRetry: (snapshot: RehydratedOrchestration, task: import('../../domain/orchestration').AgentTask) => boolean = () => false) {}
  async project(snapshot: RehydratedOrchestration | null): Promise<ConversationOrchestrationView> {
    if (!snapshot) return { run: null, plan: null, tasks: [] };
    const agents = await this.agents.getAgents().catch(() => []);
    const { run, tasks } = snapshot.state, plan = snapshot.currentPlan;
    const name = (id: string): string => agents.find(agent => agent.id === id)?.name ?? 'Unavailable agent';
    const order = plan?.taskIds ?? tasks.map(task => task.id);
    const legacy = tasks.some(task => task.status === 'failed' && !task.attempts?.length && !task.session) ? await this.legacyRetry(run).catch(() => false) : false;
    const retry = run.status === 'running' && !tasks.some(task => task.status === 'working') ? order.map(id => tasks.find(task => task.id === id)).find(task => task && (retryableTask(task, legacy) || this.conditionalRetry(snapshot, task))) : null;
    const attention = attentionTask(snapshot.state), intervention = currentIntervention(snapshot.state);
    const evaluating = intervention?.status === 'pending';
    return {
      followUp: { evaluating, canAsk: !!agents.find(agent => agent.id === run.organizerAgentId)?.enabled && !!attention && !intervention && run.status === 'running' && !!run.organizerSession && !tasks.some(task => task.status === 'working'), canContinueTask: !this.checking.has(run.id) && !!attention?.session && intervention?.status === 'applied' && intervention.decision?.type === 'continue_task' && intervention.sourceTaskRevision === (attention.revision ?? 1), waitingInput: intervention?.status === 'applied' && intervention.decision?.type === 'ask_user', failed: intervention?.status === 'failed' || intervention?.status === 'cancelled' },
      ...(this.journal ? { conversation: await this.journal.read(run.conversationId) } : {}),
      run: { canContinue: !!run.organizerSession && !tasks.length && ['waiting_input', 'completed', 'failed', 'cancelled'].includes(run.status), id: run.id, status: run.status, goal: run.goal, organizerAgentId: run.organizerAgentId, organizerName: name(run.organizerAgentId), createdAt: run.createdAt, updatedAt: run.updatedAt },
      execution: { checking: this.checking.has(run.id), canStart: !evaluating && !attention && !!nextReadyTask(snapshot.state), activeTaskId: tasks.find(task => task.status === 'working')?.id ?? null, hasExecuted: tasks.some(task => !!task.startedAt), retry: retry ? { attempt: executionAttempts(retry).length, message: retry.execution?.summary ?? 'Execution was interrupted.' } : null },
      plan: plan ? { id: plan.id, version: plan.version, summary: plan.summary } : null,
      tasks: order.flatMap(id => {
        const task = tasks.find(task => task.id === id); if (!task) return [];
        const pending = task.dependsOn.filter(id => tasks.find(task => task.id === id)?.status !== 'completed');
        const avatar = agents.find(agent => agent.id === task.ownerAgentId)?.avatar;
        return [{ id: task.id, title: task.title, status: task.status,
          assignee: { id: task.ownerAgentId, name: name(task.ownerAgentId), ...(avatar?.type === 'builtin' ? { avatar: avatar.value } : {}) },
          dependsOn: [...task.dependsOn], ...(pending.length ? { dependencySummary: `Waiting for ${pending.length} ${pending.length === 1 ? 'task' : 'tasks'}` } : {}) }];
      }),
    };
  }
  publish(snapshot: RehydratedOrchestration): Promise<void> {
    this.pending = this.pending.catch(() => undefined).then(async () => {
      const change = { conversationId: snapshot.state.run.conversationId, view: await this.project(snapshot) };
      for (const listener of this.listeners) { try { listener(structuredClone(change)); } catch { /* Listener isolation. */ } }
    });
    return this.pending;
  }
  subscribe(listener: (change: OrchestrationChange) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
}
