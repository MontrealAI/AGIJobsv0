#!/usr/bin/env ts-node
import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  loadRewardEngineConfig,
  loadThermostatConfig,
  loadDeploymentPlan,
} from '../config';
import { stringifyWithBigint } from './lib/utils';
type RewardEngineConfig = ReturnType<typeof loadRewardEngineConfig>['config'];

type OutputFormat = 'human' | 'json';

type CliOptions = {
  network?: string;
  address?: string;
  format: OutputFormat;
  missionPath?: string;
  offline?: boolean;
};

type RoleKey = 'agent' | 'validator' | 'operator' | 'employer';

const ROLES: RoleKey[] = ['agent', 'validator', 'operator', 'employer'];

interface MissionRewardEngine {
  burnRatePerBlock?: number;
  bitsProcessed?: number;
}

interface MissionThermodynamics {
  rewardEngine?: MissionRewardEngine;
}

type MissionSnapshot = {
  thermodynamics: MissionThermodynamics | null;
};

type ConfigSnapshot = {
  path: string;
  network?: string;
  source: string;
  address?: string;
  treasury?: string;
  thermostat?: string;
  roleShares: Record<RoleKey, number | null>;
  mu: Record<RoleKey, string | null>;
  baselineEnergy: Record<RoleKey, string | null>;
  kappa?: string;
  maxProofs?: number;
  temperature?: string;
  settlers: string[];
};

type OnChainSnapshot = {
  status: 'ok' | 'error' | 'skipped';
  reason?: string;
  network?: string;
  treasury?: string;
  roleShares?: Record<RoleKey, bigint>;
  mu?: Record<RoleKey, bigint>;
  baselineEnergy?: Record<RoleKey, bigint>;
  kappa?: bigint;
  temperature?: bigint;
  maxProofs?: bigint;
};

type Report = {
  generatedAt: string;
  address?: string;
  config: ConfigSnapshot;
  mission: MissionSnapshot | null;
  onChain: OnChainSnapshot;
  diagnostics: {
    roleShareTotal: number | null;
    roleShareMatchesChain: boolean | null;
  };
};

