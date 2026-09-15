import type { AgentRuntimeAdapter, RuntimeCapabilities, RuntimeTurnRequest, RuntimeTurnResult } from '../../application/runtime/AgentRuntimeAdapter';
import { AgentRuntimeError } from '../../application/runtime/AgentRuntimeError';
import type { AgentSessionReference } from '../../shared/agent-runtime';
import type { CodexAppServerClient } from './CodexAppServerClient';
import type { ChatSessionPort } from './CodexChatSession';
import { SmokeTestError } from './contracts';
import { AppServerDiagnosticError, type AppServerDiagnostic } from './AppServerDiagnostic';
import { codexOrganizerWireSchema, codexOrganizerWireInstructions, decodeCodexOrganizerEnvelope } from './CodexOrganizerSchema';

export interface CodexRuntimeSource {
 resolve(signal: AbortSignal): Promise<{ client: CodexAppServerClient; structuredOutput: boolean } | null>;
}
export const CODEX_ORGANIZER_TIMEOUT_MS = 43000;
export class CodexAgentRuntimeAdapter implements AgentRuntimeAdapter {
 readonly type = 'codex' as const;
 private static active = new Map<string, AbortController>();
 constructor(private runtime: CodexRuntimeSource, private timeoutMs = CODEX_ORGANIZER_TIMEOUT_MS, private diagnose?: (diagnostic: AppServerDiagnostic) => void) {}
 getCapabilities(): RuntimeCapabilities {
  return { structuredOutput: true, persistentSessions: true, streaming: false, cancellation: true, toolExecution: false, workingDirectory: true, sandboxing: true };
 }
 async cancel(session: AgentSessionReference): Promise<void> {
  if (session.runtime !== this.type) throw new AgentRuntimeError('RUNTIME_NOT_SUPPORTED');
  CodexAgentRuntimeAdapter.active.get(session.externalSessionId)?.abort();
 }
 async runTurn(request: RuntimeTurnRequest): Promise<RuntimeTurnResult> {
  request = { ...request, settings: { ...request.settings }, ...(request.session ? { session: { ...request.session } } : {}) };
  if (request.session && request.session.runtime !== this.type) throw new AgentRuntimeError('RUNTIME_NOT_SUPPORTED');
  const key = request.session?.externalSessionId;
  if (key && CodexAgentRuntimeAdapter.active.has(key)) throw new AgentRuntimeError('RUNTIME_SESSION_BUSY');
  const controller = new AbortController();
  if (key) CodexAgentRuntimeAdapter.active.set(key, controller);
  const owned = new Set(key ? [key] : []);
  const started = performance.now();
  let timedOut = false, session: ChatSessionPort | undefined, threadId: string | undefined;
  const abort = (): void => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; abort(); }, this.timeoutMs);
  let rejectCancelled!: () => void;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = () => reject(new AgentRuntimeError(timedOut ? 'RUNTIME_TIMEOUT' : 'RUNTIME_CANCELLED')); controller.signal.addEventListener('abort', rejectCancelled, { once: true }); if (controller.signal.aborted) rejectCancelled(); });
  void cancelled.catch(() => undefined);
  try {
   if (controller.signal.aborted) throw new AgentRuntimeError('RUNTIME_CANCELLED');
   const resolved = await Promise.race([this.runtime.resolve(controller.signal), cancelled]);
   if (!resolved) throw new AgentRuntimeError('RUNTIME_NOT_READY');
   if (!resolved.structuredOutput) throw new AgentRuntimeError('RUNTIME_CAPABILITY_MISSING');
   session = resolved.client.createStructuredSession(codexOrganizerWireSchema);
   const text = await session.turn({ cwd: request.cwd, instructions: request.instructions + '\n\n' + codexOrganizerWireInstructions,
    runtime: { type: 'codex', ...request.settings }, ...(key ? { threadId: key } : {}),
    onThread: async id => {
     if (!owned.has(id) && CodexAgentRuntimeAdapter.active.has(id)) throw new AgentRuntimeError('RUNTIME_SESSION_BUSY');
     owned.add(id); CodexAgentRuntimeAdapter.active.set(id, controller); threadId = id;
     await request.onSession?.({ runtime: this.type, externalSessionId: id });
    },
   }, request.prompt, controller.signal, () => { /* Never publish raw output. */ });
   if (controller.signal.aborted) throw new AgentRuntimeError(timedOut ? 'RUNTIME_TIMEOUT' : 'RUNTIME_CANCELLED');
   if (!threadId) throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
   return { value: decodeCodexOrganizerEnvelope(text), session: { runtime: this.type, externalSessionId: threadId }, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
   if (controller.signal.aborted) throw new AgentRuntimeError(timedOut ? 'RUNTIME_TIMEOUT' : 'RUNTIME_CANCELLED');
   if (error instanceof AgentRuntimeError) throw error;
   if (error instanceof AppServerDiagnosticError) { try { this.diagnose?.(error.diagnostic); } catch { /* Diagnostics cannot affect cleanup. */ } }
   if (error instanceof SmokeTestError) {
    if (error.code === 'PROCESS_EXIT' || error.code === 'START_FAILED') {
     try { this.diagnose?.({ method: 'transport', category: 'PROCESS_EXITED' }); } catch { /* No raw errors. */ }
     throw new AgentRuntimeError('RUNTIME_PROCESS_EXITED');
    }
    if (error.code === 'APPROVAL_REQUESTED' || error.code === 'TOOL_REQUESTED') throw new AgentRuntimeError('UNEXPECTED_TOOL_REQUEST');
   }
   throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
  } finally {
   clearTimeout(timer); request.signal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectCancelled);
   try { await session?.close(); } catch { throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR'); }
   finally { for (const id of owned) CodexAgentRuntimeAdapter.active.delete(id); }
  }
 }
}
