import { app, BrowserWindow, Menu } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

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
  const window = new BrowserWindow({
    title: 'Flux',
    width: 1000,
    height: 700,
    show: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
