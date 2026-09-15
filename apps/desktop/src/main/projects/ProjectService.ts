import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../../shared/project-api';
import { GitRepositoryService } from './GitRepositoryService';
import { ProjectRepository } from './ProjectRepository';
import { ProjectError } from './ProjectError';
import { pathKey } from './project-path';

export class ProjectService {
  private readonly directoryGrants = new Map<string, string>();
  private initialization: Promise<void> | undefined;
  constructor(
    private readonly repository: ProjectRepository,
    private readonly git: GitRepositoryService,
    private readonly initialProjectPath: string,
  ) {}

  private initialize(): Promise<void> {
    this.initialization ??= (async () => {
      if ((await this.repository.list()).length) return;
      try {
        const canonical = await this.git.canonicalDirectory(this.initialProjectPath);
        await this.register(canonical);
      } catch (error) {
        // The sole automatic seed is optional; never search for other repositories.
        if (error instanceof ProjectError && ['FOLDER_UNAVAILABLE', 'NOT_GIT_REPOSITORY', 'NO_LOCAL_BRANCHES'].includes(error.code)) return;
        throw error;
      }
    })();
    return this.initialization;
  }

  // Only called with the result of the main-process native folder picker.
  async authorizeDirectory(directory: string): Promise<string> {
    const canonical = await this.git.canonicalDirectory(directory);
    this.directoryGrants.set(pathKey(canonical), canonical);
    return canonical;
  }

  private async registeredPath(directory: string): Promise<string> {
    await this.initialize();
    const project = (await this.repository.list()).find(item => pathKey(item.path) === pathKey(directory));
    if (!project) throw new ProjectError('PATH_NOT_AUTHORIZED', 'Select this project folder using Add project first.');
    const canonical = await this.git.canonicalDirectory(project.path);
    if (pathKey(canonical) !== pathKey(project.path)) throw new ProjectError('PROJECT_MOVED', 'The project location has changed. Please select the folder again.');
    return canonical;
  }

  private async register(directory: string): Promise<Project> {
    const branches = await this.git.getLocalBranches(directory);
    const current = await this.git.getCurrentBranch(directory);
    const selectedBranch = current && branches.includes(current) ? current : branches[0];
    if (!selectedBranch) throw new ProjectError('NO_LOCAL_BRANCHES', 'No local branches were found in this repository.');
    const now = new Date().toISOString();
    const name = pathKey(directory) === pathKey(this.initialProjectPath) ? 'Flux' : path.basename(directory);
    return this.repository.add({ id: randomUUID(), name, path: directory, selectedBranch, createdAt: now, lastOpenedAt: now });
  }

  async getSelectedProjectId(): Promise<string | null> { await this.initialize(); return this.repository.getSelectedProjectId(); }

  async getProjects(): Promise<Project[]> {
    await this.initialize();
    return this.repository.list();
  }

  async addProject(directory: string): Promise<Project> {
    await this.initialize();
    const key = pathKey(directory);
    if ((await this.repository.list()).some(item => pathKey(item.path) === key)) throw new ProjectError('DUPLICATE_PROJECT', 'This project is already registered.');
    const granted = this.directoryGrants.get(key);
    if (!granted) throw new ProjectError('PATH_NOT_AUTHORIZED', 'Select this project folder using Add project first.');
    const canonical = await this.git.canonicalDirectory(granted);
    if (pathKey(canonical) !== key) throw new ProjectError('PROJECT_MOVED', 'The project location has changed. Please select the folder again.');
    return this.register(canonical);
  }

  async getGitBranches(directory: string): Promise<string[]> {
    return this.git.getLocalBranches(await this.registeredPath(directory));
  }

  async getCurrentBranch(directory: string): Promise<string | null> {
    return this.git.getCurrentBranch(await this.registeredPath(directory));
  }

  async selectWorkspace(projectId: string, branch: string): Promise<Project> {
    await this.initialize();
    const project = (await this.repository.list()).find(item => item.id === projectId);
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'The selected project is no longer registered.');
    const branches = await this.getGitBranches(project.path);
    if (!branches.includes(branch)) throw new ProjectError('BRANCH_NOT_FOUND', 'This local branch no longer exists. Select the project again to refresh its branches.');
    // Persist the UI choice only. No checkout, switch, or other Git write occurs.
    return this.repository.select(projectId, branch);
  }
}
