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
if (target === 'orchestrator')
  assets.push(
    'config/contracts.orchestrator.json',
    'config/owner-control.json',
    'config/thermodynamics.json',
    'config/identity-registry.json'
  );
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

if (target === 'orchestrator') {
  // Bundle the ESM governance dependency graph into the CommonJS server runtime.
  // TypeScript does not follow ownerConsole's runtime require or copy ESM JS assets.
  require('esbuild').buildSync({
    absWorkingDir: root,
    entryPoints: ['packages/orchestrator/src/tools/governance.ts'],
    outfile: path.join(out, 'packages/orchestrator/src/tools/governance.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    banner: {
      js: 'const __oneboxModuleUrl = require("node:url").pathToFileURL(__filename).href;',
    },
    define: { 'import.meta.url': '__oneboxModuleUrl' },
    target: 'node22',
    external: ['ethers'],
  });
}

// Preserve native ESM institutional modules beside the compiled orchestrator.
if (target === 'orchestrator') {
  fs.copyFileSync(
    path.join(root, 'apps/orchestrator/successor-runtime.cjs'),
    path.join(out, 'apps/orchestrator/successor-runtime.cjs')
  );
  fs.cpSync(
    path.join(root, 'packages/successor-core/src'),
    path.join(out, 'packages/successor-core/src'),
    { recursive: true }
  );
}
