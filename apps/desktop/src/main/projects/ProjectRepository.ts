import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../../shared/project-api';
import { ProjectError, errorCode } from './ProjectError';
import { pathKey } from './project-path';

interface Registry { version: 1; projects: Project[]; selectedProjectId: string | null; }
function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  return ['id', 'name', 'path', 'selectedBranch', 'createdAt', 'lastOpenedAt'].every(key =>
    key in value && typeof (value as Record<string, unknown>)[key] === 'string' && Boolean((value as Record<string, unknown>)[key]));
}

export class ProjectRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filePath: string) {}

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<Registry> {
    let content: string;
    try { content = await readFile(this.filePath, 'utf8'); }
    catch (error) {
      if (errorCode(error) === 'ENOENT') return { version: 1, projects: [], selectedProjectId: null };
      throw new ProjectError('REGISTRY_READ_FAILED', 'The saved project list could not be read.');
    }
    try {
      const data: unknown = JSON.parse(content);
      if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
          !('projects' in data) || !Array.isArray(data.projects) || !data.projects.every(isProject) ||
          !('selectedProjectId' in data) || !(data.selectedProjectId === null || typeof data.selectedProjectId === 'string')) throw new Error('Invalid registry');
      const projects: Project[] = data.projects;
      if (new Set(projects.map(item => item.id)).size !== projects.length ||
          new Set(projects.map(item => pathKey(item.path))).size !== projects.length ||
          projects.some(item => !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.lastOpenedAt))) ||
          (data.selectedProjectId !== null && !projects.some(item => item.id === data.selectedProjectId))) throw new Error('Invalid project');
      return { version: 1, projects, selectedProjectId: data.selectedProjectId };
    } catch {
      throw new ProjectError('REGISTRY_INVALID', 'The saved project list is invalid. The existing file has been left unchanged.');
    }
  }

  private async write(data: Registry): Promise<void> {
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, this.filePath);
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new ProjectError('REGISTRY_WRITE_FAILED', 'The project selection could not be saved. Please check access to the application data folder.');
    }
  }

  list(): Promise<Project[]> {
    return this.serialized(async () => {
      const data = await this.read();
      return data.projects.sort((a, b) => Number(b.id === data.selectedProjectId) - Number(a.id === data.selectedProjectId));
    });
  }

  add(project: Project): Promise<Project> {
    return this.serialized(async () => {
      const data = await this.read();
      if (data.projects.some(item => pathKey(item.path) === pathKey(project.path))) {
        throw new ProjectError('DUPLICATE_PROJECT', 'This project is already registered.');
      }
      data.projects.push(project);
      data.selectedProjectId = project.id;
      await this.write(data);
      return project;
    });
  }

  select(projectId: string, branch: string): Promise<Project> {
    return this.serialized(async () => {
      const data = await this.read();
      const project = data.projects.find(item => item.id === projectId);
      if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'The selected project is no longer registered.');
      project.selectedBranch = branch;
      project.lastOpenedAt = new Date().toISOString();
      data.selectedProjectId = projectId;
      await this.write(data);
      return project;
    });
  }
}
