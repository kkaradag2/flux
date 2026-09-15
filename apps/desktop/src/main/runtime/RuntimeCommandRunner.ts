import { spawn, execFile } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { codexArguments, windowsShimCommand, type RuntimeCommand } from './WindowsShimAdapter';
export interface RuntimeCommandResult { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; failed: boolean; }
export interface RuntimeCommandPort {
  resolveCodex(): Promise<string | null>;
  run(executable: string, command: RuntimeCommand, timeoutMs: number): Promise<RuntimeCommandResult>;
}
export class RuntimeCommandRunner implements RuntimeCommandPort {
  async resolveCodex(): Promise<string | null> {
    const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
    // Check named executable candidates only. Never recurse or read shim/auth files.
    for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
      const directory = entry.replace(/^"|"$/g, '');
      if (!path.isAbsolute(directory)) continue;
      for (const name of names) {
        const candidate = path.join(directory, name);
        try { await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK); if ((await stat(candidate)).isFile()) return candidate; } catch { /* Next PATH candidate. */ }
      }
    }
    return null;
  }
  run(executable: string, command: RuntimeCommand, timeoutMs: number): Promise<RuntimeCommandResult> {
    const windows = process.platform === 'win32';
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const launch = windows && executable.toLowerCase().endsWith('.cmd') ? windowsShimCommand(executable, command, systemRoot) : { executable, args: codexArguments(command), verbatim: false };
    return new Promise(resolve => {
      let stdout = '', stderr = '', bytes = 0, settled = false, stopping = false;
      let timedOut = false, failed = false;
      const child = spawn(launch.executable, launch.args, { shell: false, windowsHide: true, windowsVerbatimArguments: launch.verbatim, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(executable) });
      const finish = (exitCode: number | null): void => {
        if (settled) return; settled = true; clearTimeout(timer);
        child.stdout.destroy(); child.stderr.destroy();
        resolve({ stdout, stderr, exitCode, timedOut, failed });
      };
      const stop = (): void => {
        if (stopping || settled) return; stopping = true;
        if (windows && child.pid) {
          // Kill the shim and its descendants; never leave the actual CLI running.
          execFile(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, timeout: 2000 }, () => { child.kill('SIGKILL'); finish(null); });
        } else {
          try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
          child.kill('SIGKILL'); finish(null);
        }
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
