#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { existsSync, rmSync, statSync } = require('fs');
const { join, resolve } = require('path');

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

const env = { ...process.env };
if (!('COVERAGE_ONLY' in env)) {
  env.COVERAGE_ONLY = '1';
}

const runner = process.execPath;
const script = resolve(__dirname, '..', 'run-coverage.js');
const args = [script, ...process.argv.slice(2)];

const result = spawnSync(runner, args, {
  stdio: 'inherit',
  env,
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
