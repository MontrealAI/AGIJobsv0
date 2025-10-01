import { Contract, ethers, Wallet } from 'ethers';
import {
  stakeManager,
  TOKEN_DECIMALS,
  AGIALPHA_ADDRESS,
  provider,
  registry,
} from './utils';
import { recordAuditEvent } from '../shared/auditLogger';

const ROLE_AGENT = 0;
const ROLE_VALIDATOR = 1;
const ROLE_PLATFORM = 2;

let minStakeCache: bigint | null = null;

const TOKEN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const tokenContract = new Contract(AGIALPHA_ADDRESS, TOKEN_ABI, provider);
const MAX_UINT256 = ethers.MaxUint256;

interface StakeActionMetadata {
  role: number;
  method: string;
  amount?: string;
  delta?: string;
  target?: string;
  destination?: string;
}

export interface StakeActionReceipt {
  method: string;
  txHash: string;
}

export interface ClaimActionResult extends StakeActionReceipt {
  type: 'withdraw' | 'transfer' | 'restake' | 'approval';
  amountRaw: string;
  amountFormatted: string;
  destination?: string;
}

export interface AutoClaimOptions {
  amount?: bigint;
  destination?: string;
  restakeAmount?: bigint;
  restakePercent?: number | string;
  role?: number;
  withdrawStake?: boolean;
  acknowledge?: boolean;
}

export interface AutoClaimResult {
  agent: string;
  startingBalanceRaw: string;
  startingBalanceFormatted: string;
  endingBalanceRaw: string;
  endingBalanceFormatted: string;
  actions: ClaimActionResult[];
  restakedRaw?: string;
  restakedFormatted?: string;
}

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

async function ensureTokenAllowance(
  wallet: Wallet,
  minimum: bigint
): Promise<StakeActionReceipt | null> {
  if (!stakeManager) return null;
  if (minimum <= 0n) return null;
  const spender = (stakeManager as any).target as string;
  let allowance = 0n;
  try {
    const current = await tokenContract.allowance(wallet.address, spender);
    allowance = BigInt(current.toString());
  } catch (err) {
    console.warn('allowance query failed', wallet.address, err);
  }
  if (allowance >= minimum) {
    return null;
  }
  try {
    const approvalTx = await (tokenContract.connect(wallet) as any).approve(
      spender,
      MAX_UINT256
    );
    await approvalTx.wait();
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'approve',
        agent: wallet.address,
        metadata: {
          spender,
          method: 'approve',
          amount: 'unlimited',
        },
        success: true,
      },
      wallet
    );
    return { method: 'approve', txHash: approvalTx.hash };
  } catch (err) {
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'approve-failed',
        agent: wallet.address,
        metadata: {
          spender,
          method: 'approve',
          error: (err as Error)?.message,
        },
        success: false,
      },
      wallet
    );
    throw err;
  }
}

