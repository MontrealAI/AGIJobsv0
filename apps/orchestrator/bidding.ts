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
import {
  getEnergyInsightsSnapshot,
  type AgentEnergyInsight,
  type JobEnergyInsight,
} from '../../shared/energyInsights';
import {
  getEnergyTrendsSnapshot,
  type EnergyTrendSnapshot,
} from '../../shared/energyTrends';
import {
  evaluateTrendForAgent,
  parseTrendStatuses,
  type TrendEvaluationOptions,
} from './trendScoring';
import { EnergyPolicy, type CategoryEnergyThresholds } from './energyPolicy';

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

export const DEFAULT_MIN_PROFIT_MARGIN = parseNumericEnv(
  process.env.MIN_PROFIT_MARGIN,
  0.05
);

const MAX_AGENT_ANOMALY_RATE = parseNumericEnv(
  process.env.MAX_AGENT_ANOMALY_RATE,
  0.5
);

const MAX_JOB_ANOMALY_RATE = parseNumericEnv(
  process.env.MAX_JOB_ANOMALY_RATE,
  0.7
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
  const energyInsights = getEnergyInsightsSnapshot();
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
      const insight: AgentEnergyInsight | null =
        energyInsights.agents[agent.address.toLowerCase()] ?? null;
      const averageEnergy = insight?.averageEnergy ?? stats?.averageEnergyScore;
      const averageEfficiency =
        insight?.averageEfficiency ?? stats?.averageEfficiencyScore;
      if (averageEnergy === undefined && averageEfficiency === undefined) {
        return baseAgent;
      }
      return {
        ...baseAgent,
        ...(averageEnergy !== undefined ? { energy: averageEnergy } : {}),
        ...(averageEfficiency !== undefined
          ? { efficiencyScore: averageEfficiency }
          : {}),
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
  energyPolicy?: EnergyPolicy;
  energyTrends?: EnergyTrendSnapshot;
  trendOptions?: Partial<TrendEvaluationOptions>;
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
  anomalyRate: number;
  energySource: string;
  efficiencySource: string;
  trendStatus?: string;
  energyMomentumRatio?: string;
  profitThreshold?: string;
  trendPenalty?: string;
  trendBonus?: string;
}

export interface SelectionDiagnostics {
  evaluated: SelectionDiagnosticsEntry[];
  considered: SelectionDiagnosticsEntry[];
  pool: SelectionDiagnosticsEntry[];
  policy?: CategoryEnergyThresholds;
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
  const policyThresholds =
    options.energyPolicy?.getThresholds(category) ?? null;
  const emptyDiagnostics: SelectionDiagnostics | undefined = includeDiagnostics
    ? {
        evaluated: [],
        considered: [],
        pool: [],
        ...(policyThresholds ? { policy: policyThresholds } : {}),
      }
    : undefined;
  if (!candidates || candidates.length === 0) {
    return {
      agent: null,
      skipReason: 'no-candidates',
      diagnostics: emptyDiagnostics,
    };
  }
  const provider = options.provider ?? new ethers.JsonRpcProvider(RPC_URL);
  let minEfficiency =
    options.minEfficiencyScore ?? DEFAULT_MIN_EFFICIENCY_SCORE;
  let maxEnergy = options.maxEnergyScore ?? DEFAULT_MAX_ENERGY_SCORE;
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
  let minProfitMargin = options.minProfitMargin ?? DEFAULT_MIN_PROFIT_MARGIN;

  if (policyThresholds) {
    if (Number.isFinite(policyThresholds.minEfficiencyScore)) {
      minEfficiency = Math.max(
        minEfficiency,
        policyThresholds.minEfficiencyScore
      );
    }
    if (
      Number.isFinite(policyThresholds.maxEnergyScore) &&
      policyThresholds.maxEnergyScore > 0
    ) {
      maxEnergy = Math.min(maxEnergy, policyThresholds.maxEnergyScore);
    }
    if (
      Number.isFinite(policyThresholds.recommendedProfitMargin) &&
      policyThresholds.recommendedProfitMargin > 0
    ) {
      minProfitMargin = Math.max(
        minProfitMargin,
        policyThresholds.recommendedProfitMargin
      );
    }
  }

interface EvaluatedAgent {
  agent: AgentInfo;
  reputation: bigint;
  predictedEnergy: number;
  efficiency: number;
  skillMatches: number;
  profitMargin: number;
  profitable: boolean;
  stakeSufficient: boolean;
  anomalyRate: number;
  energySource: string;
  efficiencySource: string;
  trendStatus: string;
  energyMomentumRatio: number;
  profitThreshold: number;
  trendPenalty: number;
  trendBonus: number;
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
    anomalyRate: entry.anomalyRate,
    energySource: entry.energySource,
    efficiencySource: entry.efficiencySource,
    trendStatus: entry.trendStatus,
    energyMomentumRatio: Number.isFinite(entry.energyMomentumRatio)
      ? entry.energyMomentumRatio.toFixed(4)
      : undefined,
    profitThreshold: Number.isFinite(entry.profitThreshold)
      ? entry.profitThreshold.toFixed(6)
      : undefined,
    trendPenalty:
      entry.trendPenalty > 0 && Number.isFinite(entry.trendPenalty)
        ? entry.trendPenalty.toFixed(6)
        : undefined,
    trendBonus:
      entry.trendBonus > 0 && Number.isFinite(entry.trendBonus)
        ? entry.trendBonus.toFixed(6)
        : undefined,
  }));

  const evaluated: EvaluatedAgent[] = [];
  const energyInsights = getEnergyInsightsSnapshot();
  const energyTrends = options.energyTrends ?? getEnergyTrendsSnapshot();
  const trendOptions = resolveTrendOptions(options.trendOptions);

  for (const agent of candidates) {
    const reputation = (await reputationEngine.reputation(
      agent.address
    )) as bigint;
    const stats = getAgentEnergyStats(agent.address);
    const jobLog = jobId ? getJobEnergyLog(agent.address, jobId) : null;
    const agentKey = agent.address.toLowerCase();
    const insight: AgentEnergyInsight | null =
      energyInsights.agents[agentKey] ?? null;
    const jobInsightsByAgent = energyInsights.jobs[agentKey] ?? {};
    const jobInsight: JobEnergyInsight | undefined = jobId
      ? jobInsightsByAgent[String(jobId)]
      : undefined;

    let energySource = 'fallback';
    let predictedEnergyRaw = Number.MAX_SAFE_INTEGER;
    if (jobInsight && Number.isFinite(jobInsight.averageEnergy)) {
      predictedEnergyRaw = jobInsight.averageEnergy;
      energySource = 'insight-job';
    } else if (jobLog?.summary.energyScore !== undefined) {
      predictedEnergyRaw = jobLog.summary.energyScore;
      energySource = 'job-log';
    } else if (insight?.averageEnergy !== undefined) {
      predictedEnergyRaw = insight.averageEnergy;
      energySource = 'insight-agent';
    } else if (stats?.averageEnergyScore !== undefined) {
      predictedEnergyRaw = stats.averageEnergyScore;
      energySource = 'legacy-stats';
    } else if (agent.energy !== undefined) {
      predictedEnergyRaw = agent.energy;
      energySource = 'capability';
    }
    const predictedEnergy = Number.isFinite(predictedEnergyRaw)
      ? predictedEnergyRaw
      : Number.MAX_SAFE_INTEGER;
    if (predictedEnergy > maxEnergy) {
      continue;
    }
    let efficiencySource = 'fallback';
    let efficiencyRaw: number | undefined;
    if (jobInsight && Number.isFinite(jobInsight.efficiencyScore)) {
      efficiencyRaw = jobInsight.efficiencyScore;
      efficiencySource = 'insight-job';
    } else if (jobLog?.summary.efficiencyScore !== undefined) {
      efficiencyRaw = jobLog.summary.efficiencyScore;
      efficiencySource = 'job-log';
    } else if (insight?.averageEfficiency !== undefined) {
      efficiencyRaw = insight.averageEfficiency;
      efficiencySource = 'insight-agent';
    } else if (stats?.averageEfficiencyScore !== undefined) {
      efficiencyRaw = stats.averageEfficiencyScore;
      efficiencySource = 'legacy-stats';
    } else if (agent.efficiencyScore !== undefined) {
      efficiencyRaw = agent.efficiencyScore;
      efficiencySource = 'capability';
    } else if (predictedEnergy > 0 && Number.isFinite(predictedEnergy)) {
      efficiencyRaw = 1 / (predictedEnergy + 1);
    }
    const efficiency =
      typeof efficiencyRaw === 'number' && Number.isFinite(efficiencyRaw)
        ? efficiencyRaw
        : 0;
    if (efficiency < minEfficiency) {
      continue;
    }

    const jobAnomalyRate = jobInsight?.anomalyRate ?? 0;
    const agentAnomalyRate = insight?.anomalyRate ?? 0;
    if (agentAnomalyRate > MAX_AGENT_ANOMALY_RATE) {
      continue;
    }
    if (jobAnomalyRate > MAX_JOB_ANOMALY_RATE) {
      continue;
    }
    const anomalyRate = Math.max(jobAnomalyRate, agentAnomalyRate);

    const trend = energyTrends.agents[agentKey] ?? null;
    const trendAssessment = evaluateTrendForAgent(
      trend,
      minProfitMargin,
      trendOptions
    );
    if (trendAssessment.blocked) {
      continue;
    }
    const profitThreshold = trendAssessment.profitFloor;
    const trendStatus = trendAssessment.status;
    const energyMomentumRatio = trendAssessment.momentumRatio;

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
      rewardValue === null ? true : profitMargin >= profitThreshold;

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
      anomalyRate,
      energySource,
      efficiencySource,
      trendStatus,
      energyMomentumRatio,
      profitThreshold,
      trendPenalty: trendAssessment.penalty,
      trendBonus: trendAssessment.bonus,
    });
  }

  if (evaluated.length === 0) {
    return {
      agent: null,
      skipReason: 'filtered-out',
      diagnostics: emptyDiagnostics,
    };
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
          ...(policyThresholds ? { policy: policyThresholds } : {}),
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
      if (a.energyMomentumRatio !== b.energyMomentumRatio) {
        return a.energyMomentumRatio - b.energyMomentumRatio;
      }
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
        ...(policyThresholds ? { policy: policyThresholds } : {}),
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

const DEFAULT_MAX_AGENT_MOMENTUM_RATIO = parseNumericEnv(
  process.env.MAX_AGENT_ENERGY_MOMENTUM_RATIO,
  0.35
);

const DEFAULT_TREND_PROFIT_WEIGHT = parseNumericEnv(
  process.env.AGENT_TREND_PROFIT_WEIGHT,
  0.25
);

const DEFAULT_TREND_COOLING_WEIGHT = parseNumericEnv(
  process.env.AGENT_TREND_COOLING_BONUS_WEIGHT,
  0.15
);

const DEFAULT_TREND_MIN_PROFIT_FLOOR = parseNumericEnv(
  process.env.AGENT_TREND_MIN_PROFIT_FLOOR,
  0.02
);

const DEFAULT_BLOCKED_TREND_STATUSES = parseTrendStatuses(
  process.env.BLOCKED_AGENT_TREND_STATUSES
);

function resolveTrendOptions(
  overrides?: Partial<TrendEvaluationOptions>
): TrendEvaluationOptions {
  return {
    maxMomentumRatio:
      overrides?.maxMomentumRatio ?? DEFAULT_MAX_AGENT_MOMENTUM_RATIO,
    profitWeight: overrides?.profitWeight ?? DEFAULT_TREND_PROFIT_WEIGHT,
    coolingBonusWeight:
      overrides?.coolingBonusWeight ?? DEFAULT_TREND_COOLING_WEIGHT,
    minProfitFloor:
      overrides?.minProfitFloor ?? DEFAULT_TREND_MIN_PROFIT_FLOOR,
    blockedStatuses: overrides?.blockedStatuses
      ? new Set(overrides.blockedStatuses)
      : new Set(DEFAULT_BLOCKED_TREND_STATUSES),
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
