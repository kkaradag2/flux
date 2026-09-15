import { runtimeStateChannels } from '../shared/runtime-state-channels';
import { managementChannels as channels } from '../shared/management-channels';
import { contextBridge, ipcRenderer } from 'electron';
import type { ApiResult, FluxApi } from '../shared/project-api';
import { projectChannels } from '../shared/project-channels';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> => ipcRenderer.invoke(channel, ...args);
const api: FluxApi = {
 getCodexRuntimeState: () => invoke(runtimeStateChannels.get),
 inspectCodexRuntime: () => invoke(runtimeStateChannels.inspect),
 retryCodexRuntime: () => invoke(runtimeStateChannels.retry),
 updateCodexRuntime: () => invoke(runtimeStateChannels.update),
 getCodexInstallations: () => invoke(runtimeStateChannels.candidates),
 selectCodexInstallation: candidateId => invoke(runtimeStateChannels.select, candidateId),
 getAgents: () => invoke(channels.getAgents), getAgent: id => invoke(channels.getAgent, id), createAgent: input => invoke(channels.createAgent, input), updateAgent: (id, input) => invoke(channels.updateAgent, id, input),
 getTeams: () => invoke(channels.getTeams), getTeam: id => invoke(channels.getTeam, id), createTeam: input => invoke(channels.createTeam, input), updateTeam: (id, input) => invoke(channels.updateTeam, id, input),
 selectAgentAvatarImage: () => invoke(channels.selectAgentAvatarImage), getAgentAvatarDataUrl: id => invoke(channels.getAgentAvatarDataUrl, id),
  selectProjectDirectory: () => invoke(projectChannels.selectDirectory),
  addProject: path => invoke(projectChannels.add, path),
  getProjects: () => invoke(projectChannels.list),
  getGitBranches: path => invoke(projectChannels.branches, path),
  getCurrentBranch: path => invoke(projectChannels.currentBranch, path),
  selectWorkspace: (id, branch) => invoke(projectChannels.selectWorkspace, id, branch),
};
contextBridge.exposeInMainWorld('flux', Object.freeze(api));
