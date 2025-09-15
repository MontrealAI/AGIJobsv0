import { ethers } from 'ethers';
import { Job } from './types';
import { walletManager, registry, provider, checkEnsSubdomain } from './utils';

interface AgentMetrics {
  reputation: number;
  efficiency: number;
}

// simple in-memory metrics; in production this would persist
const metrics: Record<string, AgentMetrics> = {};

function selectBestAgent(): { address: string; label: string } | null {
  const addresses = walletManager.list();
  if (addresses.length === 0) return null;
  // pick agent with highest reputation / lowest efficiency score
  let best: { address: string; label: string; score: number } | null = null;
  for (const addr of addresses) {
    const m = metrics[addr.toLowerCase()] || { reputation: 0, efficiency: 0 };
    const score = m.reputation - m.efficiency; // higher is better
    if (!best || score > best.score) {
      best = { address: addr, label: '', score };
    }
  }
  if (!best) return null;
  return { address: best.address, label: best.label };
}

export async function handleJob(job: Job): Promise<void> {
  if (job.agent !== ethers.ZeroAddress) return; // already assigned
  const selected = selectBestAgent();
  if (!selected) {
    console.warn('No agent wallets available');
    return;
  }
  const wallet = walletManager.get(selected.address);
  if (!wallet) {
    console.warn('Wallet not found for', selected.address);
    return;
  }
  try {
    await checkEnsSubdomain(wallet.address);
    const name = await provider.lookupAddress(wallet.address);
    const label = name ? name.split('.')[0] : '';
    const tx = await (registry as any)
      .connect(wallet)
      .applyForJob(job.jobId, label, '0x');
    await tx.wait();
    console.log(`Applied for job ${job.jobId} using ${wallet.address}`);
  } catch (err) {
    console.error('Failed to apply for job', err);
  }
}
