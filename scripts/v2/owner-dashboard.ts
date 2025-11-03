import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadJobRegistryConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadRandaoCoordinatorConfig,
  loadIdentityRegistryConfig,
  loadRewardEngineConfig,
  loadThermodynamicsConfig,
  loadDeploymentPlan,
  inferNetworkKey,
} from '../config';
import type { Contract } from 'ethers';

type CliOptions = {
  json: boolean;
  configNetwork?: string;
};

type ModuleMetric = {
  label: string;
  value: string | number | boolean | null;
};

type ModuleSummary = {
  key: string;
  name: string;
  address: string | null;
  metrics: ModuleMetric[];
};

const ADDRESS_BOOK = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'deployment-addresses.json'
);

const ROLE_LABELS = ['Agent', 'Validator', 'Operator', 'Employer'] as const;

function parseBooleanEnv(value?: string | null): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
    return false;
  }
  return undefined;
}

function formatUnitsRounded(
  value: bigint,
  decimals: number,
  precision = 4
): string {
  const raw = ethers.formatUnits(value, decimals);
  const hasSign = raw.startsWith('-');
  const unsigned = hasSign ? raw.slice(1) : raw;
  if (!unsigned.includes('.')) {
    return raw;
  }
  const [intPartRaw, fracPartRaw = ''] = unsigned.split('.');
  const intPart = intPartRaw.length === 0 ? '0' : intPartRaw;
  const trimmedFrac = fracPartRaw.slice(0, precision).replace(/0+$/, '');
  const prefix = hasSign ? '-' : '';
  if (trimmedFrac.length === 0) {
    return `${prefix}${intPart}`;
  }
  return `${prefix}${intPart}.${trimmedFrac}`;
}

function formatPercentageWad(value: bigint | null): string | null {
  if (value === null) return null;
  return `${formatUnitsRounded(value, 16)}%`;
}

function formatWad(value: bigint | null, suffix = ''): string | null {
  if (value === null) return null;
  const formatted = formatUnitsRounded(value, 18);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function formatTokenAmount(
  value: bigint | null,
  symbol = 'AGIALPHA',
  decimals = 18
): string | null {
  if (value === null) return null;
  return `${formatUnitsRounded(value, decimals)} ${symbol}`;
}

async function resolveTokenMetadata(
  tokenAddress: string | null
): Promise<{ symbol: string; decimals: number }> {
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return { symbol: 'AGIALPHA', decimals: 18 };
  }

  const contract = new ethers.Contract(
    tokenAddress,
    ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
    ethers.provider
  );

  let symbol = 'AGIALPHA';
  let decimals = 18;

  try {
    const resolved = await contract.symbol();
    if (typeof resolved === 'string' && resolved.length > 0) {
      symbol = resolved;
    }
  } catch (_) {
    // ignore missing symbol metadata
  }

  try {
    const resolved = await contract.decimals();
    const parsed = Number(resolved);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 255) {
      decimals = parsed;
    }
  } catch (_) {
    // ignore missing decimals metadata
  }

  return { symbol, decimals };
}

function formatDurationSeconds(value: bigint | null): string | null {
  if (value === null) return null;
  const secondsNumber = Number(value);
  if (!Number.isFinite(secondsNumber)) {
    return `${value.toString()}s`;
  }
  if (secondsNumber === 0) {
    return '0s';
  }
  const parts: string[] = [];
  const days = Math.floor(secondsNumber / 86400);
  const hours = Math.floor((secondsNumber % 86400) / 3600);
  const minutes = Math.floor((secondsNumber % 3600) / 60);
  const seconds = secondsNumber % 60;
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && parts.length < 2) parts.push(`${seconds}s`);
  const summary = parts.length > 0 ? parts.join(' ') : `${secondsNumber}s`;
  return `${summary} (${secondsNumber}s)`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  let jsonSetByCli = false;
  let configNetworkSetByCli = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
      jsonSetByCli = true;
    } else if (arg === '--config-network' || arg === '--network-config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      options.configNetwork = value;
      i += 1;
      configNetworkSetByCli = true;
    }
  }

  const envJson = parseBooleanEnv(process.env.OWNER_DASHBOARD_JSON);
  if (!jsonSetByCli && envJson !== undefined) {
    options.json = envJson;
  }

  if (!configNetworkSetByCli && process.env.OWNER_DASHBOARD_CONFIG_NETWORK) {
    options.configNetwork = process.env.OWNER_DASHBOARD_CONFIG_NETWORK.trim();
  }

  return options;
}

