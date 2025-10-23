import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface BudgetsConfig {
  bytecode: Record<string, number>;
  gas: Record<string, number>;
}

function strip0x(value: string) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

async function readBudgets(): Promise<BudgetsConfig> {
  const configPath = path.join(process.cwd(), 'config', 'budgets.json');
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw) as BudgetsConfig;
}

async function assertBytecodeBudgets(budgets: Record<string, number>) {
  const failures: string[] = [];
  for (const [contract, maxBytes] of Object.entries(budgets)) {
    const artifactPath = path.join(process.cwd(), 'out', `${contract}.sol`, `${contract}.json`);
    const raw = await readFile(artifactPath, 'utf8');
    const artifact = JSON.parse(raw);
    const deployed: string = artifact.deployedBytecode?.object ?? '';
    if (!deployed) {
      failures.push(`✖ Missing deployed bytecode for ${contract}`);
      continue;
    }
    const sizeBytes = strip0x(deployed).length / 2;
    if (sizeBytes > maxBytes) {
      failures.push(`✖ ${contract} bytecode ${sizeBytes} bytes exceeds budget ${maxBytes} bytes`);
    } else {
      console.log(`✔ ${contract} bytecode ${sizeBytes} bytes (budget ${maxBytes})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

interface GasSnapshot {
  [label: string]: number;
}

async function parseGasSnapshot(): Promise<GasSnapshot> {
  const snapshotPath = path.join(process.cwd(), 'gas-snapshots', '.gas-snapshot');
  const raw = await readFile(snapshotPath, 'utf8');
  const results: GasSnapshot = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matchGas = trimmed.match(/^(.*)\s+\(gas:\s*([0-9]+)\)/);
    if (matchGas) {
      const [, label, value] = matchGas;
      results[label] = Number(value);
      continue;
    }
    const matchMu = trimmed.match(/^(.*)\(runs:\s*[0-9]+,\s*μ:\s*([0-9]+)[^)]*\)/);
    if (matchMu) {
      const [, label, value] = matchMu;
      results[label.trim()] = Number(value);
    }
  }
  return results;
}

async function assertGasBudgets(budgets: Record<string, number>) {
  const snapshot = await parseGasSnapshot();
  const failures: string[] = [];
  for (const [label, maxGas] of Object.entries(budgets)) {
    const actual = snapshot[label];
    if (actual === undefined) {
      failures.push(`✖ Missing gas snapshot for ${label}`);
      continue;
    }
    if (actual > maxGas) {
      failures.push(`✖ ${label} gas ${actual} exceeds budget ${maxGas}`);
    } else {
      console.log(`✔ ${label} gas ${actual} (budget ${maxGas})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

async function main() {
  const budgets = await readBudgets();
  await assertBytecodeBudgets(budgets.bytecode);
  await assertGasBudgets(budgets.gas);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
