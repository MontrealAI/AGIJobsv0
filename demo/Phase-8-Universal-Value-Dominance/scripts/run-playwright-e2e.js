#!/usr/bin/env node
/**
 * Deterministic Playwright runner for the Phase 8 dashboard.
 *
 * The script ensures the Chromium binary is available (installing it when
 * necessary) before delegating to `playwright test` with the demo-specific
 * configuration. This prevents the common "Executable doesn't exist" failure
 * when running in freshly provisioned environments.
 */
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { chromium } = require('@playwright/test');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function ensureChromium() {
  const executable = chromium.executablePath();
  if (existsSync(executable)) {
    return;
  }
  console.log('\n→ Chromium missing; installing Playwright browsers...');
  run('npx', ['playwright', 'install', 'chromium']);

  // Install OS-level dependencies when not running in CI where package
  // installation is typically handled by the pipeline image.
  if (!process.env.CI) {
    run('npx', ['playwright', 'install-deps', 'chromium']);
  }

  if (!existsSync(chromium.executablePath())) {
    throw new Error('Chromium executable still unavailable after installation');
  }
}

function runTests() {
  run('npx', [
    'playwright',
    'test',
    '--config',
    'demo/Phase-8-Universal-Value-Dominance/playwright.config.ts',
    '--reporter',
    'list',
  ]);
}

ensureChromium();
runTests();
