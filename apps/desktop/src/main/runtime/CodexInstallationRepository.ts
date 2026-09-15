import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { InstallationMethod } from '../../shared/codex-installation';
export type InstallationSelection = { selectedCandidateId: string; selectedExecutablePath: string; installationMethod: InstallationMethod; selectedAt: string };
export interface InstallationStore { load(): Promise<InstallationSelection | null>; save(selection: InstallationSelection | null): Promise<void> }
export class CodexInstallationRepository implements InstallationStore {
  constructor(private file: string) {}
  async load(): Promise<InstallationSelection | null> {
    let text: string;
    try { text = await readFile(this.file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Installation selection could not be read.'); }
    try {
      const value: unknown = JSON.parse(text); if (value === null) return null;
      if (!value || typeof value !== 'object') throw new Error(); const v = value as Record<string, unknown>;
      if (typeof v.selectedCandidateId !== 'string' || !/^[a-f0-9]{64}$/.test(v.selectedCandidateId) || typeof v.selectedExecutablePath !== 'string' || !path.isAbsolute(v.selectedExecutablePath) || /[\0\r\n]/.test(v.selectedExecutablePath) || !['npm', 'standalone', 'unknown'].includes(String(v.installationMethod)) || typeof v.selectedAt !== 'string' || !Number.isFinite(Date.parse(v.selectedAt))) throw new Error();
      return { selectedCandidateId: v.selectedCandidateId, selectedExecutablePath: v.selectedExecutablePath, installationMethod: v.installationMethod as InstallationMethod, selectedAt: v.selectedAt };
    } catch { throw new Error('Installation selection is invalid.'); }
  }
  async save(selection: InstallationSelection | null): Promise<void> {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(temporary, JSON.stringify(selection, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, this.file); }
    catch { await unlink(temporary).catch(() => undefined); throw new Error('Installation selection could not be saved.'); }
  }
}
