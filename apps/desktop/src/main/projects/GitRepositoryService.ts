import { execFile } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { devNull } from 'node:os';
import { ProjectError, errorCode } from './ProjectError';
import { pathKey } from './project-path';

export class GitRepositoryService {
  async canonicalDirectory(directory: string): Promise<string> {
    pathKey(directory);
    try {
      const canonical = await realpath(directory);
      if (!(await stat(canonical)).isDirectory()) throw new Error('Not a directory');
      return canonical;
    } catch {
      throw new ProjectError('FOLDER_UNAVAILABLE', 'The selected project folder is unavailable or cannot be read.');
    }
  }

  private run(directory: string, args: readonly string[]): Promise<string> {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    env.GIT_OPTIONAL_LOCKS = '0';
    env.GIT_TERMINAL_PROMPT = '0';
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : devNull;
    return new Promise((resolve, reject) => {
      execFile('git', ['-C', directory, ...args], { env, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) {
          if (errorCode(error) === 'ENOENT') reject(new ProjectError('GIT_UNAVAILABLE', 'Git could not be found. Install Git before opening a project.'));
          else reject(new ProjectError('GIT_READ_FAILED', 'Git could not read this repository. Check folder access and Git ownership settings.'));
        } else resolve(stdout.trim());
      });
    });
  }

  async assertRepository(directory: string): Promise<void> {
    // Do not let Git search parent directories for a repository.
    try {
      const marker = await lstat(path.join(directory, '.git'));
      if (!marker.isDirectory() && !marker.isFile()) throw new Error('Invalid Git marker');
    } catch {
      throw new ProjectError('NOT_GIT_REPOSITORY', 'The selected folder is not a Git repository.');
    }
    const root = await this.run(directory, ['rev-parse', '--show-toplevel']);
    if (pathKey(root) !== pathKey(directory)) {
      throw new ProjectError('NOT_GIT_REPOSITORY', 'The selected folder is not a Git repository.');
    }
  }

  async getLocalBranches(directory: string): Promise<string[]> {
    await this.assertRepository(directory);
    const output = await this.run(directory, ['for-each-ref', '--sort=refname', '--format=%(refname:short)', 'refs/heads/']);
    const branches = output.split(/\r?\n/).filter(Boolean);
    if (!branches.length) throw new ProjectError('NO_LOCAL_BRANCHES', 'No local branches were found in this repository. It may not have an initial commit yet.');
    return branches;
  }

  async getCurrentBranch(directory: string): Promise<string | null> {
    await this.assertRepository(directory);
    const result = await this.run(directory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return result === 'HEAD' ? null : result;
  }
}

