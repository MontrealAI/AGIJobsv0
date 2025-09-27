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

  const currentMinStakeValue = BigInt(currentMinStake);

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
  const changeSummaries: string[] = [];
  const configUpdate = {
    setStakeManager: false,
    stakeManager: currentStakeManagerAddress,
    setReputationEngine: false,
    reputationEngine: currentReputationEngineAddress,
    setMinPlatformStake: false,
    minPlatformStake: currentMinStakeValue,
    setPauser: false,
    pauser: currentPauserAddress,
  };

  const registrarUpdates: Array<{ registrar: string; allowed: boolean }> = [];
  const blacklistUpdates: Array<{ operator: string; status: boolean }> = [];
  const runner: ContractRunner | null | undefined =
    platformRegistry.runner ??
    (platformRegistry as unknown as { provider?: ContractRunner }).provider;

  if (
    desiredStakeManager !== undefined &&
    !sameAddress(desiredStakeManager, currentStakeManagerAddress)
  ) {
    await ensureModuleVersion(desiredStakeManager, 'StakeManager', runner);
    configUpdate.setStakeManager = true;
    configUpdate.stakeManager = desiredStakeManager;
    changeSummaries.push(
      `StakeManager: ${currentStakeManagerAddress} → ${desiredStakeManager}`
    );
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
    configUpdate.setReputationEngine = true;
    configUpdate.reputationEngine = desiredReputationEngine;
    changeSummaries.push(
      `ReputationEngine: ${currentReputationEngineAddress} → ${desiredReputationEngine}`
    );
  }

  if (desiredMinStake !== undefined) {
    if (currentMinStakeValue !== desiredMinStake) {
      configUpdate.setMinPlatformStake = true;
      configUpdate.minPlatformStake = desiredMinStake;
      changeSummaries.push(
        `minPlatformStake: ${formatToken(
          currentMinStakeValue,
          decimals,
          symbol
        )} → ${formatToken(
          desiredMinStake,
          decimals,
          symbol
        )} (base units: ${desiredMinStake.toString()})`
      );
    }
  }

  if (
    desiredPauser !== undefined &&
    !sameAddress(desiredPauser, currentPauserAddress)
  ) {
    configUpdate.setPauser = true;
    configUpdate.pauser = desiredPauser;
    changeSummaries.push(
      `Pauser: ${currentPauserAddress} → ${desiredPauser}`
    );
  }

  const registrarConfig = config.registrars || {};
  const sortedRegistrars = Object.keys(registrarConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const registrar of sortedRegistrars) {
    const registrarAddress = ethers.getAddress(registrar);
    const desired = Boolean(registrarConfig[registrar]);
    const current = Boolean(
      await platformRegistry.registrars(registrarAddress)
    );
    if (current !== desired) {
      registrarUpdates.push({
        registrar: registrarAddress,
        allowed: desired,
      });
      changeSummaries.push(
        `Registrar ${registrarAddress}: ${
          current ? 'authorized' : 'revoked'
        } → ${desired ? 'authorized' : 'revoked'}`
      );
    }
  }

  const blacklistConfig = config.blacklist || {};
  const sortedBlacklist = Object.keys(blacklistConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const operator of sortedBlacklist) {
    const operatorAddress = ethers.getAddress(operator);
    const desired = Boolean(blacklistConfig[operator]);
    const current = Boolean(
      await platformRegistry.blacklist(operatorAddress)
    );
    if (current !== desired) {
      blacklistUpdates.push({
        operator: operatorAddress,
        status: desired,
      });
      changeSummaries.push(
        `Blacklist ${operatorAddress}: ${
          current ? 'blacklisted' : 'cleared'
        } → ${desired ? 'blacklisted' : 'cleared'}`
      );
    }
  }

  const hasConfigChanges =
    configUpdate.setStakeManager ||
    configUpdate.setReputationEngine ||
    configUpdate.setMinPlatformStake ||
    configUpdate.setPauser;
  const hasListChanges =
    registrarUpdates.length > 0 || blacklistUpdates.length > 0;

  if (hasConfigChanges || hasListChanges) {
    const summaryNotes = changeSummaries.map((line) => `• ${line}`);
    summaryNotes.push(
      '• All updates executed atomically via applyConfiguration for consistency and reduced gas.'
    );
    actions.push({
      label: `Apply ${changeSummaries.length} PlatformRegistry configuration update${
        changeSummaries.length === 1 ? '' : 's'
      }`,
      method: 'applyConfiguration',
      args: [configUpdate, registrarUpdates, blacklistUpdates],
      notes: summaryNotes,
    });
  }

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
