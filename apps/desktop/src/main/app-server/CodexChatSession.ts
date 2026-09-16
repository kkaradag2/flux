import { preparationError, verifyTaskThreadPolicy, type PreparationStage } from './RuntimePreparation';
import { AppServerDiagnosticError } from './AppServerDiagnostic';
import type { AgentRuntime } from '../../shared/management-api';
import { turnFailureDiagnostic } from './AppServerDiagnostic';
import type { AppServerWire } from './CodexAppServerTransport';
import { identifier, object, requiredString, SmokeTestError, type AppServerRequests, type ServerNotification, type ServerRequest } from './contracts';

export type ChatSessionOptions = { preserveInstructions?: boolean; cwd: string; instructions: string; runtime: AgentRuntime; threadId?: string | null; onExecutionStarted?: () => Promise<void>; onThread?: (threadId: string) => Promise<void> };
export class ChatThreadUnavailableError extends Error { constructor() { super('Saved Codex thread could not be resumed.'); } }
export interface ChatSessionPort {
  turn(options: ChatSessionOptions, prompt: string, signal: AbortSignal, onText: (itemId: string, text: string) => void): Promise<string>;
  close(): Promise<void>;
}

// The process is disposable; the registered Codex thread can be resumed after restart.
// Minimum protocol verified against the installed Codex CLI 0.154.0 schema.
export class CodexChatSession implements ChatSessionPort {
  private wire: AppServerWire | null = null;
  private threadId: string | null = null;
  private closed = false;
  private busy = false;
  constructor(private open: (cwd: string, signal: AbortSignal) => Promise<AppServerWire>, private structured?: { outputSchema: import('./contracts').AppServerJsonValue; taskExecution?: boolean }) {}
  async close(): Promise<void> { this.closed = true; await this.wire?.close(); }

