import type { ApiResult } from './project-api';
export type OperationalStatus = 'CHECKING' | 'READY' | 'UPDATE_REQUIRED' | 'SIGN_IN_REQUIRED' | 'UNAVAILABLE' | 'VERIFICATION_FAILED' | 'INSTALLATION_SELECTION_REQUIRED';
export type VerificationReason = 'CLI_TOO_OLD' | 'MODEL_UNSUPPORTED' | 'PROTOCOL_UNSUPPORTED' | 'AUTHENTICATION_REQUIRED' | 'PROCESS_UNAVAILABLE' | 'VERIFICATION_TIMEOUT' | 'UNKNOWN_INCOMPATIBILITY';
export type UpdateProblem = 'MULTIPLE_INSTALLATIONS' | 'UNKNOWN_INSTALLATION' | 'UPDATE_FAILED' | 'VERSION_UNCHANGED' | 'SAVE_FAILED' | null;
export type CodexRuntimeState = {
  runtime: 'codex'; cliVersion: string | null; authenticationMethod: string | null;
  operationalStatus: OperationalStatus; verificationStatus: 'unverified' | 'passed' | 'failed';
  verificationReason: VerificationReason | null; verifiedAt: string | null; updatedAt: string;
  updateProblem: UpdateProblem;
  installationId?: string | null;
};
export type CodexRuntimeSnapshot = { state: CodexRuntimeState; activity: 'checking' | 'updating' | null; installation?: import('./codex-installation').CodexInstallationSummary };
export interface CodexRuntimeStateApi {
  getCodexRuntimeState(): Promise<ApiResult<CodexRuntimeSnapshot>>;
  inspectCodexRuntime(): Promise<ApiResult<CodexRuntimeSnapshot>>;
  retryCodexRuntime(): Promise<ApiResult<CodexRuntimeSnapshot>>;
  updateCodexRuntime(): Promise<ApiResult<CodexRuntimeSnapshot>>;
  getCodexInstallations(): Promise<ApiResult<import('./codex-installation').CodexInstallationCandidate[]>>;
  selectCodexInstallation(candidateId: string): Promise<ApiResult<CodexRuntimeSnapshot>>;
}