export async function acknowledgeTaxPolicy(wallet: Wallet): Promise<void> {
  if (!registry) return;
  try {
    const tx = await (registry as any)
      .connect(wallet)
      .acknowledgeTaxPolicy();
    await tx.wait();
  } catch (err: any) {
    const message = String(err?.message || '').toLowerCase();
    if (
      message.includes('already') ||
      message.includes('acknowledged') ||
      message.includes('no tax policy') ||
      message.includes('policy not set')
    ) {
      return;
    }
    console.warn('acknowledgeTaxPolicy failed', err);
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
  await ensureTokenAllowance(wallet, delta);
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

export async function getMinStake(): Promise<bigint> {
  return fetchMinStake();
}

export async function increaseStake(
  wallet: Wallet,
  amount: bigint,
  role: number = ROLE_AGENT
): Promise<void> {
  if (amount <= 0n) return;
  const current = await getStakeBalance(wallet.address, role);
  await ensureStake(wallet, current + amount, role);
}

function formatAmount(value: bigint): string {
  try {
    return ethers.formatUnits(value, TOKEN_DECIMALS);
  } catch (err) {
    console.warn('Failed to format token amount', value.toString(), err);
    return value.toString();
  }
}

async function submitStakeAction(
  wallet: Wallet,
  role: number,
  method: string,
  action: () => Promise<any>,
  metadata: Partial<StakeActionMetadata>
): Promise<StakeActionReceipt> {
  const tx = await action();
  await tx.wait();
  await recordAuditEvent(
    {
      component: 'stake-coordinator',
      action: method,
      agent: wallet.address,
      metadata: {
        role,
        method,
        ...metadata,
      },
      success: true,
    },
    wallet
  );
  return { method, txHash: tx.hash };
}

export async function requestStakeWithdrawal(
  wallet: Wallet,
  amount: bigint,
  role: number = ROLE_AGENT
): Promise<StakeActionReceipt> {
  if (!stakeManager) {
    throw new Error('StakeManager not configured');
  }
  if (amount <= 0n) {
    throw new Error('amount must be greater than zero');
  }
  const contract = (stakeManager as any).connect(wallet);
  const action = async () => {
    try {
      return await contract.requestWithdraw(role, amount);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('acknowledgement')) {
        await acknowledgeTaxPolicy(wallet);
        return await contract.requestWithdraw(role, amount);
      }
      throw err;
    }
  };
  try {
    return await submitStakeAction(wallet, role, 'requestWithdraw', action, {
      amount: formatAmount(amount),
    });
  } catch (err: any) {
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'requestWithdraw-failed',
        agent: wallet.address,
        metadata: {
          role,
          method: 'requestWithdraw',
          amount: formatAmount(amount),
          error: err?.message,
        },
        success: false,
      },
      wallet
    );
    throw err;
  }
}

export async function finalizeStakeWithdrawal(
  wallet: Wallet,
  role: number = ROLE_AGENT
): Promise<StakeActionReceipt> {
  if (!stakeManager) {
    throw new Error('StakeManager not configured');
  }
  const contract = (stakeManager as any).connect(wallet);
  const action = async () => {
    try {
      return await contract.finalizeWithdraw(role);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('acknowledgement')) {
        await acknowledgeTaxPolicy(wallet);
        return await contract.finalizeWithdraw(role);
      }
      throw err;
    }
  };
  try {
    return await submitStakeAction(wallet, role, 'finalizeWithdraw', action, {});
  } catch (err: any) {
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'finalizeWithdraw-failed',
        agent: wallet.address,
        metadata: {
          role,
          method: 'finalizeWithdraw',
          error: err?.message,
        },
        success: false,
      },
      wallet
    );
    throw err;
  }
}

export async function withdrawStakeAmount(
  wallet: Wallet,
  amount: bigint,
  role: number = ROLE_AGENT,
  { acknowledge = true }: { acknowledge?: boolean } = {}
): Promise<StakeActionReceipt> {
  if (!stakeManager) {
    throw new Error('StakeManager not configured');
  }
  if (amount <= 0n) {
    throw new Error('amount must be greater than zero');
  }
  const contract = (stakeManager as any).connect(wallet);
  const attemptWithdraw = async () => {
    try {
      return await contract.withdrawStake(role, amount);
    } catch (err) {
      if (typeof contract.acknowledgeAndWithdraw === 'function') {
        return await contract.acknowledgeAndWithdraw(role, amount);
      }
      throw err;
    }
  };
  try {
    if (acknowledge) {
      await acknowledgeTaxPolicy(wallet);
    }
    const receipt = await submitStakeAction(wallet, role, 'withdrawStake', attemptWithdraw, {
      amount: formatAmount(amount),
    });
    return receipt;
  } catch (err: any) {
    await recordAuditEvent(
      {
        component: 'stake-coordinator',
        action: 'withdraw-failed',
        agent: wallet.address,
        metadata: {
          role,
          method: 'withdrawStake',
          amount: formatAmount(amount),
          error: err?.message,
        },
        success: false,
      },
      wallet
    );
    throw err;
  }
}

function parsePercent(value: number | string): bigint | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const normalised = value > 1 ? value / 100 : value;
    const scaled = Math.min(Math.max(normalised, 0), 1);
    return BigInt(Math.round(scaled * 10_000));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.endsWith('%')
      ? trimmed.slice(0, trimmed.length - 1)
      : trimmed;
    const numeric = Number.parseFloat(cleaned);
    if (!Number.isFinite(numeric)) return null;
    const normalised = numeric > 1 ? numeric / 100 : numeric;
    const clamped = Math.min(Math.max(normalised, 0), 1);
    return BigInt(Math.round(clamped * 10_000));
  }
  return null;
}