async function readAddressBook(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(ADDRESS_BOOK, 'utf8');
    return JSON.parse(raw);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function normaliseAddress(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const address = ethers.getAddress(value);
    return address === ethers.ZeroAddress ? null : address;
  } catch (_) {
    return null;
  }
}

async function resolveOwner(contract: Contract): Promise<string | null> {
  for (const method of ['owner', 'governance']) {
    try {
      const value = await contract[method]();
      if (typeof value === 'string') {
        return ethers.getAddress(value);
      }
    } catch (_) {
      // ignore missing methods
    }
  }
  return null;
}

async function callBigInt(
  contract: Contract,
  method: string
): Promise<bigint | null> {
  try {
    const value = await contract[method]();
    if (typeof value === 'bigint') {
      return value;
    }
    if (value && typeof value === 'object' && 'toBigInt' in value) {
      return (value as { toBigInt: () => bigint }).toBigInt();
    }
    if (typeof value === 'number') {
      return BigInt(value);
    }
    if (typeof value === 'string') {
      return BigInt(value);
    }
  } catch (_) {
    // ignore
  }
  return null;
}

async function callString(
  contract: Contract,
  method: string
): Promise<string | null> {
  try {
    const value = await contract[method]();
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
  } catch (_) {
    // ignore
  }
  return null;
}

async function callBoolean(
  contract: Contract,
  method: string
): Promise<boolean | null> {
  try {
    const value = await contract[method]();
    if (typeof value === 'boolean') {
      return value;
    }
  } catch (_) {
    // ignore
  }
  return null;
}

async function collectStakeManagerSummary(
  address: string
): Promise<ModuleSummary> {
  const stakeManager = await ethers.getContractAt('StakeManager', address);
  const [
    ownerAddress,
    feePctRaw,
    burnPctRaw,
    minStakeRaw,
    treasury,
    jobRegistry,
    validationModule,
    disputeModule,
    autoStakeTuning,
    pauser,
  ] = await Promise.all([
    resolveOwner(stakeManager),
    callBigInt(stakeManager, 'feePct'),
    callBigInt(stakeManager, 'burnPct'),
    callBigInt(stakeManager, 'minStake'),
    callString(stakeManager, 'treasury'),
    callString(stakeManager, 'jobRegistry'),
    callString(stakeManager, 'validationModule'),
    callString(stakeManager, 'disputeModule'),
    (async () => {
      try {
        return Boolean(await stakeManager.autoStakeTuning());
      } catch (_) {
        return false;
      }
    })(),
    callString(stakeManager, 'pauser'),
  ]);

  return {
    key: 'stakeManager',
    name: 'StakeManager',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      { label: 'Fee %', value: feePctRaw !== null ? Number(feePctRaw) : null },
      {
        label: 'Burn %',
        value: burnPctRaw !== null ? Number(burnPctRaw) : null,
      },
      {
        label: 'Minimum Stake',
        value:
          minStakeRaw !== null
            ? `${ethers.formatUnits(minStakeRaw, 18)} AGIALPHA`
            : null,
      },
      { label: 'Treasury', value: normaliseAddress(treasury) },
      { label: 'JobRegistry', value: normaliseAddress(jobRegistry) },
      {
        label: 'ValidationModule',
        value: normaliseAddress(validationModule),
      },
      { label: 'DisputeModule', value: normaliseAddress(disputeModule) },
      { label: 'Auto Stake Tuning', value: autoStakeTuning },
      { label: 'Pauser', value: normaliseAddress(pauser) },
    ],
  };
}

