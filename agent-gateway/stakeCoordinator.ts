import { ethers, Wallet } from 'ethers';
import { stakeManager, TOKEN_DECIMALS } from './utils';
import { recordAuditEvent } from '../shared/auditLogger';

const ROLE_AGENT = 0;
const ROLE_VALIDATOR = 1;

let minStakeCache: bigint | null = null;

async function fetchMinStake(): Promise<bigint> {
  if (!stakeManager) return 0n;
  if (minStakeCache !== null) return minStakeCache;
  try {
    const value = await stakeManager.minStake();
    minStakeCache = BigInt(value.toString());
    return minStakeCache;
  } catch (err) {
    console.warn('Failed to fetch minStake from StakeManager', err);
    return 0n;
  }
}

export async function getStakeBalance(
  address: string,
  role: number = ROLE_AGENT
): Promise<bigint> {
  if (!stakeManager) return 0n;
  try {
    const balance = await stakeManager.stakeOf(address, role);
    return BigInt(balance.toString());
  } catch (err) {
    console.warn('stakeOf query failed', address, err);
    return 0n;
  }
}

export async function ensureStake(
  wallet: Wallet,
  requiredStake: bigint,
  role: number = ROLE_AGENT
): Promise<void> {
  if (!stakeManager) {
    console.warn('StakeManager not configured; skipping staking logic');
    return;
  }
  const minStake = await fetchMinStake();
  const target = requiredStake > minStake ? requiredStake : minStake;
  if (target === 0n) return;
  const current = await getStakeBalance(wallet.address, role);
  if (current >= target) {
    return;
  }
  const delta = target - current;
  try {
    const tx = await (stakeManager as any)
      .connect(wallet)
      .depositStake(role, delta);
    await tx.wait();
    await recordAuditEvent({
      component: 'stake-coordinator',
      action: 'deposit',
      agent: wallet.address,
      metadata: {
        role,
        delta: ethers.formatUnits(delta, TOKEN_DECIMALS),
        target: ethers.formatUnits(target, TOKEN_DECIMALS),
      },
      success: true,
    });
  } catch (err: any) {
    await recordAuditEvent({
      component: 'stake-coordinator',
      action: 'deposit-failed',
      agent: wallet.address,
      metadata: {
        role,
        required: target.toString(),
        error: err?.message,
      },
      success: false,
    });
    throw err;
  }
}

export async function resetStakeCache(): Promise<void> {
  minStakeCache = null;
}

export { ROLE_AGENT, ROLE_VALIDATOR };
