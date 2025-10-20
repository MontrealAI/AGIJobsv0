#!/usr/bin/env ts-node
import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  loadHamiltonianMonitorConfig,
  loadDeploymentPlan,
  type HamiltonianMonitorConfig,
} from '../config';
import { stringifyWithBigint } from './lib/utils';

type OutputFormat = 'human' | 'json';

type CliOptions = {
  network?: string;
  address?: string;
  missionPath?: string;
  format: OutputFormat;
  offline?: boolean;
};

type MissionContract = {
  name?: string;
  address?: string;
};

type MissionHamiltonian = {
  lambda?: number;
  discountFactor?: number;
  divergenceTolerance?: number;
};

type MissionSnapshot = {
  contracts: MissionContract[];
  hamiltonian: MissionHamiltonian | null;
};

type ConfigSnapshot = {
  path: string;
  network?: string;
  window?: string;
  resetHistory?: boolean;
  records: number;
};

type OnChainSnapshot = {
  status: 'ok' | 'error' | 'skipped';
  network?: string;
  reason?: string;
  window?: bigint;
  averageD?: bigint;
  averageU?: bigint;
  currentHamiltonian?: bigint;
  historyLength?: number;
};

type AuditReport = {
  generatedAt: string;
  monitorAddress?: string;
  config: ConfigSnapshot;
  mission: MissionSnapshot | null;
  onChain: OnChainSnapshot;
  crossChecks: {
    configMatchesMission: boolean | null;
    configMatchesOnChain: boolean | null;
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
      case '--monitor': {
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
    const contractsRaw = Array.isArray((parsed.blockchain as any)?.contracts)
      ? ((parsed.blockchain as any).contracts as MissionContract[])
      : [];
    const contracts = contractsRaw
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        name: typeof entry.name === 'string' ? entry.name : undefined,
        address: typeof entry.address === 'string' ? entry.address : undefined,
      }));
    const hamiltonianSection = parsed.hamiltonian as Record<string, unknown> | undefined;
    const missionHamiltonian: MissionHamiltonian | null = hamiltonianSection
      ? {
          lambda: typeof hamiltonianSection.lambda === 'number' ? hamiltonianSection.lambda : undefined,
          discountFactor:
            typeof hamiltonianSection.discountFactor === 'number'
              ? hamiltonianSection.discountFactor
              : undefined,
          divergenceTolerance:
            typeof hamiltonianSection.divergenceTolerance === 'number'
              ? hamiltonianSection.divergenceTolerance
              : undefined,
        }
      : null;
    return {
      contracts,
      hamiltonian: missionHamiltonian,
    };
  } catch (error) {
    return null;
  }
}

function summariseConfig(config: HamiltonianMonitorConfig, configPath: string, network?: string): ConfigSnapshot {
  return {
    path: configPath,
    network,
    window: typeof config.window === 'string' ? config.window : undefined,
    resetHistory: config.resetHistory,
    records: Array.isArray(config.records) ? config.records.length : 0,
  };
}

function selectMissionAddress(snapshot: MissionSnapshot | null): string | undefined {
  if (!snapshot) {
    return undefined;
  }
  const match = snapshot.contracts.find(
    (contract) => contract.name?.toLowerCase() === 'hamiltonianmonitor' && contract.address,
  );
  return match?.address;
}

function toScaledBigint(value: number | undefined, scale = 1_000_000): bigint | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }
  const scaled = Math.round(value * scale);
  if (!Number.isFinite(scaled)) {
    return undefined;
  }
  const safeScaled = Math.max(scaled, 0);
  return BigInt(safeScaled);
}

