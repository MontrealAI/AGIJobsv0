import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Wallet, ZeroAddress, formatEther, getAddress, parseEther } from 'ethers';
import { z } from 'zod';
import { NormalisedAlphaNodeConfig } from '../config';
import { connectPlatformRegistry, connectSystemPause } from './contracts';

export interface GovernanceSnapshot {
  readonly operator: string;
  readonly governance: string;
  readonly paused: boolean;
  readonly operatorIsGovernance: boolean;
  readonly operatorBlacklisted: boolean;
}

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const governanceUpdateSchema = z.object({
  config: z
    .object({
      stakeManager: addressSchema.optional(),
      reputationEngine: addressSchema.optional(),
      minPlatformStake: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      pauser: addressSchema.optional(),
      pauserManager: addressSchema.optional()
    })
    .partial()
    .default({}),
  registrars: z
    .array(
      z.object({
        address: addressSchema,
        allowed: z.boolean()
      })
    )
    .default([]),
  blacklist: z
    .array(
      z.object({
        address: addressSchema,
        status: z.boolean()
      })
    )
    .default([])
});

export interface PlatformConfigurationUpdate {
  readonly stakeManager?: string;
  readonly reputationEngine?: string;
  readonly minPlatformStakeWei?: bigint;
  readonly minPlatformStakeHuman?: string;
  readonly pauser?: string;
  readonly pauserManager?: string;
  readonly registrars: readonly { registrar: string; allowed: boolean }[];
  readonly blacklist: readonly { operator: string; status: boolean }[];
}

export interface GovernanceActionOptions {
  readonly dryRun?: boolean;
}

export interface GovernanceUpdateSummary {
  readonly stakeManagerUpdated: boolean;
  readonly reputationEngineUpdated: boolean;
  readonly minStakeUpdated: boolean;
  readonly pauserUpdated: boolean;
  readonly pauserManagerUpdated: boolean;
  readonly registrarUpdates: number;
  readonly blacklistUpdates: number;
  readonly minStake?: {
    readonly human: string;
    readonly wei: string;
  };
}

export interface GovernanceActionReport {
  readonly dryRun: boolean;
  readonly target: string;
  readonly calldata: string;
  readonly value: string;
  readonly transactionHash?: string;
  readonly summary: GovernanceUpdateSummary;
  readonly notes: string[];
}

export async function fetchGovernanceSnapshot(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig
): Promise<GovernanceSnapshot> {
  const platformRegistry = connectPlatformRegistry(
    config.contracts.platformRegistry,
    signer
  );
  const systemPause = connectSystemPause(config.contracts.systemPause, signer);
  const operatorAddress = getAddress(await signer.getAddress());

  const [governance, paused, blacklisted] = await Promise.all([
    systemPause.governance(),
    systemPause.paused(),
    platformRegistry.blacklist(operatorAddress),
  ]);

  const governanceAddress = getAddress(governance);

  return {
    operator: operatorAddress,
    governance: governanceAddress,
    paused: Boolean(paused),
    operatorIsGovernance:
      governanceAddress.toLowerCase() === operatorAddress.toLowerCase(),
    operatorBlacklisted: Boolean(blacklisted),
  };
}