  async turn(options: ChatSessionOptions, prompt: string, signal: AbortSignal, onText: (itemId: string, text: string) => void): Promise<string> {
    return this.execute(options, prompt, signal, onText);
  }
  async preflight(options: Pick<ChatSessionOptions, 'cwd' | 'instructions' | 'runtime' | 'threadId' | 'preserveInstructions'>, signal: AbortSignal, stage: (stage: PreparationStage) => void): Promise<void> {
    try { await this.execute(options, '', signal, () => undefined, stage); }
    finally { await this.close(); stage('Cleanup completed'); }
  }
  private async execute(options: ChatSessionOptions, prompt: string, signal: AbortSignal, onText: (itemId: string, text: string) => void, preflight?: (stage: PreparationStage) => void): Promise<string> {
    if (this.closed || this.busy) throw new SmokeTestError('PROCESS_EXIT');
    this.busy = true;
    let preparing = true;
    let preparationField: import('./RuntimePreparation').PreparationField = 'initialize';
    let turnId: string | null = null, finished = false, declining = false, interrupting = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const queued: ServerNotification[] = [];
    const texts = new Map<string, string>();
    const phases = new Map<string, unknown>();
    const disposers: Array<() => void> = [];
    let resolve!: (text: string) => void, reject!: (error: SmokeTestError) => void;
    const final = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    void final.catch(() => undefined);
    const fail = (error: SmokeTestError): void => { if (!finished) { finished = true; reject(error); } };
    const wait = <T>(pending: Promise<T>): Promise<T> => Promise.race([pending, final.then(() => { throw new SmokeTestError('PROTOCOL_ERROR'); })]);
    const cancel = (): void => {
      if (finished || interrupting) return;
      if (!this.wire || !this.threadId || !turnId) return;
      interrupting = true;
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => fail(new SmokeTestError('CANCELLED')), 2000);
      // Await the terminal interrupted notification; kill the process if it does not arrive.
      void this.wire.request('turn/interrupt', { threadId: this.threadId, turnId }).catch(() => fail(new SmokeTestError('CANCELLED')));
    };
    const item = (value: unknown): void => {
      const entry = object(value), type = requiredString(entry.type);
      if (type === 'agentMessage') {
        const id = identifier(entry.id);
        if (typeof entry.text !== 'string' || entry.text.length > 262144 || ![undefined, null, 'commentary', 'final_answer'].includes(entry.phase as string | null | undefined)) throw new SmokeTestError('PROTOCOL_ERROR');
        texts.set(id, entry.text); phases.set(id, entry.phase); onText(id, entry.text);
      } else if (!['userMessage', 'reasoning', 'plan', ...(this.structured?.taskExecution ? ['commandExecution', 'fileChange'] : this.structured ? [] : ['commandExecution'])].includes(type)) {
        // No file changes, external tools, dynamic tools or delegated agents in Phase 2A.
        throw new SmokeTestError('TOOL_REQUESTED');
      }
    };
    const notification = (event: ServerNotification): void => {
      if (finished || declining || !['item/agentMessage/delta', 'item/completed', 'item/started', 'turn/completed'].includes(event.method)) return;
      try {
        if (!turnId) { if (queued.length >= 1000) throw new SmokeTestError('PROTOCOL_ERROR'); queued.push(event); return; }
        const params = object(event.params);
        if (identifier(params.threadId) !== this.threadId) return;
        if (event.method === 'turn/completed') {
          const turn = object(params.turn); if (identifier(turn.id) !== turnId) return;
          if (turn.status === 'interrupted' && signal.aborted) { finished = true; resolve(''); return; }
          if (turn.status !== 'completed') throw this.structured ? turnFailureDiagnostic(turn.error) : new SmokeTestError('TURN_FAILED');
          if (!Array.isArray(turn.items)) throw new SmokeTestError('PROTOCOL_ERROR');
          for (const value of turn.items) item(value);
          const answers = [...texts].filter(([id]) => phases.get(id) !== 'commentary');
          if (this.structured && answers.length !== 1) throw new SmokeTestError('PROTOCOL_ERROR');
          const answer = answers.map(([, text]) => text).join('\n\n');
          if (!answer.trim() && !signal.aborted) throw new SmokeTestError('UNEXPECTED_RESPONSE');
          finished = true; resolve(answer);
        } else {
          if (identifier(params.turnId) !== turnId) return;
          if (event.method === 'item/agentMessage/delta') {
            const id = identifier(params.itemId), text = (texts.get(id) ?? '') + requiredString(params.delta);
            if (text.length > 262144 || texts.size > 100) throw new SmokeTestError('PROTOCOL_ERROR');
            texts.set(id, text); onText(id, text);
          } else if (event.method === 'item/completed') item(params.item);
          else {
            const entry = object(params.item);
            if (!['agentMessage', 'userMessage', 'reasoning', 'plan', ...(this.structured?.taskExecution ? ['commandExecution', 'fileChange'] : this.structured ? [] : ['commandExecution'])].includes(requiredString(entry.type))) throw new SmokeTestError('TOOL_REQUESTED');
          }
        }
      } catch (error) { fail(error instanceof SmokeTestError ? error : new SmokeTestError('PROTOCOL_ERROR')); }
    };
    const serverRequest = (request: ServerRequest): void => {
      declining = true;
      const approval = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(request.method);
      const permissions = request.method === 'item/permissions/requestApproval';
      const legacy = ['execCommandApproval', 'applyPatchApproval'].includes(request.method);
      const result = approval ? { decision: 'decline' } : permissions ? { permissions: {}, scope: 'turn' } : legacy ? { decision: { denied: { rejection: 'Read-only chat does not permit approvals.' } } } : null;
      void this.wire!.reply(request.id, result, !approval && !permissions && !legacy).then(() => fail(new SmokeTestError('APPROVAL_REQUESTED')), () => fail(new SmokeTestError('APPROVAL_REQUESTED')));
    };
    signal.addEventListener('abort', cancel);
    // Bounds startup too, including cancellation before the server yields a turn ID.
    const abortStartup = (): void => {
      cancel();
      if (!turnId && !cancelTimer) cancelTimer = setTimeout(() => fail(new SmokeTestError('CANCELLED')), 2000);
    };
    signal.addEventListener('abort', abortStartup);
    try {
      if (signal.aborted) throw new SmokeTestError('CANCELLED');
      if (!this.wire) {
        const opening = this.open(options.cwd, signal);
        void opening.then(wire => { if (finished && !this.wire) void wire.close(); }, () => undefined);
        this.wire = await wait(opening);
      }
      const wire = this.wire;
      disposers.push(wire.onNotification(notification), wire.onRequest(serverRequest), wire.onFailure(fail));
      if (!this.threadId) {
        requiredString(object(await wait(wire.request('initialize', { clientInfo: { name: 'flux-chat', title: 'Flux single-agent chat', version: '0.0.0' }, capabilities: { experimentalApi: false } }))).userAgent);
        await wait(wire.notify('initialized'));
        // Empty tables do not erase inherited configuration. Disable named servers
        // and their plugins for this thread only, without reading any auth/config file.
        const inventory = async (threadId?: string): Promise<Record<string, unknown>[]> => {
          const servers: Record<string, unknown>[] = [];
          let cursor: string | undefined;
          for (let page = 0; ; page++) {
            if (page >= 10) throw new SmokeTestError('PROTOCOL_ERROR');
            const result = object(await wait(wire.request('mcpServerStatus/list', { ...(threadId ? { threadId } : {}), detail: 'toolsAndAuthOnly', limit: 100, ...(cursor ? { cursor } : {}) })));
            if (!Array.isArray(result.data)) throw new SmokeTestError('PROTOCOL_ERROR');
            servers.push(...result.data.map(object));
            if (result.nextCursor === null) return servers;
            cursor = requiredString(result.nextCursor);
          }
        };
        preparationField = 'inventory';
        const servers = await inventory();
        const mcpServers = Object.fromEntries(servers.filter(server => server.pluginId == null && server.name !== 'codex_apps').map(server => [identifier(server.name), { enabled: false as const }]));
        const plugins = Object.fromEntries(servers.filter(server => server.pluginId !== null && server.pluginId !== undefined).map(server => [identifier(server.pluginId), { enabled: false as const }]));
        const config: Omit<AppServerRequests['thread/start'], 'ephemeral'> = {
          cwd: options.cwd, approvalPolicy: 'never', sandbox: this.structured?.taskExecution ? 'workspace-write' : 'read-only',
          ...(options.preserveInstructions && options.threadId ? {} : { developerInstructions: options.instructions }),
          ...(options.runtime.model ? { model: options.runtime.model } : {}),
          config: { ...(this.structured?.taskExecution ? { 'sandbox_workspace_write.writable_roots': [options.cwd], 'sandbox_workspace_write.network_access': false as const, 'sandbox_workspace_write.exclude_tmpdir_env_var': true as const, 'sandbox_workspace_write.exclude_slash_tmp': true as const } : {}), web_search: 'disabled', mcp_servers: mcpServers, plugins, 'features.apps': false, 'features.multi_agent': false },
        };
        preparationField = 'thread';
        let response: unknown;
        if (options.threadId) {
          try { response = await wait(wire.request('thread/resume', { ...config, threadId: options.threadId, excludeTurns: true })); }
          catch { throw new ChatThreadUnavailableError(); }
        } else {
          try { response = await wait(wire.request('thread/start', { ...config, ephemeral: !!preflight })); }
          catch (error) { if (this.structured?.taskExecution && error instanceof AppServerDiagnosticError && error.diagnostic.category === 'RPC_ERROR') throw preparationError('thread_start_rejected', undefined, error.diagnostic.protocolCode); throw error; }
        }
        preflight?.('CWD accepted'); preflight?.('Sandbox request accepted'); preflight?.('Thread started');
        const started = object(response);
        try { this.threadId = identifier(object(started.thread).id); } catch { throw preparationError('session_verification_failed', 'thread'); }
        if (options.threadId && this.threadId !== options.threadId) throw new ChatThreadUnavailableError();
        if (this.structured?.taskExecution) verifyTaskThreadPolicy(started, options.cwd);
        const sandbox = object(started.sandbox);
        if (!this.structured?.taskExecution && (started.approvalPolicy !== 'never' || sandbox.type !== (this.structured?.taskExecution ? 'workspaceWrite' : 'readOnly') || sandbox.networkAccess === true)) throw new SmokeTestError('PROTOCOL_ERROR');
        if (this.structured?.taskExecution) verifyTaskThreadPolicy(started, options.cwd);
        if (!preflight) await wait(options.onThread?.(this.threadId) ?? Promise.resolve());
        // External MCP tools are outside the filesystem sandbox. Fail closed if an
        // installed plugin or configuration layer still exposes any to this thread.
        if ((await inventory(this.threadId)).some(server => server.runtimeStatus !== 'disabled' && Object.keys(object(server.tools)).length > 0)) throw new SmokeTestError('TOOL_REQUESTED');
      }
      if (signal.aborted) throw new SmokeTestError('CANCELLED');
      if (preflight) { preflight('Returned policy verified'); return ''; }
      preparing = false;
      await wait(options.onExecutionStarted?.() ?? Promise.resolve());
      if (signal.aborted) throw new SmokeTestError('CANCELLED');
      const started = object(await wait(wire.request('turn/start', {
        threadId: this.threadId, input: [{ type: 'text', text: prompt, text_elements: [] }],
        approvalPolicy: 'never', sandboxPolicy: this.structured?.taskExecution ? { type: 'workspaceWrite', writableRoots: [options.cwd], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : { type: 'readOnly', networkAccess: false },
        ...(options.runtime.reasoningEffort === 'default' ? {} : { effort: options.runtime.reasoningEffort }),
        ...(this.structured ? { outputSchema: this.structured.outputSchema } : {}),
      })));
      turnId = identifier(object(started.turn).id);
      if (signal.aborted) cancel();
      for (const event of queued) notification(event);
      queued.length = 0;
      return await final;
    } catch (error) {
      await this.close();
      throw error instanceof SmokeTestError || error instanceof ChatThreadUnavailableError ? error : new SmokeTestError('PROTOCOL_ERROR');
    } finally {
      finished = true; this.busy = false;
      clearTimeout(cancelTimer); signal.removeEventListener('abort', cancel); signal.removeEventListener('abort', abortStartup);
      for (const dispose of disposers) dispose();
      queued.length = 0; texts.clear(); phases.clear();
    }
  }
}
