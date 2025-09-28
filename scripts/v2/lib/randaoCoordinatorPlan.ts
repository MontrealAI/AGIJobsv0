import { ethers } from 'ethers';
import type { Contract } from 'ethers';
import { type RandaoCoordinatorConfig } from '../../config';
import { type ModulePlan, type PlannedAction } from './types';

const ABI = [
  'function commitWindow() view returns (uint256)',
  'function revealWindow() view returns (uint256)',
  'function deposit() view returns (uint256)',
  'function treasury() view returns (address)',
  'function setCommitWindow(uint256)',
  'function setRevealWindow(uint256)',
  'function setDeposit(uint256)',
  'function setTreasury(address)'
];

export interface RandaoCoordinatorPlanInput {
  randao: Contract;
  config: RandaoCoordinatorConfig;
  configPath?: string;
}

function formatSeconds(value: bigint | number | undefined): string {
  if (value === undefined) {
    return 'unset';
  }
  const seconds = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(seconds)) {
    return value.toString();
  }
  if (seconds === 0) {
    return '0 seconds';
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? '' : 's'} (${seconds}s)`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'} (${seconds}s)`;
  }
  return `${seconds} seconds`;
}

export async function buildRandaoCoordinatorPlan(
  input: RandaoCoordinatorPlanInput
): Promise<ModulePlan> {
  const { randao, config, configPath } = input;
  const address = await randao.getAddress();
  const iface = new ethers.Interface(ABI);

  const [currentCommitWindow, currentRevealWindow, currentDeposit, currentTreasury] =
    await Promise.all([
      randao.commitWindow(),
      randao.revealWindow(),
      randao.deposit(),
      randao.treasury()
    ]);

  const actions: PlannedAction[] = [];
  const warnings: string[] = [];

  if (config.commitWindow !== undefined) {
    const desired = BigInt(config.commitWindow);
    if (currentCommitWindow !== desired) {
      actions.push({
        label: 'Update commit window',
        method: 'setCommitWindow',
        args: [desired],
        current: formatSeconds(currentCommitWindow),
        desired: formatSeconds(desired)
      });
    }
  } else {
    warnings.push('commitWindow missing from configuration; leaving current value.');
  }

  if (config.revealWindow !== undefined) {
    const desired = BigInt(config.revealWindow);
    if (currentRevealWindow !== desired) {
      actions.push({
        label: 'Update reveal window',
        method: 'setRevealWindow',
        args: [desired],
        current: formatSeconds(currentRevealWindow),
        desired: formatSeconds(desired)
      });
    }
  } else {
    warnings.push('revealWindow missing from configuration; leaving current value.');
  }

  if (config.deposit !== undefined) {
    const desired = ethers.getBigInt(config.deposit);
    if (currentDeposit !== desired) {
      actions.push({
        label: 'Update deposit requirement',
        method: 'setDeposit',
        args: [desired],
        current: `${ethers.formatUnits(currentDeposit, 18)} AGIALPHA`,
        desired: `${ethers.formatUnits(desired, 18)} AGIALPHA`
      });
    }
  } else {
    warnings.push('deposit missing from configuration; leaving current value.');
  }

  if (config.treasury !== undefined) {
    const desired = ethers.getAddress(config.treasury);
    if (ethers.getAddress(currentTreasury) !== desired) {
      actions.push({
        label: 'Update treasury address',
        method: 'setTreasury',
        args: [desired],
        current: ethers.getAddress(currentTreasury),
        desired
      });
    }
  } else {
    warnings.push('treasury missing from configuration; leaving current value.');
  }

  return {
    module: 'RandaoCoordinator',
    address,
    configPath,
    actions,
    warnings: warnings.length ? warnings : undefined,
    iface,
    contract: randao
  };
}
