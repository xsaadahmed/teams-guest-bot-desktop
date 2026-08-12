import { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverPort = 3000;
let isQuitting = false;
let serverChild: ChildProcess | null = null;
let logStream: fs.WriteStream | null = null;
let savedMainBounds: Electron.Rectangle | null = null;
let overlayActive = false;

const PORT_CANDIDATES = [3000, 3001, 3847];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Configure writable paths and bundled native resources for the server child process.
 */
function setupRuntimeEnv(): void {
  process.env.OPEN_WEB_UI = '0';

  if (app.isPackaged) {
    const { initAppPaths } = require('../build/appPaths');
    const { initPackagedResources } = require('../build/resources');
    initAppPaths(app.getPath('userData'));
    initPackagedResources(path.join(process.resourcesPath, 'native'));
  }

  const recordingsDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'Recordings')
    : path.join(process.cwd(), 'Recordings');
  fs.mkdirSync(recordingsDir, { recursive: true });
}

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'bot.log');
}

function appendServerLog(chunk: Buffer | string): void {
  const text = chunk.toString();
  process.stdout.write(text);
  logStream?.write(text);
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPEN_WEB_UI: '0',
    ELECTRON_RUN_AS_NODE: '1',
    TEAMS_BOT_ELECTRON: '1',
  };

  if (app.isPackaged) {
    const userData = app.getPath('userData');
    const nativeRoot = path.join(process.resourcesPath, 'native');
    env.TEAMS_BOT_PACKAGED = '1';
    env.TEAMS_BOT_ELECTRON = '1';
    env.TEAMS_BOT_USER_DATA = userData;
    env.TEAMS_BOT_RESOURCES_PATH = nativeRoot;
    env.PLAYWRIGHT_BROWSERS_PATH = path.join(nativeRoot, 'playwright-browsers');
    env.RECORDINGS_DIR = path.join(userData, 'Recordings');
    env.TEAMS_BOT_CONFIG_PATH = path.join(userData, '.teams-bot-config.json');
    env.TEAMS_BOT_BROWSER_PROFILE = path.join(userData, '.teams-bot-browser-profile');
    env.TEAMS_BOT_TEMP_DIR = path.join(userData, '.bot-temp');
  }

  return env;
}

function resolveServerLaunch(): { script: string; cwd: string } {
  if (!app.isPackaged) {
    const cwd = app.getAppPath();
    return {
      script: path.join(cwd, 'build', 'server.js'),
      cwd,
    };
  }

  // server.js must stay inside app.asar (do NOT asarUnpack build/) so require() can
  // resolve node_modules from the same archive. ELECTRON_RUN_AS_NODE reads asar natively.
  return {
    script: path.join(app.getAppPath(), 'build', 'server.js'),
    cwd: process.resourcesPath,
  };
}

function spawnServerChild(script: string, cwd: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd,
      env: buildChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('spawn', () => resolve(child));
  });
}

/**
 * Run the Express/bot server in a child process (ELECTRON_RUN_AS_NODE).
 * Separate from Electron's main process so Playwright automation works reliably.
 */
async function startServerChild(): Promise<number> {
  const { script, cwd } = resolveServerLaunch();
  if (!fs.existsSync(script) && !app.isPackaged) {
    throw new Error(`Server entry not found: ${script}. Run "npm run build" first.`);
  }

  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
  appendServerLog(`\n--- ${new Date().toISOString()} server child start ---\n`);
  appendServerLog(
    `[electron] exec=${process.execPath}\n[electron] script=${script}\n[electron] cwd=${cwd}\n`,
  );

  let child: ChildProcess;
  try {
    child = await spawnServerChild(script, cwd);
  } catch (err) {
    throw new Error(`Could not start server process: ${(err as Error).message}`);
  }

  serverChild = child;
  let childExitCode: number | null = null;
  let childExitSignal: NodeJS.Signals | null = null;

  child.stdout?.on('data', appendServerLog);
  child.stderr?.on('data', appendServerLog);
  child.on('exit', (code, signal) => {
    childExitCode = code;
    childExitSignal = signal;
    appendServerLog(`\n[electron] server child exited (code=${code}, signal=${signal})\n`);
    if (serverChild === child) {
      serverChild = null;
    }
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (childExitCode !== null) {
      throw new Error(
        `Server process exited before becoming ready (code=${childExitCode}` +
          `${childExitSignal ? `, signal=${childExitSignal}` : ''}). See ${getLogPath()}`,
      );
    }

    for (const port of PORT_CANDIDATES) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          appendServerLog(`[electron] server ready on :${port}\n`);
          return port;
        }
      } catch {
        // not ready yet
      }
    }

    await sleep(300);
  }

  throw new Error(
    `Server did not respond on ports ${PORT_CANDIDATES.join(', ')} within 60s. See ${getLogPath()}`,
  );
}

