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
  const contract = (stakeManager as any).connect(wallet);
  if (typeof contract.stake === 'function') {
    try {
      const tx = await contract.stake(role, delta);
      await tx.wait();
      await recordAuditEvent(
        {
          component: 'stake-coordinator',
          action: 'stake',
          agent: wallet.address,
          metadata: {
            role,
            method: 'stake',
            delta: ethers.formatUnits(delta, TOKEN_DECIMALS),
            target: ethers.formatUnits(target, TOKEN_DECIMALS),
          },
          success: true,
        },
        wallet
      );
      return;
    } catch (err) {
      console.warn(
        'StakeManager.stake failed; attempting depositStake fallback',
        err
      );
    }
  }
  try {
    const tx = await contract.depositStake(role, delta);
    await tx.wait();
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'stake',
        agent: wallet.address,
        metadata: {
          role,
          method: 'depositStake',
          delta: ethers.formatUnits(delta, TOKEN_DECIMALS),
          target: ethers.formatUnits(target, TOKEN_DECIMALS),
        },
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'stake-failed',
        agent: wallet.address,
        metadata: {
          role,
          required: target.toString(),
          error: err?.message,
          method: 'depositStake',
        },
        success: false,
      },
      wallet
    );
    throw err;
  }
}

export async function resetStakeCache(): Promise<void> {
  minStakeCache = null;
}

export { ROLE_AGENT, ROLE_VALIDATOR };
