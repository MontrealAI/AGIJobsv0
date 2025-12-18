import { chromium } from '@playwright/test';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

function markSkip(reason: string) {
  // Flag the browser suite for skipping instead of hard-failing when Chromium
  // is unavailable. This keeps CI lean while still allowing explicit installs
  // when the environment opts in.
  process.env.PHASE8_SKIP_BROWSER = '1';
  console.warn(`Skipping Phase 8 Playwright setup: ${reason}`);
}

function ensureChromium() {
  const executablePath = chromium.executablePath();
  const browserPresent = executablePath && existsSync(executablePath);

  if (browserPresent) {
    return;
  }

  const allowInstall = process.env.PLAYWRIGHT_AUTO_INSTALL === '1';
  if (!allowInstall) {
    markSkip('Chromium is not installed and PLAYWRIGHT_AUTO_INSTALL is not enabled. Set PLAYWRIGHT_AUTO_INSTALL=1 to download browsers during tests.');
    return;
  }

  try {
    execSync('npx playwright install --with-deps chromium', { stdio: 'inherit' });
  } catch (error) {
    markSkip(`Chromium install failed (${(error as Error).message}); continuing with browser tests skipped.`);
  }
}

export default async function globalSetup() {
  ensureChromium();
}
