#!/usr/bin/env node
const { spawn } = require('child_process');

const userArgs = process.argv.slice(2);
const hardhatArgs = ['hardhat', 'run', '--no-compile', 'scripts/v2/ownerControlPlan.ts'];
if (userArgs.length > 0) {
  hardhatArgs.push('--', ...userArgs);
}

const child = spawn('npx', hardhatArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
