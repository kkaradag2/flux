import type { TeamConversationJournal } from './TeamConversationJournal';
import type { AgentService } from '../management/AgentService';
import type { RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';
import type { ConversationOrchestrationView, OrchestrationChange } from '../../shared/orchestration-api';

export class OrchestrationViews {
  private listeners = new Set<(change: OrchestrationChange) => void>();
  private pending: Promise<void> = Promise.resolve();
  constructor(private agents: Pick<AgentService, 'getAgents'>, private journal?: TeamConversationJournal) {}
  async project(snapshot: RehydratedOrchestration | null): Promise<ConversationOrchestrationView> {
    if (!snapshot) return { run: null, plan: null, tasks: [] };
    const agents = await this.agents.getAgents().catch(() => []);
    const { run, tasks } = snapshot.state, plan = snapshot.currentPlan;
    const name = (id: string): string => agents.find(agent => agent.id === id)?.name ?? 'Unavailable agent';
    const order = plan?.taskIds ?? tasks.map(task => task.id);
    return {
      ...(this.journal ? { conversation: await this.journal.read(run.conversationId) } : {}),
      run: { canContinue: !!run.organizerSession && !tasks.length && ['waiting_input', 'completed', 'failed', 'cancelled'].includes(run.status), id: run.id, status: run.status, goal: run.goal, organizerAgentId: run.organizerAgentId, organizerName: name(run.organizerAgentId), createdAt: run.createdAt, updatedAt: run.updatedAt },
      plan: plan ? { id: plan.id, version: plan.version, summary: plan.summary } : null,
      tasks: order.flatMap(id => {
        const task = tasks.find(task => task.id === id); if (!task) return [];
        const pending = task.dependsOn.filter(id => tasks.find(task => task.id === id)?.status !== 'completed');
        const avatar = agents.find(agent => agent.id === task.assigneeAgentId)?.avatar;
        return [{ id: task.id, title: task.title, status: task.status,
          assignee: { id: task.assigneeAgentId, name: name(task.assigneeAgentId), ...(avatar?.type === 'builtin' ? { avatar: avatar.value } : {}) },
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
