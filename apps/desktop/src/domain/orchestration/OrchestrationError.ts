export type OrchestrationErrorCode =
  | 'INVALID_INPUT' | 'TIME_ORDER' | 'RUN_MISMATCH'
  | 'DUPLICATE_TASK_ID' | 'TASK_NOT_FOUND'
  | 'SELF_DEPENDENCY' | 'DUPLICATE_DEPENDENCY' | 'MISSING_DEPENDENCY' | 'DEPENDENCY_CYCLE'
  | 'DEPENDENCIES_NOT_COMPLETED' | 'INVALID_TASK_TRANSITION' | 'TERMINAL_TASK'
  | 'INVALID_ASSIGNMENT' | 'ACTOR_NOT_AUTHORIZED' | 'DECISION_REQUIRED' | 'REVIEW_REQUIRED'
  | 'ORGANIZER_REQUIRED' | 'REQUIRED_TASKS_INCOMPLETE' | 'ACTIVE_TASKS_REMAIN'
  | 'INVALID_RUN_TRANSITION' | 'TERMINAL_RUN' | 'INVALID_PLAN';

export class OrchestrationError extends Error {
  constructor(public readonly code: OrchestrationErrorCode, message: string) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

export function invariant(condition: unknown, code: OrchestrationErrorCode, message: string): asserts condition {
  if (!condition) throw new OrchestrationError(code, message);
}

export function nonEmpty(value: unknown, field: string): asserts value is string {
  invariant(typeof value === 'string' && value.trim().length > 0 && !value.includes('\0'), 'INVALID_INPUT', `${field} must be a non-empty string.`);
}
