export type Project = {
  id: string;
  name: string;
  path: string;
  selectedBranch: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export interface FluxApi {
  selectProjectDirectory(): Promise<ApiResult<string | null>>;
  addProject(path: string): Promise<ApiResult<Project>>;
  getProjects(): Promise<ApiResult<Project[]>>;
  getGitBranches(projectPath: string): Promise<ApiResult<string[]>>;
  getCurrentBranch(projectPath: string): Promise<ApiResult<string | null>>;
  selectWorkspace(projectId: string, branch: string): Promise<ApiResult<Project>>;
}
