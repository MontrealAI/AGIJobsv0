#!/usr/bin/env node
const { chmodSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { execSync } = require('node:child_process');

const hooksDir = join(__dirname, '..', '.githooks');

function ensureExecutable(file) {
  if (existsSync(file)) {
    chmodSync(file, 0o755);
  }
}

function main() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch (error) {
    console.warn('[hooks] Skipping installation (not a git repository).');
    return;
  }

  if (!existsSync(hooksDir)) {
    console.warn('[hooks] Skipping installation (.githooks directory missing).');
    return;
  }

  try {
    execSync(`git config core.hooksPath ${hooksDir}`);
  } catch (error) {
    console.warn('[hooks] Failed to set core.hooksPath:', error.message);
    return;
  }

  ensureExecutable(join(hooksDir, 'pre-commit'));
  ensureExecutable(join(hooksDir, 'pre-push'));
  console.log('[hooks] Git hooks configured at .githooks');
}

main();
