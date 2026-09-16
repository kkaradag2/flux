import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { ProjectError } from './ProjectError';
import { pathKey } from './project-path';

import { GitCommandRunner } from './GitCommandRunner';

export class GitRepositoryService {
  constructor(private commands = new GitCommandRunner()) {}
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
    return this.commands.run(directory, args);
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
    const output = await this.run(directory, ['for-each-ref', '--sort=refname', '--format=%(refname)', 'refs/heads/']);
    const branches = output.split(/\r?\n/).filter(ref => ref.startsWith('refs/heads/')).map(ref => ref.slice(11));
    if (!branches.length) throw new ProjectError('NO_LOCAL_BRANCHES', 'No local branches were found in this repository. It may not have an initial commit yet.');
    return branches;
  }

  async getCurrentBranch(directory: string): Promise<string | null> {
    await this.assertRepository(directory);
    const result = await this.run(directory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return result === 'HEAD' ? null : result;
  }
}

