import type { VerificationReason } from '../../shared/codex-runtime-state';
import type { SmokeTestErrorCode } from '../../shared/codex-smoke-test';
// Inspect in main only, emit a fixed classification, never the matched text.
export function classifyTurnError(value: unknown): VerificationReason {
  const message = value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message.slice(0, 8192) : '';
  if (/model requires a (?:newer|later|more recent) version of Codex/i.test(message)) return 'CLI_TOO_OLD';
  if (/model .*?(?:not supported|unsupported|not available)/i.test(message)) return 'MODEL_UNSUPPORTED';
  if (/(?:authentication required|not authenticated|please (?:log|sign) in)/i.test(message)) return 'AUTHENTICATION_REQUIRED';
  return 'UNKNOWN_INCOMPATIBILITY';
}
export function reasonForCode(code: SmokeTestErrorCode | null): VerificationReason | null {
  if (code === null) return null;
  if (code === 'NOT_INSTALLED' || code === 'START_FAILED' || code === 'PROCESS_EXIT') return 'PROCESS_UNAVAILABLE';
  if (code === 'PROTOCOL_ERROR') return 'PROTOCOL_UNSUPPORTED';
  if (code === 'TIMEOUT') return 'VERIFICATION_TIMEOUT';
  // RUNTIME_INCOMPATIBLE alone is deliberately insufficient for CLI_TOO_OLD.
  return 'UNKNOWN_INCOMPATIBILITY';
}
