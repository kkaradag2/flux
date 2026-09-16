import { codexFollowUpSchema, codexFollowUpInstructions, decodeCodexFollowUp } from './CodexFollowUpSchema';
import { preparationError } from './RuntimePreparation';
import { codexTaskSchema, decodeCodexTask } from './CodexTaskSchema';
import type { AgentRuntimeAdapter, RuntimeCapabilities, RuntimeTurnRequest, RuntimeTurnResult } from '../../application/runtime/AgentRuntimeAdapter';
import { AgentRuntimeError } from '../../application/runtime/AgentRuntimeError';
import type { AgentSessionReference } from '../../shared/agent-runtime';
import type { CodexAppServerClient } from './CodexAppServerClient';
import type { ChatSessionPort } from './CodexChatSession';
import { SmokeTestError } from './contracts';
import { AppServerDiagnosticError, type AppServerDiagnostic } from './AppServerDiagnostic';
import { codexOrganizerWireSchema, codexOrganizerWireInstructions, decodeCodexOrganizerEnvelope } from './CodexOrganizerSchema';

export interface CodexRuntimeSource {
 resolve(signal: AbortSignal, expected?: { installationId: string; version: string }): Promise<{ client: CodexAppServerClient; structuredOutput: boolean } | null>;
}
export const CODEX_ORGANIZER_TIMEOUT_MS = 43000;
export class CodexAgentRuntimeAdapter implements AgentRuntimeAdapter {
 readonly type = 'codex' as const;
 private static active = new Map<string, AbortController>();
 constructor(private runtime: CodexRuntimeSource, private timeoutMs = CODEX_ORGANIZER_TIMEOUT_MS, private diagnose?: (diagnostic: AppServerDiagnostic) => void) {}
 private reportPreparation(code: import('./RuntimePreparation').PreparationCode): void {
  try { this.diagnose?.(preparationError(code).diagnostic); } catch { /* Safe diagnostics cannot affect execution. */ }
 }
 getCapabilities(): RuntimeCapabilities {
  return { structuredOutput: true, persistentSessions: true, streaming: false, cancellation: true, toolExecution: true, workingDirectory: true, sandboxing: true };
 }
 async cancel(session: AgentSessionReference): Promise<void> {
  if (session.runtime !== this.type) throw new AgentRuntimeError('RUNTIME_NOT_SUPPORTED');
  CodexAgentRuntimeAdapter.active.get(session.externalSessionId)?.abort();
 }
 async runTurn(request: RuntimeTurnRequest): Promise<RuntimeTurnResult> {
  request = { ...request, settings: { ...request.settings }, ...(request.session ? { session: { ...request.session } } : {}) };
  if (request.session && request.session.runtime !== this.type) throw new AgentRuntimeError('RUNTIME_NOT_SUPPORTED');
  const taskExecution = request.resultContract === 'task-execution', followUp = request.resultContract === 'organizer-follow-up';
  if (request.policy.network !== false || request.policy.readOnly === taskExecution || request.policy.tools !== taskExecution) { this.reportPreparation('runtime_capability_missing'); throw new AgentRuntimeError('RUNTIME_CAPABILITY_MISSING'); }
  if (request.continuation && (!taskExecution || !request.session)) throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
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
  const timer = setTimeout(() => { timedOut = true; abort(); }, taskExecution ? 10 * 60 * 1000 : this.timeoutMs);
  let rejectCancelled!: () => void;
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = () => reject(new AgentRuntimeError(timedOut ? 'RUNTIME_TIMEOUT' : 'RUNTIME_CANCELLED')); controller.signal.addEventListener('abort', rejectCancelled, { once: true }); if (controller.signal.aborted) rejectCancelled(); });
  void cancelled.catch(() => undefined);
  try {
   if (controller.signal.aborted) throw new AgentRuntimeError('RUNTIME_CANCELLED');
   const resolved = await Promise.race([this.runtime.resolve(controller.signal, request.runtimeIdentity ? { installationId: request.runtimeIdentity.sourceId, version: request.runtimeIdentity.version } : undefined), cancelled]);
   if (!resolved) { this.reportPreparation('installation_not_ready'); throw new AgentRuntimeError('RUNTIME_NOT_READY'); }
   if (!resolved.structuredOutput) { this.reportPreparation('unsupported_runtime_version'); throw new AgentRuntimeError('RUNTIME_CAPABILITY_MISSING'); }
   session = resolved.client.createStructuredSession(taskExecution ? codexTaskSchema : followUp ? codexFollowUpSchema : codexOrganizerWireSchema, taskExecution);
   const text = await session.turn({ ...(request.continuation ? { preserveInstructions: true } : {}), cwd: request.cwd, instructions: request.instructions + (taskExecution ? '' : '\n\n' + (followUp ? codexFollowUpInstructions : codexOrganizerWireInstructions)),
    ...(request.onExecutionStarted ? { onExecutionStarted: request.onExecutionStarted } : {}),
    runtime: { type: 'codex', ...request.settings }, ...(key ? { threadId: key } : {}),
    onThread: async id => {
     if (!owned.has(id) && CodexAgentRuntimeAdapter.active.has(id)) throw new AgentRuntimeError('RUNTIME_SESSION_BUSY');
     owned.add(id); CodexAgentRuntimeAdapter.active.set(id, controller); threadId = id;
     await request.onSession?.({ runtime: this.type, externalSessionId: id });
    },
   }, request.prompt, controller.signal, () => { /* Never publish raw output. */ });
   if (controller.signal.aborted) throw new AgentRuntimeError(timedOut ? 'RUNTIME_TIMEOUT' : 'RUNTIME_CANCELLED');
   if (!threadId) throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
   return { value: taskExecution ? decodeCodexTask(text) : followUp ? decodeCodexFollowUp(text) : decodeCodexOrganizerEnvelope(text), session: { runtime: this.type, externalSessionId: threadId }, durationMs: Math.round(performance.now() - started) };
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
