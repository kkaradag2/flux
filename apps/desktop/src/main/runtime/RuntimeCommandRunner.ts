import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, stat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { codexArguments, windowsShimCommand, type RuntimeCommand } from './WindowsShimAdapter';
import { owningNpmPrefix, npmUpdateTarget, type NpmUpdateTarget } from './NpmInstallationInspector';
export interface RuntimeCommandResult { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; failed: boolean; }
export interface RuntimeCommandPort {
  resolveCodex(): Promise<string | null>;
  run(executable: string, command: RuntimeCommand, timeoutMs: number): Promise<RuntimeCommandResult>;
}
export class RuntimeCommandRunner implements RuntimeCommandPort {
  constructor(private selectedSource?: () => Promise<string | null>) {}
  async resolveCodex(): Promise<string | null> {
    if (this.selectedSource) return this.selectedSource();
    return (await this.resolveAll('codex'))[0] ?? null;
  }
  async resolveAll(tool: 'codex' | 'npm' | 'node'): Promise<string[]> {
    const names = process.platform === 'win32' ? (tool === 'codex' ? ['codex.exe', 'codex.cmd'] : tool === 'npm' ? ['npm.cmd'] : ['node.exe']) : [tool];
    const found: string[] = []; const seen = new Set<string>();
    // Check named executable candidates only. Never recurse or read shim/auth files.
    for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
      const directory = entry.replace(/^"|"$/g, '');
      if (!path.isAbsolute(directory)) continue;
      for (const name of names) {
        const candidate = path.join(directory, name);
        try {
          await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
          if (!(await stat(candidate)).isFile()) continue;
          const resolved = await realpath(candidate); const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
          if (!seen.has(key)) { seen.add(key); found.push(candidate); }
        } catch { /* Next named PATH candidate. */ }
      }
    }
    return found;
  }
  start(executable: string, command: RuntimeCommand, cwd = path.dirname(executable)): ChildProcessWithoutNullStreams {
    if (!path.isAbsolute(cwd) || cwd.includes('\0')) throw new Error('Invalid runtime directory.');
    const windows = process.platform === 'win32';
    const launch = windows && executable.toLowerCase().endsWith('.cmd') ? windowsShimCommand(executable, command, process.env.SystemRoot ?? 'C:\\Windows') : { executable, args: codexArguments(command), verbatim: false };
    return spawn(launch.executable, launch.args, { shell: false, windowsHide: true, windowsVerbatimArguments: launch.verbatim, detached: !windows, stdio: ['pipe', 'pipe', 'pipe'], cwd });
  }
  terminate(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise(resolve => {
      if (process.platform === 'win32' && child.pid) {
        execFile(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, timeout: 2000 }, () => { child.kill('SIGKILL'); resolve(); });
      } else {
        try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        child.kill('SIGKILL'); resolve();
      }
    });
  }
  startNpmUpdate(target: NpmUpdateTarget): ChildProcessWithoutNullStreams {
    if (![target.prefix, target.nodeExecutable, target.npmCli].every(value => path.isAbsolute(value) && !/[\0\r\n]/.test(value)) || path.basename(target.npmCli) !== 'npm-cli.js') throw new Error('Invalid update target.');
    return spawn(target.nodeExecutable, [target.npmCli, 'install', '--global', '--prefix', target.prefix, '@openai/codex@latest'], { shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], cwd: target.prefix });
  }
  run(executable: string, command: RuntimeCommand, timeoutMs: number): Promise<RuntimeCommandResult> {
    return this.collect(this.start(executable, command), timeoutMs);
  }
  async generateProtocolSchema(outputDirectory: string): Promise<boolean> {
    if (!path.isAbsolute(outputDirectory) || /[\0\r\n]/.test(outputDirectory)) return false;
    const selected = await this.resolveCodex(); if (!selected) return false;
    const args = ['app-server', 'generate-ts', '--out', outputDirectory];
    let executable = selected;
    if (process.platform === 'win32' && selected.toLowerCase().endsWith('.cmd')) {
      const prefix = await owningNpmPrefix(selected); if (!prefix) return false;
      const target = await npmUpdateTarget(prefix, await this.resolveAll('npm'), await this.resolveAll('node')); if (!target) return false;
      executable = target.nodeExecutable; args.unshift(path.join(prefix, 'node_modules/@openai/codex/bin/codex.js'));
    }
    const child = spawn(executable, args, { shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(selected) });
    const result = await this.collect(child, 10000);
    return result.exitCode === 0 && !result.failed && !result.timedOut;
  }
  private collect(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<RuntimeCommandResult> {
    return new Promise(resolve => {
      let stdout = '', stderr = '', bytes = 0, settled = false, stopping = false;
      let timedOut = false, failed = false;
      child.stdin.end();
      const finish = (exitCode: number | null): void => {
        if (settled) return; settled = true; clearTimeout(timer);
        child.stdout.destroy(); child.stderr.destroy();
        resolve({ stdout, stderr, exitCode, timedOut, failed });
      };
      const stop = (): void => {
        if (stopping || settled) return; stopping = true;
        void this.terminate(child).then(() => finish(null));
      };
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      const capture = (chunk: Buffer, stream: 'stdout' | 'stderr'): void => {
        bytes += chunk.length;
        if (bytes > 64 * 1024) { failed = true; stop(); return; }
        if (stream === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      };
      child.stdout.on('data', (chunk: Buffer) => capture(chunk, 'stdout'));
      child.stderr.on('data', (chunk: Buffer) => capture(chunk, 'stderr'));
      child.once('error', () => { failed = true; finish(null); });
      child.once('close', code => { if (!stopping) finish(code); });
    });
  }
}
