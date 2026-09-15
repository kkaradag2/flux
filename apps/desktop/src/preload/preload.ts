import { contextBridge, ipcRenderer } from 'electron';
import type { ApiResult, FluxApi } from '../shared/project-api';
import { projectChannels } from '../shared/project-channels';

const invoke = <T>(channel: string, ...args: string[]): Promise<ApiResult<T>> => ipcRenderer.invoke(channel, ...args);
const api: FluxApi = {
  selectProjectDirectory: () => invoke(projectChannels.selectDirectory),
  addProject: path => invoke(projectChannels.add, path),
  getProjects: () => invoke(projectChannels.list),
  getGitBranches: path => invoke(projectChannels.branches, path),
  getCurrentBranch: path => invoke(projectChannels.currentBranch, path),
  selectWorkspace: (id, branch) => invoke(projectChannels.selectWorkspace, id, branch),
};
contextBridge.exposeInMainWorld('flux', Object.freeze(api));
