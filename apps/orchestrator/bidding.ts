import { ethers, Contract, Provider, Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
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

const REPUTATION_ENGINE_ABI = [
  'function reputation(address user) view returns (uint256)',
];

export interface JobRequirements {
  stake: bigint;
  agentTypes: number;
}

export interface AgentInfo {
  address: string;
  energy?: number;
  efficiencyScore?: number;
}

export type CapabilityMatrix = Record<string, AgentInfo[]>;

export function loadCapabilityMatrix(
  matrixPath = path.resolve(__dirname, '../../config/agents.json')
): CapabilityMatrix {
  const data = fs.readFileSync(matrixPath, 'utf8');
  const matrix = JSON.parse(data) as CapabilityMatrix;
  for (const category of Object.keys(matrix)) {
    matrix[category] = matrix[category].map((agent) => {
      const stats = getAgentEnergyStats(agent.address);
      if (!stats) return agent;
      return {
        ...agent,
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
}

function normalizeReputation(value: bigint): number {
  if (value <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const safeValue = value > maxSafe ? Number.MAX_SAFE_INTEGER : Number(value);
  return Math.log10(safeValue + 1);
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
  };
}

export async function selectAgent(
  category: string,
  capabilityMatrix: CapabilityMatrix,
  reputationEngineAddress: string,
  options: SelectAgentOptions = {}
): Promise<AgentInfo | null> {
  const candidates = capabilityMatrix[category];
  if (!candidates || candidates.length === 0) return null;
  const provider = options.provider ?? new ethers.JsonRpcProvider(RPC_URL);
  const minEfficiency =
    options.minEfficiencyScore ?? DEFAULT_MIN_EFFICIENCY_SCORE;
  const maxEnergy = options.maxEnergyScore ?? DEFAULT_MAX_ENERGY_SCORE;
  const jobId = options.jobId;
  const reputationEngine = new Contract(
    reputationEngineAddress,
    REPUTATION_ENGINE_ABI,
    provider
  );
  const evaluated: {
    agent: AgentInfo;
    reputation: bigint;
    predictedEnergy: number;
    efficiency: number;
    combinedScore: number;
  }[] = [];

  for (const agent of candidates) {
    const reputation = await reputationEngine.reputation(agent.address);
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
    const reputationScore = normalizeReputation(reputation);
    const energyComponent = predictedEnergy > 0 ? 1 / (predictedEnergy + 1) : 1;
    const reliability = stats?.successRate ?? 1;
    const combinedScore =
      reputationScore * 0.4 +
      efficiency * 0.3 +
      energyComponent * 0.2 +
      reliability * 0.1;

    evaluated.push({
      agent,
      reputation,
      predictedEnergy,
      efficiency,
      combinedScore,
    });
  }

  if (evaluated.length === 0) {
    return null;
  }

  evaluated.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) {
      return b.combinedScore - a.combinedScore;
    }
    return a.predictedEnergy - b.predictedEnergy;
  });

  const winner = evaluated[0];
  return {
    ...winner.agent,
    energy: winner.predictedEnergy,
    efficiencyScore: winner.efficiency,
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
  const balance: bigint = await stakeManager.stakeOf(wallet.address, 0);
  if (balance >= requiredStake) return;
  const deficit = requiredStake - balance;
  const tx = await stakeManager.depositStake(0, deficit);
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
  const chosen = await selectAgent(category, matrix, reputationEngineAddress, {
    provider,
    jobId,
  });
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
