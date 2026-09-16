import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { TeamRun } from '../../domain/orchestration';
import type { TaskWorkspaces } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import { TaskExecutionError } from '../../application/orchestration/execution/AgentTaskExecutor';
import { WorktreeError, ConversationWorktreeService, type WorktreeRecord } from '../chat/ConversationWorktreeService';
import { conversationId } from '../chat/ConversationRepository';
import { AtomicFileWriter } from '../persistence/AtomicFileWriter';
import { pathKey } from '../projects/project-path';
import { GitRepositoryService } from '../projects/GitRepositoryService';
import { GitCommandRunner } from '../projects/GitCommandRunner';
export function relativeChangedFiles(output: string): string[] {
  const entries = output.split('\0'), files: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]; if (!entry) continue;
    if (!/^[ MADRCU?!]{2} /.test(entry)) throw new TaskExecutionError('EXECUTION_FAILED');
    const file = entry.slice(3); files.push(file);
    if (/[RC]/.test(entry.slice(0,2))) files.push(entries[++index] ?? '');
  }
  if (files.some(file => !file || file.startsWith('/') || /^[A-Za-z]:/.test(file) || file.includes('\\') || file.split('/').some(part => part === '..' || part === '.git') || /[\x00-\x1f]/.test(file))) throw new TaskExecutionError('EXECUTION_FAILED');
  return [...new Set(files)].sort();
}
export class RunWorkspaces implements TaskWorkspaces {
  private worktrees: ConversationWorktreeService;
  private compact: ConversationWorktreeService;
  constructor(private userData: string, private git = new GitCommandRunner()) { this.worktrees = new ConversationWorktreeService(path.join(userData, 'worktrees'), git, new GitRepositoryService(git), true); this.compact = new ConversationWorktreeService(path.join(userData, 'w'), git, new GitRepositoryService(git), true, true); }
  async prepare(run: TeamRun, baseBranch: string, projectPath: string, retry = false): Promise<string> {
    const id = conversationId(run.id), directory = path.join(this.userData, 'task-workspaces');
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw new TaskExecutionError('UNSAFE_WORKTREE');
    const file = path.join(directory, id + '.json'); let record: WorktreeRecord = { id, projectId: run.projectId, branchName: baseBranch };
    try {
      if ((await lstat(file)).isSymbolicLink()) throw new TaskExecutionError('UNSAFE_WORKTREE');
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed) || parsed.schemaVersion !== 1 || !('record' in parsed)) throw new TaskExecutionError('UNSAFE_WORKTREE');
      const saved = parsed.record as WorktreeRecord;
      if (!saved || saved.id !== id || saved.projectId !== run.projectId || saved.branchName !== baseBranch || !['creating','ready','failed','missing'].includes(saved.worktreeStatus ?? '')) throw new TaskExecutionError('UNSAFE_WORKTREE');
      record = saved;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const selection = await this.selection(record, projectPath, retry); record = selection.record;
    const service = selection.service;
    try { return await service.ensure(record, projectPath, () => new AtomicFileWriter().write(file, JSON.stringify({ schemaVersion: 1, record }) + '\n'), retry); }
    catch (error) { throw new TaskExecutionError(error instanceof WorktreeError && error.code === 'WORKTREE_FAILED' ? 'WORKTREE_PREPARATION_FAILED' : 'UNSAFE_WORKTREE'); }
  }
  private async selection(record: WorktreeRecord, projectPath: string, allowRelocation: boolean) {
    const canonical = async (directory: string) => { try { return await realpath(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return path.resolve(directory); } };
    if (!record.worktreePath) return { service: this.compact, record };
    const oldExpected = path.join(await canonical(path.join(this.userData, 'worktrees')), record.projectId, record.id);
    const compactExpected = path.join(await canonical(path.join(this.userData, 'w')), record.id);
    if (pathKey(record.worktreePath) === pathKey(oldExpected)) return { service: this.worktrees, record };
    if (pathKey(record.worktreePath) === pathKey(compactExpected)) return { service: this.compact, record };
    // Old profile identity can be replaced ONLY when no filesystem or Git entity
    // exists at that identity. Never move, delete, or inspect contents of that path.
    const branch = 'flux/' + record.id.replace(/-/g, '').slice(0,16).toLowerCase();
    if (!allowRelocation || record.worktreeStatus !== 'failed' || record.workBranch !== branch || path.basename(record.worktreePath) !== record.id || path.basename(path.dirname(record.worktreePath)) !== record.projectId) throw new TaskExecutionError('UNSAFE_WORKTREE');
    try { await lstat(record.worktreePath); throw new TaskExecutionError('UNSAFE_WORKTREE'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const branches = await new GitRepositoryService(this.git).getLocalBranches(projectPath);
    const entries = await this.git.run(projectPath, ['worktree','list','--porcelain','-z']);
    if (branches.includes(branch) || entries.split('\0').some(field => field === 'branch refs/heads/' + branch || (field.startsWith('worktree ') && pathKey(field.slice(9)) === pathKey(record.worktreePath!)))) throw new TaskExecutionError('UNSAFE_WORKTREE');
    const { worktreePath, branchOwned: _owned, branchOid: _oid, ...retained } = record;
    return { service: this.compact, record: { ...retained, previousWorktreePath: worktreePath } };
  }
  async retryablePreparation(run: TeamRun, projectPath: string): Promise<boolean> {
    try {
      const file = path.join(this.userData, 'task-workspaces', conversationId(run.id) + '.json');
      if ((await lstat(file)).isSymbolicLink()) return false;
      const data = JSON.parse(await readFile(file, 'utf8')) as { schemaVersion?: unknown; record?: WorktreeRecord };
      const record = data.record;
      if (data.schemaVersion !== 1 || !record || record.id !== run.id || record.projectId !== run.projectId || record.worktreeStatus !== 'failed') return false;
      const selection = await this.selection(record, projectPath, true);
      await selection.service.reconciliation(selection.record, projectPath); return true;
    } catch { return false; }
  }
  async verifyReady(run: TeamRun, branch: string, projectPath: string): Promise<{ cwd: string; managedRoot: string }> {
    try {
      const file = path.join(this.userData, 'task-workspaces', conversationId(run.id) + '.json');
      if ((await lstat(file)).isSymbolicLink()) throw new Error();
      const saved = JSON.parse(await readFile(file, 'utf8')) as { schemaVersion?: unknown; record?: WorktreeRecord };
      const record = saved.record;
      if (saved.schemaVersion !== 1 || !record || record.id !== run.id || record.projectId !== run.projectId || record.branchName !== branch || record.worktreeStatus !== 'ready' || !record.worktreePath) throw new Error();
      const selected = await this.selection(record, projectPath, false);
      if (await selected.service.reconciliation(record, projectPath) !== 'reuse') throw new Error();
      return { cwd: record.worktreePath, managedRoot: path.dirname(record.worktreePath) };
    } catch { throw new TaskExecutionError('UNSAFE_WORKTREE'); }
  }
  async changedFiles(cwd: string): Promise<readonly string[]> {
    // Git -z output preserves spaces/newlines; the command runner must not trim it.
    return relativeChangedFiles(await this.git.run(cwd, ['status','--porcelain=v1','-z','--untracked-files=all'], 10000, true));
  }
}
