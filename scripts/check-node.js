#!/usr/bin/env node
const { readFileSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

function parseVersion(raw) {
  const cleaned = raw.replace(/^v/, '').trim();
  const [major = '0', minor = '0', patch = '0'] = cleaned.split('.');
  return {
    raw: cleaned,
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return Math.sign(a.major - b.major);
  if (a.minor !== b.minor) return Math.sign(a.minor - b.minor);
  if (a.patch !== b.patch) return Math.sign(a.patch - b.patch);
  return 0;
}

function satisfiesRange(range, actualVersion) {
  if (!range) return true;
  const trimmed = range.trim();

  if (trimmed.endsWith('.x')) {
    const prefix = trimmed.slice(0, -2);
    return actualVersion.raw.startsWith(`${prefix}.`);
  }

  const constraints = trimmed.split(/\s+/).filter(Boolean);
  return constraints.every((constraint) => {
    if (constraint.startsWith('>=')) {
      return compareVersions(actualVersion, parseVersion(constraint.slice(2))) >= 0;
    }
    if (constraint.startsWith('<')) {
      return compareVersions(actualVersion, parseVersion(constraint.slice(1))) < 0;
    }
    return compareVersions(actualVersion, parseVersion(constraint)) === 0;
  });
}

function readNodeVersionFile(baseDir) {
  try {
    const contents = readFileSync(join(baseDir, '.node-version'), 'utf8').trim();
    return contents;
  } catch {
    return undefined;
  }
}

function main() {
  const repoRoot = join(__dirname, '..');
  const pkg = require('../package.json');
  const declaredNode = pkg.engines?.node;
  const declaredNpm = pkg.engines?.npm;
  const pinnedNodeFile = readNodeVersionFile(repoRoot);

  const nodeVersion = parseVersion(process.versions.node);
  const npmVersion = parseVersion(execSync('npm -v').toString());

  if (pinnedNodeFile && !nodeVersion.raw.startsWith(`${pinnedNodeFile}.`)) {
    console.warn(
      `⚠️  .node-version expects ${pinnedNodeFile} but detected ${nodeVersion.raw}. Aligning to the pinned version avoids flaky Hardhat builds.`,
    );
  }

  if (declaredNode && !satisfiesRange(declaredNode, nodeVersion)) {
    console.error(`❌ Node ${nodeVersion.raw} does not satisfy engines field: ${declaredNode}`);
    process.exit(1);
  }

  if (declaredNpm && !satisfiesRange(declaredNpm, npmVersion)) {
    console.error(`❌ npm ${npmVersion.raw} does not satisfy engines field: ${declaredNpm}`);
    process.exit(1);
  }

  console.log(`✅ Node ${nodeVersion.raw} and npm ${npmVersion.raw} satisfy package engines (${declaredNode ?? 'unspecified'} / ${declaredNpm ?? 'unspecified'}).`);
  if (!pinnedNodeFile && declaredNode) {
    console.warn('ℹ️  Add a .node-version or .nvmrc file so developers automatically select the correct runtime.');
  }
}

main();
