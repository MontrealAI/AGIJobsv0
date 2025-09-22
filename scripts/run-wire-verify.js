#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const network =
  process.env.TRUFFLE_NETWORK ||
  process.env.HARDHAT_NETWORK ||
  process.env.NETWORK ||
  undefined;

const args = ['scripts/verify-wiring.js'];
if (network) {
  args.push('--network', network);
}

const extraArgs = process.argv.slice(2);
if (extraArgs.length > 0) {
  args.push(...extraArgs);
}

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
