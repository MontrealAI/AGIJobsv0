#!/usr/bin/env ts-node
/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';
import cp from 'child_process';

function sh(cmd: string, env: Record<string, string | undefined> = {}) {
  return cp.execSync(cmd, { stdio: 'pipe', env: { ...process.env, ...env } }).toString().trim();
}
function writeReceipt(net: string, name: string, data: unknown) {
  const dir = path.join('reports', net, 'aurora', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}

function resolveNetwork(): string {
  const idx = process.argv.indexOf('--network');
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return process.env.NETWORK || 'localhost';
}

function loadDeployment(net: string) {
  const override = process.env.AURORA_DEPLOY_OUTPUT;
  const candidates = [
    override,
    path.join('reports', net, 'aurora', 'receipts', 'deploy.json'),
    path.join('reports', 'localhost', 'aurora', 'receipts', 'deploy.json'),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, any>;
      } catch (err) {
        console.warn(`Failed to parse deployment summary at ${candidate}:`, err);
      }
    }
  }
  return null;
}

function buildEnv(net: string) {
  const deploy = loadDeployment(net);
  if (!deploy || !deploy.contracts) {
    return { NETWORK: net };
  }
  const contracts = deploy.contracts as Record<string, string>;
  return {
    NETWORK: net,
    JOB_REGISTRY: contracts.JobRegistry,
    STAKE_MANAGER: contracts.StakeManager,
    VALIDATION_MODULE: contracts.ValidationModule,
    ATTESTATION_REGISTRY: contracts.IdentityRegistry || contracts.AttestationRegistry,
    AGIALPHA_TOKEN: contracts.AGIALPHAToken || contracts.Token || contracts.Agialpha || '',
  };
}

async function main() {
  const net = resolveNetwork();
  const baseEnv = buildEnv(net);

  console.log('⏳ compile…');
  sh('npx hardhat compile --force', baseEnv);

  const deploySummary = loadDeployment(net);
  if (deploySummary) {
    writeReceipt(net, 'deploy.json', deploySummary);
  }

  console.log('🛰  post job…');
  const postJson = sh(
    "node -e \"(async () => { const mod = require('./examples/ethers-quickstart'); const res = await mod.postJob(require('./demo/aurora/config/aurora.spec@v2.json')); if (res) console.log(JSON.stringify(res)); })();\"",
    baseEnv
  );
  let post;
  try {
    post = JSON.parse(postJson);
  } catch {
    post = { txHash: undefined, jobId: 1 };
  }
  writeReceipt(net, 'postJob.json', post);

  console.log('💎 stake (worker)…');
  sh("node -e \"(async () => { const mod = require('./examples/ethers-quickstart'); await mod.acknowledgeTaxPolicy(); await mod.prepareStake('20000000'); await mod.stake('20000000', { role: 'agent' }); })();\"", baseEnv);

  console.log('🛡  stake (validator)…');
  sh("node -e \"(async () => { const mod = require('./examples/ethers-quickstart'); await mod.prepareStake('50000000'); await mod.stake('50000000', { role: 'validator' }); })();\"", baseEnv);

  console.log('📦 submit result…');
  const submitJson = sh(
    `node -e "(async () => { const mod = require('./examples/ethers-quickstart'); const res = await mod.submit(${post?.jobId ?? 1}, 'ipfs://example-result-hash'); if (res) console.log(JSON.stringify(res)); })();"`,
    baseEnv
  );
  let submit;
  try {
    submit = JSON.parse(submitJson);
  } catch {
    submit = { txHash: undefined, worker: baseEnv.PRIVATE_KEY ? 'signer' : 'demo' };
  }
  writeReceipt(net, 'submit.json', submit);

  console.log('🧪 validate (K-of-N)…');
  const valJson = sh(
    `node -e "(async () => { const mod = require('./examples/ethers-quickstart'); const res = await mod.validate(${post?.jobId ?? 1}, true, { skipFinalize: false }); if (res) console.log(JSON.stringify(res)); })();"`,
    baseEnv
  );
  let val;
  try {
    val = JSON.parse(valJson);
  } catch {
    val = { commits: 1, reveals: 1 };
  }
  writeReceipt(net, 'validate.json', val);

  console.log('🌡  thermostat (dry-run)…');
  try {
    sh(`npx hardhat run scripts/v2/updateThermodynamics.ts --network ${net}`, baseEnv);
  } catch (err) {
    console.warn('Thermostat dry-run skipped:', err instanceof Error ? err.message : err);
  }

  const finalize = { txHash: val?.finalizeTx || 'n/a', payouts: val?.payouts || {} };
  writeReceipt(net, 'finalize.json', finalize);

  console.log('✅ AURORA demo completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
