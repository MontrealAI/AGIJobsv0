import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { FeePoolConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import { describeArgs, normaliseAddress, parsePercentage, sameAddress } from './utils';

const ROLE_LABELS = ['Agent', 'Validator', 'Platform'];

function parseRewardRole(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value >= ROLE_LABELS.length) {
      throw new Error('rewardRole must be 0 (Agent), 1 (Validator), or 2 (Platform)');
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed >= ROLE_LABELS.length) {
        throw new Error('rewardRole must be 0 (Agent), 1 (Validator), or 2 (Platform)');
      }
      return parsed;
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'agent') return 0;
    if (lower === 'validator') return 1;
    if (lower === 'platform' || lower === 'operator') return 2;
    throw new Error(
      "rewardRole must be one of 'agent', 'validator', 'platform' or the corresponding numeric value"
    );
  }
  throw new Error('rewardRole must be a string or number');
}

function formatRole(value: bigint | number): string {
  const index = Number(value);
  return ROLE_LABELS[index] ?? `Role(${index})`;
}

export interface FeePoolPlanInput {
  feePool: Contract;
  config: FeePoolConfig;
  configPath?: string;
  ownerAddress: string;
}

export async function buildFeePoolPlan(input: FeePoolPlanInput): Promise<ModulePlan> {
  const { feePool, config, configPath, ownerAddress } = input;

  const [
    currentStakeManager,
    currentRewardRole,
    currentBurnPct,
    currentTreasury,
    currentGovernance,
    currentPauser,
    currentTaxPolicy,
  ] = await Promise.all([
    feePool.stakeManager(),
    feePool.rewardRole(),
    feePool.burnPct(),
    feePool.treasury(),
    feePool.governance(),
    feePool.pauser(),
    feePool.taxPolicy(),
  ]);

  const currentStakeManagerAddress =
    currentStakeManager === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentStakeManager);
  const currentTreasuryAddress =
    currentTreasury === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTreasury);
  const currentGovernanceAddress =
    currentGovernance === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentGovernance);
  const currentPauserAddress =
    currentPauser === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentPauser);
  const currentTaxPolicyAddress =
    currentTaxPolicy === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTaxPolicy);

  const desiredStakeManager = normaliseAddress(config.stakeManager, {
    allowZero: false,
  });
  const desiredRewardRole = parseRewardRole(config.rewardRole);
  const desiredBurnPct = parsePercentage(config.burnPct, 'burnPct');
  const desiredTreasury = normaliseAddress(config.treasury);
  const desiredGovernance = normaliseAddress(config.governance, {
    allowZero: false,
  });
  const desiredPauser = normaliseAddress(config.pauser);
  const desiredTaxPolicy = normaliseAddress(config.taxPolicy, {
    allowZero: false,
  });

  const allowlistActions: PlannedAction[] = [];
  const mainActions: PlannedAction[] = [];
  const rewarderActions: PlannedAction[] = [];

  const allowlistState = new Map<string, boolean>();
  async function syncAllowlistEntry(
    addr: string,
    desired: boolean,
    note?: string
  ) {
    const normalized = ethers.getAddress(addr);
    if (normalized === ethers.ZeroAddress) {
      return;
    }
    const current = allowlistState.has(normalized)
      ? allowlistState.get(normalized)!
      : Boolean(await feePool.treasuryAllowlist(normalized));
    if (current === desired) {
      allowlistState.set(normalized, desired);
      return;
    }
    const action: PlannedAction = {
      label: `${desired ? 'Allow' : 'Block'} treasury ${normalized}`,
      method: 'setTreasuryAllowlist',
      args: [normalized, desired],
      current: current ? 'allowed' : 'blocked',
      desired: desired ? 'allowed' : 'blocked',
    };
    if (note) {
      action.notes = [note];
    }
    allowlistActions.push(action);
    allowlistState.set(normalized, desired);
  }

  const allowlistConfig = config.treasuryAllowlist || {};
  const sortedAllowlist = Object.keys(allowlistConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const addr of sortedAllowlist) {
    await syncAllowlistEntry(addr, Boolean(allowlistConfig[addr]));
  }

  const rewarderState = new Map<string, boolean>();
  async function syncRewarder(addr: string, desired: boolean) {
    const normalized = ethers.getAddress(addr);
    if (normalized === ethers.ZeroAddress) {
      return;
    }
    const current = rewarderState.has(normalized)
      ? rewarderState.get(normalized)!
      : Boolean(await feePool.rewarders(normalized));
    if (current === desired) {
      rewarderState.set(normalized, desired);
      return;
    }
    rewarderActions.push({
      label: `${desired ? 'Authorize' : 'Revoke'} rewarder ${normalized}`,
      method: 'setRewarder',
      args: [normalized, desired],
      current: current ? 'authorized' : 'revoked',
      desired: desired ? 'authorized' : 'revoked',
    });
    rewarderState.set(normalized, desired);
  }

  const rewarderConfig = config.rewarders || {};
  const sortedRewarders = Object.keys(rewarderConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const addr of sortedRewarders) {
    await syncRewarder(addr, Boolean(rewarderConfig[addr]));
  }

  if (
    desiredStakeManager &&
    !sameAddress(desiredStakeManager, currentStakeManagerAddress)
  ) {
    const stakeManager = await ethers.getContractAt(
      ['function version() view returns (uint256)'],
      desiredStakeManager
    );
    const stakeVersion = await stakeManager.version();
    if (stakeVersion !== 2n) {
      throw new Error(
        `StakeManager at ${desiredStakeManager} reports version ${stakeVersion}, expected 2`
      );
    }
    mainActions.push({
      label: `Update StakeManager to ${desiredStakeManager}`,
      method: 'setStakeManager',
      args: [desiredStakeManager],
      current: currentStakeManagerAddress,
      desired: desiredStakeManager,
      notes: ['StakeManager must expose version() == 2.'],
    });
  }

  if (
    desiredRewardRole !== undefined &&
    desiredRewardRole !== Number(currentRewardRole)
  ) {
    mainActions.push({
      label: `Update reward role to ${formatRole(desiredRewardRole)}`,
      method: 'setRewardRole',
      args: [desiredRewardRole],
      current: formatRole(currentRewardRole),
      desired: formatRole(desiredRewardRole),
    });
  }

  if (
    desiredBurnPct !== undefined &&
    desiredBurnPct !== Number(currentBurnPct)
  ) {
    mainActions.push({
      label: `Update burn percentage to ${desiredBurnPct}%`,
      method: 'setBurnPct',
      args: [desiredBurnPct],
      current: `${Number(currentBurnPct)}%`,
      desired: `${desiredBurnPct}%`,
    });
  }

  if (desiredTreasury !== undefined) {
    if (
      desiredTreasury !== ethers.ZeroAddress &&
      sameAddress(desiredTreasury, ownerAddress)
    ) {
      throw new Error('Treasury cannot be set to the contract owner');
    }
    const normalizedTreasury = desiredTreasury;
    const allowlistConfigState = config.treasuryAllowlist || {};
    if (
      normalizedTreasury !== ethers.ZeroAddress &&
      allowlistConfigState[normalizedTreasury] === false
    ) {
      throw new Error(
        `Treasury ${normalizedTreasury} is disabled in treasuryAllowlist; set it to true before updating`
      );
    }
    if (
      normalizedTreasury !== ethers.ZeroAddress &&
      (!allowlistState.has(normalizedTreasury) ||
        allowlistState.get(normalizedTreasury) !== true)
    ) {
      await syncAllowlistEntry(
        normalizedTreasury,
        true,
        'Automatically allowing treasury address before updating.'
      );
    }
    if (!sameAddress(normalizedTreasury, currentTreasuryAddress)) {
      const notes = [] as string[];
      if (normalizedTreasury === ethers.ZeroAddress) {
        notes.push('Zero address burns rounding dust instead of forwarding it.');
      }
      mainActions.push({
        label: `Update treasury to ${normalizedTreasury}`,
        method: 'setTreasury',
        args: [normalizedTreasury],
        current: currentTreasuryAddress,
        desired: normalizedTreasury,
        notes: notes.length ? notes : undefined,
      });
    }
  }

  if (
    desiredGovernance &&
    !sameAddress(desiredGovernance, currentGovernanceAddress)
  ) {
    mainActions.push({
      label: `Update governance to ${desiredGovernance}`,
      method: 'setGovernance',
      args: [desiredGovernance],
      current: currentGovernanceAddress,
      desired: desiredGovernance,
      notes: [
        'Governance address must be a TimelockController capable of calling governanceWithdraw.',
      ],
    });
  }

  if (
    desiredPauser !== undefined &&
    !sameAddress(desiredPauser, currentPauserAddress)
  ) {
    mainActions.push({
      label: `Update pauser to ${desiredPauser}`,
      method: 'setPauser',
      args: [desiredPauser],
      current: currentPauserAddress,
      desired: desiredPauser,
    });
  }

  if (
    desiredTaxPolicy &&
    !sameAddress(desiredTaxPolicy, currentTaxPolicyAddress)
  ) {
    const policy = await ethers.getContractAt(
      ['function isTaxExempt() view returns (bool)'],
      desiredTaxPolicy
    );
    const exempt = await policy.isTaxExempt();
    if (!exempt) {
      throw new Error(
        `Tax policy at ${desiredTaxPolicy} must return true for isTaxExempt()`
      );
    }
    mainActions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: currentTaxPolicyAddress,
      desired: desiredTaxPolicy,
      notes: ['Target policy must remain tax exempt.'],
    });
  }

  const actions = [...allowlistActions, ...mainActions, ...rewarderActions];

  return {
    module: 'FeePool',
    address: feePool.target as string,
    actions,
    configPath,
    iface: feePool.interface,
    contract: feePool,
  };
}

export function renderFeePoolPlan(plan: ModulePlan): string {
  if (plan.actions.length === 0) {
    return 'All tracked parameters already match the configuration.';
  }
  const lines: string[] = [];
  plan.actions.forEach((action, index) => {
    const data = plan.iface?.encodeFunctionData(action.method, action.args);
    lines.push(`${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      lines.push(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      lines.push(`   Desired: ${action.desired}`);
    }
    action.notes?.forEach((note) => lines.push(`   Note: ${note}`));
    lines.push(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (data) {
      lines.push(`   Calldata: ${data}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
