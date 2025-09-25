import type { Contract, ContractRunner } from 'ethers';
import { Contract as EthersContract, ethers } from 'ethers';
import type { PlatformRegistryConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  describeArgs,
  formatToken,
  normaliseAddress,
  parseTokenAmount,
  sameAddress,
} from './utils';

export interface PlatformRegistryPlanInput {
  platformRegistry: Contract;
  config: PlatformRegistryConfig;
  configPath?: string;
  decimals: number;
  symbol: string;
  ownerAddress: string;
}

async function ensureModuleVersion(
  address: string,
  label: string,
  runner: ContractRunner | null | undefined
): Promise<void> {
  if (!address || address === ethers.ZeroAddress) {
    return;
  }
  if (!runner) {
    throw new Error(
      `Unable to verify ${label} at ${address}: missing contract runner`
    );
  }
  const contract = new EthersContract(
    address,
    ['function version() view returns (uint256)'],
    runner
  );
  if (typeof contract.version !== 'function') {
    return;
  }
  const version = await contract.version();
  if (version !== 2n) {
    throw new Error(
      `${label} at ${address} reports version ${version}, expected 2`
    );
  }
}

export async function buildPlatformRegistryPlan(
  input: PlatformRegistryPlanInput
): Promise<ModulePlan> {
  const {
    platformRegistry,
    config,
    configPath,
    decimals,
    symbol,
    ownerAddress,
  } = input;

  const moduleAddress = await platformRegistry.getAddress();
  const iface = platformRegistry.interface;

  const [
    currentStakeManager,
    currentReputationEngine,
    currentMinStake,
    currentPauser,
  ] = await Promise.all([
    platformRegistry.stakeManager(),
    platformRegistry.reputationEngine(),
    platformRegistry.minPlatformStake(),
    platformRegistry.pauser(),
  ]);

  const currentStakeManagerAddress =
    currentStakeManager === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentStakeManager);
  const currentReputationEngineAddress =
    currentReputationEngine === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentReputationEngine);
  const currentPauserAddress =
    currentPauser === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentPauser);

  const desiredStakeManager = normaliseAddress(config.stakeManager, {
    allowZero: true,
  });
  const desiredReputationEngine = normaliseAddress(config.reputationEngine, {
    allowZero: true,
  });
  const desiredPauser = normaliseAddress(config.pauser);
  const desiredMinStake = parseTokenAmount(
    config.minPlatformStake,
    config.minPlatformStakeTokens,
    decimals,
    'minPlatformStake'
  );

  const actions: PlannedAction[] = [];
  const runner: ContractRunner | null | undefined =
    platformRegistry.runner ??
    (platformRegistry as unknown as { provider?: ContractRunner }).provider;

  if (
    desiredStakeManager !== undefined &&
    !sameAddress(desiredStakeManager, currentStakeManagerAddress)
  ) {
    await ensureModuleVersion(desiredStakeManager, 'StakeManager', runner);
    actions.push({
      label: `Update StakeManager to ${desiredStakeManager}`,
      method: 'setStakeManager',
      args: [desiredStakeManager],
      current: currentStakeManagerAddress,
      desired: desiredStakeManager,
    });
  }

  if (
    desiredReputationEngine !== undefined &&
    !sameAddress(desiredReputationEngine, currentReputationEngineAddress)
  ) {
    await ensureModuleVersion(
      desiredReputationEngine,
      'ReputationEngine',
      runner
    );
    actions.push({
      label: `Update ReputationEngine to ${desiredReputationEngine}`,
      method: 'setReputationEngine',
      args: [desiredReputationEngine],
      current: currentReputationEngineAddress,
      desired: desiredReputationEngine,
    });
  }

  if (desiredMinStake !== undefined) {
    const currentValue = BigInt(currentMinStake);
    if (currentValue !== desiredMinStake) {
      actions.push({
        label: `Update minPlatformStake to ${formatToken(
          desiredMinStake,
          decimals,
          symbol
        )}`,
        method: 'setMinPlatformStake',
        args: [desiredMinStake],
        current: formatToken(currentValue, decimals, symbol),
        desired: formatToken(desiredMinStake, decimals, symbol),
        notes: ['Value expressed in base units (18 decimals).'],
      });
    }
  }

  if (
    desiredPauser !== undefined &&
    !sameAddress(desiredPauser, currentPauserAddress)
  ) {
    actions.push({
      label: `Update pauser to ${desiredPauser}`,
      method: 'setPauser',
      args: [desiredPauser],
      current: currentPauserAddress,
      desired: desiredPauser,
    });
  }

  const registrarActions: PlannedAction[] = [];
  const registrarConfig = config.registrars || {};
  const sortedRegistrars = Object.keys(registrarConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const registrar of sortedRegistrars) {
    const desired = Boolean(registrarConfig[registrar]);
    const current = Boolean(await platformRegistry.registrars(registrar));
    if (current !== desired) {
      registrarActions.push({
        label: `${desired ? 'Authorize' : 'Revoke'} registrar ${registrar}`,
        method: 'setRegistrar',
        args: [registrar, desired],
        current: current ? 'authorized' : 'revoked',
        desired: desired ? 'authorized' : 'revoked',
      });
    }
  }

  const blacklistActions: PlannedAction[] = [];
  const blacklistConfig = config.blacklist || {};
  const sortedBlacklist = Object.keys(blacklistConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const operator of sortedBlacklist) {
    const desired = Boolean(blacklistConfig[operator]);
    const current = Boolean(await platformRegistry.blacklist(operator));
    if (current !== desired) {
      blacklistActions.push({
        label: `${desired ? 'Blacklist' : 'Unblacklist'} operator ${operator}`,
        method: 'setBlacklist',
        args: [operator, desired],
        current: current ? 'blacklisted' : 'cleared',
        desired: desired ? 'blacklisted' : 'cleared',
      });
    }
  }

  actions.push(...registrarActions, ...blacklistActions);

  const warnings: string[] = [];
  if (!sameAddress(ownerAddress, await platformRegistry.owner())) {
    warnings.push('Connected signer is not the governance owner.');
  }

  return {
    module: 'PlatformRegistry',
    address: moduleAddress,
    actions,
    configPath,
    warnings: warnings.length ? warnings : undefined,
    iface,
    contract: platformRegistry,
  };
}

export function describePlatformRegistryPlan(plan: ModulePlan): void {
  console.log(`PlatformRegistry: ${plan.address}`);
  if (plan.configPath) {
    console.log(`Configuration file: ${plan.configPath}`);
  }
  if (plan.actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }
  console.log(`Planned actions (${plan.actions.length}):`);
  plan.actions.forEach((action, index) => {
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    action.notes?.forEach((note) => console.log(`   Note: ${note}`));
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    const data = plan.iface?.encodeFunctionData(action.method, action.args);
    if (data) {
      console.log(`   Calldata: ${data}`);
    }
  });
}
