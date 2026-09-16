import type { ConditionalRetryCheck } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import { TaskExecutionError } from '../../application/orchestration/execution/AgentTaskExecutor';
import type { CodexRuntimeState } from '../../shared/codex-runtime-state';
import type { RuntimePreflightResult } from '../app-server/CodexRuntimePreflight';
import type { RunWorkspaces } from './RunWorkspaces';
import { runtimePreparationRetryCandidate } from '../../domain/orchestration/taskAttempts';
import type { AgentTask } from '../../domain/orchestration';

export function retryRuntimeIdentity(task: AgentTask, state: CodexRuntimeState | null): { installationId: string; version: string } {
 const attempt = task.attempts?.at(-1);
 // Legacy attempts lack an installation snapshot. The persisted successful verification
 // must predate that attempt: any later installation/version re-verification fails closed.
 if (!runtimePreparationRetryCandidate(task) || !attempt || state?.operationalStatus !== 'READY' || state.verificationStatus !== 'passed'
   || state.cliVersion !== '0.154.0' || !state.installationId || !state.verifiedAt || Date.parse(state.verifiedAt) > Date.parse(attempt.startedAt)) throw new TaskExecutionError('RETRY_RUNTIME_CHANGED');
 return { installationId: state.installationId, version: state.cliVersion };
}
export class ConditionalRuntimeRetry implements ConditionalRetryCheck {
 constructor(private workspaces: Pick<RunWorkspaces, 'verifyReady' | 'changedFiles'>, private loadState: () => Promise<CodexRuntimeState | null>,
  private preflight: { check(options: { cwd: string; managedRoot: string; expectedCwd: string; instructions: string; runtime: import('../../shared/management-api').AgentRuntime }, signal?: AbortSignal): Promise<RuntimePreflightResult> },
  private checking: (runId: string, value: boolean) => Promise<void>, private diagnose?: (result: RuntimePreflightResult) => void) {}
 async check(context: Parameters<ConditionalRetryCheck['check']>[0], signal: AbortSignal) {
  await this.checking(context.run.id, true);
  try {
   const stop = () => { if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED'); };
   stop();
   if (context.agent.runtime.type !== 'codex') throw new TaskExecutionError('RETRY_RUNTIME_CHANGED');
   const identity = retryRuntimeIdentity(context.task, await this.loadState());
   const location = await this.workspaces.verifyReady(context.run, context.branch, context.projectPath);
   if ((await this.workspaces.changedFiles(location.cwd)).length) throw new TaskExecutionError('RETRY_DIRTY_WORKTREE');
   stop();
   const result = await this.preflight.check({ ...location, expectedCwd: location.cwd, instructions: context.agent.instructions, runtime: { ...context.agent.runtime, type: 'codex' } }, signal);
   try { this.diagnose?.(result); } catch { /* Fixed, safe diagnostics cannot affect cleanup. */ }
   stop(); if (!result.passed) throw new TaskExecutionError('RETRY_PREFLIGHT_FAILED');
   if (JSON.stringify(retryRuntimeIdentity(context.task, await this.loadState())) !== JSON.stringify(identity)) throw new TaskExecutionError('RETRY_RUNTIME_CHANGED');
   const verified = await this.workspaces.verifyReady(context.run, context.branch, context.projectPath);
   if (verified.cwd !== location.cwd) throw new TaskExecutionError('UNSAFE_WORKTREE');
   if ((await this.workspaces.changedFiles(location.cwd)).length) throw new TaskExecutionError('RETRY_DIRTY_WORKTREE');
   stop(); return { cwd: location.cwd, runtimeIdentity: { sourceId: identity.installationId, version: identity.version } };
  } finally { await this.checking(context.run.id, false); }
 }
}
