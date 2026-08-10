import * as fs from 'fs';
import { getBotTempDir, getBrowserProfileDir } from './appPaths';
import { getPlaywrightBrowsersPath } from './resources';

/**
 * Corporate laptops often block Playwright's mkdtemp under the default %TEMP%
 * (EPERM on playwright-artifacts-*). Route temp files into the project folder.
 * Set TEAMS_BOT_USE_SYSTEM_TEMP=1 to keep the Windows default temp directory.
 */
function bootstrapWinEnv(): void {
  if (process.platform !== 'win32') return;

  const browsersPath = getPlaywrightBrowsersPath();
  if (browsersPath && !process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  }

  const useSystemTemp = process.env.TEAMS_BOT_USE_SYSTEM_TEMP?.trim().toLowerCase();
  if (useSystemTemp === '1' || useSystemTemp === 'true' || useSystemTemp === 'yes') {
    return;
  }

  const botTemp = getBotTempDir();
  fs.mkdirSync(botTemp, { recursive: true });
  process.env.TEMP = botTemp;
  process.env.TMP = botTemp;

  if (!process.env.TEAMS_BOT_BROWSER_PROFILE?.trim()) {
    process.env.TEAMS_BOT_BROWSER_PROFILE = getBrowserProfileDir();
  }
}

bootstrapWinEnv();
