import path from 'node:path';
import { realpath, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { CodexInstallationCandidate, CodexInstallationSummary } from '../../shared/codex-installation';
import type { RuntimeCommandRunner } from './RuntimeCommandRunner';
import type { InstallationStore, InstallationSelection } from './CodexInstallationRepository';
import { owningNpmPrefix, npmUpdateTarget, type NpmUpdateTarget } from './NpmInstallationInspector';
type Verified = { candidate: CodexInstallationCandidate; prefix: string | null };
export class InstallationSelectionError extends Error { constructor() { super('Choose an available Codex installation.'); this.name = 'InstallationSelectionError'; } }
export function candidateId(executable: string): string { return createHash('sha256').update(process.platform === 'win32' ? executable.toLowerCase() : executable).digest('hex'); }
export function validateCandidateId(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new InstallationSelectionError(); return value; }
export class CodexInstallationService {
  private selected: InstallationSelection | null = null;
  private loaded = false;
  private invalidated = false;
  private allowed = new Map<string, Verified>();
  private summary: CodexInstallationSummary = { id: null, canUpdate: false, selectionRequired: false };
  constructor(private store: InstallationStore, private runner: RuntimeCommandRunner) {}
  currentSummary(): CodexInstallationSummary { return { ...this.summary }; }
  private async load(): Promise<void> { if (!this.loaded) { this.selected = await this.store.load(); this.loaded = true; } }
  private async matchesId(executable: string, id: string): Promise<boolean> { try { return candidateId(await realpath(executable)) === id; } catch { return false; } }
  private async verify(executable: string, first = false): Promise<Verified | null> {
    try {
      if (!path.isAbsolute(executable) || /[\0\r\n]/.test(executable)) return null;
      const resolved = await realpath(executable); const basename = path.basename(executable).toLowerCase();
      if (!['codex', 'codex.cmd', 'codex.exe'].includes(basename)) return null;
      const prefix = await owningNpmPrefix(executable);
      if (!prefix) {
        if (basename.endsWith('.cmd')) return null;
        const file = await open(resolved, 'r'); const header = Buffer.alloc(4);
        try { await file.read(header, 0, 4, 0); } finally { await file.close(); }
        const binary = header.subarray(0, 2).toString() === 'MZ' || header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(header.readUInt32BE());
        if (!binary) return null;
      }
      const version = await this.runner.run(executable, 'version', 5000);
      const match = /^codex-cli\s+(\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z]+(?:\.\d{1,6}){1,4})?)\s*$/m.exec(version.stdout);
      if (version.failed || version.timedOut || version.exitCode !== 0 || !match?.[1]) return null;
      const id = candidateId(resolved);
      const target = prefix ? await npmUpdateTarget(prefix, await this.runner.resolveAll('npm'), await this.runner.resolveAll('node')) : null;
      const displayPath = executable.replace(/([\\/]Users[\\/])[^\\/]+/i, '$1…');
      return { prefix, candidate: { id, version: match[1], executablePath: executable, installationMethod: prefix ? 'npm' : 'standalone', canUpdate: !!target, displayPath, isFirstOnPath: first, isCurrentlySelected: this.selected?.selectedCandidateId === id } };
    } catch { return null; }
  }
  async inspect(): Promise<CodexInstallationSummary> {
    await this.load();
    if (this.selected) {
      const current = await this.matchesId(this.selected.selectedExecutablePath, this.selected.selectedCandidateId) ? await this.verify(this.selected.selectedExecutablePath) : null;
      if (current && current.candidate.id === this.selected.selectedCandidateId) {
        this.summary = { id: current.candidate.id, canUpdate: current.candidate.canUpdate, selectionRequired: false }; return this.currentSummary();
      }
      // Retain the invalid reference on disk so a restart cannot silently fall
      // back to the only remaining PATH executable. It is never used to launch.
      this.selected = null; this.invalidated = true;
    }
    const candidates = await this.list();
    if (candidates.length === 1 && !this.invalidated) { await this.choose(candidates[0]!.id); return this.currentSummary(); }
    this.summary = { id: null, canUpdate: false, selectionRequired: candidates.length > 1 || this.invalidated };
    return this.currentSummary();
  }
  async list(): Promise<CodexInstallationCandidate[]> {
    await this.load(); const paths = await this.runner.resolveAll('codex'); const firstPath = paths[0];
    if (this.selected && !paths.includes(this.selected.selectedExecutablePath)) paths.push(this.selected.selectedExecutablePath);
    const next = new Map<string, Verified>();
    for (let index = 0; index < paths.length; index++) {
      const verified = await this.verify(paths[index]!, paths[index] === firstPath);
      if (verified && !next.has(verified.candidate.id)) next.set(verified.candidate.id, verified);
    }
    this.allowed = next; return [...next.values()].map(v => ({ ...v.candidate }));
  }
  async choose(value: unknown): Promise<void> {
    const id = validateCandidateId(value); const known = this.allowed.get(id);
    if (!known) throw new InstallationSelectionError();
    if (!await this.matchesId(known.candidate.executablePath, id)) throw new InstallationSelectionError();
    const current = await this.verify(known.candidate.executablePath);
    if (!current || current.candidate.id !== id) throw new InstallationSelectionError();
    const selection: InstallationSelection = { selectedCandidateId: id, selectedExecutablePath: current.candidate.executablePath, installationMethod: current.candidate.installationMethod, selectedAt: new Date().toISOString() };
    await this.store.save(selection); this.selected = selection; this.invalidated = false;
    this.summary = { id, canUpdate: current.candidate.canUpdate, selectionRequired: false };
  }
  async resolve(): Promise<string | null> {
    await this.load(); if (!this.selected) return null;
    const verified = await this.matchesId(this.selected.selectedExecutablePath, this.selected.selectedCandidateId) ? await this.verify(this.selected.selectedExecutablePath) : null;
    if (!verified || verified.candidate.id !== this.selected.selectedCandidateId) { this.selected = null; this.invalidated = true; this.summary = { id: null, canUpdate: false, selectionRequired: true }; return null; }
    return verified.candidate.executablePath;
  }
  async updateTarget(): Promise<NpmUpdateTarget | null> {
    const executable = await this.resolve(); if (!executable) return null;
    const prefix = await owningNpmPrefix(executable); if (!prefix) return null;
    return npmUpdateTarget(prefix, await this.runner.resolveAll('npm'), await this.runner.resolveAll('node'));
  }
}
