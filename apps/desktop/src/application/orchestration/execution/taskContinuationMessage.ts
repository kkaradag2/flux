import { TaskExecutionError, safeExecutionText } from './AgentTaskExecutor';

export const continuationConstraints = [
  'Inspect the existing work and continue where this task stopped. Address the gaps in the Organizer guidance.',
  'Work only on the assigned task in the existing managed working directory. Preserve existing changes; do not rewrite or delete them without a task-specific reason.',
  'Run the repository-defined verification commands where possible. Do not report completed without evidence that the required checks passed.',
  'If dependencies are missing, safe preparation may use only an existing local/offline package store, without changing lockfiles or global settings. Decide from the repository; do not request or enable network access.',
  'Do not change global package, Git or runtime settings. Do not write outside the managed working directory. Do not commit, push, merge, change branches, create other tasks, delegate, or start other agents.',
  'Approval policy remains never. External MCP, plugins and delegated agents remain disabled. Do not request elevated permissions.',
  'If required verification remains impossible, report needs_attention with a safe explanation. Use blocked for an external obstacle preventing progress. Report only canonical completed, needs_attention or blocked with concise summary and evidence.',
] as const;

export function taskContinuationMessage(taskId: string, guidance: string): string {
  if (!taskId.trim() || taskId.length > 200 || !guidance.trim() || guidance.length > 4000 || guidance.includes('\0')) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
  return JSON.stringify({ taskId, organizerGuidance: safeExecutionText(guidance), constraints: continuationConstraints });
}
