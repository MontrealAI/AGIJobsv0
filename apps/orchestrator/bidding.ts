import { ethers, Contract, Provider, Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import {
  RPC_URL,
  JOB_REGISTRY_ADDRESS,
  STAKE_MANAGER_ADDRESS,
} from './config';

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
}

export type CapabilityMatrix = Record<string, AgentInfo[]>;

export function loadCapabilityMatrix(
  matrixPath = path.resolve(__dirname, '../../config/agents.json')
): CapabilityMatrix {
  const data = fs.readFileSync(matrixPath, 'utf8');
  return JSON.parse(data) as CapabilityMatrix;
}

export async function fetchJobRequirements(
  jobId: number | string,
  provider: Provider = new ethers.JsonRpcProvider(RPC_URL)
): Promise<JobRequirements> {
  const registry = new Contract(JOB_REGISTRY_ADDRESS, JOB_REGISTRY_ABI, provider);
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
  provider: Provider = new ethers.JsonRpcProvider(RPC_URL)
): Promise<AgentInfo | null> {
  const candidates = capabilityMatrix[category];
  if (!candidates || candidates.length === 0) return null;
  const reputationEngine = new Contract(
    reputationEngineAddress,
    REPUTATION_ENGINE_ABI,
    provider
  );
  let best = candidates[0];
  let bestRep = await reputationEngine.reputation(best.address);
  for (const agent of candidates.slice(1)) {
    const rep = await reputationEngine.reputation(agent.address);
    if (rep > bestRep) {
      best = agent;
      bestRep = rep;
    } else if (rep === bestRep) {
      const agentEnergy = agent.energy ?? Number.MAX_SAFE_INTEGER;
      const bestEnergy = best.energy ?? Number.MAX_SAFE_INTEGER;
      if (agentEnergy < bestEnergy) {
        best = agent;
      }
    }
  }
  if (bestRep === 0n) {
    best = candidates.reduce((min, a) => {
      const aEnergy = a.energy ?? Number.MAX_SAFE_INTEGER;
      const mEnergy = min.energy ?? Number.MAX_SAFE_INTEGER;
      return aEnergy < mEnergy ? a : min;
    }, best);
  }
  return best;
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
  const chosen = await selectAgent(
    category,
    matrix,
    reputationEngineAddress,
    provider
  );
  if (!chosen || chosen.address.toLowerCase() !== wallet.address.toLowerCase()) {
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
