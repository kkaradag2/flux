import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ApiResult } from '../../shared/project-api';
import { managementChannels as channels } from '../../shared/management-channels';
import type { AgentService } from './AgentService';
import type { TeamService } from './TeamService';
import type { AgentAssetService } from './AgentAssetService';
import { ManagementError } from './ManagementError';
export function registerManagementIpc(agents: AgentService, teams: TeamService, assets: AgentAssetService, trusted: Set<number>, defaultPath: string): void {
 const actions: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  [channels.getAgents]: () => agents.getAgents(), [channels.getAgent]: id => agents.getAgent(id), [channels.createAgent]: input => agents.createAgent(input), [channels.updateAgent]: (id, input) => agents.updateAgent(id, input),
  [channels.getTeams]: () => teams.getTeams(), [channels.getTeam]: id => teams.getTeam(id), [channels.createTeam]: input => teams.createTeam(input), [channels.updateTeam]: (id, input) => teams.updateTeam(id, input),
  [channels.getAgentAvatarDataUrl]: id => assets.getDataUrl(id),
 };
 let picking = false;
 for (const channel of Object.values(channels)) ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<unknown>> => {
  try {
   if (!trusted.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) throw new ManagementError('UNTRUSTED', 'This window cannot manage agents.');
   if (channel === channels.selectAgentAvatarImage) {
    if (picking) throw new ManagementError('PICKER_OPEN', 'An image picker is already open.');
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error();
    picking = true;
    try { const result = await dialog.showOpenDialog(window, { title: 'Select agent avatar', defaultPath, properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }); return { ok: true, value: result.canceled || !result.filePaths[0] ? null : await assets.importImage(result.filePaths[0]) }; }
    finally { picking = false; }
   }
   return { ok: true, value: await actions[channel]!(...args) };
  } catch (error) { return { ok: false, error: error instanceof ManagementError ? { code: error.code, message: error.message } : { code: 'MANAGEMENT_FAILED', message: 'The operation could not be completed. Check access to the saved data or selected image.' } }; }
 });
}
