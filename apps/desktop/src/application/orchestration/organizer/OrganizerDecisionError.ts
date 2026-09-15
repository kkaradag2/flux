const messages = {
  INVALID_JSON: 'The Organizer response must be a JSON decision.',
  INVALID_SHAPE: 'The Organizer decision does not match the required format.',
  INVALID_CONTEXT: 'The Organizer team context is invalid.',
  INVALID_ASSIGNEE: 'A task must be assigned to an enabled member of the selected team.',
  INVALID_DEPENDENCIES: 'The plan contains duplicate task keys or invalid task dependencies.',
} as const;
export type OrganizerDecisionErrorCode = keyof typeof messages;
export class OrganizerDecisionError extends Error {
  constructor(public readonly code: OrganizerDecisionErrorCode) { super(messages[code]); this.name = 'OrganizerDecisionError'; }
}
