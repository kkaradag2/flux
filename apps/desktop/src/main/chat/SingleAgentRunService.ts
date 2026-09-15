import { WorktreeError, type ConversationWorktrees } from './ConversationWorktreeService';
import { randomUUID } from 'node:crypto';
import type { SingleAgentInput, SingleAgentEvent, RunIdentity } from '../../shared/single-agent-api';
import type { ConversationSummary, OpenConversationResult } from '../../shared/conversation-api';
import type { ProjectService } from '../projects/ProjectService';
import type { AgentService } from '../management/AgentService';
import type { TeamService } from '../management/TeamService';
import type { CodexRuntimeStateService } from '../runtime/CodexRuntimeStateService';
import { ChatThreadUnavailableError, type ChatSessionPort } from '../app-server/CodexChatSession';
import { SmokeTestError } from '../app-server/contracts';
import { ConversationCheckpoint } from './ConversationCheckpoint';
import { conversationId, conversationDetail, conversationSummary, conversationTitle, markInterrupted, ConversationStorageError, type Conversation, type ConversationStore } from './ConversationRepository';

const messages = {
  INVALID_INPUT: 'Choose a project, branch and team, and enter a prompt.',
  BUSY: 'A turn is already running. Stop it before opening another conversation.',
  RUNTIME_NOT_READY: 'Codex is not ready to use. Open Settings to check the runtime.',
  PROJECT_UNAVAILABLE: 'This project is unavailable. Select it again before sending.',
  AGENT_UNAVAILABLE: 'This team has no enabled agent. Enable an agent in Agents first.',
  CONTEXT_CHANGED: 'This conversation belongs to a different project, branch or team. Open it from history or start a New task.',
  SESSION_ENDED: 'The Codex session ended. Open the conversation from history to continue.',
  THREAD_UNAVAILABLE: 'The saved Codex thread could not be resumed. Your conversation history is still available. No new thread was created.',
  CONVERSATION_UNAVAILABLE: 'This conversation could not be loaded. Its saved files have been preserved.',
  STORAGE_FAILED: 'Conversation history could not be saved. The turn was stopped to protect your history.',
  TIMEOUT: 'Codex took too long to respond. You can retry from this conversation.',
  RUN_FAILED: 'Codex could not finish this turn. You can retry from this conversation.',
} as const;
export class SingleAgentError extends Error {
  constructor(public readonly code: keyof typeof messages) { super(messages[code]); }
}
export function singleAgentInput(value: unknown): SingleAgentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SingleAgentError('INVALID_INPUT');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 4 || Object.keys(data).some(key => !['projectId', 'branch', 'teamId', 'prompt'].includes(key))) throw new SingleAgentError('INVALID_INPUT');
  for (const key of ['projectId', 'branch', 'teamId', 'prompt']) {
    const text = data[key];
    if (typeof text !== 'string' || !text.trim() || text.includes('\0') || text.length > (key === 'prompt' ? 32000 : 250)) throw new SingleAgentError('INVALID_INPUT');
  }
  return { projectId: data.projectId as string, branch: data.branch as string, teamId: data.teamId as string, prompt: (data.prompt as string).trim() };
}
type Session = { id: string; session: ChatSessionPort | null; record: Conversation | null };
type ActiveRun = { owner: number; identity: RunIdentity; controller: AbortController; done: Promise<void> };
export class SingleAgentRunService {
  private conversations = new Map<number, Session>();
  private active: ActiveRun | null = null;
  private resetting = new Set<number>();
  private stopped = false;
  constructor(
    private projects: Pick<ProjectService, 'getProjects'>,
    private agents: Pick<AgentService, 'getAgents'>,
    private teams: Pick<TeamService, 'getTeam'>,
    private runtime: Pick<CodexRuntimeStateService, 'snapshot'>,
    private createSession: () => ChatSessionPort,
    private repository: ConversationStore,
    private worktrees: ConversationWorktrees,
    private timeoutMs = 120000,
  ) {}
  async getConversations(): Promise<ConversationSummary[]> {
    const registered = new Set((await this.projects.getProjects()).map(project => project.id));
    return (await this.repository.list()).filter(value => registered.has(value.projectId)).map(conversationSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async open(owner: number, value: unknown): Promise<OpenConversationResult> {
    let id: string;
    try { id = conversationId(value); } catch { throw new SingleAgentError('CONVERSATION_UNAVAILABLE'); }
    if (this.resetting.has(owner) || (this.active && (this.active.owner !== owner || this.active.identity.conversationId !== id))) throw new SingleAgentError('BUSY');
    this.resetting.add(owner);
    try {
      const current = this.conversations.get(owner);
      let record = this.active && current?.id === id ? current.record : await this.repository.get(id);
      if (!record) throw new SingleAgentError('CONVERSATION_UNAVAILABLE');
      const projectId = record.projectId;
      const project = (await this.projects.getProjects()).find(project => project.id === projectId);
      if (!project) throw new SingleAgentError('PROJECT_UNAVAILABLE');
      if (!this.active) {
        if (record.worktreeStatus === 'ready' && !await this.worktrees.inspect(record, project.path)) { record.worktreeStatus = 'missing'; await this.repository.save(record); }
        if (record.status === 'running') { record = markInterrupted(record); await this.repository.save(record); }
        await current?.session?.close();
        this.conversations.set(owner, { id, record, session: null });
      }
      return { conversation: conversationDetail(record), activeRun: this.active?.identity ?? null };
    } catch (error) { throw error instanceof SingleAgentError || error instanceof WorktreeError ? error : new SingleAgentError('CONVERSATION_UNAVAILABLE'); }
    finally { this.resetting.delete(owner); }
  }
  start(owner: number, value: unknown, emit: (event: SingleAgentEvent) => void): RunIdentity {
    const input = singleAgentInput(value);
    if (this.active || this.resetting.has(owner)) throw new SingleAgentError('BUSY');
    if (this.stopped) throw new SingleAgentError('SESSION_ENDED');
    const context = this.conversations.get(owner) ?? { id: randomUUID(), session: null, record: null };
    this.conversations.set(owner, context);
    const identity = { conversationId: context.id, runId: randomUUID() };
    const controller = new AbortController();
    const active: ActiveRun = { owner, identity, controller, done: Promise.resolve() };
    this.active = active;
    const publish = (event: SingleAgentEvent): void => { try { emit(event); } catch { /* A destroyed renderer cannot break cleanup. */ } };
    active.done = this.execute(input, context, controller, identity, publish).then(event => {
      if (this.active === active) this.active = null;
      publish(event);
    });
    return identity;
  }
  private async execute(input: SingleAgentInput, context: Session, controller: AbortController, identity: RunIdentity, emit: (event: SingleAgentEvent) => void): Promise<SingleAgentEvent> {
    let timedOut = false, turnSaved = false, storageFailed = false;
    let checkpoint: ConversationCheckpoint | null = null;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const agentMessageId = identity.runId + ':agent';
    try {
      const runtime = this.runtime.snapshot();
      if (runtime.activity || runtime.state.operationalStatus !== 'READY' || runtime.state.verificationStatus !== 'passed') throw new SingleAgentError('RUNTIME_NOT_READY');
      const previous = context.record;
      if (previous && (previous.projectId !== input.projectId || previous.branchName !== input.branch || previous.teamId !== input.teamId)) throw new SingleAgentError('CONTEXT_CHANGED');
      if (previous && !previous.codexThreadId && previous.messages.some(message => message.role === 'agent' && message.content)) throw new SingleAgentError('THREAD_UNAVAILABLE');
      const project = (await this.projects.getProjects()).find(item => item.id === input.projectId);
      if (!project) throw new SingleAgentError('PROJECT_UNAVAILABLE');
      const team = await this.teams.getTeam(input.teamId).catch(() => { throw new SingleAgentError('AGENT_UNAVAILABLE'); });
      const agents = previous ? [] : await this.agents.getAgents();
      const agent = previous?.agentDefinition ?? team.agentIds.map(id => agents.find(item => item.id === id)).find(item => item?.enabled);
      if (!agent || agent.runtime.type !== 'codex') throw new SingleAgentError('AGENT_UNAVAILABLE');
      if (controller.signal.aborted) throw new SmokeTestError('CANCELLED');
      const latest = this.runtime.snapshot();
      if (latest.activity || latest.state.operationalStatus !== 'READY' || latest.state.installationId !== runtime.state.installationId) throw new SingleAgentError('RUNTIME_NOT_READY');
      const now = new Date().toISOString();
      const record: Conversation = previous ? structuredClone(previous) : {
        id: context.id, projectId: project.id, branchName: input.branch, teamId: team.id, leadAgentId: agent.id,
        codexThreadId: null, title: conversationTitle(input.prompt), createdAt: now, updatedAt: now,
        status: 'running', interrupted: false, messages: [], agentDefinition: structuredClone(agent),
        agentSnapshot: { id: agent.id, name: agent.name, avatar: structuredClone(agent.avatar) },
      };
      record.status = 'running'; record.interrupted = false; record.updatedAt = now;
      record.messages.push({ id: identity.runId + ':user', role: 'user', content: input.prompt, agentId: null, status: 'completed', createdAt: now },
        { id: agentMessageId, role: 'agent', content: '', agentId: agent.id, status: 'streaming', createdAt: now });
      // Durable user message precedes process launch and every model turn.
      await this.repository.save(record); context.record = record; turnSaved = true;
      checkpoint = new ConversationCheckpoint(this.repository, () => record, () => { storageFailed = true; controller.abort(); });
      const write = async (): Promise<void> => {
        checkpoint!.changed();
        try { await checkpoint!.flush(); } catch { storageFailed = true; throw new ConversationStorageError(); }
      };
      const previousCwd = record.worktreePath;
      const cwd = await this.worktrees.ensure(record, project.path, write);
      if (previousCwd !== cwd && context.session) { await context.session.close(); context.session = null; }
      if (controller.signal.aborted) throw new SmokeTestError('CANCELLED');
      context.session ??= this.createSession();
      emit({ ...identity, type: 'started', agent: record.agentSnapshot, conversation: conversationDetail(record) });
      const pieces = new Map<string, string>();
      const text = await context.session.turn({ cwd, instructions: agent.instructionsMarkdown, runtime: agent.runtime,
        threadId: record.codexThreadId, onThread: async id => { record.codexThreadId = id; await write(); } }, input.prompt, controller.signal,
        (itemId, text) => {
          if (controller.signal.aborted) return;
          pieces.set(itemId, text); record.messages.find(message => message.id === agentMessageId)!.content = [...pieces.values()].join('\n\n');
          record.updatedAt = new Date().toISOString(); checkpoint!.changed(); emit({ ...identity, type: 'messageDelta', itemId: agentMessageId, text: record.messages.find(message => message.id === agentMessageId)!.content });
        });
      if (storageFailed) throw new ConversationStorageError();
      if (timedOut) throw new SingleAgentError('TIMEOUT');
      record.status = controller.signal.aborted ? 'cancelled' : 'completed'; record.updatedAt = new Date().toISOString();
      const answer = record.messages.find(message => message.id === agentMessageId)!;
      answer.status = record.status; if (!controller.signal.aborted) answer.content = text;
      if (controller.signal.aborted) record.messages.push({ id: randomUUID(), role: 'system', agentId: null, content: 'Stopped.', status: 'cancelled', createdAt: record.updatedAt });
      await write();
      const detail = conversationDetail(record);
      return controller.signal.aborted ? { ...identity, type: 'cancelled', conversation: detail } : { ...identity, type: 'completed', text, conversation: detail };
    } catch (error) {
      if (turnSaved) { try { await context.session?.close(); } catch { /* Safe terminal result only. */ } context.session = null; }
      const cancelled = controller.signal.aborted && !timedOut && !storageFailed;
      let safe = storageFailed || error instanceof ConversationStorageError ? new SingleAgentError('STORAGE_FAILED') : timedOut ? new SingleAgentError('TIMEOUT') : error instanceof ChatThreadUnavailableError ? new SingleAgentError('THREAD_UNAVAILABLE') : error instanceof SingleAgentError || error instanceof WorktreeError ? error : new SingleAgentError('RUN_FAILED');
      if (turnSaved && context.record) {
        const record = context.record; record.status = cancelled ? 'cancelled' : 'failed'; record.updatedAt = new Date().toISOString();
        const answer = record.messages.find(message => message.id === agentMessageId); if (answer) answer.status = record.status;
        record.messages.push({ id: randomUUID(), role: 'system', agentId: null, content: cancelled ? 'Stopped.' : safe.message, createdAt: record.updatedAt, status: record.status });
        try { checkpoint!.changed(); await checkpoint!.flush(); } catch { safe = new SingleAgentError('STORAGE_FAILED'); }
      }
      const detail = turnSaved && context.record ? { conversation: conversationDetail(context.record) } : {};
      return cancelled && safe.code !== 'STORAGE_FAILED' ? { ...identity, ...detail, type: 'cancelled' } : { ...identity, ...detail, type: 'failed', code: safe.code, message: safe.message };
    } finally { clearTimeout(timer); }
  }
  async cancel(owner: number): Promise<void> {
    const active = this.active;
    if (active?.owner === owner) { active.controller.abort(); await active.done; }
  }
  async reset(owner: number): Promise<void> {
    this.resetting.add(owner);
    try { await this.cancel(owner); await this.conversations.get(owner)?.session?.close(); this.conversations.delete(owner); }
    finally { this.resetting.delete(owner); }
  }
  async shutdown(): Promise<void> { this.stopped = true; await Promise.all([...this.conversations.keys()].map(owner => this.reset(owner))); }
}
