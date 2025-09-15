import { ethers, Contract, Provider, Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import agialphaConfig from '../../config/agialpha.json';
import { RPC_URL, JOB_REGISTRY_ADDRESS, STAKE_MANAGER_ADDRESS } from './config';
import {
  DEFAULT_MAX_ENERGY_SCORE,
  DEFAULT_MIN_EFFICIENCY_SCORE,
  getAgentEnergyStats,
  getJobEnergyLog,
} from './metrics';

// Minimal ABIs for required contract interactions
const JOB_REGISTRY_ABI = [
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint32 feePct,uint32 agentPct,uint8 state,bool success,bool burnConfirmed,uint128 burnReceiptAmount,uint8 agentTypes,uint64 deadline,uint64 assignedAt,bytes32 uriHash,bytes32 resultHash,bytes32 specHash)',
  'function applyForJob(uint256 jobId,string subdomain,bytes32[] proof)',
];

const STAKE_MANAGER_ABI = [
  'function stakeOf(address user,uint8 role) view returns (uint256)',
  'function depositStake(uint8 role,uint256 amount)',
];

const STAKE_ROLE_AGENT = 0;

function parseNumericEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const TOKEN_DECIMALS = parseNumericEnv(
  process.env.TOKEN_DECIMALS,
  typeof agialphaConfig.decimals === 'number' ? agialphaConfig.decimals : 18
);

const DEFAULT_ENERGY_COST_PER_UNIT = parseNumericEnv(
  process.env.ENERGY_COST_PER_UNIT,
  1
);

const DEFAULT_MIN_PROFIT_MARGIN = parseNumericEnv(
  process.env.MIN_PROFIT_MARGIN,
  0.05
);

const REPUTATION_ENGINE_ABI = [
  'function reputation(address user) view returns (uint256)',
];

export interface JobRequirements {
  stake: bigint;
  agentTypes: number;
  reward: bigint;
}

export interface AgentInfo {
  address: string;
  energy?: number;
  efficiencyScore?: number;
  skills?: string[];
  metadata?: Record<string, unknown>;
}

export type CapabilityMatrix = Record<string, AgentInfo[]>;

export function loadCapabilityMatrix(
  matrixPath = path.resolve(__dirname, '../../config/agents.json')
): CapabilityMatrix {
  const data = fs.readFileSync(matrixPath, 'utf8');
  const matrix = JSON.parse(data) as CapabilityMatrix;
  for (const category of Object.keys(matrix)) {
    matrix[category] = matrix[category].map((agent) => {
      const normalizedSkills = Array.isArray(agent.skills)
        ? agent.skills
            .filter((skill): skill is string => typeof skill === 'string')
            .map((skill) => skill.trim())
            .filter((skill) => skill.length > 0)
        : undefined;
      const baseAgent: AgentInfo = {
        ...agent,
        ...(normalizedSkills ? { skills: normalizedSkills } : {}),
      };
      const stats = getAgentEnergyStats(agent.address);
      if (!stats) return baseAgent;
      return {
        ...baseAgent,
        energy: stats.averageEnergyScore,
        efficiencyScore: stats.averageEfficiencyScore,
      };
    });
  }
  return matrix;
}

export interface SelectAgentOptions {
  provider?: Provider;
  jobId?: string | number;
  minEfficiencyScore?: number;
  maxEnergyScore?: number;
  requiredSkills?: string[];
  requiredStake?: bigint;
  stakeManagerAddress?: string;
  reward?: bigint;
  rewardDecimals?: number;
  minProfitMargin?: number;
  energyCostPerUnit?: number;
  includeDiagnostics?: boolean;
}

export interface SelectionDiagnosticsEntry {
  address: string;
  reputation: string;
  predictedEnergy: number;
  efficiency: number;
  skillMatches: number;
  profitMargin: string;
  profitable: boolean;
  stakeSufficient: boolean;
}

export interface SelectionDiagnostics {
  evaluated: SelectionDiagnosticsEntry[];
  considered: SelectionDiagnosticsEntry[];
  pool: SelectionDiagnosticsEntry[];
}

export interface SelectionResult {
  agent: AgentInfo | null;
  skipReason?: string;
  diagnostics?: SelectionDiagnostics;
}

export async function fetchJobRequirements(
  jobId: number | string,
  provider: Provider = new ethers.JsonRpcProvider(RPC_URL)
): Promise<JobRequirements> {
  const registry = new Contract(
    JOB_REGISTRY_ADDRESS,
    JOB_REGISTRY_ABI,
    provider
  );
  const job = await registry.jobs(jobId);
  return {
    stake: job.stake as bigint,
    agentTypes: Number(job.agentTypes),
    reward: job.reward as bigint,
  };
}