async function resolveRestakeAmount(
  options: AutoClaimOptions,
  balance: bigint
): Promise<bigint> {
  if (options.restakeAmount && options.restakeAmount > 0n) {
    return options.restakeAmount;
  }
  if (
    options.restakePercent === undefined ||
    options.restakePercent === null
  ) {
    return 0n;
  }
  const percent = parsePercent(options.restakePercent);
  if (!percent || percent <= 0n) {
    return 0n;
  }
  return (balance * percent) / 10_000n;
}

async function getTokenBalance(address: string): Promise<bigint> {
  try {
    const balance = await tokenContract.balanceOf(address);
    return BigInt(balance.toString());
  } catch (err) {
    console.warn('Failed to read token balance', address, err);
    return 0n;
  }
}

function formatAction(
  type: ClaimActionResult['type'],
  amount: bigint,
  receipt: StakeActionReceipt,
  destination?: string
): ClaimActionResult {
  return {
    type,
    method: receipt.method,
    txHash: receipt.txHash,
    amountRaw: amount.toString(),
    amountFormatted: formatAmount(amount),
    destination,
  };
}

export async function autoClaimRewards(
  wallet: Wallet,
  options: AutoClaimOptions = {}
): Promise<AutoClaimResult> {
  const role = options.role ?? ROLE_AGENT;
  const actions: ClaimActionResult[] = [];
  const startingBalance = await getTokenBalance(wallet.address);

  if (options.withdrawStake) {
    if (!stakeManager) {
      throw new Error('StakeManager not configured; cannot withdraw stake');
    }
    const withdrawAmount = options.amount ?? startingBalance;
    if (withdrawAmount > 0n) {
      const receipt = await withdrawStakeAmount(wallet, withdrawAmount, role, {
        acknowledge: options.acknowledge !== false,
      });
      actions.push(
        formatAction('withdraw', withdrawAmount, receipt)
      );
    }
  }

  let currentBalance = await getTokenBalance(wallet.address);
  const restakeAmount = await resolveRestakeAmount(options, currentBalance);
  let transferAmount = options.amount ?? currentBalance;
  if (restakeAmount > 0n && restakeAmount > transferAmount) {
    transferAmount = restakeAmount;
  }
  let destination = options.destination;
  if (typeof destination === 'string') {
    try {
      destination = ethers.getAddress(destination);
    } catch {
      // keep original string if parsing fails
    }
  }

  if (
    destination &&
    transferAmount > 0n &&
    destination.toLowerCase() !== wallet.address.toLowerCase()
  ) {
    const tx = await (tokenContract.connect(wallet) as any).transfer(
      destination,
      transferAmount
    );
    await tx.wait();
    actions.push({
      type: 'transfer',
      method: 'transfer',
      txHash: tx.hash,
      amountRaw: transferAmount.toString(),
      amountFormatted: formatAmount(transferAmount),
      destination,
    });
    currentBalance = await getTokenBalance(wallet.address);
  }

  if (restakeAmount > 0n) {
    if (!stakeManager) {
      throw new Error('StakeManager not configured; cannot restake rewards');
    }
    await increaseStake(wallet, restakeAmount, role);
    actions.push({
      type: 'restake',
      method: 'stake',
      txHash: 'stake-adjustment',
      amountRaw: restakeAmount.toString(),
      amountFormatted: formatAmount(restakeAmount),
    });
    currentBalance = await getTokenBalance(wallet.address);
  }

  return {
    agent: wallet.address,
    startingBalanceRaw: startingBalance.toString(),
    startingBalanceFormatted: formatAmount(startingBalance),
    endingBalanceRaw: currentBalance.toString(),
    endingBalanceFormatted: formatAmount(currentBalance),
    actions,
    restakedRaw: restakeAmount > 0n ? restakeAmount.toString() : undefined,
    restakedFormatted:
      restakeAmount > 0n ? formatAmount(restakeAmount) : undefined,
  };
}

export { ROLE_AGENT, ROLE_VALIDATOR, ROLE_PLATFORM };
