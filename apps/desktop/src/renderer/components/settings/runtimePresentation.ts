import type { CodexRuntimeSnapshot, OperationalStatus, UpdateProblem, VerificationReason } from '../../../shared/codex-runtime-state';
const labels: Record<OperationalStatus, string> = { CHECKING: 'Checking…', READY: 'Ready to use', UPDATE_REQUIRED: 'Update required', SIGN_IN_REQUIRED: 'Sign-in required', UNAVAILABLE: 'Unavailable', VERIFICATION_FAILED: 'Could not connect', INSTALLATION_SELECTION_REQUIRED: 'Setup required' };
const failures: Record<VerificationReason, string> = {
  CLI_TOO_OLD: 'This Codex installation must be updated before Flux can use it.',
  MODEL_UNSUPPORTED: 'The current model is not available for this Codex installation. Check your Codex model settings, then try again.',
  PROTOCOL_UNSUPPORTED: 'Flux could not communicate with this version of Codex. Check your Codex installation, then try again.',
  AUTHENTICATION_REQUIRED: 'Sign in to Codex from the terminal, then check again.',
  PROCESS_UNAVAILABLE: 'Codex could not be found. Install the official Codex CLI manually, then check again.',
  VERIFICATION_TIMEOUT: 'Codex took too long to respond. Check your connection and try again.',
  UNKNOWN_INCOMPATIBILITY: 'Codex could not complete the connection check. Please try again.',
};
const updateMessages: Record<Exclude<UpdateProblem, null>, string> = {
  MULTIPLE_INSTALLATIONS: 'Choose the Codex installation Flux should use.',
  UNKNOWN_INSTALLATION: 'Flux could not confirm a single npm global Codex installation. Update Codex using its original installation method, then check again.',
  UPDATE_FAILED: 'Codex could not be updated. Check your connection and permissions, or update it manually, then check again.',
  VERSION_UNCHANGED: 'The update finished, but the selected installation still reports the same version. Choose another installation or try again later.',
  SAVE_FAILED: 'Flux could not read or save the Codex connection status. Your previous saved file has been preserved. Check your app data permissions, then try again.',
};
export function runtimePresentation(snapshot: CodexRuntimeSnapshot) {
  const { state, activity } = snapshot;
  const checking = activity === 'checking' || state.operationalStatus === 'CHECKING';
  const updating = activity === 'updating';
  const busy = checking || updating;
  const status = busy ? 'CHECKING' : state.operationalStatus;
  const selection = state.operationalStatus === 'INSTALLATION_SELECTION_REQUIRED';
  const cannotUpdate = state.operationalStatus === 'UPDATE_REQUIRED' && snapshot.installation?.canUpdate === false;
  return {
    label: updating ? 'Updating' : labels[status],
    tone: status === 'READY' ? 'ready' : status === 'CHECKING' ? 'checking' : status === 'VERIFICATION_FAILED' ? 'error' : 'warning',
    busy, updating,
    canUpdate: updating || state.operationalStatus === 'UPDATE_REQUIRED' && state.verificationReason === 'CLI_TOO_OLD' && !cannotUpdate,
    canChoose: selection || cannotUpdate,
    chooseLabel: selection ? 'Choose installation' : 'Choose another installation',
    retryLabel: state.operationalStatus === 'VERIFICATION_FAILED' ? 'Try again' : 'Check again',
    canRetry: !['READY', 'CHECKING', 'INSTALLATION_SELECTION_REQUIRED', 'UPDATE_REQUIRED'].includes(state.operationalStatus),
    message: updating ? 'Updating Codex. Flux will check the connection when the update finishes.' : checking ? 'Checking your Codex installation and connection…' : selection ? 'Multiple Codex installations were found. Choose which installation Flux should use.' : cannotUpdate ? 'This installation cannot be updated automatically by Flux.' : state.operationalStatus === 'READY' ? 'Codex is connected and ready.' : failures[state.verificationReason ?? 'UNKNOWN_INCOMPATIBILITY'],
    detail: !busy && !selection && !cannotUpdate && state.updateProblem ? updateMessages[state.updateProblem] : null,
  };
}