async function collectFeePoolSummary(address: string): Promise<ModuleSummary> {
  const feePool = await ethers.getContractAt('FeePool', address);
  const [
    ownerAddress,
    governance,
    burnPctRaw,
    treasury,
    stakeManager,
    taxPolicy,
    pauser,
  ] = await Promise.all([
    resolveOwner(feePool),
    callString(feePool, 'governance'),
    callBigInt(feePool, 'burnPct'),
    callString(feePool, 'treasury'),
    callString(feePool, 'stakeManager'),
    callString(feePool, 'taxPolicy'),
    callString(feePool, 'pauser'),
  ]);

  return {
    key: 'feePool',
    name: 'FeePool',
    address,
    metrics: [
      { label: 'Owner', value: ownerAddress },
      { label: 'Governance', value: normaliseAddress(governance) },
      {
        label: 'Burn %',
        value: burnPctRaw !== null ? Number(burnPctRaw) : null,
      },
      { label: 'Treasury', value: normaliseAddress(treasury) },
      { label: 'StakeManager', value: normaliseAddress(stakeManager) },
      { label: 'TaxPolicy', value: normaliseAddress(taxPolicy) },
      { label: 'Pauser', value: normaliseAddress(pauser) },
    ],
  };
}

async function collectTaxPolicySummary(
  address: string
): Promise<ModuleSummary> {
  const taxPolicy = await ethers.getContractAt('TaxPolicy', address);
  const [ownerAddress, treasury, burnAddress] = await Promise.all([
    resolveOwner(taxPolicy),
    callString(taxPolicy, 'treasury'),
    callString(taxPolicy, 'burnAddress'),
  ]);

  return {
    key: 'taxPolicy',
    name: 'TaxPolicy',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      { label: 'Treasury', value: normaliseAddress(treasury) },
      { label: 'Burn Address', value: normaliseAddress(burnAddress) },
    ],
  };
}

async function collectJobRegistrySummary(
  address: string
): Promise<ModuleSummary> {
  const jobRegistry = await ethers.getContractAt('JobRegistry', address);
  const [ownerAddress, feePool, stakeManager, validationModule, taxPolicy] =
    await Promise.all([
      resolveOwner(jobRegistry),
      callString(jobRegistry, 'feePool'),
      callString(jobRegistry, 'stakeManager'),
      callString(jobRegistry, 'validationModule'),
      callString(jobRegistry, 'taxPolicy'),
    ]);

  return {
    key: 'jobRegistry',
    name: 'JobRegistry',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      { label: 'FeePool', value: normaliseAddress(feePool) },
      { label: 'StakeManager', value: normaliseAddress(stakeManager) },
      { label: 'ValidationModule', value: normaliseAddress(validationModule) },
      { label: 'TaxPolicy', value: normaliseAddress(taxPolicy) },
    ],
  };
}

async function collectValidationModuleSummary(
  address: string
): Promise<ModuleSummary> {
  const validationModule = await ethers.getContractAt(
    'ValidationModule',
    address
  );
  const [ownerAddress, reputationEngine, committee] = await Promise.all([
    resolveOwner(validationModule),
    callString(validationModule, 'reputationEngine'),
    callString(validationModule, 'committee'),
  ]);

  return {
    key: 'validationModule',
    name: 'ValidationModule',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      {
        label: 'ReputationEngine',
        value: normaliseAddress(reputationEngine),
      },
      { label: 'Committee', value: normaliseAddress(committee) },
    ],
  };
}

async function collectPlatformRegistrySummary(
  address: string
): Promise<ModuleSummary> {
  const platformRegistry = await ethers.getContractAt(
    'PlatformRegistry',
    address
  );
  const [ownerAddress, incentives, feePool] = await Promise.all([
    resolveOwner(platformRegistry),
    callString(platformRegistry, 'platformIncentives'),
    callString(platformRegistry, 'feePool'),
  ]);

  return {
    key: 'platformRegistry',
    name: 'PlatformRegistry',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      {
        label: 'PlatformIncentives',
        value: normaliseAddress(incentives),
      },
      { label: 'FeePool', value: normaliseAddress(feePool) },
    ],
  };
}

async function collectSystemPauseSummary(
  address: string
): Promise<ModuleSummary> {
  const systemPause = await ethers.getContractAt('SystemPause', address);
  const [ownerAddress, paused] = await Promise.all([
    resolveOwner(systemPause),
    (async () => {
      try {
        return Boolean(await systemPause.paused());
      } catch (_) {
        return false;
      }
    })(),
  ]);

  return {
    key: 'systemPause',
    name: 'SystemPause',
    address,
    metrics: [
      { label: 'Governance', value: ownerAddress },
      { label: 'Paused', value: paused },
    ],
  };
}

