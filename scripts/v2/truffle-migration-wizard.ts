#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { loadDeploymentPlan, loadTokenConfig, inferNetworkKey } from '../config';

loadEnv();

interface CliOptions {
  network?: string;
  execute: boolean;
  skipCompile: boolean;
  skipMigrate: boolean;
  skipVerify: boolean;
  skipWire: boolean;
  dryRun: boolean;
  dotenvPath?: string;
}

type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface ExecutionStep {
  label: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  skip?: boolean;
}

const REQUIRED_ENVS: Array<[string, string, boolean]> = [
  ['MAINNET_RPC_URL', 'Ethereum RPC endpoint', false],
  ['MAINNET_PRIVATE_KEY', 'Deployer private key', false],
  ['GOVERNANCE_ADDRESS', 'Protocol governance address', false],
  ['ETHERSCAN_API_KEY', 'Etherscan verification key', true],
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    skipCompile: false,
    skipMigrate: false,
    skipVerify: false,
    skipWire: false,
    dryRun: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
      case '-n': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--execute':
      case '--run':
        options.execute = true;
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        options.execute = false;
        break;
      case '--skip-compile':
        options.skipCompile = true;
        break;
      case '--skip-migrate':
        options.skipMigrate = true;
        break;
      case '--skip-verify':
        options.skipVerify = true;
        break;
      case '--skip-wire':
        options.skipWire = true;
        break;
      case '--dotenv':
      case '--env': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a file path`);
        }
        options.dotenvPath = value;
        i += 1;
        break;
      }
      default:
        break;
    }
  }

  if (options.dotenvPath) {
    const dotenvAbs = path.resolve(options.dotenvPath);
    if (!fs.existsSync(dotenvAbs)) {
      throw new Error(`.env file not found at ${dotenvAbs}`);
    }
    loadEnv({ path: dotenvAbs, override: true });
  }

  return options;
}

function normaliseEnv(key: string): string | null {
  const value = process.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function validatePrivateKey(value: string | null): CheckResult {
  if (!value) {
    return {
      name: 'MAINNET_PRIVATE_KEY',
      status: 'FAIL',
      detail: 'Missing deployer private key. Export the funded deployer wallet.',
    };
  }
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return {
      name: 'MAINNET_PRIVATE_KEY',
      status: 'FAIL',
      detail: 'Private key must be a 32-byte hex string (64 hex characters).',
    };
  }
  if (/^0+$/.test(hex)) {
    return {
      name: 'MAINNET_PRIVATE_KEY',
      status: 'FAIL',
      detail: 'Private key cannot be the zero value.',
    };
  }
  return {
    name: 'MAINNET_PRIVATE_KEY',
    status: 'PASS',
    detail: 'Deployer key format looks valid.',
  };
}

function validateRpc(value: string | null, label: string): CheckResult {
  if (!value) {
    return { name: label, status: 'FAIL', detail: 'RPC endpoint missing. Configure MAINNET_RPC_URL.' };
  }
  try {
    const parsed = new URL(value);
    const allowed = new Set(['http:', 'https:', 'ws:', 'wss:']);
    if (!allowed.has(parsed.protocol)) {
      return {
        name: label,
        status: 'FAIL',
        detail: `Unsupported protocol ${parsed.protocol}. Use http(s) or ws(s).`,
      };
    }
    return { name: label, status: 'PASS', detail: `RPC host ${parsed.host} accepted.` };
  } catch (error) {
    return {
      name: label,
      status: 'FAIL',
      detail: `Invalid URL: ${(error as Error).message}`,
    };
  }
}

function validateGovernance(value: string | null): CheckResult {
  if (!value) {
    return {
      name: 'GOVERNANCE_ADDRESS',
      status: 'FAIL',
      detail: 'Governance address missing. Export your multisig/timelock address.',
    };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return {
      name: 'GOVERNANCE_ADDRESS',
      status: 'FAIL',
      detail: 'Governance must be a checksummed Ethereum address.',
    };
  }
  if (value === '0x0000000000000000000000000000000000000000') {
    return {
      name: 'GOVERNANCE_ADDRESS',
      status: 'FAIL',
      detail: 'Governance cannot be the zero address.',
    };
  }
  return {
    name: 'GOVERNANCE_ADDRESS',
    status: 'PASS',
    detail: `Governance will be set to ${value}.`,
  };
}

function validateOptional(value: string | null, key: string, description: string): CheckResult {
  if (!value) {
    return {
      name: key,
      status: 'WARN',
      detail: `${description} not configured. Step will be skipped automatically.`,
    };
  }
  return {
    name: key,
    status: 'PASS',
    detail: `${description} detected.`,
  };
}

function renderChecks(checks: CheckResult[]): void {
  const maxName = checks.reduce((acc, item) => Math.max(acc, item.name.length), 4);
  const maxStatus = 6;
  const header = `${'Name'.padEnd(maxName)} | ${'Status'.padEnd(maxStatus)} | Detail`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const check of checks) {
    console.log(
      `${check.name.padEnd(maxName)} | ${check.status.padEnd(maxStatus)} | ${check.detail}`
    );
  }
  console.log();
}

function loadPlanSummary(network: string): void {
  const { plan, path: planPath, exists } = loadDeploymentPlan({ network, optional: true });
  if (!exists || !planPath) {
    console.log(`⚠️  deployment-config/${network}.json not found. Default wiring will be used.`);
    console.log();
    return;
  }
  console.log(`Deployment plan: ${planPath}`);
  if (plan.governance) {
    console.log(`• Governance override: ${plan.governance}`);
  }
  if (plan.agialpha) {
    console.log(`• AGIALPHA override: ${plan.agialpha}`);
  }
  if (plan.withTax !== undefined) {
    console.log(`• Tax module: ${plan.withTax ? 'enabled' : 'disabled'}`);
  }
  if (plan.econ) {
    const econ = plan.econ;
    console.log('• Economic overrides:');
    for (const [key, value] of Object.entries(econ)) {
      console.log(`   - ${key}: ${value}`);
    }
  }
  const roots = plan.ensRoots || {};
  const rootKeys = Object.keys(roots);
  if (rootKeys.length) {
    console.log('• ENS roots:');
    for (const key of rootKeys) {
      const entry = roots[key];
      if (typeof entry === 'object' && entry) {
        const name = (entry as any).name || key;
        const node = (entry as any).node || (entry as any).hash;
        console.log(`   - ${key}: ${name} (${node || 'missing node'})`);
      } else {
        console.log(`   - ${key}: ${entry}`);
      }
    }
  }
  console.log();
}

function runCommand(step: ExecutionStep, dryRun: boolean): void {
  if (step.skip) {
    console.log(`⏭️  Skipping step: ${step.label}`);
    return;
  }
  if (dryRun) {
    console.log(`📝 [dry-run] ${step.label}: ${step.command} ${step.args.join(' ')}`);
    return;
  }
  console.log(`🚀 ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    env: { ...process.env, ...(step.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${step.command} ${step.args.join(' ')}`);
  }
}

function renderMermaid(network: string): void {
  const mermaid = `flowchart LR\n    Prep[Prepare ${network} config\\n.env + deployment plan] --> Compile[Compile & constants]\n    Compile --> Migrate[Truffle migrate]\n    Migrate --> Verify[Wire verification]\n    Migrate --> Etherscan[Etherscan verify]\n    Verify --> Owner[Owner control checks]\n    Etherscan --> Owner`;
  console.log('Mermaid overview (copy to docs if needed):');
  console.log('```mermaid');
  console.log(mermaid);
  console.log('```');
  console.log();
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const preferredNetwork =
      inferNetworkKey(options.network) || inferNetworkKey(process.env.TRUFFLE_NETWORK) || inferNetworkKey(process.env.NETWORK);
    const network = preferredNetwork || 'mainnet';

    console.log('AGIJobs v2 · Truffle Production Migration Wizard');
    console.log('================================================');
    console.log(`Network            : ${network}`);
    console.log(`Mode               : ${options.dryRun ? 'Dry-run (preview only)' : 'EXECUTION'}`);
    console.log(`Config directory   : deployment-config/${network}.json`);
    console.log();

    renderMermaid(network);

    const envChecks: CheckResult[] = [];
    const rpcKey = REQUIRED_ENVS[0][0];
    envChecks.push(validateRpc(normaliseEnv(rpcKey), rpcKey));
    envChecks.push(validatePrivateKey(normaliseEnv('MAINNET_PRIVATE_KEY')));
    envChecks.push(validateGovernance(normaliseEnv('GOVERNANCE_ADDRESS')));
    envChecks.push(
      validateOptional(
        normaliseEnv('ETHERSCAN_API_KEY'),
        'ETHERSCAN_API_KEY',
        'Automatic source verification'
      )
    );

    renderChecks(envChecks);

    loadPlanSummary(network);

    const hasFailure = envChecks.some((entry) => entry.status === 'FAIL');
    if (hasFailure) {
      console.error('❗ One or more mandatory environment checks failed. Fix the issues above and rerun the wizard.');
      process.exitCode = 1;
      return;
    }

    const { config: tokenConfig, path: tokenPath } = loadTokenConfig({ network });
    if (tokenPath) {
      console.log(`AGIALPHA config: ${tokenPath}`);
    }
    if (tokenConfig?.address) {
      console.log(`• Token address : ${tokenConfig.address}`);
    }
    if (tokenConfig?.symbol || tokenConfig?.name) {
      console.log(`• Token symbol  : ${tokenConfig.symbol || 'unknown'} (${tokenConfig.name || 'unnamed'})`);
    }
    console.log();

    const steps: ExecutionStep[] = [
      {
        label: 'Compile contracts (Hardhat)',
        command: 'npm',
        args: ['run', `compile:${network}`],
        skip: options.skipCompile,
      },
      {
        label: 'Truffle migrate protocol',
        command: 'npx',
        args: ['truffle', 'migrate', '--network', network, '--reset'],
        skip: options.skipMigrate,
      },
      {
        label: 'Wire verification & owner health',
        command: 'npm',
        args: ['run', 'wire:verify'],
        env: { TRUFFLE_NETWORK: network },
        skip: options.skipWire,
      },
      {
        label: 'Etherscan contract verification',
        command: 'npx',
        args: ['truffle', 'run', 'verify', 'Deployer', '--network', network],
        skip: options.skipVerify || !normaliseEnv('ETHERSCAN_API_KEY'),
      },
    ];

    for (const step of steps) {
      runCommand(step, options.dryRun);
    }

    console.log();
    console.log('✅ Wizard completed.');
    if (options.dryRun) {
      console.log('Run again with --execute to perform the deployment.');
    } else {
      console.log('Review the emitted addresses and run npm run owner:health to confirm control.');
    }
  } catch (error) {
    console.error('❌ Wizard aborted:', (error as Error).message);
    process.exitCode = 1;
  }
}

main();
