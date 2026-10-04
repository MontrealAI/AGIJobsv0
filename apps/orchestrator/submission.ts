import { ethers, Wallet } from 'ethers';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import { loadState, saveState } from './execution';

const REGISTRY_ABI = ['function finalize(uint256 jobId) external'];

/** Submission starts validation; it never releases escrow or marks settlement. */
export async function submitJobResult(
  registry: ethers.Contract,
  jobId: string,
  manifest: unknown,
  resultUri: string,
  subdomain: string
): Promise<{ txHash: string; resultHash: string }> {
  if (!resultUri.startsWith('ipfs://') || resultUri.length <= 7)
    throw new Error('A pinned result manifest is required');
  // uploadToIPFS serializes object artifacts with exactly JSON.stringify.
  const resultHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(manifest))
  );
  const tx = await registry.submit(jobId, resultHash, resultUri, subdomain, []);
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1)
    throw new Error('Submission was not confirmed');
  return { txHash: tx.hash, resultHash };
}

export async function finalizeJob(
  jobId: string | number,
  wallet: Wallet
): Promise<{ txHash: string }> {
  const provider = wallet.provider || new ethers.JsonRpcProvider(RPC_URL);
  const registry = new ethers.Contract(
    JOB_REGISTRY_ADDRESS,
    REGISTRY_ABI,
    wallet.connect(provider)
  );
  const tx = await registry.finalize(jobId);
  await tx.wait();

  const state = loadState();
  const id = jobId.toString();
  if (!state[id]) {
    state[id] = { currentStage: 0, stages: [], completed: true };
  } else {
    state[id].completed = true;
  }
  saveState(state);

  return { txHash: tx.hash };
}
