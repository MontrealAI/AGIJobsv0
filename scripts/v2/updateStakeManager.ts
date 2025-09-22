import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadTokenConfig, loadStakeManagerConfig } from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  stakeManagerAddress?: string;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  current?: string;
  desired?: string;
  notes?: string[];
}

const MAX_AGI_TYPES_CAP = 50;
const MAX_PAYOUT_PCT = 200;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--config requires a file path');
      }
      options.configPath = value;
      i += 1;
    } else if (arg === '--stake-manager' || arg === '--stakeManager') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--stake-manager requires an address');
      }
      options.stakeManagerAddress = value;
      i += 1;
    }
  }
  return options;
}

function parseTokenValue(
  baseValue: unknown,
  tokensValue: unknown,
  decimals: number,
  label: string
): bigint | undefined {
  if (baseValue !== undefined && baseValue !== null) {
    const asString =
      typeof baseValue === 'string' ? baseValue.trim() : String(baseValue);
    if (!asString) {
      return undefined;
    }
    if (!/^[-+]?\d+$/.test(asString)) {
      throw new Error(`${label} must be an integer`);
    }
    const parsed = BigInt(asString);
    if (parsed < 0n) {
      throw new Error(`${label} cannot be negative`);
    }
    return parsed;
  }
  if (tokensValue !== undefined && tokensValue !== null) {
    const asString =
      typeof tokensValue === 'string'
        ? tokensValue.trim()
        : String(tokensValue);
    if (!asString) {
      return undefined;
    }
    const parsed = ethers.parseUnits(asString, decimals);
    if (parsed < 0n) {
      throw new Error(`${label}Tokens cannot be negative`);
    }
    return parsed;
  }
  return undefined;
}

function parseInteger(value: unknown, label: string): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!asString) {
    return undefined;
  }
  if (!/^[-+]?\d+$/.test(asString)) {
    throw new Error(`${label} must be an integer`);
  }
  const parsed = BigInt(asString);
  if (parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

function parseSignedInteger(value: unknown, label: string): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!asString) {
    return undefined;
  }
  if (!/^[-+]?\d+$/.test(asString)) {
    throw new Error(`${label} must be an integer`);
  }
  return BigInt(asString);
}

