#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ABI_TARGETS } = require('./abi-targets');

function ensureArtifacts() {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  if (fs.existsSync(artifactsDir) && fs.readdirSync(artifactsDir).length > 0) {
    return;
  }

  const result = spawnSync('npx', ['hardhat', 'compile'], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function normaliseInputs(inputs = []) {
  return inputs.map((entry) => String(entry.type).trim());
}

function fragmentMatches(entry, spec) {
  if (!entry || entry.type !== spec.type || entry.name !== spec.name) {
    return false;
  }
  if (!spec.inputs) {
    return true;
  }
  const entryInputs = normaliseInputs(entry.inputs);
  if (entryInputs.length !== spec.inputs.length) {
    return false;
  }
  return entryInputs.every((type, idx) => type === spec.inputs[idx]);
}

function selectFragments(abi, spec) {
  const fragments = [];
  for (const fragmentSpec of spec.fragments) {
    const match = abi.find((entry) => fragmentMatches(entry, fragmentSpec));
    if (!match) {
      throw new Error(
        `Unable to find ${fragmentSpec.type} ${fragmentSpec.name} in ${spec.name} ABI.`
      );
    }
    fragments.push(match);
  }
  return fragments;
}

function exportAbi(target) {
  const artifactPath = path.resolve(process.cwd(), target.artifact);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found for ${target.name}: ${path.relative(
        process.cwd(),
        artifactPath
      )}. Run hardhat compile first.`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  if (!artifact.abi || !Array.isArray(artifact.abi)) {
    throw new Error(
      `Artifact for ${target.name} does not contain an ABI array.`
    );
  }

  const fragments = selectFragments(artifact.abi, target);
  const outputPath = path.resolve(process.cwd(), target.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const serialised = `${JSON.stringify(fragments, null, 2)}\n`;
  fs.writeFileSync(outputPath, serialised);
  console.log(
    `Exported ${target.name} ABI → ${path.relative(process.cwd(), outputPath)}`
  );
  return outputPath;
}

function main() {
  try {
    ensureArtifacts();
    const outputs = ABI_TARGETS.map(exportAbi);
    if (!outputs.length) {
      console.warn('No ABI targets configured.');
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
