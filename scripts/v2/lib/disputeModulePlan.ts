import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { DisputeModuleConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  formatToken,
  normaliseAddress,
  parseTokenAmount,
  sameAddress,
} from './utils';

interface DisputeModulePlanInput {
  dispute: Contract;
  config: DisputeModuleConfig;
  configPath?: string;
  decimals: number;
  symbol: string;
}

function formatAddress(value: string | undefined): string {
  if (!value) {
    return 'not set';
  }
  const checksummed = ethers.getAddress(value);
  return checksummed === ethers.ZeroAddress ? 'address(0)' : checksummed;
}

function pushAddressUpdate(
  actions: PlannedAction[],
  desired: string | undefined,
  current: string,
  method: string,
  label: string,
  notes: string[] = []
): void {
  if (!desired || sameAddress(desired, current)) {
    return;
  }
  const entry: PlannedAction = {
    label: `Update ${label} to ${desired}`,
    method,
    args: [desired],
    current: formatAddress(current),
    desired: formatAddress(desired),
  };
  if (notes.length > 0) {
    entry.notes = notes;
  }
  actions.push(entry);
}

export async function buildDisputeModulePlan(
  input: DisputeModulePlanInput
): Promise<ModulePlan> {
  const { dispute, config, configPath, decimals, symbol } = input;

  const [
    currentJobRegistry,
    currentStakeManager,
    currentCommittee,
    currentPauser,
    currentTaxPolicy,
    currentDisputeFee,
  ] = await Promise.all([
    dispute.jobRegistry(),
    dispute.stakeManager(),
    dispute.committee(),
    dispute.pauser(),
    dispute.taxPolicy(),
    dispute.disputeFee(),
  ]);

  const currentJobRegistryAddress = ethers.getAddress(currentJobRegistry);
  const currentStakeManagerAddress = ethers.getAddress(currentStakeManager);
  const currentCommitteeAddress = ethers.getAddress(currentCommittee);
  const currentPauserAddress = ethers.getAddress(currentPauser);
  const currentTaxPolicyAddress = ethers.getAddress(currentTaxPolicy);
  const currentDisputeFeeValue = BigInt(currentDisputeFee);

  const desiredJobRegistry = normaliseAddress(config.jobRegistry, {
    allowZero: false,
  });
  const desiredStakeManager = normaliseAddress(config.stakeManager, {
    allowZero: false,
  });
  const desiredCommittee = normaliseAddress(config.committee, {
    allowZero: true,
  });
  const desiredPauser = normaliseAddress(config.pauser, {
    allowZero: true,
  });
  const desiredTaxPolicy = normaliseAddress(config.taxPolicy, {
    allowZero: false,
  });
  const desiredDisputeFee = parseTokenAmount(
    config.disputeFee,
    config.disputeFeeTokens,
    decimals,
    'disputeFee'
  );

  const actions: PlannedAction[] = [];

  pushAddressUpdate(
    actions,
    desiredJobRegistry,
    currentJobRegistryAddress,
    'setJobRegistry',
    'job registry',
    ['Ensures dispute resolutions link back to the canonical JobRegistry.']
  );
  pushAddressUpdate(
    actions,
    desiredStakeManager,
    currentStakeManagerAddress,
    'setStakeManager',
    'stake manager'
  );
  pushAddressUpdate(
    actions,
    desiredCommittee,
    currentCommitteeAddress,
    'setCommittee',
    'arbitrator committee'
  );
  pushAddressUpdate(
    actions,
    desiredPauser,
    currentPauserAddress,
    'setPauser',
    'pauser'
  );

  if (
    desiredDisputeFee !== undefined &&
    desiredDisputeFee !== currentDisputeFeeValue
  ) {
    actions.push({
      label: `Set dispute fee to ${formatToken(
        desiredDisputeFee,
        decimals,
        symbol
      )}`,
      method: 'setDisputeFee',
      args: [desiredDisputeFee],
      current: formatToken(currentDisputeFeeValue, decimals, symbol),
      desired: formatToken(desiredDisputeFee, decimals, symbol),
      notes: [
        'Refund the dispute fee to the prevailing party when resolving disputes to discourage abuse.',
      ],
    });
  }

  if (
    desiredTaxPolicy &&
    !sameAddress(desiredTaxPolicy, currentTaxPolicyAddress)
  ) {
    const runner = dispute.runner ?? dispute.provider;
    if (!runner) {
      throw new Error('DisputeModule contract runner is not configured');
    }
    const policy = new ethers.Contract(
      desiredTaxPolicy,
      ['function isTaxExempt() view returns (bool)'],
      runner
    );
    const exempt = await policy.isTaxExempt();
    if (!exempt) {
      throw new Error(
        `Tax policy at ${desiredTaxPolicy} must return true for isTaxExempt()`
      );
    }
    actions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: formatAddress(currentTaxPolicyAddress),
      desired: formatAddress(desiredTaxPolicy),
      notes: ['Execute after publishing the same policy on JobRegistry.'],
    });
  }

  return {
    module: 'DisputeModule',
    address: dispute.target as string,
    actions,
    configPath,
    iface: dispute.interface,
    contract: dispute,
  };
}