export async function selectAgent(
  category: string,
  capabilityMatrix: CapabilityMatrix,
  reputationEngineAddress: string,
  options: SelectAgentOptions = {}
): Promise<SelectionResult> {
  const candidates = capabilityMatrix[category];
  const includeDiagnostics = options.includeDiagnostics === true;
  const emptyDiagnostics: SelectionDiagnostics | undefined = includeDiagnostics
    ? { evaluated: [], considered: [], pool: [] }
    : undefined;
  if (!candidates || candidates.length === 0) {
    return { agent: null, diagnostics: emptyDiagnostics };
  }
  const provider = options.provider ?? new ethers.JsonRpcProvider(RPC_URL);
  const minEfficiency =
    options.minEfficiencyScore ?? DEFAULT_MIN_EFFICIENCY_SCORE;
  const maxEnergy = options.maxEnergyScore ?? DEFAULT_MAX_ENERGY_SCORE;
  const jobId = options.jobId;
  const requiredSkills = new Set(
    (options.requiredSkills ?? [])
      .filter((skill) => typeof skill === 'string')
      .map((skill) => skill.toLowerCase())
  );
  const reputationEngine = new Contract(
    reputationEngineAddress,
    REPUTATION_ENGINE_ABI,
    provider
  );
  const stakeManager = options.stakeManagerAddress
    ? new Contract(options.stakeManagerAddress, STAKE_MANAGER_ABI, provider)
    : null;
  const rewardProvided =
    options.reward !== undefined && options.reward !== null;
  const rewardAmount = rewardProvided ? (options.reward as bigint) : 0n;
  const rewardValue = rewardProvided
    ? Number(
        ethers.formatUnits(
          rewardAmount,
          options.rewardDecimals ?? TOKEN_DECIMALS
        )
      )
    : null;
  const energyCostPerUnit =
    options.energyCostPerUnit ?? DEFAULT_ENERGY_COST_PER_UNIT;
  const minProfitMargin = options.minProfitMargin ?? DEFAULT_MIN_PROFIT_MARGIN;

  interface EvaluatedAgent {
    agent: AgentInfo;
    reputation: bigint;
    predictedEnergy: number;
    efficiency: number;
    skillMatches: number;
    profitMargin: number;
    profitable: boolean;
    stakeSufficient: boolean;
  }

  const formatDiagnostics = (
    entries: EvaluatedAgent[]
  ): SelectionDiagnosticsEntry[] =>
    entries.map((entry) => ({
      address: entry.agent.address,
      reputation: entry.reputation.toString(),
      predictedEnergy: entry.predictedEnergy,
      efficiency: entry.efficiency,
      skillMatches: entry.skillMatches,
      profitMargin: Number.isFinite(entry.profitMargin)
        ? entry.profitMargin.toFixed(6)
        : 'Infinity',
      profitable: entry.profitable,
      stakeSufficient: entry.stakeSufficient,
    }));

  const evaluated: EvaluatedAgent[] = [];

  for (const agent of candidates) {
    const reputation = (await reputationEngine.reputation(
      agent.address
    )) as bigint;
    const stats = getAgentEnergyStats(agent.address);
    const jobLog = jobId ? getJobEnergyLog(agent.address, jobId) : null;
    const predictedEnergyRaw =
      jobLog?.summary.energyScore ??
      stats?.averageEnergyScore ??
      agent.energy ??
      Number.MAX_SAFE_INTEGER;
    const predictedEnergy = Number.isFinite(predictedEnergyRaw)
      ? predictedEnergyRaw
      : Number.MAX_SAFE_INTEGER;
    if (predictedEnergy > maxEnergy) {
      continue;
    }
    const efficiencyRaw =
      jobLog?.summary.efficiencyScore ??
      stats?.averageEfficiencyScore ??
      agent.efficiencyScore ??
      (predictedEnergy > 0 ? 1 / (predictedEnergy + 1) : 1);
    const efficiency = Number.isFinite(efficiencyRaw) ? efficiencyRaw : 0;
    if (efficiency < minEfficiency) {
      continue;
    }

    const candidateSkills = new Set<string>();
    if (Array.isArray(agent.skills)) {
      for (const skill of agent.skills) {
        if (typeof skill === 'string' && skill.trim().length > 0) {
          candidateSkills.add(skill.toLowerCase());
        }
      }
    }
    const metadataSkills = Array.isArray(
      (agent.metadata as { skills?: unknown[] } | undefined)?.skills
    )
      ? ((agent.metadata as { skills?: unknown[] }).skills as unknown[])
      : null;
    if (metadataSkills) {
      for (const value of metadataSkills) {
        if (typeof value === 'string' && value.trim().length > 0) {
          candidateSkills.add(value.toLowerCase());
        }
      }
    }
    let skillMatches = 0;
    if (requiredSkills.size > 0) {
      for (const skill of requiredSkills) {
        if (candidateSkills.has(skill)) {
          skillMatches += 1;
        }
      }
    }

    const energyCost = predictedEnergy * energyCostPerUnit;
    const profitValue =
      rewardValue === null
        ? Number.POSITIVE_INFINITY
        : rewardValue - energyCost;
    const profitMargin =
      rewardValue === null
        ? Number.POSITIVE_INFINITY
        : energyCost > 0
        ? profitValue / energyCost
        : Number.POSITIVE_INFINITY;
    const profitable =
      rewardValue === null ? true : profitMargin >= minProfitMargin;

    let stakeSufficient = true;
    if (stakeManager && options.requiredStake && options.requiredStake > 0n) {
      try {
        const currentStake = (await stakeManager.stakeOf(
          agent.address,
          STAKE_ROLE_AGENT
        )) as bigint;
        stakeSufficient = currentStake >= options.requiredStake;
      } catch (err) {
        console.warn(
          'stakeOf lookup failed for agent during selection',
          agent.address,
          err
        );
        stakeSufficient = false;
      }
    }

    evaluated.push({
      agent,
      reputation,
      predictedEnergy,
      efficiency,
      skillMatches,
      profitMargin,
      profitable,
      stakeSufficient,
    });
  }

  if (evaluated.length === 0) {
    return { agent: null, diagnostics: emptyDiagnostics };
  }

  const candidatesWithStake = evaluated.filter(
    (entry) => entry.stakeSufficient
  );
  const considered =
    candidatesWithStake.length > 0 ? candidatesWithStake : evaluated;

  const profitableCandidates =
    rewardValue === null
      ? considered
      : considered.filter((entry) => entry.profitable);

  if (rewardValue !== null && profitableCandidates.length === 0) {
    const diagnostics = includeDiagnostics
      ? {
          evaluated: formatDiagnostics(evaluated),
          considered: formatDiagnostics(considered),
          pool: [],
        }
      : undefined;
    return { agent: null, skipReason: 'unprofitable', diagnostics };
  }

  const pool =
    rewardValue !== null && profitableCandidates.length > 0
      ? profitableCandidates
      : considered;

  pool.sort((a, b) => {
    if (b.skillMatches !== a.skillMatches) {
      return b.skillMatches - a.skillMatches;
    }
    if (a.reputation === b.reputation) {
      if (a.predictedEnergy !== b.predictedEnergy) {
        return a.predictedEnergy - b.predictedEnergy;
      }
      return a.agent.address.localeCompare(b.agent.address);
    }
    return a.reputation < b.reputation ? 1 : -1;
  });

  const diagnostics = includeDiagnostics
    ? {
        evaluated: formatDiagnostics(evaluated),
        considered: formatDiagnostics(considered),
        pool: formatDiagnostics(pool),
      }
    : undefined;

  const winner = pool[0];
  return {
    agent: {
      ...winner.agent,
      energy: winner.predictedEnergy,
      efficiencyScore: winner.efficiency,
    },
    diagnostics,
  };
}

