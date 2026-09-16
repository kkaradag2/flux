export const workspaceEnvironmentCodes = ['ready', 'offline_dependencies_unavailable', 'lockfile_changed', 'provider_unavailable', 'preparation_cancelled', 'preparation_failed', 'user_cancelled', 'registry_not_allowed', 'authentication_required', 'integrity_failed', 'download_failed'] as const;
export type WorkspaceEnvironmentCode = typeof workspaceEnvironmentCodes[number];
export type WorkspaceEnvironmentStage = 'resolving_registry' | 'downloading_dependencies' | 'linking_workspace' | 'verifying_lockfile' | 'validating_source';
export type WorkspaceValidation = { signup: 'passed' | 'failed' | 'not_run'; typecheck: 'passed' | 'failed' | 'not_run'; build: 'passed' | 'failed' | 'not_run'; diff: 'passed' | 'failed' | 'not_run'; sourceUnchanged: boolean };
export type WorkspaceOnlineConsent = { consentId: string; provider: string; registryHost: string; fingerprint: string; contractVersion: string; expiresAt: string };
export type WorkspaceEnvironmentState = 'not_prepared' | 'preparing' | 'ready' | 'failed' | 'cancelled';
export type WorkspaceEnvironmentStatus = {
  provider: string | null; state: WorkspaceEnvironmentState; code: WorkspaceEnvironmentCode | null;
  offline: boolean; lifecycleScripts: false; fingerprint: string | null; preparationRequired: boolean;
  mode?: 'offline' | 'online'; onlineAvailable?: boolean; registryHost?: string; stage?: WorkspaceEnvironmentStage;
  startedAt?: string; durationMs?: number; validation?: WorkspaceValidation;
};
