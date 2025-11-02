#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const problems = [];

const MIN_ROOT_LOCKFILE_BYTES = 1024;

function readFileTrim(relPath) {
  const filePath = path.join(repoRoot, relPath);
  if (!fs.existsSync(filePath)) {
    problems.push(`Missing required file: ${relPath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

function satisfiesNvmrc(engineValue, nvmrcVersion) {
  if (!engineValue || !nvmrcVersion) {
    return false;
  }
  const trimmedEngine = engineValue.trim();
  if (trimmedEngine === nvmrcVersion) {
    return true;
  }
  const wildcardMatch = /^([0-9]+\.[0-9]+)\.x$/.exec(trimmedEngine);
  if (wildcardMatch) {
    return nvmrcVersion.startsWith(`${wildcardMatch[1]}.`);
  }
  return false;
}

function checkNodeVersion() {
  const nvmrcVersion = readFileTrim('.nvmrc');
  if (!nvmrcVersion) {
    return;
  }

  const packageJsonPath = path.join(repoRoot, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    problems.push(`Unable to read package.json: ${error.message}`);
    return;
  }

  const enginesNode = pkg?.engines?.node;
  if (!enginesNode) {
    problems.push('package.json is missing engines.node pin');
  } else if (!satisfiesNvmrc(enginesNode, nvmrcVersion)) {
    problems.push(
      `Node.js version mismatch: .nvmrc (${nvmrcVersion}) is not compatible with package.json engines.node (${enginesNode})`
    );
  }

  const enginesNpm = pkg?.engines?.npm;
  if (!enginesNpm) {
    problems.push('package.json is missing engines.npm pin');
  } else if (!/^>=10\.8\.0\s*<11/.test(enginesNpm.trim())) {
    problems.push(`package.json engines.npm must bound npm 10.x (found "${enginesNpm}")`);
  }

  const packageManager = pkg?.packageManager;
  if (!packageManager) {
    problems.push('package.json is missing packageManager declaration');
  } else if (!/^npm@10\.8\.[0-9]+$/.test(packageManager.trim())) {
    problems.push(`package.json packageManager must pin npm@10.8.x (found "${packageManager}")`);
  }
}

function checkWorkflows() {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    problems.push('Missing .github/workflows directory');
    return;
  }

  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

  for (const file of workflowFiles) {
    const filePath = path.join(workflowsDir, file);
    const contents = fs.readFileSync(filePath, 'utf8');
    const directUsage = /uses:\s*actions\/setup-node@/g.test(contents);
    if (directUsage) {
      const hasNvmrc =
        contents.includes("node-version-file: '.nvmrc'") ||
        contents.includes('node-version-file: ".nvmrc"');
      const hasPinnedVersion = contents.includes('node-version:');
      if (!hasNvmrc && !hasPinnedVersion) {
        problems.push(
          `${file} uses actions/setup-node but does not pin a Node.js version via .nvmrc or node-version`
        );
      }
    }
  }
}

function checkFoundryVersion() {
  const foundryToml = readFileTrim('foundry.toml');
  if (!foundryToml) {
    return;
  }

  const forgeVersionMatches = /forge_version\s*=\s*"1\.4\.4"/.test(foundryToml);
  if (!forgeVersionMatches) {
    problems.push('foundry.toml must pin forge_version = "1.4.4"');
  }
}

function checkRootLockfile() {
  const lockfilePath = path.join(repoRoot, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    problems.push('Missing root package-lock.json');
    return;
  }

  try {
    const contents = fs.readFileSync(lockfilePath, 'utf8');
    JSON.parse(contents);
    if (Buffer.byteLength(contents, 'utf8') < MIN_ROOT_LOCKFILE_BYTES) {
      problems.push('Root package-lock.json is unexpectedly small; regenerate it with npm install --package-lock-only');
    }
  } catch (error) {
    problems.push(`Root package-lock.json is invalid JSON: ${error.message}`);
  }
}

checkNodeVersion();
checkWorkflows();
checkFoundryVersion();
checkRootLockfile();

if (problems.length > 0) {
  console.error('\n❌ Toolchain lock verification failed:');
  for (const problem of problems) {
    console.error(` - ${problem}`);
  }
  console.error('\nSee docs/toolchain-locks.md for remediation guidance.');
  process.exit(1);
}

console.log(
  '✅ Toolchain lock verification passed. All required versions are pinned.'
);
