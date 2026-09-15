import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import type { RuntimeCommandRunner } from './RuntimeCommandRunner';
import type { UpdateProblem } from '../../shared/codex-runtime-state';
import type { NpmUpdateTarget } from './NpmInstallationInspector';
export interface CodexUpdater { update(): Promise<UpdateProblem>; shutdown(): Promise<void> }
export class CodexUpdateService implements CodexUpdater {
  private cancel: (() => void) | null = null;
  private pending: Promise<UpdateProblem> | null = null;
  private stopped = false;
  constructor(private runner: RuntimeCommandRunner, private selectedInstallation?: { updateTarget(): Promise<NpmUpdateTarget | null> }) {}
  update(): Promise<UpdateProblem> {
    if (this.pending) return this.pending;
    this.pending = this.perform().catch((): UpdateProblem => 'UNKNOWN_INSTALLATION').finally(() => { this.pending = null; });
    return this.pending;
  }
  async shutdown(): Promise<void> { this.stopped = true; this.cancel?.(); await this.pending; }
  private async perform(): Promise<UpdateProblem> {
    if (this.selectedInstallation) {
      const target = await this.selectedInstallation.updateTarget();
      if (!target) return 'UNKNOWN_INSTALLATION';
      if (this.stopped) return 'UPDATE_FAILED';
      return this.install(target).catch((): UpdateProblem => 'UPDATE_FAILED');
    }
    const codex = await this.runner.resolveAll('codex');
    if (codex.length > 1) return 'MULTIPLE_INSTALLATIONS';
    if (codex.length !== 1) return 'UNKNOWN_INSTALLATION';
    const npm = await this.runner.resolveAll('npm');
    if (npm.length !== 1) return 'UNKNOWN_INSTALLATION';
    const executable = npm[0]!;
    const prefixResult = await this.runner.run(executable, 'npm-prefix', 10000);
    if (prefixResult.failed || prefixResult.timedOut || prefixResult.exitCode !== 0) return 'UNKNOWN_INSTALLATION';
    const prefix = prefixResult.stdout.trim();
    if (!path.isAbsolute(prefix) || /[\r\n\0]/.test(prefix)) return 'UNKNOWN_INSTALLATION';
    const windows = process.platform === 'win32';
    const packageDirectory = path.join(prefix, windows ? 'node_modules' : 'lib/node_modules', '@openai/codex');
    // Read only the identified installation's metadata and shim. No auth/config files.
    const metadata: unknown = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
    if (!metadata || typeof metadata !== 'object' || !('name' in metadata) || metadata.name !== '@openai/codex' || !('bin' in metadata) || !metadata.bin || typeof metadata.bin !== 'object' || !('codex' in metadata.bin) || metadata.bin.codex !== 'bin/codex.js') return 'UNKNOWN_INSTALLATION';
    const sameFile = async (left: string, right: string): Promise<boolean> => {
      const a = await realpath(left), b = await realpath(right); return windows ? a.toLowerCase() === b.toLowerCase() : a === b;
    };
    if (windows) {
      if (!await sameFile(codex[0]!, path.join(prefix, 'codex.cmd'))) return 'UNKNOWN_INSTALLATION';
      const shim = await readFile(codex[0]!, 'utf8');
      if (shim.length > 8192 || !shim.includes('node_modules\\@openai\\codex\\bin\\codex.js')) return 'UNKNOWN_INSTALLATION';
    } else if (!await sameFile(codex[0]!, path.join(packageDirectory, 'bin/codex.js'))) return 'UNKNOWN_INSTALLATION';
    // Resolve again immediately before mutation; reject a changed PATH installation.
    const current = await this.runner.resolveAll('codex');
    if (current.length !== 1 || current[0] !== codex[0]) return 'MULTIPLE_INSTALLATIONS';
    if (this.stopped) return 'UPDATE_FAILED';
    return this.install(executable);
  }
  private install(executable: string | NpmUpdateTarget): Promise<UpdateProblem> {
    return new Promise(resolve => {
      const child = typeof executable === 'string' ? this.runner.start(executable, 'npm-update') : this.runner.startNpmUpdate(executable);
      let finished = false, stopping = false;
      const discard = (): void => { /* Never retain npm output. */ };
      const finish = (problem: UpdateProblem): void => {
        if (finished) return; finished = true; clearTimeout(timer); this.cancel = null;
        child.removeListener('error', failed); child.removeListener('close', closed);
        child.stdout.removeListener('data', discard); child.stderr.removeListener('data', discard); child.stdin.removeListener('error', failed);
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); resolve(problem);
      };
      const stop = (): void => { if (stopping || finished) return; stopping = true; void this.runner.terminate(child).then(() => finish('UPDATE_FAILED')); };
      const failed = (): void => stop();
      const closed = (code: number | null): void => { if (!stopping) finish(code === 0 ? null : 'UPDATE_FAILED'); };
      const timer = setTimeout(stop, 180000); this.cancel = stop;
      child.stdout.on('data', discard); child.stderr.on('data', discard); child.stdin.on('error', failed);
      child.once('error', failed); child.once('close', closed); child.stdin.end();
    });
  }
}
