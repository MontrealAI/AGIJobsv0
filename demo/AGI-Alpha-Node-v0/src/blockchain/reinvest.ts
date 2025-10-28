import { formatUnits, Wallet } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import {
  connectFeePool,
  connectStakeManager,
  connectToken,
  FeePoolContract,
  StakeManagerContract,
  Erc20Contract
} from './contracts';
import { fetchRewardSnapshot, RewardSnapshot } from './rewards';
import { fetchStakeSnapshot } from './staking';

const PLATFORM_ROLE = 2n;

export interface ReinvestOptions {
  readonly dryRun?: boolean;
  readonly claimOnly?: boolean;
  readonly amountWei?: bigint;
}

export interface ReinvestReport {
  readonly dryRun: boolean;
  readonly thresholdWei: bigint;
  readonly pendingWei: bigint;
  readonly claimedWei: bigint;
  readonly stakedWei: bigint;
  readonly claimTransaction?: string;
  readonly stakeTransaction?: string;
  readonly notes: string[];
}

interface ReinvestDependencies {
  readonly fetchRewards?: typeof fetchRewardSnapshot;
  readonly fetchStake?: typeof fetchStakeSnapshot;
  readonly connectFeePool?: (address: string, runner: Wallet) => FeePoolContract;
  readonly connectStakeManager?: (address: string, runner: Wallet) => StakeManagerContract;
  readonly connectToken?: (address: string, runner: Wallet) => Erc20Contract;
}

function formatEther(amount: bigint): string {
  return formatUnits(amount, 18);
}

function ensurePositive(value: bigint): boolean {
  return value > 0n;
}

async function ensureAllowance(
  token: Erc20Contract,
  signer: Wallet,
  spender: string,
  amount: bigint,
  notes: string[],
  dryRun: boolean
): Promise<void> {
  if (!ensurePositive(amount)) {
    return;
  }
  const operator = await signer.getAddress();
  const allowance: bigint = BigInt(await token.allowance(operator, spender));
  if (allowance >= amount) {
    return;
  }
  if (dryRun) {
    notes.push(
      `Dry run: would approve ${formatEther(amount)} $AGIALPHA for StakeManager ${spender}.`
    );
    return;
  }
  const approveTx = await token.approve(spender, amount);
  notes.push(`Approve transaction broadcast: ${approveTx.hash}`);
  const receipt = await approveTx.wait?.();
  if (receipt) {
    notes.push(`Approval confirmed in block ${receipt.blockNumber}.`);
  }
}

export async function reinvestRewards(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  options?: ReinvestOptions,
  deps?: ReinvestDependencies
): Promise<ReinvestReport> {
  const notes: string[] = [];
  const fetchRewards = deps?.fetchRewards ?? fetchRewardSnapshot;
  const fetchStake = deps?.fetchStake ?? fetchStakeSnapshot;
  const feePoolConnector = deps?.connectFeePool ?? connectFeePool;
  const stakeManagerConnector = deps?.connectStakeManager ?? connectStakeManager;
  const tokenConnector = deps?.connectToken ?? connectToken;

  const rewardSnapshot: RewardSnapshot = await fetchRewards(signer, config);
  const threshold = config.ai.reinvestThresholdWei;
  const pending = rewardSnapshot.pending;

  let desiredAmount = options?.amountWei ?? pending;
  if (desiredAmount > pending) {
    notes.push(
      `Requested reinvest amount ${formatEther(desiredAmount)} exceeds pending rewards ${formatEther(pending)}. Limiting to pending.`
    );
    desiredAmount = pending;
  }

  if (!ensurePositive(desiredAmount)) {
    notes.push('No pending rewards to reinvest.');
    return {
      dryRun: Boolean(options?.dryRun),
      thresholdWei: threshold,
      pendingWei: pending,
      claimedWei: 0n,
      stakedWei: 0n,
      notes
    };
  }

  if (pending < threshold && !options?.amountWei) {
    notes.push(
      `Pending rewards ${formatEther(pending)} below reinvest threshold ${formatEther(threshold)}. Override with --amount to force.`
    );
    return {
      dryRun: Boolean(options?.dryRun),
      thresholdWei: threshold,
      pendingWei: pending,
      claimedWei: 0n,
      stakedWei: 0n,
      notes
    };
  }

  if (options?.dryRun) {
    notes.push(
      `Dry run: would claim ${formatEther(desiredAmount)} $AGIALPHA and restake via StakeManager.`
    );
    if (!options?.claimOnly) {
      notes.push('Dry run: would call depositStake to increase platform position.');
    }
    return {
      dryRun: true,
      thresholdWei: threshold,
      pendingWei: pending,
      claimedWei: desiredAmount,
      stakedWei: options?.claimOnly ? 0n : desiredAmount,
      notes
    };
  }

  const feePool = feePoolConnector(config.contracts.feePool, signer);
  const claimTx = await feePool.claimRewards();
  notes.push(`Claim transaction broadcast: ${claimTx.hash}`);
  const claimReceipt = await claimTx.wait?.();
  if (claimReceipt) {
    notes.push(`Rewards claimed in block ${claimReceipt.blockNumber}.`);
  }

  let staked = 0n;
  let stakeTxHash: string | undefined;

  if (!options?.claimOnly && ensurePositive(desiredAmount)) {
    const stakeManager = stakeManagerConnector(config.contracts.stakeManager, signer);
    const token = tokenConnector(config.contracts.agialphaToken, signer);
    const operator = await signer.getAddress();
    const balance = BigInt(await token.balanceOf(operator));
    if (balance < desiredAmount) {
      notes.push(
        `Wallet balance ${formatEther(balance)} $AGIALPHA insufficient for reinvestment of ${formatEther(desiredAmount)}. ` +
          'Ensure claim settled or adjust amount.'
      );
    } else {
      await ensureAllowance(token, signer, config.contracts.stakeManager, desiredAmount, notes, false);
      const stakeTx = await stakeManager.depositStake(Number(PLATFORM_ROLE), desiredAmount);
      stakeTxHash = stakeTx.hash;
      notes.push(`Reinvest stake broadcast: ${stakeTxHash}`);
      const stakeReceipt = await stakeTx.wait?.();
      if (stakeReceipt) {
        notes.push(`Stake increase confirmed in block ${stakeReceipt.blockNumber}.`);
      }
      staked = desiredAmount;
    }
  } else if (options?.claimOnly) {
    notes.push('claimOnly: skipped automatic restake.');
  }

  // Refresh snapshots for operator visibility.
  const postStake = await fetchStake(signer, config);
  notes.push(
    `Updated stake balance ${formatEther(postStake.currentStake)} / requirement ${formatEther(postStake.requiredStake)}.`
  );

  return {
    dryRun: false,
    thresholdWei: threshold,
    pendingWei: pending,
    claimedWei: desiredAmount,
    stakedWei: staked,
    claimTransaction: claimTx.hash,
    stakeTransaction: stakeTxHash,
    notes
  };
}
