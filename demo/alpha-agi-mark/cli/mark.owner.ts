#!/usr/bin/env ts-node
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv('RPC_URL');
  const privateKey = requireEnv('PRIVATE_KEY');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const networkName = process.env.NETWORK || 'localhost';
  const summaryPath = process.env.AGIMARK_DEPLOY_OUTPUT
    ? path.resolve(process.env.AGIMARK_DEPLOY_OUTPUT)
    : path.join('reports', networkName, 'agimark', 'receipts', 'deploy.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Unable to locate deployment summary at ${summaryPath}`);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
    contracts: Record<string, string>;
  };

  console.log('Operator wallet:', wallet.address);
  console.log('Contracts:');
  for (const [name, addr] of Object.entries(summary.contracts)) {
    console.log(`  ${name}: ${addr}`);
  }
  console.log('Use scripts/v2/verifyOwnerControl.ts for full owner checks.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
