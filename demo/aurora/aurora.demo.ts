#!/usr/bin/env ts-node
/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';
import cp from 'child_process';

function sh(cmd: string, env: Record<string,string|undefined> = {}) {
  return cp.execSync(cmd, { stdio: 'pipe', env: { ...process.env, ...env } }).toString().trim();
}
function writeReceipt(net: string, name: string, data: unknown) {
  const dir = path.join('reports', net, 'aurora', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}
function parseJsonOrNull(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
function extractJobId(s: string, fallback = 1) {
  const m = s.match(/"jobId"\s*:\s*(\d+)/) || s.match(/\bjobId[=:]\s*(\d+)/i);
  return m ? Number(m[1]) : fallback;
}

async function main() {
  const net = (process.argv.includes('--network') ? process.argv[process.argv.indexOf('--network')+1] : 'localhost');
  const summaryPath = process.env.AURORA_DEPLOY_OUTPUT
    ? path.resolve(process.env.AURORA_DEPLOY_OUTPUT)
    : path.resolve('reports', net, 'aurora', 'receipts', 'deploy.json');
  let deploySummary: Record<string, any> | null = null;
  if (fs.existsSync(summaryPath)) {
    try {
      deploySummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch (err) {
      console.warn(`⚠️ Failed to parse deployment summary at ${summaryPath}: ${(err as Error).message}`);
    }
  }
  const contracts = deploySummary?.contracts || {};
  const agialphaConfig = JSON.parse(fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')) as { address?: string };
  const commandEnv: Record<string, string | undefined> = {
    NETWORK: net,
    RPC_URL: process.env.RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    CHAIN_ID: process.env.CHAIN_ID,
    JOB_REGISTRY: contracts.JobRegistry,
    STAKE_MANAGER: contracts.StakeManager,
    VALIDATION_MODULE: contracts.ValidationModule,
    AGIALPHA_TOKEN: process.env.AGIALPHA_TOKEN || agialphaConfig.address,
    ATTESTATION_REGISTRY: process.env.ATTESTATION_REGISTRY,
    AURORA_DEPLOY_OUTPUT: summaryPath,
  };

  if (!commandEnv.JOB_REGISTRY || !commandEnv.STAKE_MANAGER || !commandEnv.VALIDATION_MODULE || !commandEnv.AGIALPHA_TOKEN) {
    throw new Error('Deployment summary missing required contract addresses. Ensure deployDefaults.ts wrote reports or set environment variables manually.');
  }

  console.log('⏳ compile…');
  sh('npx hardhat compile --force', commandEnv);

  console.log('🛰  post job…');
  const postOut = sh(`node examples/ethers-quickstart.js postJob --spec demo/aurora/config/aurora.spec@v2.json`, commandEnv);
  const postJson = parseJsonOrNull(postOut) || {};
  const jobId = (postJson as any).jobId ?? extractJobId(postOut, 1);
  writeReceipt(net, 'postJob.json', { ...postJson, jobId, raw: postOut });

  console.log('💎 stake (worker)…');
  sh(`node examples/ethers-quickstart.js acknowledgeTaxPolicy`, commandEnv);
  sh(`node examples/ethers-quickstart.js prepareStake --amount 50000000`, commandEnv);
  sh(`node examples/ethers-quickstart.js stake --role worker --amount 20000000`, commandEnv);

  console.log('🛡  stake (validator)…');
  sh(`node examples/ethers-quickstart.js prepareStake --amount 50000000`, commandEnv);
  sh(`node examples/ethers-quickstart.js stake --role validator --amount 50000000`, commandEnv);

  console.log('📦 submit result…');
  const submitOut = sh(`node examples/ethers-quickstart.js submit --job ${jobId} --result ipfs://example-result-hash`, commandEnv);
  writeReceipt(net, 'submit.json', parseJsonOrNull(submitOut) || { raw: submitOut });

  console.log('🧪 validate (K-of-N)…');
  sh(`node examples/ethers-quickstart.js computeValidationCommit --job ${jobId} --approve true > reports/${net}/aurora/receipts/commit.json`, commandEnv);
  const valOut = sh(`node examples/ethers-quickstart.js validate --job ${jobId} --approve true --commit reports/${net}/aurora/receipts/commit.json`, commandEnv);
  const valJson = parseJsonOrNull(valOut) || { raw: valOut };
  writeReceipt(net, 'validate.json', valJson);

  console.log('🌡  thermostat (dry-run)…');
  try {
    sh(`npx hardhat run scripts/v2/updateThermodynamics.ts --network ${net}`, commandEnv);
  } catch {} // dry-run/no-op allowed

  const finalize = { txHash: (valJson as any)?.finalizeTx || 'n/a', payouts: (valJson as any)?.payouts || {} };
  writeReceipt(net, 'finalize.json', finalize);

  console.log('✅ AURORA demo completed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
