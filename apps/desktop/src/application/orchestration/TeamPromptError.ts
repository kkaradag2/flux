const messages = {
  INVALID_TEAM: 'A team needs at least two distinct, registered members and an Organizer from those members.',
  ORGANIZER_DISABLED: 'Enable the Organizer before starting this team.',
  PROJECT_UNAVAILABLE: 'Choose an available project before starting this team.',
  CONVERSATION_UNAVAILABLE: 'This conversation is not available in the selected project.',
  RUNTIME_UNSUPPORTED: 'The Organizer runtime does not support this planning operation.',
  INVALID_REQUEST: 'Provide a non-empty request.',
  RUN_NOT_WAITING: 'Only a run waiting for input can be continued.',
  SESSION_UNAVAILABLE: 'The saved Organizer session is unavailable or no longer matches this team.',
  RUN_BUSY: 'This run is already being continued.',
  RUN_UNAVAILABLE: 'This run could not be loaded.',
  RUNTIME_FAILED: 'The Organizer could not complete the planning request.',
  CANCELLED: 'The planning request was cancelled.',
  PERSISTENCE_FAILED: 'The planning state could not be saved. The previous saved state is retained.',
} as const;
export type TeamPromptErrorCode = keyof typeof messages;
export class TeamPromptError extends Error {
  constructor(readonly code: TeamPromptErrorCode, readonly runId?: string) {
    super(messages[code]); this.name = 'TeamPromptError';
  }
}
