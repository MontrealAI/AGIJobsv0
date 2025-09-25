#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import process from 'process';
import url from 'url';
import { config as loadEnv } from 'dotenv';
import { loadDeploymentPlan } from '../config';

loadEnv();

type CheckOutcome = 'pass' | 'fail' | 'warn';

interface CheckResult {
  name: string;
  status: CheckOutcome;
  detail: string;
}

function normaliseEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function validatePrivateKey(name: string): CheckResult {
  const value = normaliseEnv(name);
  if (!value) {
    return { name, status: 'fail', detail: 'Missing private key environment variable' };
  }
  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return {
      name,
      status: 'fail',
      detail: 'Expected 32-byte hex string (64 hex chars, optionally 0x prefixed)',
    };
  }
  if (/^0+$/.test(hex)) {
    return { name, status: 'fail', detail: 'Private key cannot be zero' };
  }
  return { name, status: 'pass', detail: 'Valid private key format detected' };
}

function validateRpcUrl(name: string): CheckResult {
  const value = normaliseEnv(name);
  if (!value) {
    return { name, status: 'fail', detail: 'Missing RPC URL environment variable' };
  }
  try {
    const parsed = new url.URL(value);
    const allowedProtocols = new Set(['http:', 'https:', 'ws:', 'wss:']);
    if (!allowedProtocols.has(parsed.protocol)) {
      return { name, status: 'fail', detail: `Unsupported protocol: ${parsed.protocol}` };
    }
    return { name, status: 'pass', detail: `RPC URL looks valid (${parsed.host})` };
  } catch (error) {
    return { name, status: 'fail', detail: `Invalid URL: ${(error as Error).message}` };
  }
}

function validateNonEmptyEnv(name: string, description: string): CheckResult {
  const value = normaliseEnv(name);
  if (!value) {
    return { name, status: 'warn', detail: `${description} not configured` };
  }
  return { name, status: 'pass', detail: `${description} present` };
}

function validateDeploymentConfig(): CheckResult[] {
  const results: CheckResult[] = [];
  try {
    const { plan, path: planPath, exists } = loadDeploymentPlan({
      network: 'mainnet',
      optional: true,
    });
    if (!exists || !planPath) {
      results.push({
        name: 'deployment-config/mainnet.json',
        status: 'fail',
        detail:
          'File not found. Copy sepolia template or request production parameters.',
      });
      return results;
    }

    const governance = plan.governance;
    if (!governance) {
      results.push({
        name: 'governance address',
        status: 'warn',
        detail: 'Update governance to your production timelock / multisig address before deploying.',
      });
    } else {
      results.push({
        name: 'governance address',
        status: 'pass',
        detail: `Governance set to ${governance}`,
      });
    }
    const econ = plan.econ ?? {};
    if (econ.feePct === undefined) {
      results.push({
        name: 'feePct override',
        status: 'warn',
        detail: 'feePct override not set; default protocol fee (5%) will be used.',
      });
    } else {
      results.push({
        name: 'feePct override',
        status: 'pass',
        detail: `Protocol fee override set to ${econ.feePct}%`,
      });
    }
    const ensRoots = plan.ensRoots ?? {};
    const requiredRoots: Array<[string, string]> = [
      ['agentRoot', 'Agent ENS root'],
      ['clubRoot', 'Club ENS root'],
    ];
    for (const [key, label] of requiredRoots) {
      const entry = ensRoots[key];
      if (!entry || !entry.node || entry.node === '0x0') {
        results.push({
          name: `${label}`,
          status: 'warn',
          detail: `Update ${key} in deployment-config/mainnet.json before deploying.`,
        });
      } else if (!/^0x[0-9a-fA-F]{64}$/.test(entry.node)) {
        results.push({
          name: `${label}`,
          status: 'fail',
          detail: `${key}.hash must be a valid ENS namehash (32 bytes)`,
        });
      } else {
        results.push({
          name: `${label}`,
          status: 'pass',
          detail: `${entry.name || key} (${entry.node})`,
        });
      }
    }
  } catch (error) {
    results.push({
      name: 'deployment-config/mainnet.json',
      status: 'fail',
      detail: `Invalid JSON: ${(error as Error).message}`,
    });
  }
  return results;
}

function validateMigrations(): CheckResult[] {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const expectedFiles = [
    '1_initial_migration.js',
    '2_deploy_protocol.js',
    '2b_deploy_test_token_if_needed.js',
    '3_wire_protocol.js',
    '4_configure_ens.js',
    '5_transfer_ownership.js',
  ];
  const results: CheckResult[] = [];
  for (const file of expectedFiles) {
    const full = path.join(migrationsDir, file);
    if (fs.existsSync(full)) {
      results.push({ name: `migrations/${file}`, status: 'pass', detail: 'Present' });
    } else {
      results.push({
        name: `migrations/${file}`,
        status: 'fail',
        detail: 'Missing required migration script',
      });
    }
  }
  return results;
}

function validateNodeVersion(): CheckResult {
  const requiredMajor = 20;
  const version = process.version.replace(/^v/, '');
  const major = Number(version.split('.')[0]);
  if (Number.isNaN(major)) {
    return { name: 'Node.js version', status: 'warn', detail: `Unable to parse version (${process.version})` };
  }
  if (major < requiredMajor) {
    return {
      name: 'Node.js version',
      status: 'fail',
      detail: `Requires Node.js ${requiredMajor}.x or newer (detected ${process.version})`,
    };
  }
  return {
    name: 'Node.js version',
    status: 'pass',
    detail: `Detected ${process.version}`,
  };
}

function printResults(results: CheckResult[]): void {
  const rows = results.map((result) => ({
    Check: result.name,
    Status: result.status.toUpperCase(),
    Detail: result.detail,
  }));
  console.table(rows);
}

function main(): void {
  const results: CheckResult[] = [];
  results.push(validatePrivateKey('MAINNET_PRIVATE_KEY'));
  results.push(validateRpcUrl('MAINNET_RPC_URL'));
  results.push(validateNonEmptyEnv('ETHERSCAN_API_KEY', 'Etherscan API key'));
  results.push(validateNonEmptyEnv('DEPLOYER_ADDRESS', 'Optional deployer address (derived automatically if omitted)'));
  results.push(validateNodeVersion());
  results.push(...validateDeploymentConfig());
  results.push(...validateMigrations());

  printResults(results);

  const failures = results.filter((result) => result.status === 'fail');
  const warnings = results.filter((result) => result.status === 'warn');

  if (failures.length > 0) {
    console.error('\n❌ Deployment checklist failed. Resolve the failed checks above before migrating.');
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.warn('\n⚠️  Deployment checklist completed with warnings. Review and address them before mainnet deployment.');
  } else {
    console.log('\n✅ Deployment checklist passed. You are ready to run `npm run migrate:mainnet`.');
  }
}

main();
