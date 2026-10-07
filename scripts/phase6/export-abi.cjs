#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const artifact = path.join(
  root,
  'artifacts/contracts/v2/Phase6ExpansionManager.sol/Phase6ExpansionManager.json'
);
if (!fs.existsSync(artifact)) throw new Error('Compile first: npm run compile');
const { abi } = JSON.parse(fs.readFileSync(artifact, 'utf8'));
if (!Array.isArray(abi) || abi.length === 0)
  throw new Error('Compiled Phase 6 ABI is missing.');
for (const destination of [
  'subgraph/abis/Phase6ExpansionManager.json',
  'demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/Phase6ExpansionManager.json',
]) {
  fs.writeFileSync(
    path.join(root, destination),
    `${JSON.stringify(abi, null, 2)}\n`
  );
  console.log(`Exported ${abi.length} ABI entries to ${destination}`);
}