const DEFAULT_MISSION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'demo',
  'agi-governance',
  'config',
  'mission@v1.json',
);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: 'human' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
      case '--chain': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--address':
      case '--engine': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires an address`);
        }
        options.address = value;
        i += 1;
        break;
      }
      case '--mission': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--mission requires a file path');
        }
        options.missionPath = value;
        i += 1;
        break;
      }
      case '--json':
        options.format = 'json';
        break;
      case '--human':
        options.format = 'human';
        break;
      case '--offline':
        options.offline = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return ["1", "true", "yes", "on", "offline"].includes(normalised);
}

async function loadMissionSnapshot(missionPath?: string): Promise<MissionSnapshot | null> {
  const candidate = missionPath ?? DEFAULT_MISSION_PATH;
  try {
    const raw = await fs.readFile(candidate, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const thermo = parsed.thermodynamics as MissionThermodynamics | undefined;
    return {
      thermodynamics: thermo ?? null,
    };
  } catch (error) {
    return null;
  }
}

function normaliseRoleShares(config: RewardEngineConfig): Record<RoleKey, number | null> {
  const result: Record<RoleKey, number | null> = {
    agent: null,
    validator: null,
    operator: null,
    employer: null,
  };
  if (config.roleShares && typeof config.roleShares === 'object') {
    for (const role of ROLES) {
      const value = (config.roleShares as Record<string, unknown>)[role];
      if (typeof value === 'number') {
        result[role] = value;
      } else if (typeof value === 'string') {
        const numeric = Number(value);
        result[role] = Number.isFinite(numeric) ? numeric : null;
      }
    }
  }
  return result;
}

function normaliseMu(config: RewardEngineConfig): Record<RoleKey, string | null> {
  const result: Record<RoleKey, string | null> = {
    agent: null,
    validator: null,
    operator: null,
    employer: null,
  };
  if (config.mu && typeof config.mu === 'object') {
    for (const role of ROLES) {
      const value = (config.mu as Record<string, unknown>)[role];
      result[role] = value !== undefined && value !== null ? String(value) : null;
    }
  }
  return result;
}

function normaliseBaselineEnergy(config: RewardEngineConfig): Record<RoleKey, string | null> {
  const result: Record<RoleKey, string | null> = {
    agent: null,
    validator: null,
    operator: null,
    employer: null,
  };
  if (config.baselineEnergy && typeof config.baselineEnergy === 'object') {
    for (const role of ROLES) {
      const value = (config.baselineEnergy as Record<string, unknown>)[role];
      result[role] = value !== undefined && value !== null ? String(value) : null;
    }
  }
  return result;
}

function summariseConfig(
  config: RewardEngineConfig,
  configPath: string,
  network: string | undefined,
  source: string,
): ConfigSnapshot {
  const settlers = config.settlers && typeof config.settlers === 'object'
    ? Object.entries(config.settlers)
        .filter(([, allowed]) => Boolean(allowed))
        .map(([account]) => account)
    : [];

  const kappaValue = config.kappa;
  const temperatureValue = config.temperature;

  return {
    path: configPath,
    network,
    source,
    address: config.address,
    treasury: config.treasury,
    thermostat: config.thermostat,
    roleShares: normaliseRoleShares(config),
    mu: normaliseMu(config),
    baselineEnergy: normaliseBaselineEnergy(config),
    kappa:
      typeof kappaValue === 'number'
        ? kappaValue.toString()
        : typeof kappaValue === 'string'
          ? kappaValue
          : undefined,
    maxProofs: typeof config.maxProofs === 'number' ? config.maxProofs : undefined,
    temperature:
      typeof temperatureValue === 'number'
        ? temperatureValue.toString()
        : typeof temperatureValue === 'string'
          ? temperatureValue
          : undefined,
    settlers,
  };
}

function sumRoleShares(roleShares: Record<RoleKey, number | null>): number | null {
  let total = 0;
  for (const role of ROLES) {
    const value = roleShares[role];
    if (value === null || value === undefined) {
      return null;
    }
    total += value;
  }
  return total;
}

function parseToBigInt(value: string | number | null | undefined, decimals = 18): bigint | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = typeof value === 'string' ? value.trim() : value.toString();
  if (!text) {
    return undefined;
  }
  try {
    return ethers.parseUnits(text, decimals);
  } catch (error) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }
    return BigInt(Math.round(numeric));
  }
}

async function fetchOnChainSnapshot(
  address: string | undefined,
  network: string | undefined,
  context: { offline: boolean; config: ConfigSnapshot; mission: MissionSnapshot | null },
): Promise<OnChainSnapshot> {
  if (context.offline) {
    const roleShares: Record<RoleKey, bigint> = {
      agent: BigInt(Math.round((context.config.roleShares.agent ?? 0) * 1e18)),
      validator: BigInt(Math.round((context.config.roleShares.validator ?? 0) * 1e18)),
      operator: BigInt(Math.round((context.config.roleShares.operator ?? 0) * 1e18)),
      employer: BigInt(Math.round((context.config.roleShares.employer ?? 0) * 1e18)),
    };

    const mu: Record<RoleKey, bigint> = {
      agent: parseToBigInt(context.config.mu.agent) ?? 0n,
      validator: parseToBigInt(context.config.mu.validator) ?? 0n,
      operator: parseToBigInt(context.config.mu.operator) ?? 0n,
      employer: parseToBigInt(context.config.mu.employer) ?? 0n,
    };

    const baselineEnergy: Record<RoleKey, bigint> = {
      agent: parseToBigInt(context.config.baselineEnergy.agent) ?? 0n,
      validator: parseToBigInt(context.config.baselineEnergy.validator) ?? 0n,
      operator: parseToBigInt(context.config.baselineEnergy.operator) ?? 0n,
      employer: parseToBigInt(context.config.baselineEnergy.employer) ?? 0n,
    };

    const kappa = parseToBigInt(context.config.kappa) ?? 0n;
    const temperature = parseToBigInt(context.config.temperature) ?? 0n;
    const maxProofs =
      context.config.maxProofs !== undefined
        ? BigInt(Math.max(Math.floor(context.config.maxProofs), 0))
        : undefined;

    return {
      status: 'ok',
      network: network ?? 'offline-simulated',
      treasury: context.config.treasury,
      roleShares,
      mu,
      baselineEnergy,
      kappa,
      temperature,
      maxProofs,
    };
  }

  if (!address) {
    return { status: 'skipped', reason: 'No reward engine address configured.' };
  }

  let checksum: string;
  try {
    checksum = ethers.getAddress(address);
  } catch (error) {
    return { status: 'error', reason: `Invalid address provided: ${(error as Error).message}` };
  }

  if (!process.env.HARDHAT_NETWORK && network) {
    process.env.HARDHAT_NETWORK = network;
  }

  const hardhatResult = await import('hardhat')
    .then((module) => ({ module }))
    .catch((error: unknown) => ({ error }));
  if (!('module' in hardhatResult)) {
    const reason = hardhatResult.error instanceof Error
      ? hardhatResult.error.message
      : 'Hardhat runtime unavailable';
    return { status: 'skipped', reason };
  }

  const runtimeModule = hardhatResult.module as { default?: HardhatRuntimeEnvironment } &
    HardhatRuntimeEnvironment;
  const runtime = (runtimeModule.default ?? runtimeModule) as HardhatRuntimeEnvironment & {
    ethers: any;
    network: { name: string };
  };
  const hreEthers = runtime.ethers as any;
  const hreNetwork = runtime.network as { name: string };

  try {
    const engine = await hreEthers.getContractAt(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB',
      checksum,
    );

    const roleShares: Record<RoleKey, bigint> = {
      agent: await engine.roleShare(0),
      validator: await engine.roleShare(1),
      operator: await engine.roleShare(2),
      employer: await engine.roleShare(3),
    };

    const mu: Record<RoleKey, bigint> = {
      agent: await engine.mu(0),
      validator: await engine.mu(1),
      operator: await engine.mu(2),
      employer: await engine.mu(3),
    };

    const baselineEnergy: Record<RoleKey, bigint> = {
      agent: await engine.baselineEnergy(0),
      validator: await engine.baselineEnergy(1),
      operator: await engine.baselineEnergy(2),
      employer: await engine.baselineEnergy(3),
    };

    const [treasury, kappa, temperature, maxProofs] = await Promise.all([
      engine.treasury(),
      engine.kappa(),
      engine.temperature(),
      engine.maxProofs(),
    ]);

    return {
      status: 'ok',
      network: hreNetwork.name,
      treasury,
      roleShares,
      mu,
      baselineEnergy,
      kappa,
      temperature,
      maxProofs,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error fetching RewardEngineMB';
    return { status: 'error', reason };
  }
}

function compareShares(
  configShares: Record<RoleKey, number | null>,
  chainShares?: Record<RoleKey, bigint>,
): boolean | null {
  if (!chainShares) {
    return null;
  }
  for (let index = 0; index < ROLES.length; index += 1) {
    const role = ROLES[index];
    const configValue = configShares[role];
    if (configValue === null || configValue === undefined) {
      return null;
    }
    const scaledConfig = BigInt(Math.round(configValue * 1e18));
    const chainValue = chainShares[role];
    if (chainValue !== scaledConfig) {
      return false;
    }
  }
  return true;
}

function formatBigint(value?: bigint): string {
  if (value === undefined) {
    return 'n/a';
  }
  return value.toString();
}

function renderHuman(report: Report): void {
  const { config, mission, onChain, diagnostics } = report;
  console.log('━━━ Reward Engine Intelligence Report ━━━');
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Reward engine address: ${report.address ?? '(not resolved)'}`);
  console.log('');

  console.log('Configuration surface');
  console.log('─────────────────────');
  console.log(`• Source: ${config.path} (${config.source})`);
  console.log(`• Network: ${config.network ?? 'auto'}`);
  console.log(`• Treasury: ${config.treasury ?? 'unset'}`);
  console.log(`• Thermostat: ${config.thermostat ?? 'unset'}`);
  console.log(`• Settlers allowed: ${config.settlers.length}`);
  console.log('• Role share blueprint:');
  ROLES.forEach((role) => {
    const share = config.roleShares[role];
    console.log(`   - ${role}: ${share !== null && share !== undefined ? share : 'n/a'}`);
  });
  console.log('');

  if (mission?.thermodynamics?.rewardEngine) {
    console.log('Mission thermodynamic context');
    console.log('─────────────────────────────');
    const details: string[] = [];
    if (mission.thermodynamics.rewardEngine.bitsProcessed !== undefined) {
      details.push(`bits=${mission.thermodynamics.rewardEngine.bitsProcessed}`);
    }
    if (mission.thermodynamics.rewardEngine.burnRatePerBlock !== undefined) {
      details.push(`burn/block=${mission.thermodynamics.rewardEngine.burnRatePerBlock}`);
    }
    console.log(`• ${details.join(', ') || 'No reward engine data recorded'}`);
    console.log('');
  }

  console.log('On-chain observation');
  console.log('────────────────────');
  if (onChain.status === 'ok') {
    console.log(`• Network: ${onChain.network}`);
    console.log(`• Treasury: ${onChain.treasury}`);
    ROLES.forEach((role, index) => {
      console.log(
        `   - ${role} share: ${formatBigint(onChain.roleShares?.[role])} (µ=${formatBigint(
          onChain.mu?.[role],
        )}, baseline=${formatBigint(onChain.baselineEnergy?.[role])})`,
      );
    });
    console.log(`• κ (kappa): ${formatBigint(onChain.kappa)}`);
    console.log(`• Temperature: ${formatBigint(onChain.temperature)}`);
    console.log(`• Max proofs: ${formatBigint(onChain.maxProofs)}`);
  } else {
    console.log(`• Status: ${onChain.status.toUpperCase()}`);
    if (onChain.reason) {
      console.log(`• Reason: ${onChain.reason}`);
    }
  }
  console.log('');

  console.log('Diagnostics');
  console.log('───────────');
  console.log(`• Role share total: ${diagnostics.roleShareTotal ?? 'n/a'}`);
  console.log(`• Config vs on-chain share match: ${diagnostics.roleShareMatchesChain ?? 'n/a'}`);
}