export async function ensureStake(
  wallet: Wallet,
  requiredStake: bigint,
  provider: Provider = new ethers.JsonRpcProvider(RPC_URL)
): Promise<void> {
  const stakeManager = new Contract(
    STAKE_MANAGER_ADDRESS,
    STAKE_MANAGER_ABI,
    wallet.connect(provider)
  );
  const balance: bigint = await stakeManager.stakeOf(
    wallet.address,
    STAKE_ROLE_AGENT
  );
  if (balance >= requiredStake) return;
  const deficit = requiredStake - balance;
  const tx = await stakeManager.depositStake(STAKE_ROLE_AGENT, deficit);
  await tx.wait();
}

export async function applyForJob(
  jobId: number | string,
  category: string,
  wallet: Wallet,
  reputationEngineAddress: string,
  matrixPath = path.resolve(__dirname, '../../config/agents.json'),
  provider: Provider = new ethers.JsonRpcProvider(RPC_URL)
): Promise<void> {
  const requirements = await fetchJobRequirements(jobId, provider);
  const matrix = loadCapabilityMatrix(matrixPath);
  const decision = await selectAgent(
    category,
    matrix,
    reputationEngineAddress,
    {
      provider,
      jobId,
      reward: requirements.reward,
      requiredStake: requirements.stake,
      stakeManagerAddress: STAKE_MANAGER_ADDRESS || undefined,
    }
  );
  if (decision.skipReason) {
    throw new Error(`Job not eligible: ${decision.skipReason}`);
  }
  const chosen = decision.agent;
  if (!chosen) {
    throw new Error('No suitable agent found under current energy constraints');
  }
  if (chosen.address.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('Wallet not selected for this category');
  }
  await ensureStake(wallet, requirements.stake, provider);
  const registry = new Contract(
    JOB_REGISTRY_ADDRESS,
    JOB_REGISTRY_ABI,
    wallet.connect(provider)
  );
  const tx = await registry.applyForJob(jobId, '', []);
  await tx.wait();
}
