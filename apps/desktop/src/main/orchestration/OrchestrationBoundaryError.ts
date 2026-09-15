import type { OrchestrationErrorCode } from '../../shared/orchestration-api';
import { TeamPromptError } from '../../application/orchestration/TeamPromptError';
const messages: Record<OrchestrationErrorCode, string> = {
  PROJECT_NOT_FOUND: 'Choose an available registered project.', CONVERSATION_NOT_FOUND: 'This conversation is unavailable.',
  CONVERSATION_PROJECT_MISMATCH: 'This conversation belongs to a different project.', BRANCH_NOT_FOUND: 'Choose the conversation’s available local branch.',
  TEAM_NOT_FOUND: 'This team is unavailable.', TEAM_NOT_RUNNABLE: 'Configure a team with at least two distinct registered agents.',
  ORGANIZER_NOT_AVAILABLE: 'Choose an enabled Organizer from the team members.', RUNTIME_NOT_READY: 'The Organizer runtime is not ready for planning.',
  RUN_NOT_FOUND: 'This planning run is unavailable.', RUN_NOT_WAITING_INPUT: 'This run is not waiting for input.',
  ORCHESTRATION_BUSY: 'A planning operation is already active for this conversation.', ORCHESTRATION_FAILED: 'The planning operation could not be completed.',
};
export class OrchestrationBoundaryError extends Error {
  constructor(readonly code: OrchestrationErrorCode) { super(messages[code]); }
}
export function orchestrationError(error: unknown): { code: OrchestrationErrorCode; message: string } {
  let code: OrchestrationErrorCode = 'ORCHESTRATION_FAILED';
  if (error instanceof OrchestrationBoundaryError) code = error.code;
  else if (error instanceof TeamPromptError) {
    const mapping: Partial<Record<TeamPromptError['code'], OrchestrationErrorCode>> = {
      INVALID_TEAM: 'TEAM_NOT_RUNNABLE', ORGANIZER_DISABLED: 'ORGANIZER_NOT_AVAILABLE', PROJECT_UNAVAILABLE: 'PROJECT_NOT_FOUND',
      CONVERSATION_UNAVAILABLE: 'CONVERSATION_NOT_FOUND', RUNTIME_UNSUPPORTED: 'RUNTIME_NOT_READY', RUN_NOT_WAITING: 'RUN_NOT_WAITING_INPUT',
      SESSION_UNAVAILABLE: 'ORGANIZER_NOT_AVAILABLE', RUN_BUSY: 'ORCHESTRATION_BUSY', RUN_UNAVAILABLE: 'RUN_NOT_FOUND',
    };
    code = mapping[error.code] ?? code;
  }
  return { code, message: messages[code] };
}
