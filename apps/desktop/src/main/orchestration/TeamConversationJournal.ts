import { randomUUID } from 'node:crypto';
import type { ConversationStore } from '../chat/ConversationRepository';
import { conversationDetail, conversationTitle } from '../chat/ConversationRepository';
import type { AgentService } from '../management/AgentService';
import type { MainTeamPromptSource } from './MainTeamPromptSource';
import type { RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';
type VisibleReply = { type: 'respond' | 'ask_user' | 'plan_created'; message: string; questions?: readonly string[] };
import { OrchestrationBoundaryError } from './OrchestrationBoundaryError';

export class TeamConversationJournal {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private store: Pick<ConversationStore, 'get' | 'save'>, private source: MainTeamPromptSource, private agents: Pick<AgentService, 'getAgents'>) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.catch(() => undefined).then(operation); this.queue = result; return result; }
  async create(projectId: string, branch: string, teamId: string) {
    const project = await this.source.getProject(projectId); await this.source.validateTeam(teamId);
    if (project.selectedBranch !== branch || await this.source.getSelectedProjectId() !== projectId) throw new OrchestrationBoundaryError('BRANCH_NOT_FOUND');
    const team = await this.source.getTeam(teamId), agent = (await this.agents.getAgents()).find(agent => agent.id === team.organizerAgentId)!;
    const now = new Date().toISOString();
    const record = { mode: 'team' as const, id: randomUUID(), projectId, branchName: branch, teamId, leadAgentId: agent.id,
      title: 'New task', status: 'completed' as const, interrupted: false, createdAt: now, updatedAt: now, messages: [], codexThreadId: null,
      agentDefinition: structuredClone(agent), agentSnapshot: { id: agent.id, name: agent.name, avatar: structuredClone(agent.avatar) } };
    await this.store.save(record); return conversationDetail(record);
  }
  async assertTeam(id: string, teamId: string) {
    const record = await this.store.get(id);
    if (record.mode !== 'team' || record.teamId !== teamId) throw new OrchestrationBoundaryError('TEAM_NOT_RUNNABLE');
  }
  user(id: string, message: string): Promise<void> {
    return this.serial(async () => {
      const record = await this.store.get(id);
      if (!record.messages.length) record.title = conversationTitle(message);
      const now = new Date().toISOString(); record.updatedAt = now; record.interrupted = false;
      record.messages.push({ id: randomUUID(), role: 'user', content: message, agentId: null, createdAt: now, status: 'completed' });
      await this.store.save(record);
    });
  }
  async read(id: string) { return conversationDetail(await this.store.get(id)); }
  sync(snapshot: RehydratedOrchestration, reply?: VisibleReply): Promise<void> {
    return this.serial(async () => {
      const run = snapshot.state.run, record = await this.store.get(run.conversationId);
      if (record.mode !== 'team') return;
      record.status = run.status === 'planning' ? 'running' : run.status === 'failed' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : 'completed';
      record.updatedAt = run.updatedAt;
      const recovery = snapshot.events.some(event => event.type === 'run.failed' && event.reason === 'PLANNING_INTERRUPTED');
      record.interrupted = recovery;
      if (reply) {
        const id = `${run.id}:reply:${[...record.messages].reverse().find(message => message.role === 'user')?.id ?? 'initial'}`;
        if (!record.messages.some(message => message.id === id)) record.messages.push({ id, role: 'agent', agentId: record.leadAgentId,
          content: reply.message + (reply.type === 'ask_user' ? '\n\n' + (reply.questions ?? []).map(question => '- ' + question).join('\n') : ''),
          ...(reply.type === 'plan_created' ? { planRunId: run.id } : {}), createdAt: run.updatedAt, status: 'completed' });
      } else if (run.status === 'failed' || run.status === 'cancelled') {
        const id = run.id + ':error';
        if (!record.messages.some(message => message.id === id)) record.messages.push({ id, role: 'system', agentId: null,
          content: recovery ? 'Planning was interrupted. Send the request again.' : run.status === 'cancelled' ? 'Planning stopped.' : 'Planning could not finish. Send the request again.',
          createdAt: run.updatedAt, status: run.status });
      }
      await this.store.save(record);
    });
  }
}

