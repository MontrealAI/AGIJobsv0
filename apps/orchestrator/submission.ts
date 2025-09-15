import { ethers, Wallet } from 'ethers';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import { loadState, saveState } from './execution';

const REGISTRY_ABI = [
  'function finalizeJob(uint256 jobId,string resultRef) external',
];

export async function finalizeJob(
  jobId: string | number,
  resultRef: string,
  wallet: Wallet
): Promise<void> {
  const provider = wallet.provider || new ethers.JsonRpcProvider(RPC_URL);
  const registry = new ethers.Contract(
    JOB_REGISTRY_ADDRESS,
    REGISTRY_ABI,
    wallet.connect(provider)
  );
  const tx = await registry.finalizeJob(jobId, resultRef);
  await tx.wait();

  const state = loadState();
  const id = jobId.toString();
  if (!state[id]) {
    state[id] = { currentStage: 0, stages: [], completed: true };
  } else {
    state[id].completed = true;
  }
  saveState(state);
}