async function collectRewardEngineSummary(
  address: string
): Promise<ModuleSummary> {
  const rewardEngine = await ethers.getContractAt('RewardEngineMB', address);
  const [
    ownerAddress,
    thermostat,
    feePool,
    reputation,
    energyOracle,
    treasury,
    token,
    kappaRaw,
    manualTempRaw,
    maxProofsRaw,
  ] = await Promise.all([
    resolveOwner(rewardEngine),
    callString(rewardEngine, 'thermostat'),
    callString(rewardEngine, 'feePool'),
    callString(rewardEngine, 'reputation'),
    callString(rewardEngine, 'energyOracle'),
    callString(rewardEngine, 'treasury'),
    callString(rewardEngine, 'token'),
    callBigInt(rewardEngine, 'kappa'),
    callBigInt(rewardEngine, 'temperature'),
    callBigInt(rewardEngine, 'maxProofs'),
  ]);

  const roleShares: (string | null)[] = [];
  const muValues: (string | null)[] = [];
  const baselineValues: (string | null)[] = [];
  for (let i = 0; i < ROLE_LABELS.length; i += 1) {
    try {
      const share = await rewardEngine.roleShare(i);
      roleShares.push(formatPercentageWad(share));
    } catch (_) {
      roleShares.push(null);
    }
    try {
      const mu = await rewardEngine.mu(i);
      muValues.push(formatWad(mu, 'WAD'));
    } catch (_) {
      muValues.push(null);
    }
    try {
      const baseline = await rewardEngine.baselineEnergy(i);
      baselineValues.push(formatWad(baseline, 'WAD'));
    } catch (_) {
      baselineValues.push(null);
    }
  }

  const metrics: ModuleMetric[] = [
    { label: 'Governance', value: ownerAddress },
    { label: 'Thermostat', value: normaliseAddress(thermostat) },
    { label: 'FeePool', value: normaliseAddress(feePool) },
    { label: 'ReputationEngine', value: normaliseAddress(reputation) },
    { label: 'EnergyOracle', value: normaliseAddress(energyOracle) },
    { label: 'Treasury', value: normaliseAddress(treasury) },
    { label: 'Reward Token', value: normaliseAddress(token) },
    {
      label: 'Kappa (WAD)',
      value: kappaRaw !== null ? formatWad(kappaRaw) : null,
    },
    {
      label: 'Manual Temperature (raw)',
      value: manualTempRaw !== null ? manualTempRaw.toString() : null,
    },
    {
      label: 'Manual Temperature (WAD)',
      value: manualTempRaw !== null ? formatWad(manualTempRaw, 'WAD') : null,
    },
    {
      label: 'Max Proofs per Role',
      value: maxProofsRaw !== null ? maxProofsRaw.toString() : null,
    },
  ];

  ROLE_LABELS.forEach((role, index) => {
    metrics.push({ label: `Role Share (${role})`, value: roleShares[index] });
  });
  ROLE_LABELS.forEach((role, index) => {
    metrics.push({ label: `Mu (${role})`, value: muValues[index] });
  });
  ROLE_LABELS.forEach((role, index) => {
    metrics.push({
      label: `Baseline Energy (${role})`,
      value: baselineValues[index],
    });
  });

  return {
    key: 'rewardEngine',
    name: 'RewardEngineMB',
    address,
    metrics,
  };
}

