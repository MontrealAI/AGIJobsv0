import fs from 'fs';
import path from 'path';
import { JsonRpcProvider, Provider, ethers } from 'ethers';
import {
  CapabilityMatrix,
  loadCapabilityMatrix,
  selectAgent,
  fetchJobRequirements,
  SelectAgentOptions,
} from '../../apps/orchestrator/bidding';

interface JobMetadata {
  category: string;
  requiredSkills?: string[];
  reward?: string | number | bigint;
  rewardDecimals?: number;
  requiredStake?: string | number | bigint;
  stakeDecimals?: number;
  minEfficiencyScore?: number;
  maxEnergyScore?: number;
  minProfitMargin?: number;
  energyCostPerUnit?: number;
  jobId?: string | number;
}

interface CliConfig {
  metadataPath?: string;
  category?: string;
  reputationEngine?: string;
  stakeManager?: string;
  jobId?: string | number;
  requiredSkills?: string[];
  minEfficiencyScore?: number;
  maxEnergyScore?: number;
  minProfitMargin?: number;
  energyCostPerUnit?: number;
  reward?: string | number | bigint;
  rewardDecimals?: number;
  requiredStake?: string | number | bigint;
  stakeDecimals?: number;
  matrixPath?: string;
  rpcUrl?: string;
}

function getFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  return process.argv[index + 1];
}

