import type { CodexRuntimeSnapshot, CodexRuntimeState, VerificationReason } from '../../shared/codex-runtime-state';
import type { CodexRuntimeHealth } from '../../shared/runtime-health';
import type { CodexSmokeTestResult } from '../../shared/codex-smoke-test';
import type { RuntimeStateStore } from './CodexRuntimeStateRepository';
import type { CodexUpdater } from './CodexUpdateService';
import type { CodexInstallationService } from './CodexInstallationService';
import type { CodexInstallationCandidate } from '../../shared/codex-installation';
import type { CodexUpdateProgress, CodexUpdateStage } from '../../shared/codex-update-progress';
interface Health { refresh(): Promise<CodexRuntimeHealth>; invalidate(): void }
interface Verifier { run(): Promise<CodexSmokeTestResult>; shutdown(): Promise<void> }
const initial = (): CodexRuntimeState => ({ runtime: 'codex', cliVersion: null, authenticationMethod: null, operationalStatus: 'CHECKING', verificationStatus: 'unverified', verificationReason: null, verifiedAt: null, updatedAt: new Date().toISOString(), updateProblem: null });
export function statusForReason(reason: VerificationReason): CodexRuntimeState['operationalStatus'] {
  if (reason === 'CLI_TOO_OLD') return 'UPDATE_REQUIRED';
  if (reason === 'AUTHENTICATION_REQUIRED') return 'SIGN_IN_REQUIRED';
  if (reason === 'PROCESS_UNAVAILABLE') return 'UNAVAILABLE';
  return 'VERIFICATION_FAILED';
}
export class CodexRuntimeStateService {
  private state = initial();
  private activity: CodexRuntimeSnapshot['activity'] = null;
  private pending: Promise<CodexRuntimeSnapshot> | null = null;
  private loaded = false;
  private stopped = false;
  private listing: Promise<CodexInstallationCandidate[]> | null = null;
  private updateProgress: CodexUpdateProgress | null = null;
  constructor(private repository: RuntimeStateStore, private health: Health, private verifier: Verifier, private updater: CodexUpdater, private installations?: CodexInstallationService) {}
  snapshot(): CodexRuntimeSnapshot { return { state: { ...this.state }, activity: this.activity, updateProgress: this.updateProgress ? { ...this.updateProgress } : null, ...(this.installations ? { installation: this.installations.currentSummary() } : {}) }; }
  private updateStage(stage: CodexUpdateStage): void { this.updateProgress = { stage, startedAt: this.updateProgress?.startedAt ?? new Date().toISOString() }; }
  candidates(): Promise<CodexInstallationCandidate[]> {
    if (this.listing) return this.listing;
    const prior = this.pending;
    this.listing = (async () => { await prior; return this.installations ? this.installations.list() : []; })().finally(() => { this.listing = null; });
    return this.listing;
  }
  selectInstallation(id: string): Promise<CodexRuntimeSnapshot> {
    return this.exclusive('checking', async () => {
      if (!this.installations) return;
      await this.installations.choose(id);
      this.health.invalidate();
      await this.save({ ...initial(), installationId: this.installations.currentSummary().id });
      await this.check(true);
    });
  }
  get running(): boolean { return this.pending !== null || this.listing !== null; }
  inspect(force = false): Promise<CodexRuntimeSnapshot> { return this.exclusive('checking', () => this.check(force)); }
  update(): Promise<CodexRuntimeSnapshot> {
    return this.exclusive('updating', async () => {
      await this.load();
      if (this.state.operationalStatus !== 'UPDATE_REQUIRED' || this.state.verificationReason !== 'CLI_TOO_OLD') return;
      if (this.installations && !this.installations.currentSummary().canUpdate) return;
      this.updateProgress = null;
      this.updateStage('PREPARING');
      const previousVersion = this.state.cliVersion;
      const problem = await this.updater.update(() => this.updateStage('INSTALLING'));
      if (problem) { await this.save({ ...this.state, updateProblem: problem, updatedAt: new Date().toISOString() }); return; }
      this.updateStage('CHECKING_VERSION');
      // Invalidate persistent verification before checking the new installation.
      await this.save({ ...this.state, operationalStatus: 'CHECKING', verificationStatus: 'unverified', verificationReason: null, verifiedAt: null, updateProblem: null, updatedAt: new Date().toISOString() });
      this.health.invalidate();
      await this.check(true, previousVersion);
    });
  }
  async shutdown(): Promise<void> { this.stopped = true; await Promise.all([this.verifier.shutdown(), this.updater.shutdown()]); await this.pending; await this.listing; }
  private exclusive(activity: CodexRuntimeSnapshot['activity'], action: () => Promise<void>): Promise<CodexRuntimeSnapshot> {
    if (this.pending) return this.pending;
    if (this.stopped) return Promise.resolve(this.snapshot());
    this.activity = activity;
    const priorListing = this.listing;
    this.pending = (async () => { await priorListing; await action(); })().catch((error: unknown) => {
      if (error instanceof Error && error.name === 'InstallationSelectionError') throw error;
      this.state = { ...this.state, operationalStatus: 'VERIFICATION_FAILED', verificationStatus: 'failed', verificationReason: 'UNKNOWN_INCOMPATIBILITY', updateProblem: 'SAVE_FAILED', updatedAt: new Date().toISOString() };
    }).then(() => {
      if (activity === 'updating' && this.updateProgress) {
        if (this.state.operationalStatus === 'READY') this.updateStage('COMPLETED');
        else this.updateProgress = null;
      }
      this.activity = null; return this.snapshot();
    }).finally(() => { this.activity = null; this.pending = null; });
    return this.pending;
  }
  private async load(): Promise<void> { if (!this.loaded) { const saved = await this.repository.load(); if (saved) this.state = saved; this.loaded = true; } }
  private async save(state: CodexRuntimeState): Promise<void> { await this.repository.save(state); this.state = state; }
  private async check(force: boolean, versionBeforeUpdate?: string | null): Promise<void> {
    await this.load();
    const previous = this.state;
    const installation = await this.installations?.inspect();
    if (installation?.selectionRequired) {
      await this.save({ ...initial(), operationalStatus: 'INSTALLATION_SELECTION_REQUIRED' }); return;
    }
    const health = await this.health.refresh();
    if (this.stopped) return;
    const base = { ...initial(), cliVersion: health.version, authenticationMethod: health.authenticationMethod, updatedAt: health.checkedAt, ...(installation ? { installationId: installation.id } : {}) };
    if (health.status !== 'ready') {
      const auth = health.status === 'not-authenticated';
      await this.save({ ...base, operationalStatus: auth ? 'SIGN_IN_REQUIRED' : 'UNAVAILABLE', verificationReason: auth ? 'AUTHENTICATION_REQUIRED' : 'PROCESS_UNAVAILABLE' }); return;
    }
    if (versionBeforeUpdate !== undefined && versionBeforeUpdate === health.version) {
      await this.save({ ...base, operationalStatus: 'VERIFICATION_FAILED', verificationStatus: 'failed', verificationReason: 'UNKNOWN_INCOMPATIBILITY', updateProblem: 'VERSION_UNCHANGED' }); return;
    }
    const matches = previous.cliVersion === health.version && previous.authenticationMethod === health.authenticationMethod && (!installation || previous.installationId === installation.id);
    if (!force && matches && previous.verificationStatus !== 'unverified') {
      await this.save({ ...previous, updatedAt: health.checkedAt }); return;
    }
    // Store invalidation before starting an asynchronous model call (including crash/restart).
    await this.save(base);
    if (this.stopped) return;
    if (this.activity === 'updating' && this.updateProgress) this.updateStage('VERIFYING_CONNECTION');
    const result = await this.verifier.run();
    const passed = result.status === 'passed' && result.response === 'Hello from Flux.';
    const reason = passed ? null : result.verificationReason ?? 'UNKNOWN_INCOMPATIBILITY';
    await this.save({ ...base, operationalStatus: passed ? 'READY' : statusForReason(reason!), verificationStatus: passed ? 'passed' : 'failed', verificationReason: reason, verifiedAt: result.checkedAt, updatedAt: new Date().toISOString() });
  }
}
