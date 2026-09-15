import { ConversationWorktreeService } from './chat/ConversationWorktreeService';
import { CodexAppServerClient } from './app-server/CodexAppServerClient';
import { CodexSmokeTestService } from './app-server/CodexSmokeTestService';
import { CodexRuntimeStateRepository } from './runtime/CodexRuntimeStateRepository';
import { CodexInstallationRepository } from './runtime/CodexInstallationRepository';
import { CodexInstallationService } from './runtime/CodexInstallationService';
import { CodexRuntimeStateService } from './runtime/CodexRuntimeStateService';
import { CodexUpdateService } from './runtime/CodexUpdateService';
import { registerRuntimeStateIpc } from './runtime/registerRuntimeStateIpc';
import { RuntimeCommandRunner } from './runtime/RuntimeCommandRunner';
import { CodexRuntimeProbe } from './runtime/CodexRuntimeProbe';
import { RuntimeHealthService } from './runtime/RuntimeHealthService';
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
import { SingleAgentRunService } from './chat/SingleAgentRunService';
import { registerSingleAgentIpc } from './chat/registerSingleAgentIpc';
import { ConversationRepository } from './chat/ConversationRepository';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
const trustedWindowIds = new Set<number>();
const initialProjectPath = 'C:\\WorkSpace\\AI\\Flux';

// Worktrees always live outside the source checkout, including development.
const worktreeDataPath = app.isPackaged ? app.getPath('userData') : path.join(app.getPath('appData'), 'Flux');

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
  const installations = new CodexInstallationService(new CodexInstallationRepository(path.join(app.getPath('userData'), 'codex-installation.json')), new RuntimeCommandRunner());
  const runtimeRunner = new RuntimeCommandRunner(() => installations.resolve());
  const health = new RuntimeHealthService(new CodexRuntimeProbe(runtimeRunner));
  const smokeTest = new CodexSmokeTestService(CodexAppServerClient.using(runtimeRunner), initialProjectPath);
  const runtime = new CodexRuntimeStateService(new CodexRuntimeStateRepository(path.join(app.getPath('userData'), 'codex-runtime-state.json')), health, smokeTest, new CodexUpdateService(runtimeRunner, installations), installations);
  registerRuntimeStateIpc(runtime, trustedWindowIds);
  void runtime.inspect();
  const assets = new AgentAssetService(path.join(app.getPath('userData'), 'agent-avatars'), data => {
    const image = nativeImage.createFromBuffer(data); const size = image.getSize();
    return !image.isEmpty() && size.width <= 4096 && size.height <= 4096;
  });
  const agents = new AgentService(new JsonAgentRepository(path.join(app.getPath('userData'), 'agents.json')), assets);
  const teams = new TeamService(new JsonTeamRepository(path.join(app.getPath('userData'), 'teams.json')), agents);
  registerManagementIpc(agents, teams, assets, trustedWindowIds, initialProjectPath);
  const chatClient = CodexAppServerClient.using(runtimeRunner);
  const conversations = new ConversationRepository(path.join(app.getPath('userData'), 'conversations'));
  // A damaged history file must not prevent the rest of the app from opening.
  // Repository errors are surfaced by the history API without replacing the file.
  await conversations.recoverInterrupted().catch(() => undefined);
  const chat = new SingleAgentRunService(projectService, agents, teams, runtime, () => chatClient.createChatSession(), conversations, new ConversationWorktreeService(path.join(worktreeDataPath, 'worktrees')));
  registerSingleAgentIpc(chat, trustedWindowIds);
  let cleanedUp = false;
  app.on('before-quit', event => {
    if (cleanedUp) return;
    event.preventDefault();
    void Promise.all([chat.shutdown(), runtime.shutdown()]).finally(() => { cleanedUp = true; app.quit(); });
  });
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
