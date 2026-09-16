import { currentIntervention, type OrganizerFollowUp } from '../../application/orchestration/organizer/OrganizerFollowUp';
import type { TaskExecutionCoordinator } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import type { TeamConversationJournal } from './TeamConversationJournal';
import type { TeamPromptCoordinator, TeamPromptResult } from '../../application/orchestration/TeamPromptCoordinator';
import type { OrchestrationRepository } from '../../application/orchestration/OrchestrationRepository';
import type { StartTeamPromptRequest, ContinueTeamPromptRequest, TeamPromptResponse } from '../../shared/orchestration-api';
import type { MainTeamPromptSource } from './MainTeamPromptSource';
import type { OrchestrationViews } from './OrchestrationViews';
import { OrchestrationBoundaryError as BoundaryError } from './OrchestrationBoundaryError';

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) throw new BoundaryError('ORCHESTRATION_FAILED');
  return value;
}
function input(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BoundaryError('ORCHESTRATION_FAILED');
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new BoundaryError('ORCHESTRATION_FAILED');
  return value as Record<string, unknown>;
}
export function startRequest(value: unknown): StartTeamPromptRequest {
  const data = input(value, ['conversationId', 'projectId', 'branch', 'teamId', 'message']);
  return { conversationId: text(data.conversationId, 200), projectId: text(data.projectId, 200), branch: text(data.branch, 255), teamId: text(data.teamId, 200), message: text(data.message, 32000) };
}
function continueRequest(value: unknown): ContinueTeamPromptRequest {
  const data = input(value, ['runId', 'message']); return { runId: text(data.runId, 200), message: text(data.message, 32000) };
}
export class OrchestrationService {
  private executions = new Map<string, { kind?: 'followup'; owner: number; controller: AbortController; done: Promise<import('../../shared/orchestration-api').ConversationOrchestrationView> }>();
  private active = new Map<string, { owner: number; controller: AbortController; done: Promise<unknown> }>();
  private owners = new Map<number, { closed: boolean }>();
  private stopped = false;
  environmentBusy: (id: string) => boolean = () => false;
  isRunBusy(id: string, conversationId: string) { return this.executions.has(id) || this.active.has(conversationId); }
  constructor(private source: MainTeamPromptSource, private repository: OrchestrationRepository,
    private coordinator: Pick<TeamPromptCoordinator, 'start' | 'continueRun'>, private views: OrchestrationViews, private ready: () => boolean,
    private available: () => boolean = () => true, private journal?: TeamConversationJournal, private tasks?: TaskExecutionCoordinator, private followUp?: OrganizerFollowUp) {}
  subscribe: OrchestrationViews['subscribe'] = listener => this.views.subscribe(listener);
  async get(conversationId: unknown) {
    if (!this.available()) throw new BoundaryError('ORCHESTRATION_FAILED');
    const id = text(conversationId, 200), conversation = await this.source.getConversation(id);
    await this.source.getProject(conversation.projectId);
    const runs = await this.repository.listRuns(id);
    return this.views.project(runs[0] ? await this.repository.rehydrate(runs[0].id) : null);
  }
  private async result(result: TeamPromptResult): Promise<TeamPromptResponse> {
    const snapshot = await this.repository.rehydrate(result.runId);
    await this.journal?.sync(snapshot, result);
    if (this.journal) await this.views.publish(snapshot);
    return { type: result.type, runId: result.runId, message: result.message,
      ...(result.type === 'ask_user' ? { questions: [...result.questions] } : {}), view: await this.views.project(await this.repository.rehydrate(result.runId)) };
  }
  private lifetime(owner: number) {
    let lifetime = this.owners.get(owner);
    if (!lifetime) { lifetime = { closed: false }; this.owners.set(owner, lifetime); }
    return lifetime;
  }
  private exclusive(owner: number, conversationId: string, action: (signal: AbortSignal) => Promise<TeamPromptResult>, lifetime = this.lifetime(owner)): Promise<TeamPromptResponse> {
    if (!this.available() || lifetime.closed) return Promise.reject(new BoundaryError('ORCHESTRATION_FAILED'));
    if (this.stopped || this.active.has(conversationId)) return Promise.reject(new BoundaryError('ORCHESTRATION_BUSY'));
    const controller = new AbortController();
    // Reserve before the first asynchronous validation/runtime call.
    const done = Promise.resolve().then(() => action(controller.signal)).then(result => this.result(result))
      .finally(() => { this.active.delete(conversationId); });
    this.active.set(conversationId, { owner, controller, done }); return done;
  }
  start(owner: number, value: unknown): Promise<TeamPromptResponse> {
    const request = startRequest(value);
    return this.exclusive(owner, request.conversationId, async signal => {
      await this.source.validate(request.conversationId, request.projectId, request.branch);
      await this.source.validateTeam(request.teamId);
      if (!this.ready()) throw new BoundaryError('RUNTIME_NOT_READY');
      if (await this.repository.getActiveRun(request.conversationId)) throw new BoundaryError('ORCHESTRATION_BUSY');
      await this.journal?.assertTeam(request.conversationId, request.teamId);
      await this.journal?.user(request.conversationId, request.message);
      return this.coordinator.start({ conversationId: request.conversationId, projectId: request.projectId, teamId: request.teamId, prompt: request.message, signal });
    });
  }
  async continue(owner: number, value: unknown): Promise<TeamPromptResponse> {
    const request = continueRequest(value);
    const lifetime = this.lifetime(owner);
    let run;
    try { run = await this.repository.getRun(request.runId); } catch { throw new BoundaryError('RUN_NOT_FOUND'); }
    if (this.environmentBusy(run.id)) throw new BoundaryError('ORCHESTRATION_BUSY');
    if (this.executions.has(run.id)) throw new BoundaryError('ORCHESTRATION_BUSY');
    if (currentIntervention((await this.repository.rehydrate(run.id)).state)?.decision?.type === 'ask_user') {
      if (lifetime.closed || this.stopped) throw new BoundaryError('ORCHESTRATION_FAILED');
      const view = await this.requestFollowUp(owner, { runId: run.id }, request.message);
      return { type: 'respond', runId: run.id, message: 'Organizer follow-up saved.', view };
    }
    return this.exclusive(owner, run.conversationId, async signal => {
      if (!['waiting_input', 'completed', 'failed', 'cancelled'].includes(run.status)) throw new BoundaryError('RUN_NOT_WAITING_INPUT');
      await this.source.validate(run.conversationId, run.projectId);
      await this.source.validateTeam(run.teamId);
      if (!this.ready()) throw new BoundaryError('RUNTIME_NOT_READY');
      await this.journal?.assertTeam(run.conversationId, run.teamId);
      await this.journal?.user(run.conversationId, request.message);
      return this.coordinator.continueRun(run.id, request.message, signal);
    }, lifetime);
  }
  async create(value: unknown) {
    const data = input(value, ['projectId', 'branch', 'teamId']);
    if (!this.journal || !this.available()) throw new BoundaryError('ORCHESTRATION_FAILED');
    return this.journal.create(text(data.projectId, 200), text(data.branch, 255), text(data.teamId, 200));
  }
  async cancel(owner: number, value: unknown): Promise<void> {
    const data = input(value, ['runId']); let run;
    try { run = await this.repository.getRun(text(data.runId, 200)); } catch { throw new BoundaryError('RUN_NOT_FOUND'); }
    const active = this.active.get(run.conversationId);
    if (!active || run.status !== 'planning') { if (this.executions.get(run.id)?.kind === 'followup') await this.cancelExecution(owner, value); return; }
    if (active.owner !== owner) throw new BoundaryError('ORCHESTRATION_BUSY');
    active.controller.abort(); await active.done.catch(() => undefined);
  }
  execute(owner: number, value: unknown, retry = false, continuation = false) {
    const data = input(value, ['runId']), id = text(data.runId, 200), lifetime = this.lifetime(owner);
    if (this.environmentBusy(id)) throw new BoundaryError('ORCHESTRATION_BUSY');
    const existing = this.executions.get(id);
    if (existing) { if (existing.owner !== owner || existing.kind === 'followup') throw new BoundaryError('EXECUTION_BUSY'); return existing.done; }
    if (this.stopped || lifetime.closed || !this.available() || !this.tasks) throw new BoundaryError('EXECUTION_FAILED');
    if (!this.ready()) throw new BoundaryError('RUNTIME_NOT_READY');
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const run = await this.repository.getRun(id);
      await this.source.validate(run.conversationId, run.projectId);
      await this.journal?.assertTeam(run.conversationId, run.teamId);
      if (this.active.has(run.conversationId)) throw new BoundaryError('ORCHESTRATION_BUSY');
      await this.tasks!.execute(id, controller.signal, retry, continuation);
      return this.views.project(await this.repository.rehydrate(id));
    }).finally(() => this.executions.delete(id));
    this.executions.set(id, { owner, controller, done }); return done;
  }
  requestFollowUp(owner: number, value: unknown, answer?: string) {
    const data = input(value, ['runId']), id = text(data.runId, 200), lifetime = this.lifetime(owner);
    if (this.environmentBusy(id)) throw new BoundaryError('ORCHESTRATION_BUSY');
    const existing = this.executions.get(id);
    if (existing) { if (existing.owner !== owner || existing.kind !== 'followup') throw new BoundaryError('ORCHESTRATION_BUSY'); return existing.done; }
    if (this.stopped || lifetime.closed || !this.available() || !this.followUp) throw new BoundaryError('ORCHESTRATION_FAILED');
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const run = await this.repository.getRun(id);
      if (this.active.has(run.conversationId)) throw new BoundaryError('ORCHESTRATION_BUSY');
      await this.source.validate(run.conversationId, run.projectId);
      await this.source.validateTeam(run.teamId);
      await this.journal?.assertTeam(run.conversationId, run.teamId);
      if (!this.ready()) throw new BoundaryError('RUNTIME_NOT_READY');
      if (answer !== undefined) await this.journal?.user(run.conversationId, answer);
      await this.followUp!.request(id, controller.signal, answer);
      return this.views.project(await this.repository.rehydrate(id));
    }).finally(() => this.executions.delete(id));
    this.executions.set(id, { owner, controller, done, kind: 'followup' }); return done;
  }
  async cancelExecution(owner: number, value: unknown): Promise<void> {
    const data = input(value, ['runId']), active = this.executions.get(text(data.runId, 200));
    if (!active) return;
    if (active.owner !== owner) throw new BoundaryError('EXECUTION_BUSY');
    active.controller.abort(); await active.done.catch(() => undefined);
  }
  async closeOwner(owner: number): Promise<void> {
    for (const value of this.executions.values()) if (value.owner === owner) value.controller.abort();
    const lifetime = this.owners.get(owner); if (lifetime) lifetime.closed = true;
    this.owners.delete(owner);
    for (const value of this.active.values()) if (value.owner === owner) value.controller.abort();
    await Promise.allSettled([...this.executions.values(), ...this.active.values()].filter(value => value.owner === owner).map(value => value.done));
  }
  async shutdown(): Promise<void> {
    this.stopped = true;
    for (const value of this.executions.values()) value.controller.abort();
    await Promise.allSettled([...this.executions.values()].map(value => value.done));
    for (const lifetime of this.owners.values()) lifetime.closed = true;
    this.owners.clear();
    for (const value of this.active.values()) value.controller.abort();
    await Promise.allSettled([...this.active.values()].map(value => value.done));
  }
}
