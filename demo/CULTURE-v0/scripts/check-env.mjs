#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const requiredKeys = [
  'RPC_URL',
  'CHAIN_ID',
  'CULTURE_REGISTRY_ADDRESS',
  'SELF_PLAY_ARENA_ADDRESS',
  'ORCHESTRATOR_PORT',
  'INDEXER_PORT',
  'IPFS_GATEWAY',
  'IPFS_API_ENDPOINT',
  'VITE_ORCHESTRATOR_URL',
  'VITE_INDEXER_URL',
  'VITE_IPFS_GATEWAY',
];

const recommendedKeys = ['PINATA_JWT', 'WEB3_STORAGE_TOKEN'];

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

const envPath = path.resolve(process.cwd(), process.argv[2] ?? '.env');
const resolved = new Map();

if (fs.existsSync(envPath)) {
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    resolved.set(key.trim(), rest.join('=').trim());
  }
} else {
  console.warn(`⚠️  No .env file found at ${envPath}. Falling back to process environment.`);
}

for (const key of Object.keys(process.env)) {
  if (!resolved.has(key)) {
    resolved.set(key, process.env[key]);
  }
}

const missing = [];
for (const key of requiredKeys) {
  const value = resolved.get(key);
  if (!value) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  console.error('❌ Missing required environment values:', missing.join(', '));
}

const invalidAddresses = ['CULTURE_REGISTRY_ADDRESS', 'SELF_PLAY_ARENA_ADDRESS']
  .map((key) => ({ key, value: resolved.get(key) }))
  .filter(({ value }) => value && !addressPattern.test(value));

if (invalidAddresses.length > 0) {
  for (const { key, value } of invalidAddresses) {
    console.error(`❌ ${key} has invalid address format: ${value}`);
  }
}

for (const key of recommendedKeys) {
  const value = resolved.get(key);
  if (!value) {
    console.warn(`ℹ️  ${key} is empty; upload flows will be limited.`);
  }
}

if (missing.length === 0 && invalidAddresses.length === 0) {
  console.log('✅ Environment file looks complete.');
  process.exit(0);
}

process.exit(1);
