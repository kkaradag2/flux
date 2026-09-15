import { AgentService } from './management/AgentService';
import { TeamService } from './management/TeamService';
import { JsonAgentRepository } from './management/JsonAgentRepository';
import { JsonTeamRepository } from './management/JsonTeamRepository';
import { AgentAssetService } from './management/AgentAssetService';
import { registerManagementIpc } from './management/registerManagementIpc';
import { app, BrowserWindow, Menu, nativeTheme, nativeImage } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ProjectRepository } from './projects/ProjectRepository';
import { GitRepositoryService } from './projects/GitRepositoryService';
import { ProjectService } from './projects/ProjectService';
import { registerProjectIpc } from './projects/registerProjectIpc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
const trustedWindowIds = new Set<number>();
const initialProjectPath = 'C:\\WorkSpace\\AI\\Flux';

// Keep development profiles and Chromium caches inside this repository.
if (!app.isPackaged) {
  const dataPath = path.resolve(__dirname, '../../../..', '.flux', 'desktop');
  mkdirSync(dataPath, { recursive: true });
  app.setPath('userData', dataPath);
  app.setPath('sessionData', dataPath);
  app.setPath('crashDumps', path.join(dataPath, 'crash-dumps'));
  app.setAppLogsPath(path.join(dataPath, 'logs'));
}

const createWindow = async (): Promise<void> => {
  const backgroundColor = (): string => nativeTheme.shouldUseDarkColors ? '#212121' : '#ffffff';
  const window = new BrowserWindow({
    title: 'Flux',
    width: 1200,
    height: 700,
    show: false,
    backgroundColor: backgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const contentsId = window.webContents.id;
  trustedWindowIds.add(contentsId);
  window.once('closed', () => trustedWindowIds.delete(contentsId));

  const updateBackground = (): void => window.setBackgroundColor(backgroundColor());
  nativeTheme.on('updated', updateBackground);
  window.once('closed', () => nativeTheme.removeListener('updated', updateBackground));

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => {
    window.show();
    if (!app.isPackaged) {
      console.info('[Flux] Window shown', {
        visible: window.isVisible(),
      });
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(async () => {
  const projectService = new ProjectService(
    new ProjectRepository(path.join(app.getPath('userData'), 'projects.json')),
    new GitRepositoryService(),
    initialProjectPath,
  );
  registerProjectIpc(projectService, trustedWindowIds, initialProjectPath);
  const assets = new AgentAssetService(path.join(app.getPath('userData'), 'agent-avatars'), data => {
    const image = nativeImage.createFromBuffer(data); const size = image.getSize();
    return !image.isEmpty() && size.width <= 4096 && size.height <= 4096;
  });
  const agents = new AgentService(new JsonAgentRepository(path.join(app.getPath('userData'), 'agents.json')), assets);
  const teams = new TeamService(new JsonTeamRepository(path.join(app.getPath('userData'), 'teams.json')), agents);
  registerManagementIpc(agents, teams, assets, trustedWindowIds, initialProjectPath);
  nativeTheme.themeSource = 'system';
  Menu.setApplicationMenu(null);
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error: unknown) => {
  console.error('[Flux] Startup failed', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
