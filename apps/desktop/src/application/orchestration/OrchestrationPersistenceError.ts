export type OrchestrationPersistenceErrorCode = 'NOT_FOUND' | 'ALREADY_EXISTS' | 'READ_FAILED' | 'WRITE_FAILED'
  | 'CORRUPT_JSON' | 'UNSUPPORTED_SCHEMA' | 'INVALID_RECORD' | 'DUPLICATE_EVENT' | 'DUPLICATE_PLAN_VERSION'
  | 'REVISION_CONFLICT' | 'UNSAFE_LOCATION';
const messages: Record<OrchestrationPersistenceErrorCode, string> = {
  NOT_FOUND: 'This orchestration run was not found.', ALREADY_EXISTS: 'This orchestration run already exists.',
  READ_FAILED: 'Orchestration history could not be read.', WRITE_FAILED: 'Orchestration history could not be saved. The previous snapshot has been preserved.',
  CORRUPT_JSON: 'The orchestration file contains invalid JSON. The original file has been preserved.',
  UNSUPPORTED_SCHEMA: 'This orchestration file uses an unsupported schema version.',
  INVALID_RECORD: 'The orchestration snapshot is invalid. Existing records have been preserved.',
  DUPLICATE_EVENT: 'An event with this ID is already recorded.', DUPLICATE_PLAN_VERSION: 'This plan version is already recorded.',
  REVISION_CONFLICT: 'The run changed after it was loaded. Reload before saving.',
  UNSAFE_LOCATION: 'Orchestration data must stay in application userData, outside project and worktree directories.',
};
export class OrchestrationPersistenceError extends Error {
  constructor(public readonly code: OrchestrationPersistenceErrorCode) { super(messages[code]); this.name = 'OrchestrationPersistenceError'; }
}
