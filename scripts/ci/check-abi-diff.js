#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { ABI_TARGETS } = require('./abi-targets');

function runExport() {
  const scriptPath = path.join(__dirname, 'export-abis.js');
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function collectOutputPaths() {
  return ABI_TARGETS.map((target) =>
    path.relative(process.cwd(), path.resolve(process.cwd(), target.output))
  );
}

function checkGitDiff(paths) {
  if (paths.length === 0) {
    console.log('No ABI targets configured; skipping diff check.');
    return;
  }

  const status = spawnSync('git', ['status', '--short', '--', ...paths], {
    encoding: 'utf8',
  });
  if (status.error) {
    throw status.error;
  }
  if (typeof status.status === 'number' && status.status !== 0) {
    process.exit(status.status);
  }

  const output = status.stdout.trim();
  if (output) {
    console.error('ABI changes detected in tracked files:');
    console.error(output);
    console.error('Run "npm run abi:export" and commit the updated ABI files.');
    process.exit(1);
  }

  console.log('ABI outputs match tracked versions.');
}

function main() {
  try {
    runExport();
    const outputs = collectOutputPaths();
    checkGitDiff(outputs);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
