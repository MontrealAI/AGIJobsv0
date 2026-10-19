#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const coverageFile = path.join(repoRoot, 'coverage', 'lcov.info');

const mappings = new Map([
  [
    'contracts/coverage/OwnerConfiguratorHarness.sol',
    'contracts/v2/admin/OwnerConfigurator.sol',
  ],
  [
    'contracts/coverage/GovernorHarness.sol',
    'contracts/v2/governance/AGIGovernor.sol',
  ],
  [
    'contracts/coverage/TimelockHarness.sol',
    'contracts/v2/governance/AGITimelock.sol',
  ],
]);

let coverageFd;
try {
  coverageFd = fs.openSync(
    coverageFile,
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('Coverage file not found; skipping path remap.');
  process.exit(0);
}
const original = fs.readFileSync(coverageFd, 'utf8');
const lines = original.split(/\r?\n/);
const remappedBlocks = [];
let currentBlock = [];

const pushBlock = (block) => {
  if (block.length === 0) {
    return;
  }
  remappedBlocks.push(block);
  const sfLine = block.find((line) => line.startsWith('SF:'));
  if (!sfLine) {
    return;
  }
  const filePath = sfLine.slice(3).trim();
  for (const [source, target] of mappings) {
    if (filePath.endsWith(source)) {
      const mappedPath = path.join(repoRoot, target).replace(/\\/g, '/');
      const cloned = block.map((line) =>
        line.startsWith('SF:') ? `SF:${mappedPath}` : line
      );
      remappedBlocks.push(cloned);
      break;
    }
  }
};

for (const line of lines) {
  if (line === 'end_of_record') {
    pushBlock(currentBlock);
    remappedBlocks.push(['end_of_record']);
    currentBlock = [];
  } else {
    currentBlock.push(line);
  }
}
pushBlock(currentBlock);

const flattened = remappedBlocks
  .map((block) =>
    block.length === 1 && block[0] === 'end_of_record'
      ? block[0]
      : block.join('\n')
  )
  .join('\n');

try {
  fs.ftruncateSync(coverageFd, 0);
  fs.writeSync(coverageFd, `${flattened}\n`, 0, 'utf8');
} finally {
  fs.closeSync(coverageFd);
}
console.log('Remapped coverage paths for admin and governance modules.');