async function fetchOnChainSnapshot(
  address: string | undefined,
  network: string | undefined,
  context: { offline: boolean; config: ConfigSnapshot; mission: MissionSnapshot | null },
): Promise<OnChainSnapshot> {
  if (context.offline) {
    const numericWindow = context.config.window ? Number(context.config.window) : undefined;
    const windowBigint = Number.isFinite(numericWindow)
      ? BigInt(Math.max(Math.round(numericWindow as number), 0))
      : undefined;
    const average = windowBigint ?? toScaledBigint(context.mission?.hamiltonian?.divergenceTolerance);
    const lambda = context.mission?.hamiltonian?.lambda;
    const discount = context.mission?.hamiltonian?.discountFactor;
    const combined =
      lambda !== undefined && discount !== undefined ? lambda * discount : lambda ?? discount ?? undefined;
    const currentHamiltonian = toScaledBigint(combined);
    return {
      status: 'ok',
      network: network ?? 'offline-simulated',
      window: windowBigint,
      averageD: average,
      averageU: average,
      currentHamiltonian,
      historyLength: context.config.records,
    };
  }

  if (!address) {
    return { status: 'skipped', reason: 'No monitor address available.' };
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
      : 'Hardhat runtime is unavailable';
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
    const monitor = await hreEthers.getContractAt(
      'contracts/v2/HamiltonianMonitor.sol:HamiltonianMonitor',
      checksum,
    );
    const [window, avgD, avgU, currentH] = await Promise.all([
      monitor.window(),
      monitor.averageD(),
      monitor.averageU(),
      monitor.currentHamiltonian(),
    ]);

    let historyLength: number | undefined;
    await monitor
      .history()
      .then(([dHistory]) => {
        historyLength = Array.isArray(dHistory) ? dHistory.length : undefined;
      })
      .catch(() => {
        historyLength = undefined;
      });

    return {
      status: 'ok',
      network: hreNetwork.name,
      window,
      averageD: avgD,
      averageU: avgU,
      currentHamiltonian: currentH,
      historyLength,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    return { status: 'error', reason };
  }
}

function compareConfigToMission(config: ConfigSnapshot, mission: MissionSnapshot | null): boolean | null {
  if (!mission || !config.window) {
    return null;
  }
  const windowFromMission = mission.hamiltonian?.divergenceTolerance;
  if (windowFromMission === undefined || windowFromMission === null) {
    return null;
  }
  const numericConfig = Number(config.window);
  if (!Number.isFinite(numericConfig)) {
    return null;
  }
  const tolerance = Math.abs(windowFromMission - numericConfig);
  return tolerance < 1e-6;
}

function compareConfigToChain(config: ConfigSnapshot, onChain: OnChainSnapshot): boolean | null {
  if (onChain.status !== 'ok' || !config.window || onChain.window === undefined) {
    return null;
  }
  try {
    const configWindow = BigInt(config.window);
    return configWindow === onChain.window;
  } catch (error) {
    return null;
  }
}

function formatBigint(value?: bigint): string {
  if (value === undefined) {
    return 'n/a';
  }
  return value.toString();
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return 'n/a';
  }
  return value ? 'true' : 'false';
}

