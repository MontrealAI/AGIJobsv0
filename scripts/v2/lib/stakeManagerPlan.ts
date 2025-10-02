import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { StakeManagerConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  describeArgs,
  formatToken,
  normaliseAddress,
  parseBigInt,
  parseBoolean,
  parsePercentage,
  parseTokenAmount,
  sameAddress,
} from './utils';

const MAX_AGI_TYPES_CAP = 50;
const MAX_PAYOUT_PCT = 200;

export interface StakeManagerPlanInput {
  stakeManager: Contract;
  config: StakeManagerConfig;
  configPath?: string;
  decimals: number;
  symbol: string;
  ownerAddress: string;
}

async function ensureModuleVersion(
  address: string,
  artifact: string,
  label: string
): Promise<void> {
  const contract = await ethers.getContractAt(artifact, address);
  const version = await contract.version();
  if (version !== 2n) {
    throw new Error(`${label} at ${address} reports version ${version}, expected 2`);
  }
}

export async function buildStakeManagerPlan(
  input: StakeManagerPlanInput
): Promise<ModulePlan> {
  const { stakeManager, config, configPath, decimals, symbol, ownerAddress } =
    input;

  const [
    currentMinStake,
    currentAgentRoleMin,
    currentValidatorRoleMin,
    currentPlatformRoleMin,
    currentFeePct,
    currentBurnPct,
    currentValidatorRewardPct,
    currentValidatorSlashPct,
    currentEmployerSlashPct,
    currentTreasurySlashPct,
    currentTreasury,
    currentFeePool,
    currentUnbondingPeriod,
    currentMaxStakePerAddress,
    currentAutoStakeEnabled,
    currentDisputeThreshold,
    currentIncreasePct,
    currentDecreasePct,
    currentWindow,
    currentFloor,
    currentMaxMinStake,
    currentTempThreshold,
    currentHamThreshold,
    currentDisputeWeight,
    currentTempWeight,
    currentHamWeight,
    currentThermostat,
    currentHamiltonianFeed,
    currentJobRegistry,
    currentDisputeModule,
    currentValidationModule,
    currentPauser,
    currentMaxAGITypes,
    currentMaxTotalPayoutPct,
    currentAGITypes,
  ] = await Promise.all([
    stakeManager.minStake(),
    stakeManager.roleMinimumStake(0),
    stakeManager.roleMinimumStake(1),
    stakeManager.roleMinimumStake(2),
    stakeManager.feePct(),
    stakeManager.burnPct(),
    stakeManager.validatorRewardPct(),
    stakeManager.validatorSlashRewardPct(),
    stakeManager.employerSlashPct(),
    stakeManager.treasurySlashPct(),
    stakeManager.treasury(),
    stakeManager.feePool(),
    stakeManager.unbondingPeriod(),
    stakeManager.maxStakePerAddress(),
    stakeManager.autoStakeTuning(),
    stakeManager.stakeDisputeThreshold(),
    stakeManager.stakeIncreasePct(),
    stakeManager.stakeDecreasePct(),
    stakeManager.stakeTuneWindow(),
    stakeManager.minStakeFloor(),
    stakeManager.maxMinStake(),
    stakeManager.stakeTempThreshold(),
    stakeManager.stakeHamiltonianThreshold(),
    stakeManager.disputeWeight(),
    stakeManager.temperatureWeight(),
    stakeManager.hamiltonianWeight(),
    stakeManager.thermostat(),
    stakeManager.hamiltonianFeed(),
    stakeManager.jobRegistry(),
    stakeManager.disputeModule(),
    stakeManager.validationModule(),
    stakeManager.pauser(),
    stakeManager.maxAGITypes(),
    stakeManager.maxTotalPayoutPct(),
    stakeManager.getAGITypes(),
  ]);

  const currentAgiTypeCount = Array.isArray(currentAGITypes)
    ? currentAGITypes.length
    : Number((currentAGITypes as any)?.length ?? 0);

  const desiredMinStake = parseTokenAmount(
    config.minStake,
    config.minStakeTokens,
    decimals,
    'minStake'
  );

  const roleMinimums = config.roleMinimums ?? {};
  const desiredAgentRoleMin = parseTokenAmount(
    (roleMinimums as any).agent,
    (roleMinimums as any).agentTokens,
    decimals,
    'roleMinimums.agent'
  );
  const desiredValidatorRoleMin = parseTokenAmount(
    (roleMinimums as any).validator,
    (roleMinimums as any).validatorTokens,
    decimals,
    'roleMinimums.validator'
  );
  const desiredPlatformRoleMin = parseTokenAmount(
    (roleMinimums as any).platform,
    (roleMinimums as any).platformTokens,
    decimals,
    'roleMinimums.platform'
  );

  const formatRoleMinimums = (agent: bigint, validator: bigint, platform: bigint): string =>
    [
      `agent=${agent === 0n ? 'disabled' : formatToken(agent, decimals, symbol)}`,
      `validator=${validator === 0n ? 'disabled' : formatToken(validator, decimals, symbol)}`,
      `platform=${platform === 0n ? 'disabled' : formatToken(platform, decimals, symbol)}`,
    ].join(', ');
  const desiredMaxStake = parseTokenAmount(
    config.maxStakePerAddress,
    config.maxStakePerAddressTokens,
    decimals,
    'maxStakePerAddress'
  );
  const desiredFeePct = parsePercentage(config.feePct, 'feePct');
  const desiredBurnPct = parsePercentage(config.burnPct, 'burnPct');
  const desiredValidatorPct = parsePercentage(
    config.validatorRewardPct,
    'validatorRewardPct'
  );
  const desiredValidatorSlashPct = parsePercentage(
    config.validatorSlashRewardPct,
    'validatorSlashRewardPct'
  );
  const desiredEmployerSlashPct = parsePercentage(
    config.employerSlashPct,
    'employerSlashPct'
  );
  const desiredTreasurySlashPct = parsePercentage(
    config.treasurySlashPct,
    'treasurySlashPct'
  );
  const desiredUnbondingPeriod = parseBigInt(
    config.unbondingPeriodSeconds,
    'unbondingPeriodSeconds'
  );

  const recommendations = config.stakeRecommendations || {};
  const desiredRecMin = parseTokenAmount(
    recommendations.min,
    recommendations.minTokens,
    decimals,
    'stakeRecommendations.min'
  );
  const desiredRecMax = parseTokenAmount(
    recommendations.max,
    recommendations.maxTokens,
    decimals,
    'stakeRecommendations.max'
  );

  const autoConfig = config.autoStake || {};
  const desiredAutoEnabled = parseBoolean(
    autoConfig.enabled,
    'autoStake.enabled'
  );
  const desiredAutoThreshold = parseBigInt(
    autoConfig.threshold,
    'autoStake.threshold'
  );
  const desiredAutoIncrease = parsePercentage(
    autoConfig.increasePct,
    'autoStake.increasePct'
  );
  const desiredAutoDecrease = parsePercentage(
    autoConfig.decreasePct,
    'autoStake.decreasePct'
  );
  const desiredAutoWindow = parseBigInt(
    autoConfig.windowSeconds,
    'autoStake.windowSeconds'
  );
  const desiredAutoFloor = parseTokenAmount(
    autoConfig.floor,
    autoConfig.floorTokens,
    decimals,
    'autoStake.floor'
  );
  const desiredAutoCeil = parseTokenAmount(
    autoConfig.ceiling,
    autoConfig.ceilingTokens,
    decimals,
    'autoStake.ceiling'
  );
  const desiredTempThreshold = parseBigInt(
    autoConfig.temperatureThreshold,
    'autoStake.temperatureThreshold',
    { allowNegative: true }
  );
  const desiredHamThreshold = parseBigInt(
    autoConfig.hamiltonianThreshold,
    'autoStake.hamiltonianThreshold',
    { allowNegative: true }
  );
  const desiredDisputeWeight = parseBigInt(
    autoConfig.disputeWeight,
    'autoStake.disputeWeight'
  );
  const desiredTempWeight = parseBigInt(
    autoConfig.temperatureWeight,
    'autoStake.temperatureWeight'
  );
  const desiredHamWeight = parseBigInt(
    autoConfig.hamiltonianWeight,
    'autoStake.hamiltonianWeight'
  );

  const desiredTreasury = normaliseAddress(config.treasury);
  const desiredPauser = normaliseAddress(config.pauser);
  const desiredThermostat = normaliseAddress(config.thermostat);
  const desiredHamiltonianFeed = normaliseAddress(config.hamiltonianFeed);
  const desiredJobRegistry = normaliseAddress(config.jobRegistry, {
    allowZero: false,
  });
  const desiredDisputeModule = normaliseAddress(config.disputeModule, {
    allowZero: false,
  });
  const desiredValidationModule = normaliseAddress(config.validationModule, {
    allowZero: false,
  });
  const desiredFeePool = normaliseAddress(config.feePool, {
    allowZero: false,
  });
  const desiredMaxAGITypes =
    config.maxAGITypes !== undefined
      ? Number(config.maxAGITypes)
      : undefined;
  const desiredMaxTotalPayoutPct =
    config.maxTotalPayoutPct !== undefined
      ? Number(config.maxTotalPayoutPct)
      : undefined;

  const actions: PlannedAction[] = [];
  const percentageActions: Array<PlannedAction & { delta: number }> = [];

  const currentTreasuryAddress =
    currentTreasury === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTreasury);
  if (
    desiredTreasury !== undefined &&
    !sameAddress(desiredTreasury, currentTreasuryAddress)
  ) {
    if (
      desiredTreasury !== ethers.ZeroAddress &&
      sameAddress(desiredTreasury, ownerAddress)
    ) {
      throw new Error('Treasury cannot be set to the owner address');
    }
    actions.push({
      label: `Update treasury to ${desiredTreasury}`,
      method: 'setTreasury',
      args: [desiredTreasury],
      current: currentTreasuryAddress,
      desired: desiredTreasury,
      notes: [
        'Passing the zero address burns the treasury share of slashed stake.',
      ],
    });
  }

  const allowlist = config.treasuryAllowlist || {};
  const sortedAllowlist = Object.keys(allowlist).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const addr of sortedAllowlist) {
    const desired = Boolean(allowlist[addr]);
    const current = await stakeManager.treasuryAllowlist(addr);
    if (current !== desired) {
      actions.push({
        label: `${desired ? 'Allow' : 'Block'} treasury ${addr}`,
        method: 'setTreasuryAllowlist',
        args: [addr, desired],
        current: current ? 'allowed' : 'blocked',
        desired: desired ? 'allowed' : 'blocked',
      });
    }
  }

  const currentPauserAddress =
    currentPauser === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentPauser);
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

  if (
    desiredThermostat !== undefined &&
    !sameAddress(desiredThermostat, currentThermostat)
  ) {
    actions.push({
      label: `Update thermostat to ${desiredThermostat}`,
      method: 'setThermostat',
      args: [desiredThermostat],
      current: ethers.getAddress(currentThermostat),
      desired: desiredThermostat,
    });
  }

  if (
    desiredHamiltonianFeed !== undefined &&
    !sameAddress(desiredHamiltonianFeed, currentHamiltonianFeed)
  ) {
    actions.push({
      label: `Update Hamiltonian feed to ${desiredHamiltonianFeed}`,
      method: 'setHamiltonianFeed',
      args: [desiredHamiltonianFeed],
      current: ethers.getAddress(currentHamiltonianFeed),
      desired: desiredHamiltonianFeed,
    });
  }

  if (desiredJobRegistry) {
    await ensureModuleVersion(
      desiredJobRegistry,
      'contracts/v2/interfaces/IJobRegistry.sol:IJobRegistry',
      'JobRegistry'
    );
    const currentJobRegistryAddress =
      currentJobRegistry === ethers.ZeroAddress
        ? ethers.ZeroAddress
        : ethers.getAddress(currentJobRegistry);
    if (!sameAddress(desiredJobRegistry, currentJobRegistryAddress)) {
      actions.push({
        label: `Update JobRegistry to ${desiredJobRegistry}`,
        method: 'setJobRegistry',
        args: [desiredJobRegistry],
        current: currentJobRegistryAddress,
        desired: desiredJobRegistry,
      });
    }
  }

  if (desiredDisputeModule) {
    await ensureModuleVersion(
      desiredDisputeModule,
      'contracts/v2/interfaces/IDisputeModule.sol:IDisputeModule',
      'DisputeModule'
    );
    const currentDisputeModuleAddress =
      currentDisputeModule === ethers.ZeroAddress
        ? ethers.ZeroAddress
        : ethers.getAddress(currentDisputeModule);
    if (!sameAddress(desiredDisputeModule, currentDisputeModuleAddress)) {
      actions.push({
        label: `Update DisputeModule to ${desiredDisputeModule}`,
        method: 'setDisputeModule',
        args: [desiredDisputeModule],
        current: currentDisputeModuleAddress,
        desired: desiredDisputeModule,
      });
    }
  }

  if (desiredValidationModule) {
    await ensureModuleVersion(
      desiredValidationModule,
      'contracts/v2/interfaces/IValidationModule.sol:IValidationModule',
      'ValidationModule'
    );
    const currentValidationModuleAddress = ethers.getAddress(
      currentValidationModule
    );
    if (!sameAddress(desiredValidationModule, currentValidationModuleAddress)) {
      actions.push({
        label: `Update ValidationModule to ${desiredValidationModule}`,
        method: 'setValidationModule',
        args: [desiredValidationModule],
        current: currentValidationModuleAddress,
        desired: desiredValidationModule,
      });
    }
  }

  if (desiredFeePool) {
    await ensureModuleVersion(
      desiredFeePool,
      'contracts/v2/interfaces/IFeePool.sol:IFeePool',
      'FeePool'
    );
    const currentFeePoolAddress =
      currentFeePool === ethers.ZeroAddress
        ? ethers.ZeroAddress
        : ethers.getAddress(currentFeePool);
    if (!sameAddress(desiredFeePool, currentFeePoolAddress)) {
      actions.push({
        label: `Update FeePool to ${desiredFeePool}`,
        method: 'setFeePool',
        args: [desiredFeePool],
        current: currentFeePoolAddress,
        desired: desiredFeePool,
        notes: ['FeePool must expose version() == 2.'],
      });
    }
  }

  const currentMinStakeValue = currentMinStake as bigint;
  let minStakeHandledByRecommendations = false;
  const currentMaxStakeValue = currentMaxStakePerAddress as bigint;

  const recConfigured = desiredRecMin !== undefined || desiredRecMax !== undefined;
  if (recConfigured) {
    const targetMin = desiredRecMin ?? currentMinStakeValue;
    const targetMax = desiredRecMax ?? currentMaxStakeValue;
    if (targetMin <= 0n) {
      throw new Error('stakeRecommendations.min must be greater than zero');
    }
    if (targetMax !== 0n && targetMax < targetMin) {
      throw new Error('stakeRecommendations.max cannot be below min');
    }
    const hasChange =
      (desiredRecMin !== undefined && desiredRecMin !== currentMinStakeValue) ||
      (desiredRecMax !== undefined && desiredRecMax !== currentMaxStakeValue);
    if (hasChange) {
      actions.push({
        label: 'Update stake recommendations',
        method: 'setStakeRecommendations',
        args: [targetMin, targetMax],
        current: `min ${formatToken(currentMinStakeValue, decimals, symbol)}, max ${
          currentMaxStakeValue === 0n
            ? 'disabled'
            : formatToken(currentMaxStakeValue, decimals, symbol)
        }`,
        desired: `min ${formatToken(targetMin, decimals, symbol)}, max ${
          targetMax === 0n
            ? 'disabled'
            : formatToken(targetMax, decimals, symbol)
        }`,
      });
      if (desiredRecMin !== undefined) {
        minStakeHandledByRecommendations = true;
      }
    }
  }

  if (
    desiredMinStake !== undefined &&
    !minStakeHandledByRecommendations &&
    desiredMinStake !== currentMinStakeValue
  ) {
    if (desiredMinStake <= 0n) {
      throw new Error('minStake must be greater than zero');
    }
    actions.push({
      label: `Update minimum stake to ${formatToken(
        desiredMinStake,
        decimals,
        symbol
      )}`,
      method: 'setMinStake',
      args: [desiredMinStake],
      current: formatToken(currentMinStakeValue, decimals, symbol),
      desired: formatToken(desiredMinStake, decimals, symbol),
    });
  }

  const currentAgentRoleMinValue = currentAgentRoleMin as bigint;
  const currentValidatorRoleMinValue = currentValidatorRoleMin as bigint;
  const currentPlatformRoleMinValue = currentPlatformRoleMin as bigint;
  const roleMinimumsConfigured =
    desiredAgentRoleMin !== undefined ||
    desiredValidatorRoleMin !== undefined ||
    desiredPlatformRoleMin !== undefined;

  if (roleMinimumsConfigured) {
    const agentTarget = desiredAgentRoleMin ?? currentAgentRoleMinValue;
    const validatorTarget = desiredValidatorRoleMin ?? currentValidatorRoleMinValue;
    const platformTarget = desiredPlatformRoleMin ?? currentPlatformRoleMinValue;
    const hasRoleChange =
      agentTarget !== currentAgentRoleMinValue ||
      validatorTarget !== currentValidatorRoleMinValue ||
      platformTarget !== currentPlatformRoleMinValue;

    if (hasRoleChange) {
      actions.push({
        label: 'Update role minimum stakes',
        method: 'setRoleMinimums',
        args: [agentTarget, validatorTarget, platformTarget],
        current: formatRoleMinimums(
          currentAgentRoleMinValue,
          currentValidatorRoleMinValue,
          currentPlatformRoleMinValue
        ),
        desired: formatRoleMinimums(agentTarget, validatorTarget, platformTarget),
      });
    }
  }

  if (
    desiredMaxStake !== undefined &&
    desiredMaxStake !== currentMaxStakeValue
  ) {
    if (desiredMaxStake !== 0n && desiredMaxStake < currentMinStakeValue) {
      throw new Error('maxStakePerAddress cannot be below the current minimum stake');
    }
    actions.push({
      label: `Update max stake per address to ${
        desiredMaxStake === 0n
          ? 'disabled'
          : formatToken(desiredMaxStake, decimals, symbol)
      }`,
      method: 'setMaxStakePerAddress',
      args: [desiredMaxStake],
      current:
        currentMaxStakeValue === 0n
          ? 'disabled'
          : formatToken(currentMaxStakeValue, decimals, symbol),
      desired:
        desiredMaxStake === 0n
          ? 'disabled'
          : formatToken(desiredMaxStake, decimals, symbol),
    });
  }

  const currentFee = Number(currentFeePct);
  const currentBurn = Number(currentBurnPct);
  const currentValidator = Number(currentValidatorRewardPct);
  const targetFee = desiredFeePct ?? currentFee;
  const targetBurn = desiredBurnPct ?? currentBurn;
  const targetValidator = desiredValidatorPct ?? currentValidator;

  if (targetFee + targetBurn + targetValidator > 100) {
    throw new Error('feePct + burnPct + validatorRewardPct cannot exceed 100');
  }

  if (desiredFeePct !== undefined && desiredFeePct !== currentFee) {
    percentageActions.push({
      label: `Update protocol fee percentage to ${desiredFeePct}%`,
      method: 'setFeePct',
      args: [desiredFeePct],
      current: `${currentFee}%`,
      desired: `${desiredFeePct}%`,
      delta: desiredFeePct - currentFee,
    });
  }

  if (desiredBurnPct !== undefined && desiredBurnPct !== currentBurn) {
    percentageActions.push({
      label: `Update burn percentage to ${desiredBurnPct}%`,
      method: 'setBurnPct',
      args: [desiredBurnPct],
      current: `${currentBurn}%`,
      desired: `${desiredBurnPct}%`,
      delta: desiredBurnPct - currentBurn,
    });
  }

  if (
    desiredValidatorPct !== undefined &&
    desiredValidatorPct !== currentValidator
  ) {
    percentageActions.push({
      label: `Update validator reward percentage to ${desiredValidatorPct}%`,
      method: 'setValidatorRewardPct',
      args: [desiredValidatorPct],
      current: `${currentValidator}%`,
      desired: `${desiredValidatorPct}%`,
      delta: desiredValidatorPct - currentValidator,
    });
  }

  percentageActions.sort((a, b) => a.delta - b.delta);
  actions.push(...percentageActions);

  if (
    desiredEmployerSlashPct !== undefined ||
    desiredTreasurySlashPct !== undefined ||
    desiredValidatorSlashPct !== undefined
  ) {
    const employerTarget = desiredEmployerSlashPct ?? Number(currentEmployerSlashPct);
    const treasuryTarget = desiredTreasurySlashPct ?? Number(currentTreasurySlashPct);
    const validatorTarget = desiredValidatorSlashPct ?? Number(currentValidatorSlashPct);
    if (employerTarget + treasuryTarget + validatorTarget > 100) {
      throw new Error(
        'employerSlashPct + treasurySlashPct + validatorSlashRewardPct cannot exceed 100'
      );
    }
    const currentEmployer = Number(currentEmployerSlashPct);
    const currentTreasuryPct = Number(currentTreasurySlashPct);
    const currentValidatorSlash = Number(currentValidatorSlashPct);
    if (
      employerTarget !== currentEmployer ||
      treasuryTarget !== currentTreasuryPct ||
      validatorTarget !== currentValidatorSlash
    ) {
      actions.push({
        label:
          `Update slashing distribution (employer ${employerTarget}%, treasury ${treasuryTarget}%, validators ${validatorTarget}%)`,
        method: 'setSlashingDistribution',
        args: [employerTarget, treasuryTarget, validatorTarget],
        current: `employer ${currentEmployer}%, treasury ${currentTreasuryPct}%, validators ${currentValidatorSlash}%`,
        desired: `employer ${employerTarget}%, treasury ${treasuryTarget}%, validators ${validatorTarget}%`,
        notes: ['Distribution percentages must sum to 100 or less.'],
      });
    }
  }

  if (
    desiredUnbondingPeriod !== undefined &&
    desiredUnbondingPeriod !== (currentUnbondingPeriod as bigint)
  ) {
    if (desiredUnbondingPeriod <= 0n) {
      throw new Error('unbondingPeriodSeconds must be greater than zero');
    }
    actions.push({
      label: `Update unbonding period to ${desiredUnbondingPeriod.toString()} seconds`,
      method: 'setUnbondingPeriod',
      args: [desiredUnbondingPeriod],
      current: `${(currentUnbondingPeriod as bigint).toString()} seconds`,
      desired: `${desiredUnbondingPeriod.toString()} seconds`,
    });
  }

  const currentAutoEnabled = Boolean(currentAutoStakeEnabled);
  if (
    desiredAutoEnabled !== undefined &&
    desiredAutoEnabled !== currentAutoEnabled
  ) {
    actions.push({
      label: `${desiredAutoEnabled ? 'Enable' : 'Disable'} automatic stake tuning`,
      method: 'autoTuneStakes',
      args: [desiredAutoEnabled],
      current: currentAutoEnabled ? 'enabled' : 'disabled',
      desired: desiredAutoEnabled ? 'enabled' : 'disabled',
    });
  }

  const autoTargets = {
    threshold: desiredAutoThreshold ?? (currentDisputeThreshold as bigint),
    increase: desiredAutoIncrease ?? Number(currentIncreasePct),
    decrease: desiredAutoDecrease ?? Number(currentDecreasePct),
    window: desiredAutoWindow ?? (currentWindow as bigint),
    floor: desiredAutoFloor ?? (currentFloor as bigint),
    ceil: desiredAutoCeil ?? (currentMaxMinStake as bigint),
    tempThreshold: desiredTempThreshold ?? (currentTempThreshold as bigint),
    hamThreshold: desiredHamThreshold ?? (currentHamThreshold as bigint),
    disputeWeight: desiredDisputeWeight ?? (currentDisputeWeight as bigint),
    tempWeight: desiredTempWeight ?? (currentTempWeight as bigint),
    hamWeight: desiredHamWeight ?? (currentHamWeight as bigint),
  };

  if (autoTargets.increase < 0 || autoTargets.increase > 100) {
    throw new Error('autoStake.increasePct must be between 0 and 100');
  }
  if (autoTargets.decrease < 0 || autoTargets.decrease > 100) {
    throw new Error('autoStake.decreasePct must be between 0 and 100');
  }

  const autoChanged =
    (desiredAutoThreshold !== undefined &&
      desiredAutoThreshold !== (currentDisputeThreshold as bigint)) ||
    (desiredAutoIncrease !== undefined &&
      desiredAutoIncrease !== Number(currentIncreasePct)) ||
    (desiredAutoDecrease !== undefined &&
      desiredAutoDecrease !== Number(currentDecreasePct)) ||
    (desiredAutoWindow !== undefined &&
      desiredAutoWindow !== (currentWindow as bigint)) ||
    (desiredAutoFloor !== undefined &&
      desiredAutoFloor !== (currentFloor as bigint)) ||
    (desiredAutoCeil !== undefined &&
      desiredAutoCeil !== (currentMaxMinStake as bigint)) ||
    (desiredTempThreshold !== undefined &&
      desiredTempThreshold !== (currentTempThreshold as bigint)) ||
    (desiredHamThreshold !== undefined &&
      desiredHamThreshold !== (currentHamThreshold as bigint)) ||
    (desiredDisputeWeight !== undefined &&
      desiredDisputeWeight !== (currentDisputeWeight as bigint)) ||
    (desiredTempWeight !== undefined &&
      desiredTempWeight !== (currentTempWeight as bigint)) ||
    (desiredHamWeight !== undefined &&
      desiredHamWeight !== (currentHamWeight as bigint));

  if (autoChanged) {
    actions.push({
      label: 'Update automatic stake tuning parameters',
      method: 'configureAutoStake',
      args: [
        autoTargets.threshold,
        autoTargets.increase,
        autoTargets.decrease,
        autoTargets.window,
        autoTargets.floor,
        autoTargets.ceil,
        autoTargets.tempThreshold,
        autoTargets.hamThreshold,
        autoTargets.disputeWeight,
        autoTargets.tempWeight,
        autoTargets.hamWeight,
      ],
      notes: [
        'Floor values of 0 keep the current minimum stake floor.',
        'Ceiling of 0 disables the cap.',
      ],
    });
  }

  if (desiredMaxAGITypes !== undefined) {
    if (!Number.isInteger(desiredMaxAGITypes) || desiredMaxAGITypes <= 0) {
      throw new Error('maxAGITypes must be a positive integer');
    }
    if (desiredMaxAGITypes > MAX_AGI_TYPES_CAP) {
      throw new Error(`maxAGITypes cannot exceed ${MAX_AGI_TYPES_CAP}`);
    }
    if (desiredMaxAGITypes < currentAgiTypeCount) {
      throw new Error(
        `maxAGITypes cannot be below the current AGI type count (${currentAgiTypeCount})`
      );
    }
    const currentMaxAgi = Number(currentMaxAGITypes);
    if (desiredMaxAGITypes !== currentMaxAgi) {
      actions.push({
        label: `Update max AGI types to ${desiredMaxAGITypes}`,
        method: 'setMaxAGITypes',
        args: [desiredMaxAGITypes],
        current: currentMaxAgi.toString(),
        desired: desiredMaxAGITypes.toString(),
      });
    }
  }

  if (desiredMaxTotalPayoutPct !== undefined) {
    if (!Number.isInteger(desiredMaxTotalPayoutPct)) {
      throw new Error('maxTotalPayoutPct must be an integer');
    }
    if (
      desiredMaxTotalPayoutPct < 100 ||
      desiredMaxTotalPayoutPct > MAX_PAYOUT_PCT
    ) {
      throw new Error(
        `maxTotalPayoutPct must be between 100 and ${MAX_PAYOUT_PCT}`
      );
    }
    const currentMaxTotal = Number(currentMaxTotalPayoutPct);
    if (desiredMaxTotalPayoutPct !== currentMaxTotal) {
      actions.push({
        label: `Update max total payout percentage to ${desiredMaxTotalPayoutPct}%`,
        method: 'setMaxTotalPayoutPct',
        args: [desiredMaxTotalPayoutPct],
        current: `${currentMaxTotal}%`,
        desired: `${desiredMaxTotalPayoutPct}%`,
      });
    }
  }

  return {
    module: 'StakeManager',
    address: stakeManager.target as string,
    actions,
    configPath,
    iface: stakeManager.interface,
    contract: stakeManager,
  };
}

export function renderStakeManagerPlan(plan: ModulePlan): string {
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
