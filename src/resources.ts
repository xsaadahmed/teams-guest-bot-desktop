import * as fs from 'fs';
import * as path from 'path';

/** True when running inside a packaged Electron app (set by electron/main.ts). */
export function isPackaged(): boolean {
  const v = process.env.TEAMS_BOT_PACKAGED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function getProjectRoot(): string {
  return path.join(__dirname, '..');
}

/** Real on-disk path for transcribe/ (Python cannot read inside app.asar). */
export function getTranscribeDir(): string {
  const dir = path.join(getProjectRoot(), 'transcribe');
  if (isPackaged() && dir.includes('app.asar')) {
    return dir.replace('app.asar', 'app.asar.unpacked');
  }
  return dir;
}

function getResourcesRoot(): string {
  if (isPackaged()) {
    return process.env.TEAMS_BOT_RESOURCES_PATH?.trim() || path.join(process.resourcesPath || '', 'native');
  }
  return getProjectRoot();
}

export function getWasapiHelperPath(): string {
  if (process.env.WASAPI_HELPER_PATH?.trim()) {
    return process.env.WASAPI_HELPER_PATH.trim();
  }
  return path.join(
    getResourcesRoot(),
    'windows',
    'WasapiLoopbackRecorder',
    'publish',
    'WasapiLoopbackRecorder.exe',
  );
}

export function getDismissDialogExePath(): string {
  if (process.env.DISMISS_DIALOG_EXE?.trim()) {
    return process.env.DISMISS_DIALOG_EXE.trim();
  }
  return path.join(
    getResourcesRoot(),
    'windows',
    'DismissTeamsDialog',
    'publish',
    'DismissTeamsDialog.exe',
  );
}

export function getChromiumPolicyFile(): string {
  if (process.env.CHROMIUM_POLICY_FILE?.trim()) {
    return process.env.CHROMIUM_POLICY_FILE.trim();
  }
  return path.join(getResourcesRoot(), 'windows', 'chromium-policy.json');
}

/**
 * Directory containing Playwright browser builds. When unset in dev, Playwright
 * uses its default cache location.
 */
export function getPlaywrightBrowsersPath(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (fromEnv) return fromEnv;

  if (isPackaged()) {
    const bundled = path.join(getResourcesRoot(), 'playwright-browsers');
    if (fs.existsSync(bundled)) return bundled;
  }

  const localBrowsers = path.join(getProjectRoot(), 'node_modules', 'playwright-core', '.local-browsers');
  if (fs.existsSync(localBrowsers)) return localBrowsers;

  return undefined;
}

/** Resolve bundled Playwright Chromium executable (packaged app + portable bundle). */
export function getPlaywrightChromiumExecutable(): string | undefined {
  if (process.env.CHROME_PATH?.trim()) {
    return process.env.CHROME_PATH.trim();
  }

  const browsersRoot = getPlaywrightBrowsersPath();
  if (!browsersRoot || !fs.existsSync(browsersRoot)) return undefined;

  const chromiumDir = fs
    .readdirSync(browsersRoot)
    .find((entry) => entry.startsWith('chromium-') && !entry.includes('headless'));
  if (!chromiumDir) return undefined;

  const exe = path.join(browsersRoot, chromiumDir, 'chrome-win64', 'chrome.exe');
  return fs.existsSync(exe) ? exe : undefined;
}

/** Configure env vars for a packaged Electron build before loading the server. */
export function initPackagedResources(resourcesPath: string): void {
  process.env.TEAMS_BOT_PACKAGED = '1';
  process.env.TEAMS_BOT_RESOURCES_PATH = resourcesPath;
  const browsersPath = path.join(resourcesPath, 'playwright-browsers');
  if (fs.existsSync(browsersPath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  }
}