export async function loadGovernanceUpdate(
  manifestPath: string
): Promise<PlatformConfigurationUpdate> {
  const resolved = path.resolve(manifestPath);
  const raw = await fs.readFile(resolved, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse governance update manifest (${resolved}): ${(error as Error).message}`
    );
  }

  const manifest = governanceUpdateSchema.parse(parsed);

  const minStakeHuman = manifest.config.minPlatformStake;
  const minStakeWei =
    typeof minStakeHuman === 'string' ? parseEther(minStakeHuman) : undefined;

  return {
    stakeManager: manifest.config.stakeManager,
    reputationEngine: manifest.config.reputationEngine,
    minPlatformStakeWei: minStakeWei,
    minPlatformStakeHuman: minStakeHuman,
    pauser: manifest.config.pauser,
    pauserManager: manifest.config.pauserManager,
    registrars: manifest.registrars.map((entry) => ({
      registrar: entry.address,
      allowed: entry.allowed,
    })),
    blacklist: manifest.blacklist.map((entry) => ({
      operator: entry.address,
      status: entry.status,
    })),
  };
}

interface PreparedGovernanceCall {
  readonly args: readonly [
    {
      readonly setStakeManager: boolean;
      readonly stakeManager: string;
      readonly setReputationEngine: boolean;
      readonly reputationEngine: string;
      readonly setMinPlatformStake: boolean;
      readonly minPlatformStake: bigint;
      readonly setPauser: boolean;
      readonly pauser: string;
      readonly setPauserManager: boolean;
      readonly pauserManager: string;
    },
    readonly { readonly registrar: string; readonly allowed: boolean }[],
    readonly { readonly operator: string; readonly status: boolean }[]
  ];
  readonly calldata: string;
  readonly summary: GovernanceUpdateSummary;
  readonly notes: string[];
}

function buildConfigurationCall(
  update: PlatformConfigurationUpdate,
  contractAddress: string,
  encode: (args: PreparedGovernanceCall['args']) => string
): PreparedGovernanceCall {
  const configStruct = {
    setStakeManager: update.stakeManager !== undefined,
    stakeManager: update.stakeManager ?? ZeroAddress,
    setReputationEngine: update.reputationEngine !== undefined,
    reputationEngine: update.reputationEngine ?? ZeroAddress,
    setMinPlatformStake: update.minPlatformStakeWei !== undefined,
    minPlatformStake: update.minPlatformStakeWei ?? 0n,
    setPauser: update.pauser !== undefined,
    pauser: update.pauser ?? ZeroAddress,
    setPauserManager: update.pauserManager !== undefined,
    pauserManager: update.pauserManager ?? ZeroAddress,
  } as const;

  const registrarUpdates = update.registrars.map((entry) => ({
    registrar: entry.registrar,
    allowed: entry.allowed,
  }));

  const blacklistUpdates = update.blacklist.map((entry) => ({
    operator: entry.operator,
    status: entry.status,
  }));

  const summary: GovernanceUpdateSummary = {
    stakeManagerUpdated: configStruct.setStakeManager,
    reputationEngineUpdated: configStruct.setReputationEngine,
    minStakeUpdated: configStruct.setMinPlatformStake,
    pauserUpdated: configStruct.setPauser,
    pauserManagerUpdated: configStruct.setPauserManager,
    registrarUpdates: registrarUpdates.length,
    blacklistUpdates: blacklistUpdates.length,
    minStake: configStruct.setMinPlatformStake
      ? {
          human: update.minPlatformStakeHuman ?? formatEther(configStruct.minPlatformStake),
          wei: configStruct.minPlatformStake.toString(),
        }
      : undefined,
  };

  const notes: string[] = [];
  if (summary.stakeManagerUpdated && update.stakeManager) {
    notes.push(`StakeManager → ${update.stakeManager}`);
  }
  if (summary.reputationEngineUpdated && update.reputationEngine) {
    notes.push(`ReputationEngine → ${update.reputationEngine}`);
  }
  if (summary.minStakeUpdated && summary.minStake) {
    notes.push(
      `Min platform stake → ${summary.minStake.human} $AGIALPHA (${summary.minStake.wei} wei)`
    );
  }
  if (summary.pauserUpdated && update.pauser) {
    notes.push(`Pauser → ${update.pauser}`);
  }
  if (summary.pauserManagerUpdated && update.pauserManager) {
    notes.push(`PauserManager → ${update.pauserManager}`);
  }
  if (registrarUpdates.length > 0) {
    registrarUpdates.forEach((entry) =>
      notes.push(`Registrar ${entry.registrar} → ${entry.allowed ? 'allowed' : 'blocked'}`)
    );
  }
  if (blacklistUpdates.length > 0) {
    blacklistUpdates.forEach((entry) =>
      notes.push(`Blacklist ${entry.operator} → ${entry.status ? 'blacklisted' : 'cleared'}`)
    );
  }

  const args: PreparedGovernanceCall['args'] = [
    configStruct,
    registrarUpdates,
    blacklistUpdates,
  ];

  const calldata = encode(args);

  notes.push(`Target PlatformRegistry: ${contractAddress}`);

  return {
    args,
    calldata,
    summary,
    notes,
  };
}

export async function applyGovernanceUpdate(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  update: PlatformConfigurationUpdate,
  options?: GovernanceActionOptions
): Promise<GovernanceActionReport> {
  const platformRegistry = connectPlatformRegistry(
    config.contracts.platformRegistry,
    signer
  );

  const prepared = buildConfigurationCall(
    update,
    config.contracts.platformRegistry,
    (args) =>
      platformRegistry.interface.encodeFunctionData('applyConfiguration', args)
  );

  const hasChanges =
    prepared.summary.stakeManagerUpdated ||
    prepared.summary.reputationEngineUpdated ||
    prepared.summary.minStakeUpdated ||
    prepared.summary.pauserUpdated ||
    prepared.summary.pauserManagerUpdated ||
    prepared.summary.registrarUpdates > 0 ||
    prepared.summary.blacklistUpdates > 0;

  if (!hasChanges) {
    prepared.notes.push('No configuration changes specified; skipping transaction.');
    return {
      dryRun: true,
      target: platformRegistry.target as string,
      calldata: '0x',
      value: '0',
      summary: prepared.summary,
      notes: prepared.notes,
    };
  }

  const report: GovernanceActionReport = {
    dryRun: true,
    target: platformRegistry.target as string,
    calldata: prepared.calldata,
    value: '0',
    summary: prepared.summary,
    notes: prepared.notes,
  };

  if (options?.dryRun) {
    report.notes.push('Dry-run only: no transaction broadcast.');
    return report;
  }

  const tx = await (platformRegistry as any).applyConfiguration(
    ...prepared.args
  );
  report.notes.push(`applyConfiguration broadcast: ${tx.hash}`);
  const receipt = await tx.wait?.();
  if (receipt) {
    report.notes.push(`Confirmed in block ${receipt.blockNumber}`);
  }
  return {
    ...report,
    dryRun: false,
    transactionHash: tx.hash,
  };
}
