import { ethers } from 'ethers';
import {
  RPC_URL,
  JOB_REGISTRY_ADDRESS,
  STAKE_MANAGER_ADDRESS,
  AGENT_ADDRESS,
  ORCHESTRATOR_ENDPOINT,
} from './config';

const jobRegistryAbi = [
  'event JobCreated(uint256 indexed jobId,address indexed employer,address indexed agent,uint256 reward,uint256 stake,uint256 fee,bytes32 specHash,string uri)',
];

const stakeManagerAbi = [
  'function stakeOf(address user,uint8 role) view returns (uint256)',
];

export async function resolveAddress(
  provider: ethers.Provider,
  addrOrName: string
): Promise<string> {
  if (ethers.isAddress(addrOrName)) return addrOrName;
  const resolved = await provider.resolveName(addrOrName);
  if (!resolved) throw new Error(`Could not resolve ENS name: ${addrOrName}`);
  return resolved;
}

interface JobCreatedDetails {
  employer: string;
  reward: string;
  stake: string;
  fee: string;
  specHash: string;
  uri: string;
}

type JobDetectedHandler = (
  jobId: string,
  details: JobCreatedDetails
) => void | Promise<void>;

type JobCreatedListener = (
  jobId: bigint,
  employer: string,
  assignedAgent: string,
  reward: bigint,
  stake: bigint,
  fee: bigint,
  specHash: string,
  uri: string
) => void | Promise<void>;

interface JobRegistryContract {
  on(event: 'JobCreated', listener: JobCreatedListener): void;
}

interface StakeManagerContract {
  stakeOf(address: string, role: number): Promise<bigint>;
}

export function setupJobListener(
  jobRegistry: JobRegistryContract,
  stakeManager: StakeManagerContract,
  agentAddress: string,
  onJobDetected: JobDetectedHandler
): void {
  jobRegistry.on(
    'JobCreated',
    async (
      jobId: bigint,
      employer: string,
      assignedAgent: string,
      reward: bigint,
      stake: bigint,
      fee: bigint,
      specHash: string,
      uri: string
    ) => {
      if (assignedAgent !== ethers.ZeroAddress) return;
      const balance = await stakeManager.stakeOf(agentAddress, 0);
      if (balance < stake) return;
      const details = {
        employer,
        reward: reward.toString(),
        stake: stake.toString(),
        fee: fee.toString(),
        specHash,
        uri,
      };
      await onJobDetected(jobId.toString(), details);
    }
  );
}

export async function start(
  onJobDetected: JobDetectedHandler = defaultCallback
): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const jobRegistryAddress = await resolveAddress(
    provider,
    JOB_REGISTRY_ADDRESS
  );
  const stakeManagerAddress = await resolveAddress(
    provider,
    STAKE_MANAGER_ADDRESS
  );
  const jobRegistry = new ethers.Contract(
    jobRegistryAddress,
    jobRegistryAbi,
    provider
  );
  const stakeManager = new ethers.Contract(
    stakeManagerAddress,
    stakeManagerAbi,
    provider
  );
  const jobRegistryContract: JobRegistryContract = {
    on: (event, listener) => {
      jobRegistry.on(event, listener);
    },
  };
  const stakeManagerContract: StakeManagerContract = {
    stakeOf: (address, role) => stakeManager.stakeOf(address, role),
  };
  setupJobListener(
    jobRegistryContract,
    stakeManagerContract,
    AGENT_ADDRESS,
    onJobDetected
  );
}

export async function defaultCallback(
  jobId: string,
  details: JobCreatedDetails
): Promise<void> {
  if (!ORCHESTRATOR_ENDPOINT) return;
  await fetch(ORCHESTRATOR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...details }),
  });
}
