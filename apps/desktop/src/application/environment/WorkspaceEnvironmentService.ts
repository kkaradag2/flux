import { workspaceEnvironmentCodes, type WorkspaceEnvironmentStatus, type WorkspaceOnlineConsent, type WorkspaceEnvironmentStage, type WorkspaceValidation } from '../../shared/workspace-environment';
import { WorkspaceEnvironmentRegistry, type WorkspaceEnvironmentContext, type WorkspaceEnvironmentStore, type WorkspaceEnvironmentPlan } from './WorkspaceEnvironmentProvider';
const unavailable = (): WorkspaceEnvironmentStatus => ({ provider: null, state: 'not_prepared', code: 'provider_unavailable', offline: true, lifecycleScripts: false, fingerprint: null, preparationRequired: false });
export function environmentRunId(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('runId' in input) || typeof input.runId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.runId)) throw new Error('Invalid environment request');
  return input.runId;
}
export class WorkspaceEnvironmentService {
  private active = new Map<string, { owner: number; controller: AbortController; done: Promise<WorkspaceEnvironmentStatus>; consentId?: string; stage?: WorkspaceEnvironmentStage; startedAt: string }>();
  private stopped = false;
  private consents = new Map<string, { owner: number; context: WorkspaceEnvironmentContext; plan: WorkspaceEnvironmentPlan; expires: number }>();
  private closedOwners = new Set<number>();
  constructor(private registry: WorkspaceEnvironmentRegistry, private store: WorkspaceEnvironmentStore,
    private resolve: (id: string) => Promise<WorkspaceEnvironmentContext>, private newId: () => string = () => globalThis.crypto.randomUUID()) {}
  busy(id: string) { return this.active.has(id); }
  async status(input: unknown, terminal = false): Promise<WorkspaceEnvironmentStatus> {
    const id = environmentRunId(input), context = await this.resolve(id), detected = await this.registry.detect(context);
    if (!detected) return unavailable();
    const { plan, provider } = detected, old = await this.store.get(id);
    const matches = old?.workspaceId === context.workspaceId && old.providerId === plan.providerId && old.contractVersion === plan.contractVersion && old.fingerprint === plan.fingerprint;
    let state = matches ? old.state : 'not_prepared' as const, code = matches ? old.code : old ? 'lockfile_changed' as const : null;
    if (state === 'ready' && !await provider.isReady(context, plan)) { state = 'not_prepared'; code = null; }
    if (state === 'ready' && old?.mode === 'online') {
      try { const current = await provider.onlinePlan?.(context); if (!current || current.sourceFingerprint !== old.sourceFingerprint || current.registryHost !== old.registryHost) { state = 'not_prepared'; code = 'lockfile_changed'; } }
      catch { state = 'not_prepared'; code = 'registry_not_allowed'; }
    }
    if (old && state === 'not_prepared' && !this.active.has(id) && !provider.onlinePlan) await this.store.save({ ...old, workspaceId: context.workspaceId, providerId: plan.providerId, contractVersion: plan.contractVersion, fingerprint: plan.fingerprint, state, code, updatedAt: new Date().toISOString() });
    const active = terminal ? undefined : this.active.get(id);
    return { provider: plan.description, state: active ? 'preparing' : state, code, offline: old?.mode !== 'online', mode: old?.mode ?? 'offline', lifecycleScripts: false, fingerprint: plan.fingerprint, preparationRequired: state !== 'ready',
      onlineAvailable: !!provider.onlinePlan && state !== 'ready' && (old?.code === 'offline_dependencies_unavailable' || old?.mode === 'online'),
      ...(old?.registryHost ? { registryHost: old.registryHost } : {}), ...(old?.validation ? { validation: old.validation } : {}),
      ...(active ? { stage: active.stage ?? 'resolving_registry', startedAt: active.startedAt } : old?.durationMs !== undefined ? { durationMs: old.durationMs } : {}) };

  }
  prepare(owner: number, input: unknown): Promise<WorkspaceEnvironmentStatus> {
    const id = environmentRunId(input), existing = this.active.get(id);
    if (existing) { if (existing.owner !== owner) return Promise.reject(new Error('Environment busy')); return existing.done; }
    if (this.stopped || this.closedOwners.has(owner)) return Promise.reject(new Error('Environment stopped'));
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const context = await this.resolve(id), detected = await this.registry.detect(context);
      if (!detected) return unavailable();
      const { provider, plan } = detected, previous = await this.store.get(id), now = new Date().toISOString();
      if (previous?.workspaceId === context.workspaceId && previous.fingerprint === plan.fingerprint && previous.contractVersion === plan.contractVersion && previous.providerId === plan.providerId && previous.state === 'ready' && await provider.isReady(context, plan)) return this.status(input, true);
      const record = { runId: id, workspaceId: context.workspaceId, providerId: plan.providerId, contractVersion: plan.contractVersion, fingerprint: plan.fingerprint, state: 'preparing' as const, code: null, createdAt: previous?.createdAt ?? now, updatedAt: now };
      await this.store.save(record);
      let code: import('../../shared/workspace-environment').WorkspaceEnvironmentCode;
      try { code = controller.signal.aborted ? 'preparation_cancelled' : (await provider.prepare(context, plan, controller.signal)).code; }
      catch { code = controller.signal.aborted ? 'preparation_cancelled' : 'preparation_failed'; }
      if (!(workspaceEnvironmentCodes as readonly string[]).includes(code)) code = 'preparation_failed';
      if (controller.signal.aborted) code = 'preparation_cancelled';
      await this.store.save({ ...record, state: code === 'ready' ? 'ready' : code === 'preparation_cancelled' ? 'cancelled' : 'failed', code, updatedAt: new Date().toISOString() });
      return this.status(input, true);
    }).finally(() => this.active.delete(id));
    this.active.set(id, { owner, controller, done, startedAt: new Date().toISOString() }); return done;
  }
  async onlinePlan(owner: number, input: unknown): Promise<WorkspaceOnlineConsent> {
    const id = environmentRunId(input);
    if (this.stopped || this.closedOwners.has(owner) || this.active.has(id)) throw new Error('preparation_failed');
    const context = await this.resolve(id), detected = await this.registry.detect(context), plan = await detected?.provider.onlinePlan?.(context);
    if (!plan?.registryHost || !plan.sourceFingerprint || plan.mode !== 'online_with_confirmation') throw new Error('registry_not_allowed');
    if (this.stopped || this.closedOwners.has(owner) || this.active.has(id)) throw new Error('preparation_failed');
    for (const [key, value] of this.consents) if (value.expires <= Date.now() || (value.owner === owner && value.context.runId === id)) this.consents.delete(key);
    const consentId = this.newId(), expires = Date.now() + 5 * 60 * 1000;
    this.consents.set(consentId, { owner, context, plan, expires });
    return { consentId, provider: plan.description, registryHost: plan.registryHost, fingerprint: plan.fingerprint, contractVersion: plan.contractVersion, expiresAt: new Date(expires).toISOString() };
  }
  cancelConsent(owner: number, input: unknown) {
    const { runId, consentId } = onlineRequest(input), consent = this.consents.get(consentId);
    if (consent?.owner === owner && consent.context.runId === runId) this.consents.delete(consentId);
    return { code: 'user_cancelled' as const };
  }
  prepareOnline(owner: number, input: unknown): Promise<WorkspaceEnvironmentStatus> {
    const { runId: id, consentId } = onlineRequest(input), existing = this.active.get(id);
    if (existing) { if (existing.owner !== owner || existing.consentId !== consentId) return Promise.reject(new Error('preparation_failed')); return existing.done; }
    const consent = this.consents.get(consentId);
    if (this.stopped || this.closedOwners.has(owner) || !consent || consent.owner !== owner || consent.context.runId !== id || consent.expires <= Date.now()) return Promise.reject(new Error('user_cancelled'));
    this.consents.delete(consentId); // One-shot, owner-bound consent; never persisted as reusable permission.
    const controller = new AbortController(), startedAt = new Date().toISOString();
    const progress = (stage: WorkspaceEnvironmentStage) => { const entry = this.active.get(id); if (entry) entry.stage = stage; };
    const done = Promise.resolve().then(async () => {
      const context = await this.resolve(id), detected = await this.registry.detect(context), plan = await detected?.provider.onlinePlan?.(context);
      if (!plan || !detected?.provider.prepareOnline) throw new Error('registry_not_allowed');
      if (JSON.stringify(context) !== JSON.stringify(consent.context) || JSON.stringify(plan) !== JSON.stringify(consent.plan)) throw new Error('lockfile_changed');
      if (controller.signal.aborted) throw new Error('preparation_cancelled');
      const previous = await this.store.get(id);
      if (previous?.state === 'ready' && previous.workspaceId === context.workspaceId && previous.providerId === plan.providerId
        && previous.contractVersion === plan.contractVersion && previous.fingerprint === plan.fingerprint && previous.sourceFingerprint === plan.sourceFingerprint
        && previous.registryHost === plan.registryHost && await detected.provider.isReady(context, plan)) return this.status({ runId: id }, true);
      const record = { runId: id, workspaceId: context.workspaceId, providerId: plan.providerId, contractVersion: plan.contractVersion, fingerprint: plan.fingerprint,
        mode: 'online' as const, registryHost: plan.registryHost!, sourceFingerprint: plan.sourceFingerprint!, consentAt: startedAt, startedAt,
        state: 'preparing' as const, code: null, createdAt: startedAt, updatedAt: startedAt };
      await this.store.save(record);
      let code: import('../../shared/workspace-environment').WorkspaceEnvironmentCode, validation: WorkspaceValidation | undefined;
      try { code = (await detected.provider.prepareOnline(context, plan, controller.signal, progress)).code; }
      catch { code = controller.signal.aborted ? 'preparation_cancelled' : 'preparation_failed'; }
      if (!(workspaceEnvironmentCodes as readonly string[]).includes(code)) code = 'preparation_failed';
      if (controller.signal.aborted) code = 'preparation_cancelled';
      if (code === 'ready' && detected.provider.validate) {
        progress('validating_source');
        try { validation = await detected.provider.validate(context, controller.signal); }
        catch { validation = { signup: 'not_run', typecheck: 'not_run', build: 'not_run', diff: 'not_run', sourceUnchanged: false }; }
      }
      await this.store.save({ ...record, state: code === 'ready' ? 'ready' : code === 'preparation_cancelled' ? 'cancelled' : 'failed', code, updatedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt), ...(validation ? { validation } : {}) });
      return this.status({ runId: id }, true);
    }).finally(() => this.active.delete(id));
    this.active.set(id, { owner, controller, done, consentId, stage: 'resolving_registry', startedAt }); return done;
  }
  async cancel(owner: number, input: unknown) { const active = this.active.get(environmentRunId(input)); if (!active) return; if (active.owner !== owner) throw new Error('Environment busy'); active.controller.abort(); await active.done.catch(() => undefined); }
  verify(owner: number, input: unknown): Promise<WorkspaceEnvironmentStatus> {
    const id = environmentRunId(input), existing = this.active.get(id);
    if (existing || this.stopped || this.closedOwners.has(owner)) return Promise.reject(new Error('preparation_failed'));
    const controller = new AbortController(), startedAt = new Date().toISOString();
    const done = Promise.resolve().then(async () => {
      const context = await this.resolve(id), detected = await this.registry.detect(context), record = await this.store.get(id);
      if (!record || record.state !== 'ready' || !detected?.provider.validate || record.workspaceId !== context.workspaceId || record.providerId !== detected.plan.providerId
        || record.contractVersion !== detected.plan.contractVersion || record.fingerprint !== detected.plan.fingerprint || !await detected.provider.isReady(context, detected.plan)) throw new Error('preparation_failed');
      const validation = await detected.provider.validate(context, controller.signal);
      await this.store.save({ ...record, validation, updatedAt: new Date().toISOString() });
      return this.status(input, true);
    }).finally(() => this.active.delete(id));
    this.active.set(id, { owner, controller, done, startedAt, stage: 'validating_source' }); return done;
  }
  async closeOwner(owner: number) { this.closedOwners.add(owner); for (const [key, value] of this.consents) if (value.owner === owner) this.consents.delete(key); const values = [...this.active.values()].filter(v => v.owner === owner); for (const v of values) v.controller.abort(); await Promise.allSettled(values.map(v => v.done)); }
  async shutdown() { this.stopped = true; this.consents.clear(); const values = [...this.active.values()]; for (const v of values) v.controller.abort(); await Promise.allSettled(values.map(v => v.done)); }
}

export function onlineRequest(input: unknown): { runId: string; consentId: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 || !('runId' in input) || !('consentId' in input) || typeof input.consentId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.consentId)) throw new Error('preparation_failed');
  return { runId: environmentRunId({ runId: input.runId }), consentId: input.consentId };
}
