#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { existsSync, rmSync, statSync } = require('fs');
const { join } = require('path');

const COVERAGE_DIR = join(process.cwd(), 'coverage');
const LCOV_PATH = join(COVERAGE_DIR, 'lcov.info');

if (existsSync(COVERAGE_DIR)) {
  try {
    rmSync(COVERAGE_DIR, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to clean previous coverage artefacts:', error);
    process.exit(1);
  }
}

const binName = process.platform === 'win32' ? 'hardhat.cmd' : 'hardhat';
const localBin = join(process.cwd(), 'node_modules', '.bin', binName);
const command = existsSync(localBin) ? localBin : binName;

const args = ['coverage', ...process.argv.slice(2)];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32' && !existsSync(localBin),
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

if (!existsSync(LCOV_PATH)) {
  console.error(`Expected coverage artefact missing: ${LCOV_PATH}`);
  process.exit(1);
}

try {
  const stats = statSync(LCOV_PATH);
  if (!stats.size) {
    console.error(`Coverage artefact is empty: ${LCOV_PATH}`);
    process.exit(1);
  }
} catch (error) {
  console.error('Unable to stat coverage artefact:', error);
  process.exit(1);
}
