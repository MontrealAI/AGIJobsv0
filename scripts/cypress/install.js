#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

let cypressCli;
try {
  const pkgDir = path.dirname(require.resolve('cypress/package.json'));
  cypressCli = path.join(pkgDir, 'bin', 'cypress');
} catch (error) {
  console.error('Unable to locate the Cypress CLI. Did you install dependencies?');
  console.error(error);
  process.exit(1);
}

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.toLowerCase().includes('cypress_install_binary')) {
    env[key] = '';
  }
}

const result = spawnSync(process.execPath, [cypressCli, 'install', '--force'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
