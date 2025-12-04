#!/usr/bin/env node
const { spawnSync } = require('child_process');

const passthroughArgs = [];
let reporterOption;

for (let i = 0; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--reporter' || arg === '-R') {
    const value = process.argv[i + 1];
    if (value) {
      process.env.MOCHA_REPORTER = value;
      i += 1;
      continue;
    }
  }
  if (arg && arg.startsWith('--reporter=')) {
    process.env.MOCHA_REPORTER = arg.split('=')[1];
    continue;
  }
  if (arg === '--reporter-options') {
    reporterOption = process.argv[i + 1];
    i += 1;
    continue;
  }
  if (arg && arg.startsWith('--reporter-options=')) {
    reporterOption = arg.split('=')[1];
    continue;
  }
  if (i < 2) {
    // Skip the node binary and script path
    continue;
  }
  passthroughArgs.push(arg);
}

if (reporterOption) {
  process.env.MOCHA_REPORTER_OPTIONS = reporterOption;
}

const result = spawnSync(
  'npx',
  ['hardhat', 'test', '--no-compile', ...passthroughArgs],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