async function collectThermostatSummary(
  address: string
): Promise<ModuleSummary> {
  const thermostat = await ethers.getContractAt('Thermostat', address);
  const [
    ownerAddress,
    systemTemp,
    minTemp,
    maxTemp,
    kp,
    ki,
    kd,
    wEmission,
    wBacklog,
    wSla,
    integralMin,
    integralMax,
  ] = await Promise.all([
    resolveOwner(thermostat),
    callBigInt(thermostat, 'systemTemperature'),
    callBigInt(thermostat, 'minTemp'),
    callBigInt(thermostat, 'maxTemp'),
    callBigInt(thermostat, 'kp'),
    callBigInt(thermostat, 'ki'),
    callBigInt(thermostat, 'kd'),
    callBigInt(thermostat, 'wEmission'),
    callBigInt(thermostat, 'wBacklog'),
    callBigInt(thermostat, 'wSla'),
    callBigInt(thermostat, 'integralMin'),
    callBigInt(thermostat, 'integralMax'),
  ]);

  const roleTemps: (string | null)[] = [];
  for (let i = 0; i < ROLE_LABELS.length; i += 1) {
    try {
      const roleTemp = await thermostat.getRoleTemperature(i);
      roleTemps.push(formatWad(roleTemp, 'WAD'));
    } catch (_) {
      roleTemps.push(null);
    }
  }

  const metrics: ModuleMetric[] = [
    { label: 'Governance', value: ownerAddress },
    {
      label: 'System Temperature (raw)',
      value: systemTemp !== null ? systemTemp.toString() : null,
    },
    {
      label: 'System Temperature (WAD)',
      value: systemTemp !== null ? formatWad(systemTemp, 'WAD') : null,
    },
    {
      label: 'Minimum Temperature (raw)',
      value: minTemp !== null ? minTemp.toString() : null,
    },
    {
      label: 'Minimum Temperature (WAD)',
      value: minTemp !== null ? formatWad(minTemp, 'WAD') : null,
    },
    {
      label: 'Maximum Temperature (raw)',
      value: maxTemp !== null ? maxTemp.toString() : null,
    },
    {
      label: 'Maximum Temperature (WAD)',
      value: maxTemp !== null ? formatWad(maxTemp, 'WAD') : null,
    },
    { label: 'kP (raw)', value: kp !== null ? kp.toString() : null },
    { label: 'kI (raw)', value: ki !== null ? ki.toString() : null },
    { label: 'kD (raw)', value: kd !== null ? kd.toString() : null },
    {
      label: 'Emission Weight',
      value: wEmission !== null ? wEmission.toString() : null,
    },
    {
      label: 'Backlog Weight',
      value: wBacklog !== null ? wBacklog.toString() : null,
    },
    { label: 'SLA Weight', value: wSla !== null ? wSla.toString() : null },
    {
      label: 'Integral Min (raw)',
      value: integralMin !== null ? integralMin.toString() : null,
    },
    {
      label: 'Integral Min (WAD)',
      value: integralMin !== null ? formatWad(integralMin, 'WAD') : null,
    },
    {
      label: 'Integral Max (raw)',
      value: integralMax !== null ? integralMax.toString() : null,
    },
    {
      label: 'Integral Max (WAD)',
      value: integralMax !== null ? formatWad(integralMax, 'WAD') : null,
    },
  ];

  ROLE_LABELS.forEach((role, index) => {
    metrics.push({
      label: `Role Temperature (${role})`,
      value: roleTemps[index],
    });
  });

  return {
    key: 'thermostat',
    name: 'Thermostat',
    address,
    metrics,
  };
}

async function collectReputationEngineSummary(
  address: string
): Promise<ModuleSummary> {
  const reputationEngine = await ethers.getContractAt(
    'ReputationEngine',
    address
  );
  const [
    ownerAddress,
    stakeManager,
    premiumThreshold,
    stakeWeight,
    reputationWeight,
    validationRewardPct,
    pauser,
    paused,
    version,
  ] = await Promise.all([
    resolveOwner(reputationEngine),
    callString(reputationEngine, 'stakeManager'),
    callBigInt(reputationEngine, 'premiumThreshold'),
    callBigInt(reputationEngine, 'stakeWeight'),
    callBigInt(reputationEngine, 'reputationWeight'),
    callBigInt(reputationEngine, 'validationRewardPercentage'),
    callString(reputationEngine, 'pauser'),
    callBoolean(reputationEngine, 'paused'),
    callBigInt(reputationEngine, 'version'),
  ]);

  return {
    key: 'reputationEngine',
    name: 'ReputationEngine',
    address,
    metrics: [
      { label: 'Owner', value: ownerAddress },
      { label: 'StakeManager', value: normaliseAddress(stakeManager) },
      {
        label: 'Premium Threshold',
        value:
          premiumThreshold !== null
            ? formatTokenAmount(premiumThreshold)
            : null,
      },
      {
        label: 'Stake Weight',
        value: stakeWeight !== null ? formatWad(stakeWeight, 'WAD') : null,
      },
      {
        label: 'Reputation Weight',
        value:
          reputationWeight !== null ? formatWad(reputationWeight, 'WAD') : null,
      },
      {
        label: 'Validation Reward %',
        value:
          validationRewardPct !== null
            ? `${formatUnitsRounded(validationRewardPct, 0)}%`
            : null,
      },
      { label: 'Pauser', value: normaliseAddress(pauser) },
      { label: 'Paused', value: paused },
      {
        label: 'Module Version',
        value: version !== null ? version.toString() : null,
      },
    ],
  };
}

