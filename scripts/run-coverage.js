#!/usr/bin/env node
const { spawnSync } = require('child_process');

const env = { ...process.env };

if (env.HARDHAT_NETWORK) {
  console.log(
    `Removing HARDHAT_NETWORK=${env.HARDHAT_NETWORK} for coverage run (coverage must use default network).`
  );
  delete env.HARDHAT_NETWORK;
}
if (env.npm_config_hardhat_network) {
  delete env.npm_config_hardhat_network;
}

const tsNodeRegister = 'ts-node/register/transpile-only';
if (!env.NODE_OPTIONS || !env.NODE_OPTIONS.includes(tsNodeRegister)) {
  const extra = `-r ${tsNodeRegister}`;
  env.NODE_OPTIONS = env.NODE_OPTIONS
    ? `${env.NODE_OPTIONS} ${extra}`
    : extra;
}
if (!env.TS_NODE_TRANSPILE_ONLY) {
  env.TS_NODE_TRANSPILE_ONLY = '1';
}
let coverageOnly = env.COVERAGE_ONLY === '1';
if (!('COVERAGE_ONLY' in env)) {
  env.COVERAGE_ONLY = '1';
  coverageOnly = true;
}

const npxBinary = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['hardhat', 'coverage', '--temp', 'build-coverage', ...process.argv.slice(2)];
if (coverageOnly) {
  const coveragePattern = 'test/coverage/**/*.{js,ts}';
  console.log(`Running coverage suite with testfiles pattern: ${coveragePattern}`);
  args.push('--testfiles', coveragePattern);
}

const result = spawnSync(npxBinary, args, {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
