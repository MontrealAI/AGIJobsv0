import { Wallet, formatUnits } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import { connectFeePool, connectStakeManager } from './contracts';

const PLATFORM_ROLE = 2n;
const ACC_SCALE = 1_000_000_000_000n;

export interface RewardSnapshot {
  readonly boostedStake: bigint;
  readonly cumulativePerToken: bigint;
  readonly checkpoint: bigint;
  readonly pending: bigint;
  readonly projectedDaily: string;
}

export async function fetchRewardSnapshot(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig
): Promise<RewardSnapshot> {
  const feePool = connectFeePool(config.contracts.feePool, signer);
  const stakeManager = connectStakeManager(config.contracts.stakeManager, signer);
  const operator = await signer.getAddress();

  const [stake, pct, cumulativePerToken, checkpoint, pendingFees] = await Promise.all([
    stakeManager.stakeOf(operator, PLATFORM_ROLE),
    stakeManager.getTotalPayoutPct(operator),
    feePool.cumulativePerToken(),
    feePool.userCheckpoint(operator),
    feePool.pendingFees()
  ]);

  const boosted = ((stake as bigint) * BigInt(pct)) / 100n;
  const accrued = ((boosted * (cumulativePerToken as bigint)) / ACC_SCALE) - (checkpoint as bigint);
  const projectedDaily = formatUnits(accrued * 96n, 18); // 15-minute epochs → approximate daily (96 intervals)

  return {
    boostedStake: boosted,
    cumulativePerToken: cumulativePerToken as bigint,
    checkpoint: checkpoint as bigint,
    pending: (accrued + (pendingFees as bigint)),
    projectedDaily
  };
}