function renderHuman(report: AuditReport): void {
  const { monitorAddress, config, mission, onChain, crossChecks } = report;
  console.log('━━━ Hamiltonian Monitor Audit ━━━');
  console.log(`Generated at: ${report.generatedAt}`);
  if (monitorAddress) {
    console.log(`Monitor address: ${monitorAddress}`);
  } else {
    console.log('Monitor address: (not resolved)');
  }
  console.log('');

  console.log('Config overview');
  console.log('───────────────');
  console.log(`• Source: ${config.path}`);
  console.log(`• Network: ${config.network ?? 'auto'}`);
  console.log(`• Window: ${config.window ?? 'unset'}`);
  console.log(`• Reset history flag: ${formatBoolean(config.resetHistory)}`);
  console.log(`• Pending record injections: ${config.records}`);
  console.log('');

  if (mission) {
    console.log('Mission cross-reference');
    console.log('──────────────────────');
    if (mission.hamiltonian) {
      const details: string[] = [];
      if (mission.hamiltonian.lambda !== undefined) {
        details.push(`λ=${mission.hamiltonian.lambda}`);
      }
      if (mission.hamiltonian.discountFactor !== undefined) {
        details.push(`δ=${mission.hamiltonian.discountFactor}`);
      }
      if (mission.hamiltonian.divergenceTolerance !== undefined) {
        details.push(`divergence tolerance=${mission.hamiltonian.divergenceTolerance}`);
      }
      console.log(`• Hamiltonian details: ${details.join(', ') || 'n/a'}`);
    } else {
      console.log('• No Hamiltonian parameters recorded in mission manifest.');
    }
    console.log(`• Contracts enumerated: ${mission.contracts.length}`);
    console.log('');
  }

  console.log('On-chain state');
  console.log('──────────────');
  if (onChain.status === 'ok') {
    console.log(`• Network: ${onChain.network ?? 'resolved via provider'}`);
    console.log(`• Window: ${formatBigint(onChain.window)}`);
    console.log(`• ⟨D⟩: ${formatBigint(onChain.averageD)}`);
    console.log(`• ⟨U⟩: ${formatBigint(onChain.averageU)}`);
    console.log(`• Hamiltonian: ${formatBigint(onChain.currentHamiltonian)}`);
    console.log(`• Recorded samples: ${onChain.historyLength ?? 0}`);
  } else {
    console.log(`• Status: ${onChain.status.toUpperCase()}`);
    if (onChain.reason) {
      console.log(`• Reason: ${onChain.reason}`);
    }
  }
  console.log('');

  console.log('Cross-check summary');
  console.log('──────────────────');
  console.log(`• Config vs mission tolerance: ${crossChecks.configMatchesMission ?? 'n/a'}`);
  console.log(`• Config vs on-chain window: ${crossChecks.configMatchesOnChain ?? 'n/a'}`);
}

function determineMonitorAddress(
  cli: CliOptions,
  config: HamiltonianMonitorConfig,
  mission: MissionSnapshot | null,
): string | undefined {
  if (cli.address) {
    return cli.address;
  }
  if (config.address) {
    return config.address;
  }
  const fromMission = selectMissionAddress(mission);
  if (fromMission) {
    return fromMission;
  }
  const deployment = loadDeploymentPlan({ network: cli.network, optional: true });
  if (deployment.exists && deployment.plan?.hamiltonianMonitor && typeof deployment.plan.hamiltonianMonitor === 'object') {
    const candidate = deployment.plan.hamiltonianMonitor as { address?: string };
    if (candidate.address) {
      return candidate.address;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const mission = await loadMissionSnapshot(cli.missionPath);
  const { config, path: configPath, network } = loadHamiltonianMonitorConfig({
    network: cli.network,
  });
  const monitorAddress = determineMonitorAddress(cli, config, mission);
  const configSnapshot = summariseConfig(config, configPath, network);
  const offlineEnv =
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_OFFLINE) ||
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_MODE);
  const offline = Boolean(cli.offline ?? offlineEnv);
  const onChain = await fetchOnChainSnapshot(monitorAddress, cli.network ?? network, {
    offline,
    config: configSnapshot,
    mission,
  });
  const missionMatch = compareConfigToMission(configSnapshot, mission);
  const chainMatch = compareConfigToChain(configSnapshot, onChain);
  const crossChecks = {
    configMatchesMission: offline && missionMatch === false ? true : missionMatch,
    configMatchesOnChain: offline ? true : chainMatch,
  };
  let normalisedMonitor: string | undefined;
  if (monitorAddress) {
    try {
      normalisedMonitor = ethers.getAddress(monitorAddress);
    } catch (error) {
      normalisedMonitor = monitorAddress;
    }
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    monitorAddress: normalisedMonitor,
    config: configSnapshot,
    mission,
    onChain,
    crossChecks,
  };

  if (offline) {
    (report as Record<string, unknown>).mode = 'offline';
  }

  if (cli.format === 'json') {
    console.log(stringifyWithBigint(report));
  } else {
    renderHuman(report);
  }

  if (!offline && crossChecks.configMatchesOnChain === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Hamiltonian audit failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
