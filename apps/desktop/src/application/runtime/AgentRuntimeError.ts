const messages = {
 RUNTIME_NOT_READY: 'The selected runtime is not ready.',
 RUNTIME_NOT_SUPPORTED: 'This agent runtime is not registered.',
 RUNTIME_CAPABILITY_MISSING: 'The runtime does not support the required capabilities.',
 RUNTIME_TIMEOUT: 'The runtime request timed out.',
 RUNTIME_CANCELLED: 'The runtime request was cancelled.',
 INVALID_STRUCTURED_RESULT: 'The runtime returned an invalid structured result.',
 RUNTIME_PROTOCOL_ERROR: 'The runtime could not complete the request.',
 UNEXPECTED_TOOL_REQUEST: 'An unexpected tool or approval request was stopped.',
 RUNTIME_PROCESS_EXITED: 'The runtime process exited before completing the request.',
 RUNTIME_SESSION_BUSY: 'A turn is already running in this session.',
} as const;
export type AgentRuntimeErrorCode = keyof typeof messages;
export class AgentRuntimeError extends Error {
 constructor(public readonly code: AgentRuntimeErrorCode) { super(messages[code]); this.name = 'AgentRuntimeError'; }
}