function getListFlag(flag: string): string[] | undefined {
  const value = getFlagValue(flag);
  if (!value) return undefined;
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseNumberFlag(flag: string): number | undefined {
  const value = getFlagValue(flag);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCli(): CliConfig {
  const metadataPath = getFlagValue('--metadata');
  const category = getFlagValue('--category');
  const reputationEngine =
    getFlagValue('--reputation') || process.env.REPUTATION_ENGINE_ADDRESS;
  const stakeManager =
    getFlagValue('--stake-manager') || process.env.STAKE_MANAGER_ADDRESS;
  const jobId = getFlagValue('--job-id');
  const reward = getFlagValue('--reward');
  const rewardDecimals = parseNumberFlag('--reward-decimals');
  const requiredStake = getFlagValue('--stake');
  const stakeDecimals = parseNumberFlag('--stake-decimals');
  const matrixPath =
    getFlagValue('--matrix') || process.env.CAPABILITY_MATRIX_PATH;
  const rpcUrl = getFlagValue('--rpc') || process.env.RPC_URL;

  return {
    metadataPath,
    category,
    reputationEngine: reputationEngine || undefined,
    stakeManager: stakeManager || undefined,
    jobId,
    requiredSkills: getListFlag('--skills'),
    minEfficiencyScore: parseNumberFlag('--min-efficiency'),
    maxEnergyScore: parseNumberFlag('--max-energy'),
    minProfitMargin: parseNumberFlag('--min-profit'),
    energyCostPerUnit: parseNumberFlag('--energy-cost'),
    reward,
    rewardDecimals,
    requiredStake,
    stakeDecimals,
    matrixPath,
    rpcUrl,
  };
}

function readMetadata(
  metadataPath: string | undefined
): JobMetadata | undefined {
  if (!metadataPath) return undefined;
  const absolutePath = path.resolve(process.cwd(), metadataPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as JobMetadata;
}

function coerceBigInt(
  value: string | number | bigint | undefined,
  decimals?: number
): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return decimals !== undefined
      ? ethers.parseUnits(value.toString(), decimals)
      : BigInt(Math.trunc(value));
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('0x') || /^-?\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  if (decimals === undefined) {
    throw new Error(
      `Cannot parse decimal value "${value}" without providing decimals.`
    );
  }
  return ethers.parseUnits(trimmed, decimals);
}

function mergeMetadata(cli: CliConfig, metadata?: JobMetadata): JobMetadata {
  return {
    category: metadata?.category || cli.category || '',
    requiredSkills: metadata?.requiredSkills ?? cli.requiredSkills,
    reward:
      metadata?.reward !== undefined
        ? metadata.reward
        : cli.reward ?? undefined,
    rewardDecimals:
      metadata?.rewardDecimals !== undefined
        ? metadata.rewardDecimals
        : cli.rewardDecimals,
    requiredStake:
      metadata?.requiredStake !== undefined
        ? metadata.requiredStake
        : cli.requiredStake,
    stakeDecimals:
      metadata?.stakeDecimals !== undefined
        ? metadata.stakeDecimals
        : cli.stakeDecimals,
    minEfficiencyScore: metadata?.minEfficiencyScore ?? cli.minEfficiencyScore,
    maxEnergyScore: metadata?.maxEnergyScore ?? cli.maxEnergyScore,
    minProfitMargin: metadata?.minProfitMargin ?? cli.minProfitMargin,
    energyCostPerUnit: metadata?.energyCostPerUnit ?? cli.energyCostPerUnit,
    jobId: metadata?.jobId ?? cli.jobId,
  };
}

function ensureCategory(metadata: JobMetadata): string {
  if (!metadata.category) {
    throw new Error(
      'Job category is required. Provide it via metadata or --category flag.'
    );
  }
  return metadata.category;
}

async function resolveRequirements(
  metadata: JobMetadata,
  provider: Provider
): Promise<{ reward?: bigint; stake?: bigint }> {
  const result: { reward?: bigint; stake?: bigint } = {};
  if (metadata.jobId !== undefined) {
    const requirements = await fetchJobRequirements(metadata.jobId, provider);
    result.reward = requirements.reward;
    result.stake = requirements.stake;
  }
  const reward = coerceBigInt(metadata.reward, metadata.rewardDecimals);
  if (reward !== undefined) {
    result.reward = reward;
  }
  const stake = coerceBigInt(metadata.requiredStake, metadata.stakeDecimals);
  if (stake !== undefined) {
    result.stake = stake;
  }
  return result;
}

function resolveMatrix(matrixPath: string | undefined): CapabilityMatrix {
  if (matrixPath) {
    return loadCapabilityMatrix(path.resolve(process.cwd(), matrixPath));
  }
  return loadCapabilityMatrix();
}

async function main(): Promise<void> {
  const cli = parseCli();
  if (!cli.reputationEngine) {
    throw new Error(
      'Reputation engine address missing. Set REPUTATION_ENGINE_ADDRESS or pass --reputation.'
    );
  }

  const metadataFile = readMetadata(cli.metadataPath);
  const metadata = mergeMetadata(cli, metadataFile);
  const category = ensureCategory(metadata);

  const provider = new JsonRpcProvider(
    cli.rpcUrl || process.env.RPC_URL || 'http://localhost:8545'
  );
  const matrix = resolveMatrix(cli.matrixPath);

  const { reward, stake } = await resolveRequirements(metadata, provider);

  const options: SelectAgentOptions = {
    provider,
    jobId: metadata.jobId,
    requiredSkills: metadata.requiredSkills,
    minEfficiencyScore: metadata.minEfficiencyScore,
    maxEnergyScore: metadata.maxEnergyScore,
    minProfitMargin: metadata.minProfitMargin,
    energyCostPerUnit: metadata.energyCostPerUnit,
    reward,
    rewardDecimals: metadata.rewardDecimals,
    requiredStake: stake,
    stakeManagerAddress: cli.stakeManager,
    includeDiagnostics: true,
  };

  const decision = await selectAgent(
    category,
    matrix,
    cli.reputationEngine,
    options
  );

  const output = {
    category,
    jobId: metadata.jobId,
    requiredSkills: metadata.requiredSkills,
    reward: reward?.toString(),
    requiredStake: stake?.toString(),
    decision: {
      agent: decision.agent,
      skipReason: decision.skipReason,
    },
    diagnostics: decision.diagnostics,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!decision.agent) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