function parsePercentage(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be an integer between 0 and 100`);
  }
  if (numberValue < 0 || numberValue > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return numberValue;
}

function parseBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const asString = String(value).trim().toLowerCase();
  if (!asString) {
    return undefined;
  }
  if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(asString)) {
    return true;
  }
  if (
    ['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(asString)
  ) {
    return false;
  }
  throw new Error(`${label} must be a boolean value`);
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function formatToken(value: bigint, decimals: number, symbol: string): string {
  return `${ethers.formatUnits(value, decimals)} ${symbol}`.trim();
}

function describeArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') {
        return arg.toString();
      }
      if (typeof arg === 'string') {
        return arg;
      }
      if (typeof arg === 'boolean') {
        return arg ? 'true' : 'false';
      }
      return JSON.stringify(arg);
    })
    .join(', ');
}

async function ensureModuleVersion(
  address: string,
  artifact: string,
  label: string
): Promise<void> {
  const contract = await ethers.getContractAt(artifact, address);
  const version = await contract.version();
  if (version !== 2n) {
    throw new Error(
      `${label} at ${address} reports version ${version}, expected 2`
    );
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const { config: stakeConfig, path: stakeConfigPath } = loadStakeManagerConfig(
    {
      network: network.name,
      chainId: network.config?.chainId,
      path: cli.configPath,
    }
  );

  const decimals =
    typeof tokenConfig.decimals === 'number' ? tokenConfig.decimals : 18;
  const symbol =
    typeof tokenConfig.symbol === 'string' && tokenConfig.symbol
      ? tokenConfig.symbol
      : 'tokens';

  const stakeManagerCandidate =
    cli.stakeManagerAddress || tokenConfig.modules?.stakeManager;
  if (!stakeManagerCandidate) {
    throw new Error('Stake manager address is not configured');
  }
  const stakeManagerAddress = ethers.getAddress(stakeManagerCandidate);
  if (stakeManagerAddress === ethers.ZeroAddress) {
    throw new Error('Stake manager address cannot be the zero address');
  }

  const stakeManager = (await ethers.getContractAt(
    'contracts/v2/StakeManager.sol:StakeManager',
    stakeManagerAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const ownerAddress = await stakeManager.owner();
  const signerAddress = await signer.getAddress();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${ownerAddress}. ` +
        'Running in dry-run mode.'
    );
  }

  const [
    currentMinStake,
    currentFeePct,
    currentBurnPct,
    currentValidatorRewardPct,
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
    stakeManager.feePct(),
    stakeManager.burnPct(),
    stakeManager.validatorRewardPct(),
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

  const desiredMinStake = parseTokenValue(
    stakeConfig.minStake,
    stakeConfig.minStakeTokens,
    decimals,
    'minStake'
  );
  const desiredMaxStake = parseTokenValue(
    stakeConfig.maxStakePerAddress,
    stakeConfig.maxStakePerAddressTokens,
    decimals,
    'maxStakePerAddress'
  );
  const desiredFeePct = parsePercentage(stakeConfig.feePct, 'feePct');
  const desiredBurnPct = parsePercentage(stakeConfig.burnPct, 'burnPct');
  const desiredValidatorPct = parsePercentage(
    stakeConfig.validatorRewardPct,
    'validatorRewardPct'
  );
  const desiredEmployerSlashPct = parsePercentage(
    stakeConfig.employerSlashPct,
    'employerSlashPct'
  );
  const desiredTreasurySlashPct = parsePercentage(
    stakeConfig.treasurySlashPct,
    'treasurySlashPct'
  );
  const desiredUnbondingPeriod = parseInteger(
    stakeConfig.unbondingPeriodSeconds,
    'unbondingPeriodSeconds'
  );

  const recommendations = (stakeConfig.stakeRecommendations || {}) as Record<
    string,
    unknown
  >;
  const desiredRecMin = parseTokenValue(
    recommendations.min,
    recommendations.minTokens,
    decimals,
    'stakeRecommendations.min'
  );
  const desiredRecMax = parseTokenValue(
    recommendations.max,
    recommendations.maxTokens,
    decimals,
    'stakeRecommendations.max'
  );

  const autoConfig = (stakeConfig.autoStake || {}) as Record<string, unknown>;
  const desiredAutoEnabled = parseBoolean(
    autoConfig.enabled,
    'autoStake.enabled'
  );
  const desiredAutoThreshold = parseInteger(
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
  const desiredAutoWindow = parseInteger(
    autoConfig.windowSeconds,
    'autoStake.windowSeconds'
  );
  const desiredAutoFloor = parseTokenValue(
    autoConfig.floor,
    autoConfig.floorTokens,
    decimals,
    'autoStake.floor'
  );
  const desiredAutoCeil = parseTokenValue(
    autoConfig.ceiling,
    autoConfig.ceilingTokens,
    decimals,
    'autoStake.ceiling'
  );
  const desiredTempThreshold = parseSignedInteger(
    autoConfig.temperatureThreshold,
    'autoStake.temperatureThreshold'
  );
  const desiredHamThreshold = parseSignedInteger(
    autoConfig.hamiltonianThreshold,
    'autoStake.hamiltonianThreshold'
  );
  const desiredDisputeWeight = parseInteger(
    autoConfig.disputeWeight,
    'autoStake.disputeWeight'
  );
  const desiredTempWeight = parseInteger(
    autoConfig.temperatureWeight,
    'autoStake.temperatureWeight'
  );
  const desiredHamWeight = parseInteger(
    autoConfig.hamiltonianWeight,
    'autoStake.hamiltonianWeight'
  );

  const desiredTreasury =
    stakeConfig.treasury !== undefined
      ? ethers.getAddress(stakeConfig.treasury as string)
      : undefined;
  const desiredPauser =
    stakeConfig.pauser !== undefined
      ? ethers.getAddress(stakeConfig.pauser as string)
      : undefined;
  const desiredThermostat =
    stakeConfig.thermostat !== undefined
      ? ethers.getAddress(stakeConfig.thermostat as string)
      : undefined;
  const desiredHamiltonianFeed =
    stakeConfig.hamiltonianFeed !== undefined
      ? ethers.getAddress(stakeConfig.hamiltonianFeed as string)
      : undefined;
  const desiredJobRegistry =
    stakeConfig.jobRegistry !== undefined &&
    stakeConfig.jobRegistry !== ethers.ZeroAddress
      ? ethers.getAddress(stakeConfig.jobRegistry as string)
      : undefined;
  const desiredDisputeModule =
    stakeConfig.disputeModule !== undefined &&
    stakeConfig.disputeModule !== ethers.ZeroAddress
      ? ethers.getAddress(stakeConfig.disputeModule as string)
      : undefined;
  const desiredValidationModule =
    stakeConfig.validationModule !== undefined &&
    stakeConfig.validationModule !== ethers.ZeroAddress
      ? ethers.getAddress(stakeConfig.validationModule as string)
      : undefined;
  const desiredFeePool =
    stakeConfig.feePool !== undefined &&
    stakeConfig.feePool !== ethers.ZeroAddress
      ? ethers.getAddress(stakeConfig.feePool as string)
      : undefined;

  const desiredMaxAGITypes =
    stakeConfig.maxAGITypes !== undefined
      ? Number(stakeConfig.maxAGITypes)
      : undefined;
  const desiredMaxTotalPayoutPct =
    stakeConfig.maxTotalPayoutPct !== undefined
      ? Number(stakeConfig.maxTotalPayoutPct)
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

  const allowlist = (stakeConfig.treasuryAllowlist || {}) as Record<
    string,
    boolean
  >;
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
  const recConfigured =
    desiredRecMin !== undefined || desiredRecMax !== undefined;
  if (recConfigured) {
    const targetMin = desiredRecMin ?? currentMinStakeValue;
    const targetMax = desiredRecMax ?? currentMaxStakeValue;
    if (targetMin <= 0n) {
      throw new Error('stakeRecommendations.min must be greater than zero');
    }
    if (targetMax !== 0n && targetMax < targetMin) {
      throw new Error('stakeRecommendations.max cannot be below min');
    }
    if (
      targetMin !== currentMinStakeValue ||
      targetMax !== currentMaxStakeValue
    ) {
      actions.push({
        label: `Set stake recommendations to min ${formatToken(
          targetMin,
          decimals,
          symbol
        )}, max ${
          targetMax === 0n
            ? 'disabled'
            : formatToken(targetMax, decimals, symbol)
        }`,
        method: 'setStakeRecommendations',
        args: [targetMin, targetMax],
        current: `min ${formatToken(
          currentMinStakeValue,
          decimals,
          symbol
        )}, max ${
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

  if (
    desiredMaxStake !== undefined &&
    desiredMaxStake !== currentMaxStakeValue
  ) {
    if (desiredMaxStake !== 0n && desiredMaxStake < currentMinStakeValue) {
      throw new Error(
        'maxStakePerAddress cannot be below the current minimum stake'
      );
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
    desiredTreasurySlashPct !== undefined
  ) {
    const employerTarget =
      desiredEmployerSlashPct ?? Number(currentEmployerSlashPct);
    const treasuryTarget =
      desiredTreasurySlashPct ?? Number(currentTreasurySlashPct);
    if (employerTarget + treasuryTarget > 100) {
      throw new Error('employerSlashPct + treasurySlashPct cannot exceed 100');
    }
    const currentEmployer = Number(currentEmployerSlashPct);
    const currentTreasuryPct = Number(currentTreasurySlashPct);
    if (
      employerTarget !== currentEmployer ||
      treasuryTarget !== currentTreasuryPct
    ) {
      actions.push({
        label: `Update slashing percentages (employer ${employerTarget}%, treasury ${treasuryTarget}%)`,
        method: 'setSlashingPercentages',
        args: [employerTarget, treasuryTarget],
        current: `employer ${currentEmployer}%, treasury ${currentTreasuryPct}%`,
        desired: `employer ${employerTarget}%, treasury ${treasuryTarget}%`,
        notes: ['Employer + treasury percentages must not exceed 100%.'],
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
      label: `${
        desiredAutoEnabled ? 'Enable' : 'Disable'
      } automatic stake tuning`,
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

  console.log('StakeManager:', stakeManagerAddress);
  console.log('Configuration file:', stakeConfigPath);

  if (actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }

  console.log(`Planned actions (${actions.length}):`);
  const iface = stakeManager.interface;
  actions.forEach((action, index) => {
    const data = iface.encodeFunctionData(action.method, action.args);
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    if (action.notes) {
      for (const note of action.notes) {
        console.log(`   Note: ${note}`);
      }
    }
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    console.log(`   Calldata: ${data}`);
  });

  if (!cli.execute || !sameAddress(ownerAddress, signerAddress)) {
    console.log(
      '\nDry run complete. Re-run with --execute once ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (stakeManager as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    console.log('   Confirmed');
  }
  console.log('All transactions confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
