#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const jobRegistryAbi = JSON.parse(
  fs.readFileSync('scripts/v2/lib/prebuilt/JobRegistry.json', 'utf8')
).abi;

function resolveDeploySummary(): any {
  const file = process.env.DEPLOY_DEFAULTS_OUTPUT
    ? path.resolve(process.env.DEPLOY_DEFAULTS_OUTPUT)
    : path.resolve('reports', process.env.NETWORK || 'localhost', 'agimark', 'deploy.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment summary not found at ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deploy = resolveDeploySummary();
  const contracts = deploy.contracts || deploy;
  const jobRegistryAddress = ethers.getAddress(contracts.JobRegistry);

  const ownerKey = process.env.PRIVATE_KEY;
  if (!ownerKey) {
    throw new Error('PRIVATE_KEY env var required to run owner helper');
  }
  const owner = new ethers.Wallet(ownerKey, provider);

  console.log(`Owner helper connected as ${owner.address}`);
  const registry = new ethers.Contract(jobRegistryAddress, jobRegistryAbi, owner);
  console.log('Fee pct:', (await registry.feePct()).toString());
  console.log('Thermostat/Reward engine tuning handled via scripts/v2/updateThermodynamics.ts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
