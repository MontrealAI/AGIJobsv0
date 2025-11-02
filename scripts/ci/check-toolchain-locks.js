#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const problems = [];

function readFileTrim(relPath) {
  const filePath = path.join(repoRoot, relPath);
  if (!fs.existsSync(filePath)) {
    problems.push(`Missing required file: ${relPath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8').trim();
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

  const enginesVersion = pkg?.engines?.node;
  if (!enginesVersion) {
    problems.push('package.json is missing engines.node pin');
  } else if (enginesVersion.trim() !== nvmrcVersion) {
    problems.push(
      `Node.js version mismatch: .nvmrc (${nvmrcVersion}) !== package.json engines.node (${enginesVersion})`
    );
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
    if (contents.includes('actions/setup-node')) {
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

checkNodeVersion();
checkWorkflows();
checkFoundryVersion();

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
