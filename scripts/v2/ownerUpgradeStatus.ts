#!/usr/bin/env ts-node
import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  loadOwnerControlConfig,
  loadDeploymentPlan,
} from '../config';
import { stringifyWithBigint } from './lib/utils';

type OutputFormat = 'human' | 'json';

type CliOptions = {
  network?: string;
  timelock?: string;
  format: OutputFormat;
  operations: string[];
  missionPath?: string;
  offline?: boolean;
};

type RoleDescriptor = {
  name: string;
  id: string;
  members: string[];
};

type OperationStatus = {
  id: string;
  pending?: boolean;
  ready?: boolean;
  executed?: boolean;
  timestamp?: bigint;
  error?: string;
};

type TimelockSnapshot = {
  status: 'ok' | 'error' | 'skipped';
  reason?: string;
  network?: string;
  minDelay?: bigint;
  roles?: RoleDescriptor[];
  operations?: OperationStatus[];
};

type Report = {
  generatedAt: string;
  timelock?: string;
  configSource: string;
  onChain: TimelockSnapshot;
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

type MissionSnapshot = {
  timelockSeconds?: number;
  upgradeActions: string[];
};

async function loadMissionSnapshot(missionPath?: string): Promise<MissionSnapshot | null> {
  const candidate = missionPath ? path.resolve(missionPath) : DEFAULT_MISSION_PATH;
  try {
    const raw = await fs.readFile(candidate, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ownerControls = parsed.ownerControls as Record<string, unknown> | undefined;
    const timelockSeconds =
      ownerControls && typeof ownerControls.timelockSeconds === 'number'
        ? ownerControls.timelockSeconds
        : undefined;
    const upgradeActionsRaw = Array.isArray(ownerControls?.upgradeActions)
      ? (ownerControls?.upgradeActions as Array<Record<string, unknown>>)
      : [];
    const upgradeActions = upgradeActionsRaw
      .map((entry) => {
        const label = typeof entry.label === 'string' ? entry.label : undefined;
        const command = typeof entry.command === 'string' ? entry.command : undefined;
        const id = typeof entry.id === 'string' ? entry.id : undefined;
        return command || label || id || undefined;
      })
      .filter((value): value is string => Boolean(value));

    return {
      timelockSeconds,
      upgradeActions,
    };
  } catch (error) {
    return null;
  }
}

const ROLE_LABELS: Array<{ name: string; hash: string }> = [
  { name: 'TIMELOCK_ADMIN_ROLE', hash: ethers.id('TIMELOCK_ADMIN_ROLE') },
  { name: 'PROPOSER_ROLE', hash: ethers.id('PROPOSER_ROLE') },
  { name: 'EXECUTOR_ROLE', hash: ethers.id('EXECUTOR_ROLE') },
  { name: 'CANCELLER_ROLE', hash: ethers.id('CANCELLER_ROLE') },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: 'human', operations: [] };
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
      case '--timelock':
      case '--address': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires an address`);
        }
        options.timelock = value;
        i += 1;
        break;
      }
      case '--operation': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--operation requires a hash');
        }
        options.operations.push(value);
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

function determineTimelockAddress(cli: CliOptions): { address?: string; source: string } {
  if (cli.timelock) {
    return { address: cli.timelock, source: 'cli' };
  }

  const ownerConfig = loadOwnerControlConfig({ network: cli.network });
  if (ownerConfig.config.governance) {
    return { address: ownerConfig.config.governance, source: ownerConfig.path };
  }

  const deployment = loadDeploymentPlan({ network: cli.network, optional: true });
  if (deployment.exists && deployment.plan?.governance) {
    return { address: deployment.plan.governance, source: deployment.path ?? 'deployment plan' };
  }

  return { address: undefined, source: 'not found' };
}

function normaliseAddress(address: string): string | null {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    return null;
  }
}

function formatDuration(seconds?: bigint): string {
  if (seconds === undefined) {
    return 'n/a';
  }
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds)) {
    return `${seconds.toString()} seconds`;
  }
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = totalSeconds / 60;
  if (minutes < 120) {
    return `${minutes.toFixed(2)} min`;
  }
  const hours = minutes / 60;
  if (hours < 48) {
    return `${hours.toFixed(2)} h`;
  }
  const days = hours / 24;
  return `${days.toFixed(2)} d`;
}

async function fetchTimelockSnapshot(
  address: string | undefined,
  network: string | undefined,
  operations: string[] = [],
  context: { offline: boolean; mission: MissionSnapshot | null },
): Promise<TimelockSnapshot> {
  if (context.offline) {
    const derivedOperations = operations.length > 0 ? operations : context.mission?.upgradeActions ?? [];
    const operationStatuses: OperationStatus[] = derivedOperations.map((id) => ({
      id,
      pending: false,
      ready: true,
      executed: false,
    }));
    const minDelay =
      context.mission?.timelockSeconds !== undefined
        ? BigInt(Math.max(Math.floor(context.mission.timelockSeconds), 0))
        : undefined;
    return {
      status: 'ok',
      network: network ?? 'offline-simulated',
      minDelay,
      roles: [],
      operations: operationStatuses,
    };
  }

  if (!address) {
    return { status: 'skipped', reason: 'No timelock address available.' };
  }

  const checksum = normaliseAddress(address);
  if (!checksum) {
    return { status: 'error', reason: `Invalid timelock address ${address}` };
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
    const timelock = await hreEthers.getContractAt(
      '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
      checksum,
    );

    const minDelay = await timelock.getMinDelay();

    const roles: RoleDescriptor[] = [];
    for (const { name, hash } of ROLE_LABELS) {
      const members: string[] = [];
      const count = Number(await timelock.getRoleMemberCount(hash));
      for (let index = 0; index < count; index += 1) {
        const member = await timelock.getRoleMember(hash, index);
        members.push(member);
      }
      roles.push({ name, id: hash, members });
    }

    const operationStatuses: OperationStatus[] = [];
    for (const idRaw of operations) {
      const cleaned = idRaw.trim();
      let operationId: string | null = null;
      try {
        if (!ethers.isHexString(cleaned)) {
          throw new Error('Operation identifier must be hex-encoded');
        }
        operationId = ethers.hexlify(cleaned);
      } catch (error) {
        operationStatuses.push({
          id: cleaned || idRaw,
          error: error instanceof Error ? error.message : 'Invalid operation hash',
        });
        continue;
      }
      try {
        const pending = await timelock.isOperationPending(operationId);
        const ready = await timelock.isOperationReady(operationId);
        const executed = await timelock.isOperationDone(operationId);
        const timestamp = await timelock.getTimestamp(operationId);
        operationStatuses.push({ id: operationId, pending, ready, executed, timestamp });
      } catch (error) {
        operationStatuses.push({
          id: operationId,
          error: error instanceof Error ? error.message : 'Operation status unavailable',
        });
      }
    }

    return {
      status: 'ok',
      network: hreNetwork.name,
      minDelay,
      roles,
      operations: operationStatuses,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown timelock query error';
    return { status: 'error', reason };
  }
}

function renderHuman(report: Report): void {
  console.log('━━━ Timelock Governance Status ━━━');
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Timelock address: ${report.timelock ?? '(not resolved)'}`);
  console.log(`Configuration source: ${report.configSource}`);
  console.log('');

  const { onChain } = report;
  console.log('On-chain state');
  console.log('──────────────');
  if (onChain.status === 'ok') {
    console.log(`• Network: ${onChain.network}`);
    console.log(`• Minimum delay: ${formatDuration(onChain.minDelay)} (${onChain.minDelay?.toString() ?? 'n/a'} seconds)`);
    onChain.roles?.forEach((role) => {
      console.log(`• ${role.name} (${role.id})`);
      if (role.members.length === 0) {
        console.log('   ↳ no members configured');
      } else {
        role.members.forEach((member) => console.log(`   ↳ ${member}`));
      }
    });
    if (onChain.operations && onChain.operations.length > 0) {
      console.log('• Operation status:');
      onChain.operations.forEach((operation) => {
        console.log(`   - ${operation.id}`);
        if (operation.error) {
          console.log(`     ⚠️ ${operation.error}`);
        } else {
          console.log(`     pending=${operation.pending} ready=${operation.ready} executed=${operation.executed}`);
          console.log(`     eta=${operation.timestamp?.toString() ?? '0'}`);
        }
      });
    }
  } else {
    console.log(`• Status: ${onChain.status.toUpperCase()}`);
    if (onChain.reason) {
      console.log(`• Reason: ${onChain.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const mission = await loadMissionSnapshot(cli.missionPath);
  const resolved = determineTimelockAddress(cli);
  const offlineEnv =
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_OFFLINE) ||
    isTruthyFlag(process.env.AGI_OWNER_DIAGNOSTICS_MODE);
  const offline = Boolean(cli.offline ?? offlineEnv);
  const snapshot = await fetchTimelockSnapshot(resolved.address, cli.network, cli.operations, {
    offline,
    mission,
  });

  let normalised: string | undefined;
  if (resolved.address) {
    normalised = normaliseAddress(resolved.address) ?? resolved.address;
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    timelock: normalised,
    configSource: resolved.source,
    onChain: snapshot,
  };

  if (offline) {
    (report as Record<string, unknown>).mode = 'offline';
  }

  if (cli.format === 'json') {
    console.log(stringifyWithBigint(report));
  } else {
    renderHuman(report);
  }

  if (!offline && snapshot.status === 'error') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Timelock status audit failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
