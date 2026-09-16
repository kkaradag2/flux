import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { OrchestrationResult, OrchestrationState, TeamRun } from '../../domain/orchestration';
import type { OrchestrationRepository, RehydratedOrchestration } from '../../application/orchestration/OrchestrationRepository';
import { OrchestrationPersistenceError as PersistenceError } from '../../application/orchestration/OrchestrationPersistenceError';
import { AtomicFileWriter, type AtomicWriter } from '../persistence/AtomicFileWriter';
import { orchestrationDirectory, type OrchestrationStorageLocation } from './OrchestrationStorageLocation';
import { parseOrchestrationRecord, planKey, recordId, rehydrated, type OrchestrationRecord } from './orchestrationRecord';

function filename(id: string): string { return createHash('sha256').update(recordId(id)).digest('hex') + '.json'; }
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export class JsonOrchestrationRepository implements OrchestrationRepository {
  // Shared between repository instances in this main process, keyed by canonical file.
  private static pending = new Map<string, Promise<unknown>>();
  private location: OrchestrationStorageLocation;
  constructor(location: OrchestrationStorageLocation, private writer: AtomicWriter = new AtomicFileWriter()) {
    this.location = structuredClone(location);
  }
  private async serialized<T>(file: string, operation: () => Promise<T>): Promise<T> {
    const key = process.platform === 'win32' ? file.toLowerCase() : file;
    const result = (JsonOrchestrationRepository.pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    JsonOrchestrationRepository.pending.set(key, result);
    try { return await result; } finally { if (JsonOrchestrationRepository.pending.get(key) === result) JsonOrchestrationRepository.pending.delete(key); }
  }
  private async forRun<T>(id: string, operation: (file: string) => Promise<T>): Promise<T> {
    const file = path.join(await orchestrationDirectory(this.location), filename(id));
    return this.serialized(file, () => operation(file));
  }
  private async read(file: string): Promise<OrchestrationRecord> {
    let source: string;
    try {
      if ((await lstat(file)).isSymbolicLink()) throw new PersistenceError('UNSAFE_LOCATION');
      source = await readFile(file, 'utf8');
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'NOT_FOUND' : 'READ_FAILED');
    }
    let data: unknown;
    try { data = JSON.parse(source); } catch { throw new PersistenceError('CORRUPT_JSON'); }
    const record = parseOrchestrationRecord(data);
    if (filename(record.run.id) !== path.basename(file)) throw new PersistenceError('INVALID_RECORD');
    if ((data as { schemaVersion?: unknown }).schemaVersion === 1) await this.write(file, record);
    return record;
  }
  private async write(file: string, record: OrchestrationRecord): Promise<RehydratedOrchestration> {
    try {
      // Recheck confinement before the mutation; never use caller-supplied filenames.
      if (path.dirname(file) !== await orchestrationDirectory(this.location)) throw new PersistenceError('UNSAFE_LOCATION');
      await mkdir(path.dirname(file), { recursive: true });
      await this.writer.write(file, JSON.stringify(record) + '\n');
    } catch (error) { if (error instanceof PersistenceError) throw error; throw new PersistenceError('WRITE_FAILED'); }
    return rehydrated(record);
  }
  private merge(current: OrchestrationRecord, result: OrchestrationResult): OrchestrationRecord {
    if (new Set(result.state.plans.map(plan => plan.version)).size !== result.state.plans.length) throw new PersistenceError('DUPLICATE_PLAN_VERSION');
    for (const key of ['id', 'conversationId', 'projectId', 'teamId', 'organizerAgentId', 'goal', 'createdAt'] as const) {
      if (result.state.run[key] !== current.run[key]) throw new PersistenceError('INVALID_RECORD');
    }
    const existingEvents = new Set(current.events.map(event => event.id));
    for (const event of result.events) if (existingEvents.has(event.id)) throw new PersistenceError('DUPLICATE_EVENT');
    const existingPlans = new Set(current.plans.map(planKey));
    for (const event of result.events) {
      if ((event.type === 'plan.created' || event.type === 'plan.revised') && existingPlans.has(planKey(event.plan))) throw new PersistenceError('DUPLICATE_PLAN_VERSION');
    }
    for (const previous of current.plans) {
      const retained = result.state.plans.find(plan => planKey(plan) === planKey(previous));
      if (!retained || !same(retained, previous)) throw new PersistenceError('DUPLICATE_PLAN_VERSION');
    }
    if (current.tasks.some(task => !result.state.tasks.some(next => next.id === task.id))) throw new PersistenceError('INVALID_RECORD');
    if (result.events.length === 0 && !same(result.state, rehydrated(current).state)) throw new PersistenceError('INVALID_RECORD');
    return parseOrchestrationRecord({ schemaVersion: 2, legacyEventMetadata: current.legacyEventMetadata, revision: current.revision + 1, ...result.state, events: [...current.events, ...result.events] });
  }
  async create(result: OrchestrationResult): Promise<RehydratedOrchestration> {
    const record = parseOrchestrationRecord({ schemaVersion: 2, revision: 1, ...structuredClone(result.state), events: structuredClone(result.events) });
    return this.forRun(record.run.id, async file => {
      try { await this.read(file); } catch (error) {
        if (error instanceof PersistenceError && error.code === 'NOT_FOUND') return this.write(file, record);
        throw error;
      }
      throw new PersistenceError('ALREADY_EXISTS');
    });
  }
  async save(result: OrchestrationResult, expectedRevision: number): Promise<RehydratedOrchestration> {
    const snapshot = structuredClone(result);
    return this.forRun(snapshot.state.run.id, async file => {
      const current = await this.read(file);
      if (current.revision !== expectedRevision) throw new PersistenceError('REVISION_CONFLICT');
      return this.write(file, this.merge(current, snapshot));
    });
  }
  async update(runId: string, transition: (state: OrchestrationState) => OrchestrationResult): Promise<RehydratedOrchestration> {
    return this.forRun(runId, async file => {
      const current = await this.read(file);
      // The application calls the existing central domain API under the run lock.
      // No transition rules or clock live in this repository.
      const result = transition(rehydrated(current).state);
      return this.write(file, this.merge(current, result));
    });
  }
  rehydrate(runId: string): Promise<RehydratedOrchestration> { return this.forRun(runId, async file => rehydrated(await this.read(file))); }
  async getRun(runId: string) { return (await this.rehydrate(runId)).state.run; }
  async getCurrentPlan(runId: string) { return (await this.rehydrate(runId)).currentPlan; }
  async getTasks(runId: string) { return (await this.rehydrate(runId)).state.tasks; }
  async getEvents(runId: string) { return (await this.rehydrate(runId)).events; }
  async listRuns(conversationId: string): Promise<readonly TeamRun[]> {
    recordId(conversationId); return Object.freeze((await this.listAllRuns()).filter(run => run.conversationId === conversationId));
  }
  async listAllRuns(): Promise<readonly TeamRun[]> {
    const directory = await orchestrationDirectory(this.location);
    let files: string[];
    try { files = await readdir(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new PersistenceError('READ_FAILED'); }
    const runs: TeamRun[] = [];
    for (const name of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort()) {
      const file = path.join(directory, name);
      const snapshot = await this.serialized(file, async () => rehydrated(await this.read(file)));
      runs.push(snapshot.state.run);
    }
    return Object.freeze(runs.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id)));
  }
  async getActiveRun(conversationId: string): Promise<RehydratedOrchestration | null> {
    for (const run of await this.listRuns(conversationId)) {
      const snapshot = await this.rehydrate(run.id);
      if (['planning', 'running', 'waiting_input'].includes(snapshot.state.run.status)) return snapshot;
    }
    return null;
  }
}
