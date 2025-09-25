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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--config-network' || arg === '--network-config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      options.configNetwork = value;
      i += 1;
    }
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

const COLLECTORS: Record<string, (address: string) => Promise<ModuleSummary>> =
  {
    stakeManager: collectStakeManagerSummary,
    feePool: collectFeePoolSummary,
    taxPolicy: collectTaxPolicySummary,
    jobRegistry: collectJobRegistrySummary,
    validationModule: collectValidationModuleSummary,
    platformRegistry: collectPlatformRegistrySummary,
    systemPause: collectSystemPauseSummary,
  };

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
    if (!address) {
      summaries.push({ key, name: key, address: null, metrics: [] });
      continue;
    }
    try {
      const summary = await collector(address);
      summaries.push(summary);
    } catch (error) {
      summaries.push({
        key,
        name: key,
        address,
        metrics: [
          {
            label: 'error',
            value:
              error instanceof Error
                ? error.message
                : 'Failed to load module state',
          },
        ],
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
