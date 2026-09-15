import { execFile } from 'node:child_process';
import { devNull } from 'node:os';
import { ProjectError, errorCode } from './ProjectError';

export class GitCommandRunner {
  run(directory: string, args: readonly string[], timeout = 10000): Promise<string> {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
    const nullFile = process.platform === 'win32' ? 'NUL' : devNull;
    Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: nullFile });
    return new Promise((resolve, reject) => {
      execFile('git', ['-C', directory, '-c', `core.hooksPath=${nullFile}`, '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', ...args],
        { env, shell: false, windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
          if (error) reject(new ProjectError(errorCode(error) === 'ENOENT' ? 'GIT_UNAVAILABLE' : 'GIT_READ_FAILED', 'Git could not complete the repository operation.'));
          else resolve(stdout.trim());
        });
    });
  }
}
