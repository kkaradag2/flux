import { spawn } from 'node:child_process';
import path from 'node:path';
export type EnvironmentCommand = { executable: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; onLine?: (line: string) => void };
export type EnvironmentProcessResult = { exitCode: number | null; output: string };
export function isolatedEnvironment(cwd: string, readOnlyProbe = false): NodeJS.ProcessEnv {
  const scratch = path.join(cwd, '.cache', 'workspace-environment');
  // Do not inherit package manager configuration, proxy, authentication, hooks or NODE_OPTIONS.
  return { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, COMSPEC: process.env.COMSPEC,
    ELECTRON_RUN_AS_NODE: '1', DISABLE_V8_COMPILE_CACHE: '1', NODE_DISABLE_COMPILE_CACHE: '1',
    HOME: scratch, USERPROFILE: scratch, APPDATA: scratch, LOCALAPPDATA: scratch,
    XDG_CACHE_HOME: scratch, XDG_CONFIG_HOME: scratch, XDG_DATA_HOME: scratch, XDG_STATE_HOME: scratch,
    // The version probe must not create a directory; the CLI resolves TMPDIR even for --version.
    TEMP: readOnlyProbe ? cwd : scratch, TMP: readOnlyProbe ? cwd : scratch, TMPDIR: readOnlyProbe ? cwd : scratch, CI: 'true', NO_UPDATE_NOTIFIER: '1',
    COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    npm_config_userconfig: process.platform === 'win32' ? 'NUL' : '/dev/null',
    npm_config_globalconfig: process.platform === 'win32' ? 'NUL' : '/dev/null' };
}
export class EnvironmentProcess {
  run(command: EnvironmentCommand, signal: AbortSignal, timeout = 180000): Promise<EnvironmentProcessResult> {
    if (signal.aborted) return Promise.reject(new Error('Cancelled'));
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, [...command.args], { cwd: command.cwd, env: command.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', line = '', failed = false, killing: Promise<void> | null = null;
      const stop = () => {
        failed = true; if (killing) return;
        if (process.platform === 'win32' && child.pid) {
          killing = new Promise<void>(done => {
            const killer = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
            killer.once('error', () => { child.kill(); }); killer.once('close', () => done());
          });
        } else { try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } killing = Promise.resolve(); }
      };
      const timer = setTimeout(stop, timeout);
      const collect = (chunk: Buffer) => {
        const text = chunk.toString('utf8'); output = (output + text).slice(-128000);
        line += text; let end: number;
        while ((end = line.indexOf('\n')) >= 0) { const entry = line.slice(0, end); line = line.slice(end + 1); try { command.onLine?.(entry); } catch { /* Fixed progress projection cannot fail the process. */ } }
        if (line.length > 128000) line = '';
      };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
      const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
      child.once('error', () => { failed = true; });
      // Await close, not kill()/exit: all stdio handles must be closed before owner cleanup completes.
      child.once('close', async code => { clean(); await killing; if (failed) reject(new Error('Environment process stopped')); else resolve({ exitCode: code, output }); });
    });
  }
}
