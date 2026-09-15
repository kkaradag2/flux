import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { CodexRuntimeState } from '../../shared/codex-runtime-state';
export interface RuntimeStateStore { load(): Promise<CodexRuntimeState | null>; save(state: CodexRuntimeState): Promise<void> }
export function parseRuntimeState(value: unknown): CodexRuntimeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved runtime state.');
  const v = value as Record<string, unknown>;
  const date = (item: unknown): boolean => typeof item === 'string' && Number.isFinite(Date.parse(item)) && new Date(item).toISOString() === item;
  if (v.runtime !== 'codex' || !(v.cliVersion === null || typeof v.cliVersion === 'string' && /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z]+(?:\.\d{1,6}){1,4})?$/.test(v.cliVersion)) || ![null, 'ChatGPT', 'API key'].includes(v.authenticationMethod as string | null)
    || !['CHECKING', 'READY', 'UPDATE_REQUIRED', 'SIGN_IN_REQUIRED', 'UNAVAILABLE', 'VERIFICATION_FAILED', 'INSTALLATION_SELECTION_REQUIRED'].includes(String(v.operationalStatus))
    || !['unverified', 'passed', 'failed'].includes(String(v.verificationStatus))
    || ![null, 'CLI_TOO_OLD', 'MODEL_UNSUPPORTED', 'PROTOCOL_UNSUPPORTED', 'AUTHENTICATION_REQUIRED', 'PROCESS_UNAVAILABLE', 'VERIFICATION_TIMEOUT', 'UNKNOWN_INCOMPATIBILITY'].includes(v.verificationReason as string | null)
    || !(v.verifiedAt === null || date(v.verifiedAt)) || !date(v.updatedAt)
    || ![null, 'MULTIPLE_INSTALLATIONS', 'UNKNOWN_INSTALLATION', 'UPDATE_FAILED', 'VERSION_UNCHANGED', 'SAVE_FAILED'].includes(v.updateProblem as string | null)) throw new Error('Invalid saved runtime state.');
  if (v.verificationStatus === 'passed' && (v.operationalStatus !== 'READY' || v.verificationReason !== null || !v.verifiedAt || !v.cliVersion)
    || v.operationalStatus === 'READY' && v.verificationStatus !== 'passed'
    || v.operationalStatus === 'UPDATE_REQUIRED' && (v.verificationStatus !== 'failed' || v.verificationReason !== 'CLI_TOO_OLD' || !v.cliVersion || !v.verifiedAt)
    || v.verificationStatus === 'failed' && !v.verificationReason) throw new Error('Inconsistent saved runtime state.');
  // Construct an allowlisted record; ignore all extra fields, including raw process data.
  const installationId = typeof v.installationId === 'string' && /^[a-f0-9]{64}$/.test(v.installationId) ? v.installationId : null;
  return { runtime: 'codex', cliVersion: v.cliVersion, authenticationMethod: v.authenticationMethod, operationalStatus: v.operationalStatus, verificationStatus: v.verificationStatus, verificationReason: v.verificationReason, verifiedAt: v.verifiedAt, updatedAt: v.updatedAt, updateProblem: v.updateProblem, installationId } as CodexRuntimeState;
}
export class CodexRuntimeStateRepository implements RuntimeStateStore {
  constructor(private file: string) {}
  async load(): Promise<CodexRuntimeState | null> {
    let content: string;
    try { content = await readFile(this.file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Saved Codex state could not be read.'); }
    try { return parseRuntimeState(JSON.parse(content)); } catch { throw new Error('Saved Codex state is invalid. The original file was preserved.'); }
  }
  async save(state: CodexRuntimeState): Promise<void> {
    const clean = parseRuntimeState(state); const temp = this.file + '.' + randomUUID() + '.tmp';
    try { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(temp, JSON.stringify(clean, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temp, this.file); }
    catch { await unlink(temp).catch(() => undefined); throw new Error('Codex state could not be saved.'); }
  }
}
