import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { PlatformIncentivesConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import { normaliseAddress, sameAddress } from './utils';

export interface PlatformIncentivesPlanInput {
  platformIncentives: Contract;
  config: PlatformIncentivesConfig;
  configPath?: string;
  ownerAddress: string;
}

export async function buildPlatformIncentivesPlan(
  input: PlatformIncentivesPlanInput
): Promise<ModulePlan> {
  const { platformIncentives, config, configPath } = input;
  const address = await platformIncentives.getAddress();
  const iface = platformIncentives.interface;

  const [currentStakeManager, currentPlatformRegistry, currentJobRouter] =
    await Promise.all([
      platformIncentives.stakeManager(),
      platformIncentives.platformRegistry(),
      platformIncentives.jobRouter(),
    ]);

  const desiredStakeManager = normaliseAddress(config.stakeManager);
  const desiredPlatformRegistry = normaliseAddress(config.platformRegistry);
  const desiredJobRouter = normaliseAddress(config.jobRouter);

  const stakeManagerAddress =
    desiredStakeManager ??
    (currentStakeManager
      ? ethers.getAddress(currentStakeManager)
      : undefined) ??
    ethers.ZeroAddress;
  const platformRegistryAddress =
    desiredPlatformRegistry ??
    (currentPlatformRegistry
      ? ethers.getAddress(currentPlatformRegistry)
      : undefined) ??
    ethers.ZeroAddress;
  const jobRouterAddress =
    desiredJobRouter ??
    (currentJobRouter ? ethers.getAddress(currentJobRouter) : undefined) ??
    ethers.ZeroAddress;

  const actions: PlannedAction[] = [];

  if (
    !sameAddress(currentStakeManager, stakeManagerAddress) ||
    !sameAddress(currentPlatformRegistry, platformRegistryAddress) ||
    !sameAddress(currentJobRouter, jobRouterAddress)
  ) {
    actions.push({
      label:
        'Update linked modules (StakeManager, PlatformRegistry, JobRouter)',
      method: 'setModules',
      args: [stakeManagerAddress, platformRegistryAddress, jobRouterAddress],
      current: `${currentStakeManager}, ${currentPlatformRegistry}, ${currentJobRouter}`,
      desired: `${stakeManagerAddress}, ${platformRegistryAddress}, ${jobRouterAddress}`,
    });
  }

  return {
    module: 'PlatformIncentives',
    address,
    actions,
    configPath,
    iface,
    contract: platformIncentives,
  };
}