async function collectIdentityRegistrySummary(
  address: string
): Promise<ModuleSummary> {
  const identityRegistry = await ethers.getContractAt(
    'IdentityRegistry',
    address
  );
  const [
    ownerAddress,
    ens,
    nameWrapper,
    reputation,
    attestationRegistry,
    agentRootNode,
    clubRootNode,
    agentMerkleRoot,
    validatorMerkleRoot,
    agentAliases,
    clubAliases,
  ] = await Promise.all([
    resolveOwner(identityRegistry),
    callString(identityRegistry, 'ens'),
    callString(identityRegistry, 'nameWrapper'),
    callString(identityRegistry, 'reputationEngine'),
    callString(identityRegistry, 'attestationRegistry'),
    callString(identityRegistry, 'agentRootNode'),
    callString(identityRegistry, 'clubRootNode'),
    callString(identityRegistry, 'agentMerkleRoot'),
    callString(identityRegistry, 'validatorMerkleRoot'),
    (async () => {
      try {
        const roots: string[] =
          await identityRegistry.getAgentRootNodeAliases();
        return roots;
      } catch (_) {
        return null;
      }
    })(),
    (async () => {
      try {
        const roots: string[] = await identityRegistry.getClubRootNodeAliases();
        return roots;
      } catch (_) {
        return null;
      }
    })(),
  ]);

  return {
    key: 'identityRegistry',
    name: 'IdentityRegistry',
    address,
    metrics: [
      { label: 'Owner', value: ownerAddress },
      { label: 'ENS', value: normaliseAddress(ens) },
      { label: 'NameWrapper', value: normaliseAddress(nameWrapper) },
      { label: 'ReputationEngine', value: normaliseAddress(reputation) },
      {
        label: 'AttestationRegistry',
        value: normaliseAddress(attestationRegistry),
      },
      { label: 'Agent Root Node', value: agentRootNode },
      { label: 'Club Root Node', value: clubRootNode },
      { label: 'Agent Merkle Root', value: agentMerkleRoot },
      { label: 'Validator Merkle Root', value: validatorMerkleRoot },
      {
        label: 'Agent Root Aliases',
        value:
          agentAliases === null
            ? null
            : agentAliases.length > 0
            ? agentAliases.join(', ')
            : 'none',
      },
      {
        label: 'Club Root Aliases',
        value:
          clubAliases === null
            ? null
            : clubAliases.length > 0
            ? clubAliases.join(', ')
            : 'none',
      },
    ],
  };
}

async function collectPlatformIncentivesSummary(
  address: string
): Promise<ModuleSummary> {
  const incentives = await ethers.getContractAt('PlatformIncentives', address);
  const [ownerAddress, stakeManager, platformRegistry, jobRouter, maxDiscount] =
    await Promise.all([
      resolveOwner(incentives),
      callString(incentives, 'stakeManager'),
      callString(incentives, 'platformRegistry'),
      callString(incentives, 'jobRouter'),
      callBigInt(incentives, 'maxDiscountPct'),
    ]);

  return {
    key: 'platformIncentives',
    name: 'PlatformIncentives',
    address,
    metrics: [
      { label: 'Owner', value: ownerAddress },
      { label: 'StakeManager', value: normaliseAddress(stakeManager) },
      { label: 'PlatformRegistry', value: normaliseAddress(platformRegistry) },
      { label: 'JobRouter', value: normaliseAddress(jobRouter) },
      {
        label: 'Max Discount %',
        value: maxDiscount !== null ? `${maxDiscount.toString()}%` : null,
      },
    ],
  };
}