function determineRewardEngineAddress(
  cli: CliOptions,
  config: RewardEngineConfig,
): string | undefined {
  if (cli.address) {
    return cli.address;
  }
  if (config.address) {
    return config.address;
  }
  const deployment = loadDeploymentPlan({ network: cli.network, optional: true });
  if (deployment.exists && deployment.plan?.rewardEngine && typeof deployment.plan.rewardEngine === 'object') {
    const candidate = deployment.plan.rewardEngine as { address?: string };
    if (candidate.address) {
      return candidate.address;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const mission = await loadMissionSnapshot(cli.missionPath);
  let configLoadWarning: string | undefined;
  let rewardResult;
  try {
    rewardResult = loadRewardEngineConfig({ network: cli.network });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/RewardEngine address cannot be the zero address/.test(message)) {
      const fallbackPath = path.resolve(__dirname, '..', '..', 'config', 'reward-engine.json');
      const raw = JSON.parse(await fs.readFile(fallbackPath, 'utf8')) as Record<string, unknown>;
      const fallbackConfig = (raw.rewardEngine ?? raw) as RewardEngineConfig;
      rewardResult = {
        config: fallbackConfig,
        path: fallbackPath,
        network: cli.network,
        source: raw.rewardEngine ? 'thermodynamics' : 'reward-engine',
      };
      configLoadWarning = message;
    } else {
      throw error;
    }
  }

  const { config, path: configPath, network, source } = rewardResult;

  try {
    const thermostatConfig = loadThermostatConfig({ network: cli.network });
    if (thermostatConfig?.config?.address && !config.thermostat) {
      config.thermostat = thermostatConfig.config.address;
    }
  } catch (error) {
    // Thermostat configuration is optional for the audit; ignore if unavailable.
  }

  const rewardEngineAddress = determineRewardEngineAddress(cli, config);
  const configSnapshot = summariseConfig(config, configPath, network, source);
  const offlineEnv =
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_OFFLINE) ||
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_MODE);
  const offline = Boolean(cli.offline ?? offlineEnv);
  const onChain = await fetchOnChainSnapshot(rewardEngineAddress, cli.network ?? network, {
    offline,
    config: configSnapshot,
    mission,
  });
  const roleShareTotal = sumRoleShares(configSnapshot.roleShares);
  const diagnostics = {
    roleShareTotal,
    roleShareMatchesChain: offline ? true : compareShares(configSnapshot.roleShares, onChain.roleShares),
  };

  let normalisedAddress: string | undefined;
  if (rewardEngineAddress) {
    try {
      normalisedAddress = ethers.getAddress(rewardEngineAddress);
    } catch (error) {
      normalisedAddress = rewardEngineAddress;
    }
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    address: normalisedAddress,
    config: configSnapshot,
    mission,
    onChain,
    diagnostics,
  };

  if (offline) {
    (report as Record<string, unknown>).mode = 'offline';
  }

  if (configLoadWarning && cli.format === 'human') {
    console.warn(`⚠️ ${configLoadWarning}`);
  }

  if (cli.format === 'json') {
    console.log(stringifyWithBigint(report));
  } else {
    renderHuman(report);
  }

  if (!offline && diagnostics.roleShareMatchesChain === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Reward engine report failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
