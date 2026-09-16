import type { WorkspaceEnvironmentCode, WorkspaceEnvironmentState, WorkspaceEnvironmentStage, WorkspaceValidation } from '../../shared/workspace-environment';
export type WorkspaceEnvironmentContext = { runId: string; workspaceId: string; directory: string };
export type WorkspaceEnvironmentPlan = { providerId: string; contractVersion: string; fingerprint: string; description: string; mode?: 'offline' | 'online_with_confirmation'; registryHost?: string; sourceFingerprint?: string };
export type WorkspaceEnvironmentPreparationResult = { code: WorkspaceEnvironmentCode };
export interface WorkspaceEnvironmentProvider {
  readonly id: string;
  detect(context: WorkspaceEnvironmentContext): Promise<WorkspaceEnvironmentPlan | null>;
  prepare(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan, signal: AbortSignal): Promise<WorkspaceEnvironmentPreparationResult>;
  isReady(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan): Promise<boolean>;
  onlinePlan?(context: WorkspaceEnvironmentContext): Promise<WorkspaceEnvironmentPlan | null>;
  prepareOnline?(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan, signal: AbortSignal, progress: (stage: WorkspaceEnvironmentStage) => void): Promise<WorkspaceEnvironmentPreparationResult>;
  validate?(context: WorkspaceEnvironmentContext, signal: AbortSignal): Promise<WorkspaceValidation>;
}
export class WorkspaceEnvironmentRegistry {
  constructor(private providers: readonly WorkspaceEnvironmentProvider[]) {
    if (new Set(providers.map(p => p.id)).size !== providers.length) throw new Error('Duplicate environment provider');
  }
  async detect(context: WorkspaceEnvironmentContext) {
    for (const provider of this.providers) { const plan = await provider.detect(context); if (plan) return { provider, plan }; }
    return null;
  }
}
export type WorkspaceEnvironmentRecord = {
  runId: string; workspaceId: string; providerId: string; contractVersion: string; fingerprint: string;
  state: WorkspaceEnvironmentState; code: WorkspaceEnvironmentCode | null; createdAt: string; updatedAt: string;
  mode?: 'offline' | 'online'; registryHost?: string; consentAt?: string; sourceFingerprint?: string; startedAt?: string; durationMs?: number; validation?: WorkspaceValidation;
};
export interface WorkspaceEnvironmentStore {
  get(id: string): Promise<WorkspaceEnvironmentRecord | null>;
  save(record: WorkspaceEnvironmentRecord): Promise<void>;
  recover(): Promise<void>;
}