async function collectRandaoCoordinatorSummary(
  address: string
): Promise<ModuleSummary> {
  const randao = await ethers.getContractAt('RandaoCoordinator', address);
  const [ownerAddress, commitWindow, revealWindow, deposit, treasury, token] =
    await Promise.all([
      resolveOwner(randao),
      callBigInt(randao, 'commitWindow'),
      callBigInt(randao, 'revealWindow'),
      callBigInt(randao, 'deposit'),
      callString(randao, 'treasury'),
      callString(randao, 'token'),
    ]);

  const tokenAddress = token ? ethers.getAddress(token) : null;
  const tokenMetadata = await resolveTokenMetadata(tokenAddress);

  return {
    key: 'randaoCoordinator',
    name: 'RandaoCoordinator',
    address,
    metrics: [
      { label: 'Owner', value: ownerAddress },
      { label: 'Commit Window', value: formatDurationSeconds(commitWindow) },
      { label: 'Reveal Window', value: formatDurationSeconds(revealWindow) },
      {
        label: 'Deposit',
        value: formatTokenAmount(deposit, tokenMetadata.symbol, tokenMetadata.decimals),
      },
      { label: 'Token', value: normaliseAddress(tokenAddress ?? undefined) },
      { label: 'Treasury', value: normaliseAddress(treasury) },
    ],
  };
}

const COLLECTORS: Record<string, (address: string) => Promise<ModuleSummary>> =
  {
    stakeManager: collectStakeManagerSummary,
    feePool: collectFeePoolSummary,
    taxPolicy: collectTaxPolicySummary,
    jobRegistry: collectJobRegistrySummary,
    validationModule: collectValidationModuleSummary,
    platformRegistry: collectPlatformRegistrySummary,
    systemPause: collectSystemPauseSummary,
    reputationEngine: collectReputationEngineSummary,
    identityRegistry: collectIdentityRegistrySummary,
    platformIncentives: collectPlatformIncentivesSummary,
    randaoCoordinator: collectRandaoCoordinatorSummary,
    rewardEngine: collectRewardEngineSummary,
    thermostat: collectThermostatSummary,
  };

const MODULE_TITLES: Record<string, string> = {
  stakeManager: 'StakeManager',
  feePool: 'FeePool',
  taxPolicy: 'TaxPolicy',
  jobRegistry: 'JobRegistry',
  validationModule: 'ValidationModule',
  platformRegistry: 'PlatformRegistry',
  systemPause: 'SystemPause',
  reputationEngine: 'ReputationEngine',
  identityRegistry: 'IdentityRegistry',
  platformIncentives: 'PlatformIncentives',
  randaoCoordinator: 'RandaoCoordinator',
  rewardEngine: 'RewardEngineMB',
  thermostat: 'Thermostat',
};

function resolveModuleTitle(key: string): string {
  const title = MODULE_TITLES[key];
  if (title) {
    return title;
  }
  if (!key) {
    return 'Module';
  }
  const cleaned = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned.length > 0
    ? cleaned
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : key;
}

function classifyModuleError(
  key: string,
  address: string | null,
  error: unknown
): ModuleMetric {
  const rawMessage =
    error instanceof Error
      ? error.message || error.toString()
      : error === null || error === undefined
      ? 'Unknown error'
      : String(error);
  const message = rawMessage.trim();
  const moduleTitle = resolveModuleTitle(key);
  const addressHint = address ? ` (${address})` : '';

  if (/HH700/.test(message) || /artifact\s+for\s+contract/i.test(message)) {
    return {
      label: 'warning',
      value: `${moduleTitle}${addressHint} — contract artifact unavailable. Run \`npx hardhat compile\` before mission control or ensure the module sources are included in the build.`,
    };
  }

  if (
    /CALL_EXCEPTION/.test(message) ||
    /missing code/i.test(message) ||
    /execution reverted/i.test(message)
  ) {
    return {
      label: 'warning',
      value: `${moduleTitle}${addressHint} — no contract detected at the configured address. Update docs/deployment-addresses.json or provide the module address via environment overrides.`,
    };
  }

  return {
    label: 'error',
    value: `${moduleTitle}${addressHint} — ${message || 'Failed to load module state'}`,
  };
}

