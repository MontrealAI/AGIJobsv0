import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { JobRegistryConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  describeArgs,
  formatToken,
  normaliseAddress,
  parseBigInt,
  parsePercentage,
  parseTokenAmount,
} from './utils';

const MAX_UINT96 = (1n << 96n) - 1n;

export interface JobRegistryPlanInput {
  registry: Contract;
  config: JobRegistryConfig;
  configPath?: string;
  decimals: number;
  symbol: string;
}

function ensureFeeBudgetValid(
  fee: number | undefined,
  validator: number | undefined
) {
  if (fee === undefined || validator === undefined) {
    return;
  }
  if (fee + validator > 100) {
    throw new Error('feePct + validatorRewardPct cannot exceed 100');
  }
}

export async function buildJobRegistryPlan(
  input: JobRegistryPlanInput
): Promise<ModulePlan> {
  const { registry, config, configPath, decimals, symbol } = input;

  const [
    currentJobStake,
    currentMaxJobReward,
    currentMinAgentStake,
    currentFeePct,
    currentValidatorRewardPct,
    currentMaxDuration,
    currentMaxActiveJobs,
    currentExpirationGrace,
    currentTreasury,
    currentTaxPolicy,
  ] = await Promise.all([
    registry.jobStake(),
    registry.maxJobReward(),
    registry.minAgentStake(),
    registry.feePct(),
    registry.validatorRewardPct(),
    registry.maxJobDuration(),
    registry.maxActiveJobsPerAgent(),
    registry.expirationGracePeriod(),
    registry.treasury(),
    registry.taxPolicy(),
  ]);

  const desiredJobStake = parseTokenAmount(
    config.jobStake,
    config.jobStakeTokens,
    decimals,
    'jobStake'
  );
  const desiredMinAgentStake = parseTokenAmount(
    config.minAgentStake,
    config.minAgentStakeTokens,
    decimals,
    'minAgentStake'
  );
  const desiredMaxReward = parseTokenAmount(
    config.maxJobReward,
    config.maxJobRewardTokens,
    decimals,
    'maxJobReward'
  );
  const desiredDuration = parseBigInt(
    config.jobDurationLimitSeconds,
    'jobDurationLimitSeconds'
  );
  const desiredMaxActive = parseBigInt(
    config.maxActiveJobsPerAgent,
    'maxActiveJobsPerAgent'
  );
  const desiredExpirationGrace = parseBigInt(
    config.expirationGracePeriodSeconds,
    'expirationGracePeriodSeconds'
  );
  const desiredFeePct = parsePercentage(config.feePct, 'feePct');
  const desiredValidatorPct = parsePercentage(
    config.validatorRewardPct,
    'validatorRewardPct'
  );
  ensureFeeBudgetValid(desiredFeePct, desiredValidatorPct);

  const desiredTreasury = normaliseAddress(config.treasury);
  const desiredTaxPolicy = normaliseAddress(config.taxPolicy, {
    allowZero: false,
  });

  const actions: PlannedAction[] = [];

  if (desiredJobStake !== undefined && desiredJobStake !== currentJobStake) {
    if (desiredJobStake > MAX_UINT96) {
      throw new Error('jobStake exceeds uint96 range');
    }
    actions.push({
      label: `Update job stake to ${formatToken(
        desiredJobStake,
        decimals,
        symbol
      )}`,
      method: 'setJobStake',
      args: [desiredJobStake],
      current: formatToken(currentJobStake, decimals, symbol),
      desired: formatToken(desiredJobStake, decimals, symbol),
    });
  }

  if (
    desiredMinAgentStake !== undefined &&
    desiredMinAgentStake !== currentMinAgentStake
  ) {
    if (desiredMinAgentStake > MAX_UINT96) {
      throw new Error('minAgentStake exceeds uint96 range');
    }
    actions.push({
      label: `Update minimum agent stake to ${formatToken(
        desiredMinAgentStake,
        decimals,
        symbol
      )}`,
      method: 'setMinAgentStake',
      args: [desiredMinAgentStake],
      current: formatToken(currentMinAgentStake, decimals, symbol),
      desired: formatToken(desiredMinAgentStake, decimals, symbol),
    });
  }

  if (
    desiredMaxReward !== undefined &&
    desiredMaxReward !== currentMaxJobReward
  ) {
    actions.push({
      label: `Update maximum job reward to ${formatToken(
        desiredMaxReward,
        decimals,
        symbol
      )}`,
      method: 'setMaxJobReward',
      args: [desiredMaxReward],
      current: formatToken(currentMaxJobReward, decimals, symbol),
      desired: formatToken(desiredMaxReward, decimals, symbol),
    });
  }

  if (desiredDuration !== undefined && desiredDuration !== currentMaxDuration) {
    actions.push({
      label: `Update job duration limit to ${desiredDuration} seconds`,
      method: 'setJobDurationLimit',
      args: [desiredDuration],
      current: `${currentMaxDuration.toString()} seconds`,
      desired: `${desiredDuration.toString()} seconds`,
    });
  }

  if (
    desiredMaxActive !== undefined &&
    desiredMaxActive !== currentMaxActiveJobs
  ) {
    actions.push({
      label: `Update maximum active jobs per agent to ${desiredMaxActive}`,
      method: 'setMaxActiveJobsPerAgent',
      args: [desiredMaxActive],
      current: currentMaxActiveJobs.toString(),
      desired: desiredMaxActive.toString(),
    });
  }

  if (
    desiredExpirationGrace !== undefined &&
    desiredExpirationGrace !== currentExpirationGrace
  ) {
    actions.push({
      label: `Update expiration grace period to ${desiredExpirationGrace} seconds`,
      method: 'setExpirationGracePeriod',
      args: [desiredExpirationGrace],
      current: `${currentExpirationGrace.toString()} seconds`,
      desired: `${desiredExpirationGrace.toString()} seconds`,
    });
  }

  const currentFee = Number(currentFeePct);
  const currentValidator = Number(currentValidatorRewardPct);

  if (desiredFeePct !== undefined && desiredFeePct !== currentFee) {
    ensureFeeBudgetValid(desiredFeePct, desiredValidatorPct ?? currentValidator);
    actions.push({
      label: `Update protocol fee percentage to ${desiredFeePct}%`,
      method: 'setFeePct',
      args: [desiredFeePct],
      current: `${currentFee}%`,
      desired: `${desiredFeePct}%`,
    });
  }

  if (
    desiredValidatorPct !== undefined &&
    desiredValidatorPct !== currentValidator
  ) {
    ensureFeeBudgetValid(desiredFeePct ?? currentFee, desiredValidatorPct);
    actions.push({
      label: `Update validator reward percentage to ${desiredValidatorPct}%`,
      method: 'setValidatorRewardPct',
      args: [desiredValidatorPct],
      current: `${currentValidator}%`,
      desired: `${desiredValidatorPct}%`,
    });
  }

  const currentTreasuryAddress =
    currentTreasury === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTreasury);
  if (
    desiredTreasury !== undefined &&
    desiredTreasury !== currentTreasuryAddress
  ) {
    actions.push({
      label: `Update treasury to ${desiredTreasury}`,
      method: 'setTreasury',
      args: [desiredTreasury],
      current: currentTreasuryAddress,
      desired: desiredTreasury,
      notes: ['Passing the zero address burns forfeited payouts.'],
    });
  }

  const currentTaxPolicyAddress =
    currentTaxPolicy === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTaxPolicy);
  if (
    desiredTaxPolicy &&
    desiredTaxPolicy !== ethers.ZeroAddress &&
    desiredTaxPolicy !== currentTaxPolicyAddress
  ) {
    actions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: currentTaxPolicyAddress,
      desired: desiredTaxPolicy,
    });
  }

  const acknowledgers = config.acknowledgers || {};
  const sortedAcks = Object.keys(acknowledgers).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const ack of sortedAcks) {
    const desired = acknowledgers[ack];
    const current = await registry.acknowledgers(ack);
    if (Boolean(desired) !== current) {
      actions.push({
        label: `${desired ? 'Enable' : 'Disable'} acknowledger ${ack}`,
        method: 'setAcknowledger',
        args: [ack, Boolean(desired)],
        current: current ? 'allowed' : 'blocked',
        desired: desired ? 'allowed' : 'blocked',
      });
    }
  }

  return {
    module: 'JobRegistry',
    address: registry.target as string,
    actions,
    configPath,
    iface: registry.interface,
    contract: registry,
  };
}

export function renderJobRegistryPlan(plan: ModulePlan): string {
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
    action.notes?.forEach((note) => {
      lines.push(`   Note: ${note}`);
    });
    lines.push(
      `   Method: ${action.method}(${describeArgs(action.args)})`
    );
    if (data) {
      lines.push(`   Calldata: ${data}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
