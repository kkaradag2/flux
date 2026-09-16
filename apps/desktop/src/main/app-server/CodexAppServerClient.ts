import { CodexAppServerTransport, type AppServerWire } from './CodexAppServerTransport';
import { CodexChatSession } from './CodexChatSession';
import { confirmProcessExit } from './confirmProcessExit';
import { classifyTurnError } from './verificationReason';
import type { RuntimeCommandRunner } from '../runtime/RuntimeCommandRunner';
import { SmokeTestError, object, identifier, requiredString, HELLO, SMOKE_PROMPT, type ServerNotification, type ServerRequest } from './contracts';
export class CodexAppServerClient {
  constructor(private createTransport: (cwd: string, signal: AbortSignal) => Promise<AppServerWire>) {}
  createChatSession(): CodexChatSession { return new CodexChatSession(this.createTransport); }
  createStructuredSession(outputSchema: import('./contracts').AppServerJsonValue, taskExecution = false): CodexChatSession {
    return new CodexChatSession(this.createTransport, { outputSchema, taskExecution });
  }
  static using(runner: RuntimeCommandRunner, verifyProcessExit = false): CodexAppServerClient {
    return new CodexAppServerClient(async (cwd, signal) => {
      const executable = await runner.resolveCodex();
      if (signal.aborted) throw new SmokeTestError('CANCELLED');
      if (!executable) throw new SmokeTestError('NOT_INSTALLED');
      const child = runner.start(executable, 'app-server', cwd);
      return new CodexAppServerTransport(child, () => verifyProcessExit ? confirmProcessExit(child, () => runner.terminate(child)) : runner.terminate(child));
    });
  }
  async run(cwd: string, signal: AbortSignal): Promise<string> {
    let wire: AppServerWire | null = null;
    let threadId: string | null = null, turnId: string | null = null;
    let finished = false, approvalPending = false;
    const queued: ServerNotification[] = [];
    const deltas = new Map<string, string>();
    const messages = new Map<string, { text: string; phase: unknown }>();
    const unsubscribe: Array<() => void> = [];
    let resolveFinal!: (text: string) => void, rejectFinal!: (error: SmokeTestError) => void;
    const final = new Promise<string>((resolve, reject) => { resolveFinal = resolve; rejectFinal = reject; });
    // A failure can arrive while a request is still in flight.
    void final.catch(() => undefined);
    const fail = (error: SmokeTestError): void => { if (!finished) { finished = true; rejectFinal(error); } };
    const abort = (): void => fail(new SmokeTestError('CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    const acceptItem = (value: unknown): void => {
      const item = object(value); const type = requiredString(item.type); const id = identifier(item.id);
      if (type === 'agentMessage') {
        if (typeof item.text !== 'string' || item.text.length > 65536 || ![undefined, null, 'commentary', 'final_answer'].includes(item.phase as string | null | undefined)) throw new SmokeTestError('PROTOCOL_ERROR');
        messages.set(id, { text: item.text, phase: item.phase });
      } else if (!['userMessage', 'reasoning', 'plan'].includes(type)) throw new SmokeTestError('TOOL_REQUESTED');
    };
    const notification = (event: ServerNotification): void => {
      if (finished || approvalPending) return;
      try {
        if (!['item/agentMessage/delta', 'item/completed', 'item/started', 'turn/completed'].includes(event.method)) return;
        if (!turnId) { if (queued.length >= 1000) throw new SmokeTestError('PROTOCOL_ERROR'); queued.push(event); return; }
        const params = object(event.params);
        if (identifier(params.threadId) !== threadId) return;
        if (event.method === 'turn/completed') {
          const turn = object(params.turn); if (identifier(turn.id) !== turnId) return;
          if (turn.status !== 'completed') {
            const reason = classifyTurnError(turn.error);
            throw new SmokeTestError(reason === 'CLI_TOO_OLD' ? 'RUNTIME_INCOMPATIBLE' : 'TURN_FAILED', reason);
          }
          if (!Array.isArray(turn.items)) throw new SmokeTestError('PROTOCOL_ERROR');
          for (const item of turn.items) acceptItem(item);
          const finals = [...messages.values()].filter(item => item.phase !== 'commentary');
          const text = finals.at(-1)?.text;
          if (text !== HELLO) throw new SmokeTestError('UNEXPECTED_RESPONSE');
          finished = true; resolveFinal(text);
        } else {
          if (identifier(params.turnId) !== turnId) return;
          if (event.method === 'item/agentMessage/delta') {
            const id = identifier(params.itemId), delta = requiredString(params.delta);
            const combined = (deltas.get(id) ?? '') + delta;
            if (combined.length > 65536) throw new SmokeTestError('PROTOCOL_ERROR');
            deltas.set(id, combined);
          } else {
            const item = object(params.item);
            if (event.method === 'item/completed') acceptItem(item);
            else if (!['agentMessage', 'userMessage', 'reasoning', 'plan'].includes(requiredString(item.type))) throw new SmokeTestError('TOOL_REQUESTED');
          }
        }
      } catch (error) { fail(error instanceof SmokeTestError ? error : new SmokeTestError('PROTOCOL_ERROR')); }
    };
    const serverRequest = (request: ServerRequest): void => {
      approvalPending = true;
      let result: unknown = null, code: 'APPROVAL_REQUESTED' | 'TOOL_REQUESTED' = 'APPROVAL_REQUESTED', unsupported = false;
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(request.method)) result = { decision: 'decline' };
      else if (request.method === 'item/permissions/requestApproval') result = { permissions: {}, scope: 'turn' };
      else if (['execCommandApproval', 'applyPatchApproval'].includes(request.method)) result = { decision: { denied: { rejection: 'Connection test does not permit tools.' } } };
      else { code = 'TOOL_REQUESTED'; unsupported = true; }
      // Flush the decline before failing and tearing down the transport.
      void wire!.reply(request.id, result, unsupported).then(() => fail(new SmokeTestError(code)), () => fail(new SmokeTestError(code)));
    };
    const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, final.then(() => { throw new SmokeTestError('PROTOCOL_ERROR'); })]);
    try {
      if (signal.aborted) abort();
      const opening = this.createTransport(cwd, signal);
      // A late factory resolution after cancellation must not leak its process.
      void opening.then(late => { if (finished && !wire) void late.close(); }, () => undefined);
      wire = await wait(opening);
      unsubscribe.push(wire.onNotification(notification), wire.onRequest(serverRequest), wire.onFailure(fail));
      const initialized = object(await wait(wire.request('initialize', { clientInfo: { name: 'flux-smoke-test', title: 'Flux connection test', version: '0.0.0' }, capabilities: { experimentalApi: false } })));
      requiredString(initialized.userAgent);
      await wait(wire.notify('initialized'));
      const started = object(await wait(wire.request('thread/start', { cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true })));
      threadId = identifier(object(started.thread).id);
      if (started.approvalPolicy !== 'never' || object(started.sandbox).type !== 'readOnly') throw new SmokeTestError('PROTOCOL_ERROR');
      const turn = object(object(await wait(wire.request('turn/start', { threadId, input: [{ type: 'text', text: SMOKE_PROMPT, text_elements: [] }], approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false } }))).turn);
      turnId = identifier(turn.id);
      for (const event of queued) notification(event);
      queued.length = 0;
      return await final;
    } finally {
      signal.removeEventListener('abort', abort); for (const dispose of unsubscribe) dispose();
      try { await wire?.close(); } catch { throw new SmokeTestError('CLEANUP_FAILED'); }
      queued.length = 0; deltas.clear(); messages.clear();
    }
  }
}
