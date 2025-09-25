#!/usr/bin/env node
const { spawn } = require('child_process');

const userArgs = process.argv.slice(2);
const hardhatArgs = ['hardhat', 'run', '--no-compile', 'scripts/v2/ownerControlPlan.ts'];

const forwardedEnv = { ...process.env };

for (let i = 0; i < userArgs.length; i += 1) {
  const arg = userArgs[i];
  switch (arg) {
    case '--execute':
      forwardedEnv.OWNER_PLAN_EXECUTE = '1';
      break;
    case '--json':
      forwardedEnv.OWNER_PLAN_JSON = '1';
      break;
    case '--no-json':
      forwardedEnv.OWNER_PLAN_JSON = '0';
      break;
    case '--out':
    case '--output': {
      const value = userArgs[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a file path`);
      }
      forwardedEnv.OWNER_PLAN_OUT = value;
      i += 1;
      break;
    }
    case '--safe':
    case '--safe-out': {
      const value = userArgs[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a file path`);
      }
      forwardedEnv.OWNER_PLAN_SAFE_OUT = value;
      i += 1;
      break;
    }
    case '--safe-name': {
      const value = userArgs[i + 1];
      if (!value) {
        throw new Error('--safe-name requires a value');
      }
      forwardedEnv.OWNER_PLAN_SAFE_NAME = value;
      i += 1;
      break;
    }
    case '--safe-desc':
    case '--safe-description': {
      const value = userArgs[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      forwardedEnv.OWNER_PLAN_SAFE_DESCRIPTION = value;
      i += 1;
      break;
    }
    default:
      throw new Error(`Unknown owner:plan argument ${arg}`);
  }
}

const child = spawn('npx', hardhatArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: forwardedEnv,
});
child.on('exit', (code) => {
  process.exit(code ?? 0);
});
