import type { CodexRuntimeSource } from './CodexAgentRuntimeAdapter';
import type { CodexChatSession, ChatSessionOptions } from './CodexChatSession';
import { AppServerDiagnosticError, type AppServerDiagnostic } from './AppServerDiagnostic';
import { preparationError, verifyManagedWorkingDirectory, type PreparationStage } from './RuntimePreparation';
export type RuntimePreflightResult = { passed: boolean; stages: readonly PreparationStage[]; diagnostic: AppServerDiagnostic | null };
/** Main-process diagnostic only: no repository, IPC, prompt, turn or session-save port. */
export class CodexRuntimePreflight {
 constructor(private source: CodexRuntimeSource) {}
 async check(options: Pick<ChatSessionOptions, 'cwd' | 'instructions' | 'runtime'> & { managedRoot: string; expectedCwd: string }, signal?: AbortSignal): Promise<RuntimePreflightResult> {
  const stages: PreparationStage[] = [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), 40000);
  let session: CodexChatSession | undefined;
  let diagnostic: AppServerDiagnostic | null = null;
  try {
   const resolved = await this.source.resolve(controller.signal);
   if (!resolved || controller.signal.aborted) throw preparationError('installation_not_ready', 'runtime');
   if (!resolved.structuredOutput) throw preparationError('unsupported_runtime_version', 'runtime');
   stages.push('Runtime source resolved');
   if (options.runtime.type !== 'codex') throw preparationError('runtime_capability_missing', 'runtime');
   await verifyManagedWorkingDirectory(options.cwd, options.managedRoot, options.expectedCwd);
   stages.push('Worktree identity verified');
   session = resolved.client.createStructuredSession({}, true);
   // Pass only preparation fields: callers cannot inject an onThread persistence callback.
   await session.preflight({ cwd: options.cwd, instructions: options.instructions, runtime: options.runtime }, controller.signal, stage => stages.push(stage));
  } catch (error) {
   diagnostic = error instanceof AppServerDiagnosticError ? error.diagnostic : preparationError('unknown_validation_failure').diagnostic;
  } finally {
   clearTimeout(timer); signal?.removeEventListener('abort', abort);
   try { await session?.close(); if (!stages.includes('Cleanup completed')) stages.push('Cleanup completed'); }
   catch { diagnostic = preparationError('session_verification_failed').diagnostic; }
  }
  return { passed: diagnostic === null, stages, diagnostic };
 }
}