function printModule(summary: ModuleSummary): void {
  if (!summary.address) {
    console.log(`\n${summary.name}\n  address: (not configured)`);
    return;
  }
  console.log(`\n${summary.name}\n  address: ${summary.address}`);
  for (const metric of summary.metrics) {
    let value: string;
    if (metric.value === null) {
      value = 'unknown';
    } else if (typeof metric.value === 'boolean') {
      value = metric.value ? 'true' : 'false';
    } else {
      value = String(metric.value);
    }
    console.log(`  ${metric.label}: ${value}`);
  }
}

async function loadConfigSummary(configNetwork: string) {
  const result: Record<string, any> = {};

  try {
    const { plan } = loadDeploymentPlan({
      network: configNetwork,
      optional: true,
    });
    if (plan && Object.keys(plan).length > 0) {
      result.deploymentPlan = plan;
    }
  } catch (_) {
    // ignore missing
  }

  try {
    const { config } = loadStakeManagerConfig({ network: configNetwork });
    result.stakeManager = config;
  } catch (_) {}

  try {
    const { config } = loadFeePoolConfig({ network: configNetwork });
    result.feePool = config;
  } catch (_) {}

  try {
    const { config } = loadJobRegistryConfig({ network: configNetwork });
    result.jobRegistry = config;
  } catch (_) {}

  try {
    const { config } = loadPlatformRegistryConfig({ network: configNetwork });
    result.platformRegistry = config;
  } catch (_) {}

  try {
    const { config } = loadPlatformIncentivesConfig({ network: configNetwork });
    result.platformIncentives = config;
  } catch (_) {}

  try {
    const { config } = loadTaxPolicyConfig({ network: configNetwork });
    result.taxPolicy = config;
  } catch (_) {}

  try {
    const { config } = loadRandaoCoordinatorConfig({ network: configNetwork });
    result.randaoCoordinator = config;
  } catch (_) {}

  try {
    const { config } = loadIdentityRegistryConfig({ network: configNetwork });
    result.identityRegistry = config;
  } catch (_) {}

  try {
    const { config } = loadRewardEngineConfig({ network: configNetwork });
    result.rewardEngine = config;
  } catch (_) {}

  try {
    const { config } = loadThermodynamicsConfig({ network: configNetwork });
    result.thermodynamics = config;
  } catch (_) {}

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const networkInfo = await ethers.provider.getNetwork();
  const addressBook = await readAddressBook();
  const configNetwork =
    inferNetworkKey(
      options.configNetwork || network.name || networkInfo.name
    ) || networkInfo.name;

  const summaries: ModuleSummary[] = [];

  for (const [key, collector] of Object.entries(COLLECTORS)) {
    const rawAddress = addressBook[key];
    const address = normaliseAddress(rawAddress);
    const name = resolveModuleTitle(key);
    if (!address) {
      summaries.push({ key, name, address: null, metrics: [] });
      continue;
    }
    try {
      const summary = await collector(address);
      summaries.push(summary);
    } catch (error) {
      summaries.push({
        key,
        name,
        address,
        metrics: [classifyModuleError(key, address, error)],
      });
    }
  }

  const configSummary = await loadConfigSummary(configNetwork || '');

  if (options.json) {
    const output = {
      network: {
        chainId: Number(networkInfo.chainId),
        name: networkInfo.name,
        configNetwork,
      },
      modules: summaries,
      config: configSummary,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('AGIJobs Owner Control Dashboard');
  console.log('================================');
  console.log(`Network: ${networkInfo.name} (chainId: ${networkInfo.chainId})`);
  if (configNetwork) {
    console.log(`Config network: ${configNetwork}`);
  }

  for (const summary of summaries) {
    printModule(summary);
  }

  if (Object.keys(configSummary).length > 0) {
    console.log('\nConfiguration Snapshots');
    console.log('-----------------------');
    for (const [key, value] of Object.entries(configSummary)) {
      console.log(`\n${key}`);
      console.log(JSON.stringify(value, null, 2));
    }
  }
}

main().catch((error) => {
  console.error('Owner dashboard failed:', error);
  process.exitCode = 1;
});
