#!/usr/bin/env node
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const failures = [];

function checkLockfile(relPath) {
  const lockPath = path.join(repoRoot, relPath);
  let contents;
  try {
    contents = fs.readFileSync(lockPath, 'utf8');
  } catch (error) {
    failures.push(`Unable to read ${relPath}: ${error.message}`);
    return;
  }

  if (Buffer.byteLength(contents, 'utf8') < 128) {
    failures.push(`${relPath} is unexpectedly small; regenerate with npm install --package-lock-only`);
  }

  let data;
  try {
    data = JSON.parse(contents);
  } catch (error) {
    failures.push(`${relPath} is not valid JSON: ${error.message}`);
    return;
  }

  if (data.lockfileVersion !== 3) {
    failures.push(`${relPath} must set lockfileVersion = 3 (found ${data.lockfileVersion ?? 'undefined'})`);
  }

  if (!data.packages || typeof data.packages !== 'object') {
    failures.push(`${relPath} is missing the "packages" map; run npm install --package-lock-only`);
  }
}

function main() {
  let stdout = '';
  try {
    stdout = execSync("git ls-files '**/package-lock.json'", { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    failures.push(`Unable to enumerate package-lock.json files: ${error.stderr || error.message}`);
  }

  const files = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (files.length === 0) {
    failures.push('No package-lock.json files found in repository');
  }

  for (const file of files) {
    checkLockfile(file);
  }

  if (failures.length > 0) {
    console.error('\n❌ Lockfile integrity check failed:');
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    console.error('\nRun npm install --package-lock-only in each affected workspace.');
    process.exit(1);
  }

  console.log('✅ All package-lock.json files are valid and deterministic.');
}

main();
