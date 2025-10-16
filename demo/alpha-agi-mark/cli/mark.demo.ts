#!/usr/bin/env ts-node
/*
 * α-AGI MARK demo orchestrator.
 *
 * This script intentionally favours explicit logging and JSON receipts over
 * compact code so that non-technical operators can inspect every step. It wraps
 * the existing ethers quickstart helpers that already ship with AGI Jobs v0
 * (v2) and layers receipt generation, deploy-summary hydration, and
 * environment-setup ergonomics on top.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DeploySummary {
  contracts: Record<string, string>;
}

interface ReceiptRecord {
  name: string;
  payload: unknown;
}

function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function resolveNetwork(): string {
  const cliIndex = process.argv.indexOf('--network');
  if (cliIndex !== -1 && process.argv[cliIndex + 1]) {
    return process.argv[cliIndex + 1];
  }
  if (process.env.NETWORK) {
    return process.env.NETWORK;
  }
  return 'localhost';
}

function resolveReportsDir(network: string): string {
  return path.join(process.cwd(), 'reports', network, 'agimark');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadDeploySummary(network: string): DeploySummary {
  const custom = process.env.AGIMARK_DEPLOY_OUTPUT;
  const summaryPath = custom
    ? path.resolve(custom)
    : path.join(resolveReportsDir(network), 'receipts', 'deploy.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(
      `Deployment summary not found at ${summaryPath}. ` +
        'Run scripts/v2/deployDefaults.ts with DEPLOY_DEFAULTS_OUTPUT pointing to this path.'
    );
  }
  return readJson(summaryPath) as DeploySummary;
}

function quickstartEnv(
  network: string,
  deploySummary: DeploySummary,
  overrides: Record<string, string> = {}
) {
  const baseRpc =
    overrides.RPC_URL ||
    process.env.RPC_URL ||
    (network === 'localhost' ? 'http://127.0.0.1:8545' : undefined);
  const baseKey = overrides.PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!baseRpc) {
    throw new Error('RPC_URL must be provided via env or --network localhost default.');
  }
  if (!baseKey) {
    throw new Error('PRIVATE_KEY must be provided in the environment.');
  }
  const { contracts } = deploySummary;
  const mapAddress = (label: string) => {
    const value = contracts[label];
    if (!value) {
      throw new Error(`Deployment summary missing ${label} address.`);
    }
    return value;
  };
  const agialphaConfig = readJson(path.join(process.cwd(), 'config', 'agialpha.json'));
  const env = {
    ...process.env,
    RPC_URL: baseRpc,
    PRIVATE_KEY: baseKey,
    JOB_REGISTRY: mapAddress('JobRegistry'),
    STAKE_MANAGER: mapAddress('StakeManager'),
    VALIDATION_MODULE: mapAddress('ValidationModule'),
    ATTESTATION_REGISTRY: mapAddress('IdentityRegistry'),
    AGIALPHA_TOKEN: agialphaConfig.address,
  } as Record<string, string>;
  return { env, rpcUrl: baseRpc, privateKey: baseKey };
}

function callQuickstart(
  fn: string,
  args: unknown[],
  env: Record<string, string>
): ReceiptRecord | null {
  const payload = JSON.stringify({ fn, args });
  const script = `
    (async () => {
      const mod = require('../../examples/ethers-quickstart');
      const input = ${JSON.stringify(payload)};
      const parsed = JSON.parse(input);
      const target = mod[parsed.fn];
      if (typeof target !== 'function') {
        throw new Error('Function ' + parsed.fn + ' not found in quickstart module.');
      }
      const result = await target.apply(null, parsed.args || []);
      if (result !== undefined) {
        console.log(JSON.stringify(result));
      }
    })().catch((err) => {
      console.error('ERROR:' + (err?.message || err));
      process.exit(1);
    });
  `;
  const child = spawnSync('node', ['-e', script], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (child.status !== 0) {
    const message = child.stderr || child.stdout;
    throw new Error(`quickstart ${fn} failed: ${message}`);
  }
  const trimmed = child.stdout.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return { name: fn, payload: parsed };
  } catch (err) {
    return {
      name: fn,
      payload: { raw: trimmed },
    };
  }
}

function writeReceipt(
  network: string,
  record: ReceiptRecord | null,
  suffix: string
) {
  if (!record) return;
  const outDir = path.join(resolveReportsDir(network), 'receipts');
  ensureDir(outDir);
  const filePath = path.join(outDir, `${suffix}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record.payload, null, 2));
}

function writeMissionSummary(network: string, items: ReceiptRecord[]) {
  const lines = [
    '# α-AGI MARK — Mission Report',
    `network: ${network}`,
    '',
  ];
  for (const item of items) {
    const payload = JSON.stringify(item.payload, null, 2);
    lines.push(`## ${item.name}`);
    lines.push('```json');
    lines.push(payload);
    lines.push('```');
    lines.push('');
  }
  const target = path.join(resolveReportsDir(network), 'mission.md');
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, lines.join('\n'));
}

async function main() {
  const network = resolveNetwork();
  const deploySummary = loadDeploySummary(network);
  const { env } = quickstartEnv(network, deploySummary);

  const receipts: ReceiptRecord[] = [];

  console.log('🔁 acknowledging tax policy');
  receipts.push(
    callQuickstart('acknowledgeTaxPolicy', [], env) || {
      name: 'acknowledgeTaxPolicy',
      payload: { status: 'ok' },
    }
  );

  console.log('🏗  posting foresight job');
  receipts.push(
    callQuickstart('postJob', ['1'], env) || {
      name: 'postJob',
      payload: { amount: '1' },
    }
  );

  console.log('💰 preparing stake');
  callQuickstart('prepareStake', ['10'], env);

  console.log('💎 staking as agent');
  receipts.push(
    callQuickstart('stake', ['5'], env) || {
      name: 'stake',
      payload: { amount: '5' },
    }
  );

  console.log('📦 submitting result');
  receipts.push(
    callQuickstart('submit', [1, 'ipfs://demo-result'], env) || {
      name: 'submit',
      payload: { jobId: 1 },
    }
  );

  console.log('🧪 validator commit & reveal');
  receipts.push(
    callQuickstart('validate', [1, true], env) || {
      name: 'validate',
      payload: { jobId: 1, approve: true },
    }
  );

  console.log('🧾 writing receipts');
  receipts.forEach((record) => {
    const suffix = record.name;
    writeReceipt(network, record, suffix);
  });
  writeMissionSummary(network, receipts);

  console.log('✅ α-AGI MARK demo complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
