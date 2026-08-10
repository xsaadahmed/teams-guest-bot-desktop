import * as path from 'path';

let userDataRoot: string | null = null;

/**
 * Writable root for recordings, config, browser profile, and temp files.
 * Defaults to process.cwd() (project folder) when unpackaged.
 * Electron sets TEAMS_BOT_USER_DATA to app.getPath('userData') when packaged.
 */
export function getUserDataRoot(): string {
  if (userDataRoot) return userDataRoot;
  const fromEnv = process.env.TEAMS_BOT_USER_DATA?.trim();
  userDataRoot = fromEnv || process.cwd();
  return userDataRoot;
}

/** Call from Electron main before importing the server in packaged mode. */
export function initAppPaths(root: string): void {
  userDataRoot = root;
  if (!process.env.RECORDINGS_DIR?.trim()) {
    process.env.RECORDINGS_DIR = path.join(root, 'Recordings');
  }
  if (!process.env.TEAMS_BOT_CONFIG_PATH?.trim()) {
    process.env.TEAMS_BOT_CONFIG_PATH = path.join(root, '.teams-bot-config.json');
  }
  if (!process.env.TEAMS_BOT_BROWSER_PROFILE?.trim()) {
    process.env.TEAMS_BOT_BROWSER_PROFILE = path.join(root, '.teams-bot-browser-profile');
  }
  if (!process.env.TEAMS_BOT_TEMP_DIR?.trim()) {
    process.env.TEAMS_BOT_TEMP_DIR = path.join(root, '.bot-temp');
  }
}

export function getRecordingsDir(): string {
  const fromEnv = process.env.RECORDINGS_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getUserDataRoot(), 'Recordings');
}

export function getBotTempDir(): string {
  const fromEnv = process.env.TEAMS_BOT_TEMP_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getUserDataRoot(), '.bot-temp');
}

export function getBrowserProfileDir(): string {
  const fromEnv = process.env.TEAMS_BOT_BROWSER_PROFILE?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getUserDataRoot(), '.teams-bot-browser-profile');
}

export function getConfigFilePath(): string {
  const fromEnv = process.env.TEAMS_BOT_CONFIG_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(getUserDataRoot(), '.teams-bot-config.json');
}
