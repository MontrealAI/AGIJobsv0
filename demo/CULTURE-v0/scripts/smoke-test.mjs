#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';

const targets = [
  {
    name: 'anvil',
    check: async () => {
      const response = await fetch(process.env.SMOKE_RPC_URL ?? 'http://culture-chain:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      });
      if (!response.ok) throw new Error(`RPC status ${response.status}`);
      const payload = await response.json();
      if (!payload.result) throw new Error('Missing block number');
    },
  },
  {
    name: 'ipfs',
    check: async () => {
      const response = await fetch(process.env.SMOKE_IPFS_API ?? 'http://culture-ipfs:5001/api/v0/version');
      if (!response.ok) throw new Error(`IPFS status ${response.status}`);
    },
  },
  {
    name: 'orchestrator',
    check: async () => {
      const response = await fetch(process.env.SMOKE_ORCHESTRATOR ?? 'http://culture-orchestrator:4005/healthz');
      if (!response.ok) throw new Error(`Orchestrator status ${response.status}`);
    },
  },
  {
    name: 'indexer',
    check: async () => {
      const response = await fetch(process.env.SMOKE_INDEXER ?? 'http://culture-indexer:4100/healthz');
      if (!response.ok) throw new Error(`Indexer status ${response.status}`);
    },
  },
  {
    name: 'studio',
    check: async () => {
      const response = await fetch(process.env.SMOKE_STUDIO ?? 'http://culture-studio:4173/healthz');
      if (!response.ok) throw new Error(`Studio status ${response.status}`);
    },
  },
];

const maxAttempts = Number.parseInt(process.env.SMOKE_MAX_ATTEMPTS ?? '20', 10);
const backoffMs = Number.parseInt(process.env.SMOKE_BACKOFF_MS ?? '5000', 10);

(async () => {
  for (const target of targets) {
    let attempt = 0;
    let success = false;
    while (attempt < maxAttempts && !success) {
      attempt += 1;
      try {
        await target.check();
        console.log(`✅ ${target.name} is reachable (attempt ${attempt})`);
        success = true;
      } catch (err) {
        console.log(`⏳ Waiting for ${target.name} (attempt ${attempt}/${maxAttempts}): ${err.message}`);
        if (attempt >= maxAttempts) {
          console.error(`❌ ${target.name} did not become healthy in time.`);
          process.exit(1);
        }
        await delay(backoffMs);
      }
    }
  }
  console.log('🎉 All services responded successfully.');
})().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
