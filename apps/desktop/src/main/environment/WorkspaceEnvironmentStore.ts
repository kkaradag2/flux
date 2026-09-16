import { workspaceEnvironmentCodes } from '../../shared/workspace-environment';
import { mkdir, readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceEnvironmentRecord, WorkspaceEnvironmentStore } from '../../application/environment/WorkspaceEnvironmentProvider';
import { AtomicFileWriter } from '../persistence/AtomicFileWriter';
const idPattern = /^[a-f0-9-]{36}$/;
export class JsonWorkspaceEnvironmentStore implements WorkspaceEnvironmentStore {
  constructor(private directory: string) {}
  private async file(id: string) {
    if (!idPattern.test(id)) throw new Error('Invalid environment identity');
    await mkdir(this.directory, { recursive: true });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('Unsafe environment storage');
    const file = path.join(this.directory, id + '.json');
    try { if ((await lstat(file)).isSymbolicLink()) throw new Error('Unsafe environment storage'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    return file;
  }
  async get(id: string): Promise<WorkspaceEnvironmentRecord | null> {
    try { const r = JSON.parse(await readFile(await this.file(id), 'utf8')) as WorkspaceEnvironmentRecord;
      if (r.runId !== id || !idPattern.test(r.workspaceId) || !/^[a-z0-9-]{1,80}$/.test(r.providerId) || !/^[\w.-]{1,30}$/.test(r.contractVersion) || !/^[a-f0-9]{64}$/.test(r.fingerprint)
        || !['not_prepared','preparing','ready','failed','cancelled'].includes(r.state) || !(r.code === null || (workspaceEnvironmentCodes as readonly string[]).includes(r.code))
        || !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.updatedAt))) throw new Error('Invalid environment record');
      if (r.mode !== undefined && !['offline','online'].includes(r.mode)) throw new Error('Invalid environment record');
      if (r.registryHost !== undefined && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(r.registryHost)) throw new Error('Invalid environment record');
      if (r.sourceFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(r.sourceFingerprint)) throw new Error('Invalid environment record');
      for (const date of [r.consentAt, r.startedAt]) if (date !== undefined && !Number.isFinite(Date.parse(date))) throw new Error('Invalid environment record');
      if (r.durationMs !== undefined && (!Number.isFinite(r.durationMs) || r.durationMs < 0)) throw new Error('Invalid environment record');
      if (r.validation && (Object.keys(r.validation).sort().join(',') !== 'build,diff,signup,sourceUnchanged,typecheck' || typeof r.validation.sourceUnchanged !== 'boolean' || [r.validation.signup,r.validation.typecheck,r.validation.build,r.validation.diff].some(v => !['passed','failed','not_run'].includes(v)))) throw new Error('Invalid environment record');
      return r;
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async save(r: WorkspaceEnvironmentRecord) {
    // Explicit projection: no paths, commands, environment or process output can be persisted.
    const { runId, workspaceId, providerId, contractVersion, fingerprint, state, code, createdAt, updatedAt, mode, registryHost, consentAt, sourceFingerprint, startedAt, durationMs, validation } = r;
    await new AtomicFileWriter().write(await this.file(runId), JSON.stringify({ runId, workspaceId, providerId, contractVersion, fingerprint, state, code, createdAt, updatedAt, mode, registryHost, consentAt, sourceFingerprint, startedAt, durationMs, validation }) + '\n');
  }
  async recover() {
    let files: string[]; try { files = await readdir(this.directory); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    for (const file of files) if (idPattern.test(file.slice(0,-5)) && file.endsWith('.json')) {
      const r = await this.get(file.slice(0,-5)); if (r?.state === 'preparing') await this.save({ ...r, state: 'failed', code: 'preparation_failed', updatedAt: new Date().toISOString() });
    }
  }
}
