import { mkdir, readFile, readdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentDefinition } from '../../shared/management-api';
import type { ConversationDetail, ConversationSummary, ConversationMessage } from '../../shared/conversation-api';
import { storedAgent } from '../management/validation';

export type Conversation = ConversationDetail & { codexThreadId: string | null; agentDefinition: AgentDefinition };
export interface ConversationStore {
  get(id: string): Promise<Conversation>;
  list(): Promise<Conversation[]>;
  save(conversation: Conversation): Promise<void>;
}
export class ConversationStorageError extends Error {
  constructor() { super('Conversation history could not be saved or loaded. Existing files have been preserved.'); }
}
export function conversationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new ConversationStorageError();
  return value;
}
export function conversationTitle(prompt: string): string { return Array.from(prompt.replace(/\s+/gu, ' ').trim()).slice(0, 60).join(''); }
export function conversationSummary(value: Conversation): ConversationSummary {
  const { id, projectId, branchName, teamId, leadAgentId, title, status, interrupted, createdAt, updatedAt } = value;
  return { ...(value.mode ? { mode: value.mode } : {}), id, projectId, branchName, teamId, leadAgentId, title, status, interrupted, createdAt, updatedAt };
}
export function conversationDetail(value: Conversation): ConversationDetail {
  return { ...conversationSummary(value), agentSnapshot: structuredClone(value.agentSnapshot), messages: structuredClone(value.messages) };
}
function parse(value: unknown): Conversation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConversationStorageError();
  const data = value as Record<string, unknown>;
  const text = (v: unknown, max = 250): string => { if (typeof v !== 'string' || !v || v.length > max || v.includes('\0')) throw new ConversationStorageError(); return v; };
  const date = (v: unknown): string => { const s = text(v, 50); if (!Number.isFinite(Date.parse(s))) throw new ConversationStorageError(); return s; };
  const status = data.status;
  if (status !== 'running' && status !== 'completed' && status !== 'failed' && status !== 'cancelled') throw new ConversationStorageError();
  if (typeof data.interrupted !== 'boolean' || !Array.isArray(data.messages)) throw new ConversationStorageError();
  const agentDefinition = storedAgent(data.agentDefinition);
  const snapshot = data.agentSnapshot as Record<string, unknown> | null;
  if (!snapshot || snapshot.id !== agentDefinition.id || snapshot.name !== agentDefinition.name || JSON.stringify(snapshot.avatar) !== JSON.stringify(agentDefinition.avatar)) throw new ConversationStorageError();
  const title = text(data.title, 120);
  if (/[\r\n]/.test(title) || Array.from(title).length > 60 || data.leadAgentId !== agentDefinition.id) throw new ConversationStorageError();
  const messages = data.messages.map((value): ConversationMessage => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConversationStorageError();
    const message = value as Record<string, unknown>, role = message.role, status = message.status;
    if (role !== 'user' && role !== 'agent' && role !== 'system') throw new ConversationStorageError();
    if (status !== 'streaming' && status !== 'completed' && status !== 'failed' && status !== 'cancelled') throw new ConversationStorageError();
    if (typeof message.content !== 'string' || message.content.length > 2 * 1024 * 1024 || message.agentId !== (role === 'agent' ? agentDefinition.id : null)) throw new ConversationStorageError();
    return { ...(message.planRunId === undefined ? {} : { planRunId: text(message.planRunId) }), id: text(message.id), role, content: message.content, agentId: role === 'agent' ? agentDefinition.id : null, createdAt: date(message.createdAt), status };
  });
  if (new Set(messages.map(message => message.id)).size !== messages.length) throw new ConversationStorageError();
  if (data.mode !== undefined && data.mode !== 'single-agent' && data.mode !== 'team') throw new ConversationStorageError();
  return { ...(data.mode === 'team' ? { mode: 'team' as const } : {}), id: conversationId(data.id), projectId: text(data.projectId), branchName: text(data.branchName), teamId: text(data.teamId), leadAgentId: agentDefinition.id,
    codexThreadId: data.codexThreadId === null ? null : text(data.codexThreadId, 200), title, status, interrupted: data.interrupted,
    createdAt: date(data.createdAt), updatedAt: date(data.updatedAt), messages, agentDefinition,
    agentSnapshot: { id: agentDefinition.id, name: agentDefinition.name, avatar: structuredClone(agentDefinition.avatar) } };
}
export function markInterrupted(conversation: Conversation): Conversation {
  if (conversation.status !== 'running' || conversation.mode === 'team') return conversation;
  const now = new Date().toISOString();
  return { ...conversation, status: 'failed', interrupted: true, updatedAt: now,
    messages: [...conversation.messages.map(message => message.status === 'streaming' ? { ...message, status: 'failed' as const } : message),
      { id: randomUUID(), role: 'system', content: 'Interrupted — the app closed before this response finished.', agentId: null, createdAt: now, status: 'failed' }] };
}
export class ConversationRepository implements ConversationStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(action).catch(() => { throw new ConversationStorageError(); });
    this.queue = operation.catch(() => undefined); return operation;
  }
  private async read(id: string): Promise<Conversation> {
    const data = parse(JSON.parse(await readFile(path.join(this.directory, conversationId(id) + '.json'), 'utf8')));
    if (data.id !== id) throw new ConversationStorageError(); return data;
  }
  get(id: string): Promise<Conversation> { return this.serialize(() => this.read(id)); }
  list(): Promise<Conversation[]> {
    return this.serialize(async () => {
      let files: string[];
      try { files = await readdir(this.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
      const values: Conversation[] = [];
      for (const file of files) if (file.endsWith('.json')) values.push(await this.read(file.slice(0, -5)));
      return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    });
  }
  save(value: Conversation): Promise<void> {
    // Snapshot now, not when a queued disk operation eventually executes.
    const snapshot = structuredClone(value);
    return this.serialize(async () => {
      const record = parse(snapshot), file = path.join(this.directory, record.id + '.json'), temp = file + '.' + randomUUID() + '.tmp';
      try {
        await mkdir(this.directory, { recursive: true });
        const handle = await open(temp, 'wx');
        try { await handle.writeFile(JSON.stringify(record) + '\n', 'utf8'); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, file);
      } catch (error) { await unlink(temp).catch(() => undefined); throw error; }
    });
  }
  async recoverInterrupted(): Promise<void> {
    for (const value of await this.list()) if (value.status === 'running' && value.mode !== 'team') await this.save(markInterrupted(value));
  }
}
