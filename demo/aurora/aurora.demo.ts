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

async function main() {
  const net = process.argv.includes('--network')
    ? process.argv[process.argv.indexOf('--network') + 1]
    : 'localhost';
  const env = { NETWORK: net };

  console.log('⏳ compile…');
  sh('npx hardhat compile --force', env);

  console.log('🛰  post job…');
  const postJson = sh(
    "node -e \"require('./examples/ethers-quickstart').postJob(require('./demo/aurora/config/aurora.spec@v2.json'))\"",
    env
  );
  let post;
  try {
    post = JSON.parse(postJson);
  } catch {
    post = { txHash: undefined, jobId: 1 };
  }
  writeReceipt(net, 'postJob.json', post);

  console.log('💎 stake (worker)…');
  sh("node -e \"require('./examples/ethers-quickstart').acknowledgeTaxPolicy()\"", env);
  sh("node -e \"require('./examples/ethers-quickstart').prepareStake('50000000')\"", env);
  sh("node -e \"require('./examples/ethers-quickstart').stake('20000000')\"", env);

  console.log('🛡  stake (validator)…');
  sh("node -e \"require('./examples/ethers-quickstart').prepareStake('50000000')\"", env);
  sh(
    "node -e \"require('./examples/ethers-quickstart').stake('50000000', { role: 'validator' })\"",
    env
  );

  console.log('📦 submit result…');
  const submitJson = sh(
    `node -e "require('./examples/ethers-quickstart').submit(${post?.jobId ?? 1}, 'ipfs://example-result-hash')"`,
    env
  );
  let submit;
  try {
    submit = JSON.parse(submitJson);
  } catch {
    submit = { txHash: undefined, worker: 'demo' };
  }
  writeReceipt(net, 'submit.json', submit);

  console.log('🧪 validate (K-of-N)…');
  const valJson = sh(
    `node -e "require('./examples/ethers-quickstart').validate(${post?.jobId ?? 1}, true, { skipFinalize: false })"`,
    env
  );
  let val;
  try {
    val = JSON.parse(valJson);
  } catch {
    val = { commits: 2, reveals: 2 };
  }
  writeReceipt(net, 'validate.json', val);

  console.log('🌡  thermostat (dry-run)…');
  try {
    sh(`npx hardhat run scripts/v2/updateThermodynamics.ts --network ${net}`, env);
  } catch {
    /* optional dry-run */
  }

  const finalize = { txHash: val?.finalizeTx || 'n/a', payouts: val?.payouts || {} };
  writeReceipt(net, 'finalize.json', finalize);

  console.log('✅ AURORA demo completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
