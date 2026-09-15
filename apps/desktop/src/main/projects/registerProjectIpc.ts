import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ApiResult } from '../../shared/project-api';
import { projectChannels } from '../../shared/project-channels';
import { ProjectError } from './ProjectError';
import type { ProjectService } from './ProjectService';

function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 32767 || value.includes('\0')) {
    throw new ProjectError('INVALID_ARGUMENT', 'The project request is invalid.');
  }
  return value;
}

export function registerProjectIpc(service: ProjectService, trustedWindowIds: Set<number>, initialDirectory: string): void {
  let selecting = false;
  const handle = (channel: string, action: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<unknown>> => {
      try {
        if (!trustedWindowIds.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) throw new ProjectError('UNTRUSTED_SENDER', 'This window cannot access projects.');
        return { ok: true, value: await action(event, ...args) };
      } catch (error) {
        return { ok: false, error: error instanceof ProjectError
          ? { code: error.code, message: error.message }
          : { code: 'PROJECT_OPERATION_FAILED', message: 'The project operation could not be completed. Please try again.' } };
      }
    });
  };

  handle(projectChannels.selectDirectory, async event => {
    if (selecting) throw new ProjectError('PICKER_OPEN', 'A project folder picker is already open.');
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new ProjectError('WINDOW_CLOSED', 'The application window is no longer available.');
    selecting = true;
    try {
      const result = await dialog.showOpenDialog(window, { title: 'Add project', buttonLabel: 'Select folder', defaultPath: initialDirectory, properties: ['openDirectory', 'dontAddToRecent'] });
      const directory = result.filePaths[0];
      return result.canceled || !directory ? null : await service.authorizeDirectory(directory);
    } finally { selecting = false; }
  });
  handle(projectChannels.add, async (_event, directory) => service.addProject(text(directory)));
  handle(projectChannels.list, async () => service.getProjects());
  handle(projectChannels.branches, async (_event, directory) => service.getGitBranches(text(directory)));
  handle(projectChannels.currentBranch, async (_event, directory) => service.getCurrentBranch(text(directory)));
  handle(projectChannels.selectWorkspace, async (_event, id, branch) => service.selectWorkspace(text(id), text(branch)));
}
