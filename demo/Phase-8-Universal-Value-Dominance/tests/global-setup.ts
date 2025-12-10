import { chromium } from '@playwright/test';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

function ensureChromium() {
  const executablePath = chromium.executablePath();
  if (!executablePath || !existsSync(executablePath)) {
    execSync('npx playwright install --with-deps chromium', { stdio: 'inherit' });
  }
}

export default async function globalSetup() {
  ensureChromium();
}
