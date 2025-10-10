import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';

import parseDuration from '../utils/parseDuration';
import { ethers } from 'ethers';

interface EconConfig {
  feePct?: number;
  burnPct?: number;
  minStake?: string | number;
  jobStake?: string | number;
  minPlatformStake?: string | number;
  commitWindow?: string | number;
  revealWindow?: string | number;
  employerSlashPct?: number;
  treasurySlashPct?: number;
  validatorSlashRewardPct?: number;
  appealFee?: string | number;
  disputeWindow?: string | number;
  treasury?: string;
}

interface DeployConfig {
  network?: string;
  governance: string;
  tax?: {
    enabled?: boolean;
    uri?: string;
    description?: string;
  };
  econ?: EconConfig;
  secureDefaults?: Record<string, unknown>;
  output?: string;
}

type Args = Record<string, string | boolean>;

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function ensureAddress(
  value: string | undefined,
  label: string,
  { allowZero = false, optional = false }: { allowZero?: boolean; optional?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (optional) {
      return undefined;
    }
    throw new Error(`${label} address is required`);
  }
  const address = ethers.getAddress(value);
  if (!allowZero && address === ethers.ZeroAddress) {
    if (optional) {
      return undefined;
    }
    throw new Error(`${label} address cannot be zero`);
  }
  return address;
}

function parseSeconds(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Math.max(0, Math.floor(value));
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  const parsed = parseDuration(trimmed, 's');
  if (parsed === null || parsed === undefined) {
    throw new Error(`Unable to parse duration "${value}"`);
  }
  return Math.max(0, Math.floor(parsed));
}

async function loadConfig(configPath: string): Promise<DeployConfig> {
  const absolute = path.resolve(configPath);
  const raw = await fs.readFile(absolute, 'utf8');
  return JSON.parse(raw) as DeployConfig;
}

function formatToken(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return '0';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return value.trim();
}

async function confirm(message: string, autoYes: boolean): Promise<boolean> {
  if (autoYes) {
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) => {
    rl.question(`${message} [y/N] `, resolve);
  });
  rl.close();
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

async function runHardhat(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn('npx', ['hardhat', ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`hardhat exited with code ${code}`));
      }
    });
    child.on('error', (err) => reject(err));
  });
}

async function main() {
  const args = parseArgs();
  const configPath = (args.config as string) ?? path.join('deployment-config', 'deployer.sample.json');
  const config = await loadConfig(configPath);

  const network = (args.network as string) ?? config.network ?? process.env.HARDHAT_NETWORK ?? 'sepolia';
  const configuredGovernance = ensureAddress(config.governance, 'governance', {
    optional: true,
    allowZero: true,
  });
  const governance =
    configuredGovernance && configuredGovernance !== ethers.ZeroAddress
      ? configuredGovernance
      : undefined;

  const econ = config.econ || {};
  const treasuryAddress =
    ensureAddress(econ.treasury, 'treasury', { optional: true, allowZero: true }) ?? ethers.ZeroAddress;
  const feePct = econ.feePct ?? 5;
  const burnPct = econ.burnPct ?? 0;
  const minStake = formatToken(econ.minStake);
  const minPlatformStake = formatToken(econ.minPlatformStake ?? '1000');
  const appealFee = formatToken(econ.appealFee);
  const disputeWindow = parseSeconds(econ.disputeWindow);

  const summaryGovernance = governance ?? 'deployer (auto)';
  const summary = [
    ['Network', network],
    ['Governance', summaryGovernance],
    ['Treasury', treasuryAddress],
    ['Fee %', String(feePct)],
    ['Burn %', String(burnPct)],
    ['Min stake (AGIA)', minStake],
    ['Min platform stake (AGIA)', minPlatformStake],
    ['Appeal fee (AGIA)', appealFee || '0'],
    ['Dispute window (s)', disputeWindow.toString()],
  ];

  console.log('📦 One-click deployment configuration');
  for (const [label, value] of summary) {
    console.log(`  • ${label.padEnd(24)} ${value}`);
  }

  const proceed = await confirm('Proceed with contract deployment?', Boolean(args.yes));
  if (!proceed) {
    console.log('Aborted by user');
    return;
  }

  const deployEnv: NodeJS.ProcessEnv = {
    ONECLICK_TREASURY: treasuryAddress,
    ONECLICK_FEE_PCT: String(feePct),
    ONECLICK_BURN_PCT: String(burnPct),
    ONECLICK_MIN_STAKE: minStake,
    ONECLICK_MIN_PLATFORM_STAKE: minPlatformStake,
  };

  if (governance) {
    deployEnv.ONECLICK_GOVERNANCE = governance;
  }

  if (appealFee && appealFee !== '0') {
    deployEnv.ONECLICK_APPEAL_FEE = appealFee;
  }
  if (disputeWindow > 0) {
    deployEnv.ONECLICK_DISPUTE_WINDOW = disputeWindow.toString();
  }

  await runHardhat(
    [
      'run',
      '--no-compile',
      '--network',
      network,
      path.join('scripts', 'v2', 'deploy.ts'),
    ],
    deployEnv,
  );

  const addressesPath = path.join('docs', 'deployment-addresses.json');
  const outputPath = config.output ? path.resolve(config.output) : path.resolve('deployment-config', 'latest-deployment.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.copyFile(addressesPath, outputPath);
  console.log(`ℹ️  Deployment addresses copied to ${outputPath}`);

  await runHardhat(
    [
      'run',
      '--no-compile',
      '--network',
      network,
      path.join('scripts', 'v2', 'apply-secure-defaults.ts'),
    ],
    {
      ONECLICK_CONFIG_PATH: path.resolve(configPath),
      ONECLICK_ADDRESSES_PATH: addressesPath,
    },
  );

  console.log('✅ Contracts deployed and secured. Update your environment variables with the new addresses.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
