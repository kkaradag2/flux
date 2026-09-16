import type { ConditionalRetryCheck } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import { TaskExecutionError } from '../../application/orchestration/execution/AgentTaskExecutor';
import type { CodexRuntimeState } from '../../shared/codex-runtime-state';
import type { CodexRuntimePreflight } from '../app-server/CodexRuntimePreflight';
import type { RunWorkspaces } from './RunWorkspaces';

/** Resume-only preparation: never creates a task attempt or a model turn. */
export class TaskContinuationPreflight implements ConditionalRetryCheck {
  constructor(private workspaces: Pick<RunWorkspaces, 'verifyReady' | 'changedFiles'>,
    private loadState: () => Promise<CodexRuntimeState | null>, private preflight: Pick<CodexRuntimePreflight, 'check'>,
    private checking: (runId: string, value: boolean) => Promise<void> = async () => undefined) {}
  async check(context: Parameters<ConditionalRetryCheck['check']>[0], signal: AbortSignal) {
    await this.checking(context.run.id, true);
    try { return await this.perform(context, signal); }
    finally { await this.checking(context.run.id, false); }
  }
  private async perform(context: Parameters<ConditionalRetryCheck['check']>[0], signal: AbortSignal) {
    const identity = async () => {
      const state = await this.loadState();
      const firstModelAttempt = context.task.attempts?.find(attempt => attempt.phase === 'model_execution');
      // Older sessions have no installation snapshot. Require an unchanged successful
      // verification predating their first model attempt, as for legacy retry eligibility.
      if (context.task.session?.runtime !== 'codex' || context.agent.runtime.type !== 'codex' || !firstModelAttempt
        || state?.operationalStatus !== 'READY' || state.verificationStatus !== 'passed' || !state.cliVersion || !state.installationId
        || !state.verifiedAt || Date.parse(state.verifiedAt) > Date.parse(firstModelAttempt.startedAt)) throw new TaskExecutionError('RETRY_RUNTIME_CHANGED');
      return { sourceId: state.installationId, version: state.cliVersion };
    };
    const stop = () => { if (signal.aborted) throw new TaskExecutionError('EXECUTION_INTERRUPTED'); };
    stop(); const runtimeIdentity = await identity();
    const location = await this.workspaces.verifyReady(context.run, context.branch, context.projectPath);
    const files = await this.workspaces.changedFiles(location.cwd);
    const result = await this.preflight.check({ ...location, expectedCwd: location.cwd, instructions: '', runtime: { ...context.agent.runtime, type: 'codex' },
      threadId: context.task.session!.externalSessionId, preserveInstructions: true, runtimeIdentity }, signal);
    stop(); if (!result.passed) throw new TaskExecutionError('RETRY_PREFLIGHT_FAILED');
    if (JSON.stringify(await identity()) !== JSON.stringify(runtimeIdentity)) throw new TaskExecutionError('RETRY_RUNTIME_CHANGED');
    const verified = await this.workspaces.verifyReady(context.run, context.branch, context.projectPath);
    if (verified.cwd !== location.cwd || JSON.stringify(await this.workspaces.changedFiles(location.cwd)) !== JSON.stringify(files)) throw new TaskExecutionError('UNSAFE_WORKTREE');
    stop(); return { cwd: location.cwd, runtimeIdentity };
  }
}
