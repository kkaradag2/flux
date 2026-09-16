import { lstat, mkdir, realpath, rmdir } from 'node:fs/promises';
import path from 'node:path';
export type WorktreeRecord = { id: string; projectId: string; branchName: string; baseBranch?: string; workBranch?: string; worktreePath?: string; worktreeStatus?: 'creating' | 'ready' | 'failed' | 'missing'; worktreeCreatedAt?: string | null; previousWorktreePath?: string; branchOwned?: boolean; branchOid?: string };
import { conversationId } from './ConversationRepository';
import { GitCommandRunner } from '../projects/GitCommandRunner';
import { GitRepositoryService } from '../projects/GitRepositoryService';
import { pathKey } from '../projects/project-path';

export class WorktreeError extends Error {
  constructor(public readonly code: 'BASE_BRANCH_UNAVAILABLE' | 'WORKTREE_FAILED' | 'WORKTREE_MISSING' | 'WORKTREE_CONFLICT') {
    super(code === 'BASE_BRANCH_UNAVAILABLE' ? 'The selected base branch is no longer a local branch. Choose a local branch for a new task.'
      : code === 'WORKTREE_MISSING' ? 'This conversation’s isolated worktree is missing or no longer matches its saved branch. Codex was not started.'
      : 'The isolated worktree could not be created. Codex was not started. Check repository and application data access.');
  }
}
export interface ConversationWorktrees {
  ensure(record: WorktreeRecord, projectPath: string, save: () => Promise<void>): Promise<string>;
  inspect(record: WorktreeRecord, projectPath: string): Promise<boolean>;
}
type WorktreeEntry = { directory: string; branch: string };
const within = (parent: string, child: string): boolean => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export class ConversationWorktreeService implements ConversationWorktrees {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private root: string, private git = new GitCommandRunner(), private repositories = new GitRepositoryService(git), private preserveFailed = false, private compact = false) {}
  private async locked<T>(repository: string, operation: () => Promise<T>): Promise<T> {
    const common = pathKey(await realpath(await this.git.run(repository, ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
    const pending = (this.locks.get(common) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.locks.set(common, pending);
    try { return await pending; } finally { if (this.locks.get(common) === pending) this.locks.delete(common); }
  }
  private async location(record: WorktreeRecord, repository: string, create = true): Promise<{ directory: string; branch: string }> {
    const id = conversationId(record.id);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(record.projectId)) throw new WorktreeError('WORKTREE_CONFLICT');
    const requestedRoot = path.resolve(this.root);
    const branch = 'flux/' + id.replace(/-/g, '').slice(0, 16).toLowerCase();
    // Development userData may be inside the checkout; worktrees must never be.
    const project = await realpath(repository);
    if (within(project, requestedRoot)) throw new WorktreeError('WORKTREE_CONFLICT');
    if (create) await mkdir(requestedRoot, { recursive: true });
    if (await exists(requestedRoot) && (await lstat(requestedRoot)).isSymbolicLink()) throw new WorktreeError('WORKTREE_CONFLICT');
    // Windows packaged hosts can virtualize AppData without using a symlink.
    // Resolve the trusted application root once, then enforce child containment.
    const root = await exists(requestedRoot) ? await realpath(requestedRoot) : requestedRoot;
    if (within(project, root)) throw new WorktreeError('WORKTREE_CONFLICT');
    const parent = this.compact ? root : path.join(root, record.projectId), directory = path.join(parent, id);
    if (create) await mkdir(parent, { recursive: true });
    if (await exists(parent) && ((await lstat(parent)).isSymbolicLink() || pathKey(await realpath(parent)) !== pathKey(parent))) throw new WorktreeError('WORKTREE_CONFLICT');
    if (record.worktreePath && pathKey(record.worktreePath) !== pathKey(directory)) throw new WorktreeError('WORKTREE_MISSING');
    if (record.workBranch && record.workBranch !== branch) throw new WorktreeError('WORKTREE_MISSING');
    return { directory, branch };
  }
  private async entries(repository: string): Promise<WorktreeEntry[]> {
    const result = await this.git.run(repository, ['worktree', 'list', '--porcelain', '-z']);
    return result.split('\0\0').filter(Boolean).map(block => {
      const fields = block.split('\0');
      return { directory: fields.find(field => field.startsWith('worktree '))?.slice(9) ?? '', branch: fields.find(field => field.startsWith('branch '))?.slice(7) ?? '' };
    });
  }
  private async valid(repository: string, directory: string, branch: string): Promise<boolean> {
    try {
      if ((await lstat(directory)).isSymbolicLink() || pathKey(await realpath(directory)) !== pathKey(directory)) return false;
      const entry = (await this.entries(repository)).find(entry => entry.directory && pathKey(entry.directory) === pathKey(directory));
      if (entry?.branch !== 'refs/heads/' + branch) return false;
      await this.repositories.assertRepository(directory);
      const common = async (cwd: string): Promise<string> => pathKey(await realpath(await this.git.run(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])));
      return await common(directory) === await common(repository) && await this.repositories.getCurrentBranch(directory) === branch;
    } catch { return false; }
  }
  async inspect(record: WorktreeRecord, repository: string): Promise<boolean> {
    if (!record.worktreeStatus) return true; // Legacy records migrate only before their next turn.
    try { const location = await this.location(record, repository); return await this.valid(repository, location.directory, location.branch); }
    catch { return false; }
  }
  /** Read-only ownership comparison, also used to classify legacy pre-model failures. */
  async reconciliation(record: WorktreeRecord, repository: string): Promise<'reuse' | 'attach' | 'create'> {
    const { directory, branch } = await this.location(record, repository, false);
    const entries = await this.entries(repository);
    if (await this.valid(repository, directory, branch)) return 'reuse';
    if (await exists(directory) || entries.some(entry => (entry.directory && pathKey(entry.directory) === pathKey(directory)) || entry.branch === 'refs/heads/' + branch)) throw new WorktreeError('WORKTREE_CONFLICT');
    const branches = await this.repositories.getLocalBranches(repository);
    if (!branches.includes(branch)) return 'create';
    if (!record.branchOwned || !record.branchOid || !/^[a-f0-9]{40,64}$/.test(record.branchOid)
      || await this.git.run(repository, ['rev-parse', '--verify', 'refs/heads/' + branch + '^{commit}']) !== record.branchOid) throw new WorktreeError('WORKTREE_CONFLICT');
    return 'attach';
  }
  async ensure(record: WorktreeRecord, repository: string, save: () => Promise<void>, retry = false): Promise<string> {
    try {
      await this.repositories.assertRepository(repository);
      return await this.locked(repository, async () => {
        const reconciliation = retry ? await this.reconciliation(record, repository) : null;
        const { directory, branch } = await this.location(record, repository);
        if (reconciliation === 'reuse') { record.worktreeStatus = 'ready'; await save(); return directory; }
        if (reconciliation === 'attach') {
          record.worktreeStatus = 'creating'; await save();
          try { await this.git.run(repository, ['worktree', 'add', '--', directory, branch], 60000);
            if (!await this.valid(repository, directory, branch)) throw new WorktreeError('WORKTREE_CONFLICT');
          } catch (error) { record.worktreeStatus = 'failed'; await save(); throw error instanceof WorktreeError ? error : new WorktreeError('WORKTREE_FAILED'); }
          record.worktreeStatus = 'ready'; record.worktreeCreatedAt ??= new Date().toISOString(); await save(); return directory;
        }
        if (reconciliation === 'create') record.worktreeStatus = 'failed';
        if (record.worktreeStatus === 'ready' || record.worktreeStatus === 'missing' || record.worktreeStatus === 'creating') {
          if (await this.valid(repository, directory, branch)) {
            record.worktreeStatus = 'ready'; record.worktreeCreatedAt ??= new Date().toISOString(); await save(); return directory;
          }
          // Never recreate a previously usable worktree silently.
          if (record.worktreeStatus !== 'creating') { record.worktreeStatus = 'missing'; await save(); throw new WorktreeError('WORKTREE_MISSING'); }
        }
        const base = record.baseBranch ?? record.branchName;
        record.baseBranch = base; record.workBranch = branch; record.worktreePath = directory;
        record.worktreeStatus = 'failed'; record.worktreeCreatedAt = null;
        // Persist planned identity even when local-branch or collision checks fail.
        await save();
        if (!(await this.repositories.getLocalBranches(repository)).includes(base)) throw new WorktreeError('BASE_BRANCH_UNAVAILABLE');
        if (await exists(directory) || (await this.repositories.getLocalBranches(repository)).includes(branch)) throw new WorktreeError('WORKTREE_CONFLICT');
        const oid = await this.git.run(repository, ['rev-parse', '--verify', 'refs/heads/' + base + '^{commit}']);
        if (!/^[a-f0-9]{40,64}$/.test(oid)) throw new WorktreeError('WORKTREE_FAILED');
        record.baseBranch = base; record.workBranch = branch; record.worktreePath = directory;
        record.worktreeStatus = 'creating'; record.worktreeCreatedAt = null; await save();
        let ownedBranch = false;
        try {
          // Compare-and-swap reserves a previously absent, machine-generated ref.
          await this.git.run(repository, ['update-ref', 'refs/heads/' + branch, oid, '0'.repeat(oid.length)]); ownedBranch = true;
          record.branchOwned = true; record.branchOid = oid; await save();
          await this.git.run(repository, ['worktree', 'add', '--', directory, branch], 60000);
          if (!await this.valid(repository, directory, branch)) throw new WorktreeError('WORKTREE_FAILED');
        } catch {
          if (ownedBranch && !this.preserveFailed) await this.cleanup(repository, directory, branch, oid);
          record.worktreeStatus = 'failed'; await save(); throw new WorktreeError('WORKTREE_FAILED');
        }
        record.worktreeStatus = 'ready'; record.worktreeCreatedAt = new Date().toISOString();
        // Keep a successfully created tree if the final JSON write fails: the durable
        // creating record can validate and recover it, without deleting user files.
        await save(); return directory;
      });
    } catch (error) { if (error instanceof WorktreeError) throw error; throw new WorktreeError('WORKTREE_FAILED'); }
  }
  private async cleanup(repository: string, directory: string, branch: string, oid: string): Promise<void> {
    // Called only for a ref reserved by this attempt. No force, prune or recursive rm.
    try {
      if (await this.valid(repository, directory, branch)) {
        if (await this.git.run(directory, ['rev-parse', 'HEAD']) !== oid || await this.git.run(directory, ['status', '--porcelain', '--untracked-files=all'])) return;
        await this.git.run(repository, ['worktree', 'remove', '--', directory]);
      } else if (await exists(directory)) { if ((await lstat(directory)).isSymbolicLink()) return; await rmdir(directory); }
      if ((await this.entries(repository)).some(entry => entry.branch === 'refs/heads/' + branch)) return;
      await this.git.run(repository, ['update-ref', '-d', 'refs/heads/' + branch, oid]);
    } catch { /* Ambiguous ownership or changed files: preserve them. */ }
  }
}