function stopServerChild(): void {
  if (!serverChild) return;
  try {
    serverChild.kill();
  } catch {
    // already gone
  }
  serverChild = null;
  logStream?.end();
  logStream = null;
}

function getRecordingsDir(): string {
  return process.env.RECORDINGS_DIR || path.join(app.getPath('userData'), 'Recordings');
}

async function isRecordingActive(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/status`);
    if (!res.ok) return false;
    const status = (await res.json()) as { state?: string };
    return status.state === 'joining' || status.state === 'in_meeting' || status.state === 'leaving';
  } catch {
    return false;
  }
}

async function confirmQuit(): Promise<boolean> {
  if (!(await isRecordingActive())) return true;
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Quit anyway'],
    cancelId: 0,
    defaultId: 0,
    title: 'Quit Teams Guest Bot?',
    message: 'A meeting recording may still be in progress.',
    detail: 'Quitting now will stop the recording and leave the meeting.',
  });
  return response === 1;
}

async function requestQuit(): Promise<void> {
  if (isQuitting) return;
  if (await confirmQuit()) {
    isQuitting = true;
    stopServerChild();
    app.quit();
  }
}

function getTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, 'tray-icon.png'),
    path.join(__dirname, '..', 'electron', 'build', 'tray-icon.png'),
    path.join(__dirname, '..', 'electron', 'tray-icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return nativeImage.createFromPath(candidate);
    }
  }
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  );
}

function revealRecordingsFolder(): void {
  const dir = getRecordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  void shell.openPath(dir);
}

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Teams Guest Bot');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => showMainWindow() },
    { label: 'Recordings folder', click: () => revealRecordingsFolder() },
    { type: 'separator' },
    { label: 'Quit', click: () => void requestQuit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
}

async function createMainWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Teams Guest Bot',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

function registerIpcHandlers(): void {
  ipcMain.handle('reveal-recordings-folder', () => {
    revealRecordingsFolder();
  });

  ipcMain.handle('pick-output-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getRecordingsDir(),
      title: 'Choose output folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'window-set-overlay',
    (
      _event,
      opts: { width: number; height: number; left: number; top: number; topmost?: boolean },
    ) => {
      const win = mainWindow;
      if (!win) return { ok: false };

      if (!overlayActive) {
        savedMainBounds = win.getBounds();
        overlayActive = true;
      }

      const width = Math.round(opts.width);
      const height = Math.round(opts.height);
      const left = Math.round(opts.left);
      const top = Math.round(opts.top);

      win.setMenuBarVisibility(false);
      win.setResizable(false);
      win.setMinimumSize(width, height);
      win.setMaximumSize(width, height);
      win.setBounds({ x: left, y: top, width, height });
      win.setAlwaysOnTop(opts.topmost !== false, 'floating');
      return { ok: true };
    },
  );

  ipcMain.handle(
    'window-restore',
    (
      _event,
      opts?: { width: number; height: number; left: number; top: number },
    ) => {
      const win = mainWindow;
      if (!win) return { ok: false };

      overlayActive = false;
      win.setAlwaysOnTop(false);
      win.setResizable(true);
      win.setMinimumSize(900, 600);
      win.setMaximumSize(0, 0);

      const fallback = savedMainBounds ?? { x: 80, y: 80, width: 1280, height: 860 };
      win.setBounds({
        x: Math.round(opts?.left ?? fallback.x),
        y: Math.round(opts?.top ?? fallback.y),
        width: Math.round(opts?.width ?? fallback.width),
        height: Math.round(opts?.height ?? fallback.height),
      });
      win.setMenuBarVisibility(true);
      savedMainBounds = null;
      return { ok: true };
    },
  );
}

// Prevent multiple instances fighting over the same ports.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  void app.whenReady().then(async () => {
    setupRuntimeEnv();
    registerIpcHandlers();

    try {
      serverPort = await startServerChild();
      await createMainWindow(serverPort);
      createTray();
    } catch (err) {
      stopServerChild();
      dialog.showErrorBox('Teams Guest Bot failed to start', (err as Error).message);
      app.quit();
      return;
    }

    app.on('activate', () => {
      showMainWindow();
    });
  });

  app.on('before-quit', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void requestQuit();
  });

  app.on('window-all-closed', () => {
    // Tray keeps the app alive while a meeting may be recording.
  });
}
