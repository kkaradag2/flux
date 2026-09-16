import type { AgentTask, TaskAttempt } from './models';
export function executionAttempts(task: AgentTask): readonly TaskAttempt[] {
  if (task.attempts?.length) return task.attempts;
  if (!task.startedAt) return [];
  return [{ number: 1, status: task.status, phase: 'unknown', failure: task.status === 'failed' ? 'UNKNOWN_FAILURE' : null,
    startedAt: task.startedAt, finishedAt: task.completedAt, ...(task.execution ? { report: task.execution } : {}) }];
}
export function retryableTask(task: AgentTask, verifiedLegacyPreparationFailure = false, verifiedRuntimePreparationFailure = false): boolean {
  if (verifiedRuntimePreparationFailure && runtimePreparationRetryCandidate(task)) return true;
  if (task.status !== 'failed') return false;
  const last = executionAttempts(task).at(-1);
  if (!last) return false;
  if (!task.attempts?.length && !task.session && verifiedLegacyPreparationFailure) return true;
  return last.failure === 'EXECUTION_INTERRUPTED' || (last.failure === 'WORKTREE_PREPARATION_FAILED' && last.phase === 'worktree_preparation')
    || (last.failure === 'RUNTIME_PREPARATION_FAILED' && last.phase === 'runtime_preparation');
}

/** Structural eligibility only; main must prove environment safety before retry. */
export function runtimePreparationRetryCandidate(task: AgentTask): boolean {
 const last = task.attempts?.at(-1);
 return task.status === 'failed' && !task.session && !!last && last.status === 'failed' && last.phase === 'runtime_preparation' && last.failure === 'VALIDATION_FAILED' && !!last.finishedAt;
}
