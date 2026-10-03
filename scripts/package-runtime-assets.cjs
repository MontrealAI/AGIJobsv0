#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = process.argv[2];
const outputs = {
  gateway: 'agent-gateway/dist',
  orchestrator: 'apps/orchestrator/dist',
};
if (!Object.hasOwn(outputs, target))
  throw new Error(
    'Usage: node scripts/package-runtime-assets.cjs gateway|orchestrator'
  );
const out = path.join(root, outputs[target]);
const assets = ['config/agents.json', 'config/agialpha.json'];
if (target === 'gateway')
  assets.push(
    'agent-gateway/ipfs-runtime.cjs',
    'scripts/config/index.js',
    'scripts/utils/parseDuration.js',
    'agent-gateway/protos/agent_gateway.proto',
    'config/agialpha.mainnet.json',
    'config/agialpha.sepolia.json',
    'config/agialpha.ci.json',
    'config/ens.json',
    'config/ens.mainnet.json',
    'config/ens.sepolia.json'
  );
for (const asset of assets) {
  const destination = path.join(out, asset);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, asset), destination);
}
console.log(`Packaged ${assets.length} runtime assets for ${target}.`);
