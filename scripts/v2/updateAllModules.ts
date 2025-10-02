import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import type { Contract, Interface, ParamType } from 'ethers';
import {
  loadTokenConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadJobRegistryConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadRewardEngineConfig,
  loadThermostatConfig,
  loadRandaoCoordinatorConfig,
  loadEnergyOracleConfig,
  loadTaxPolicyConfig,
  loadIdentityRegistryConfig,
  loadDisputeModuleConfig,
  type TokenConfigResult,
  type StakeManagerConfigResult,
  type FeePoolConfigResult,
  type JobRegistryConfigResult,
  type PlatformRegistryConfigResult,
  type PlatformIncentivesConfigResult,
  type RewardEngineConfigResult,
  type ThermostatConfigResult,
  type RandaoCoordinatorConfigResult,
  type EnergyOracleConfigResult,
  type TaxPolicyConfigResult,
  type IdentityRegistryConfigResult,
  type DisputeModuleConfigResult,
} from '../config';
import { buildStakeManagerPlan } from './lib/stakeManagerPlan';
import { buildFeePoolPlan } from './lib/feePoolPlan';
import { buildJobRegistryPlan } from './lib/jobRegistryPlan';
import { buildPlatformRegistryPlan } from './lib/platformRegistryPlan';
import { buildPlatformIncentivesPlan } from './lib/platformIncentivesPlan';
import { buildRewardEnginePlan } from './lib/rewardEnginePlan';
import { buildThermostatPlan } from './lib/thermostatPlan';
import { buildRandaoCoordinatorPlan } from './lib/randaoCoordinatorPlan';
import { buildEnergyOraclePlan } from './lib/energyOraclePlan';
import { buildTaxPolicyPlan } from './lib/taxPolicyPlan';
import { buildIdentityRegistryPlan } from './lib/identityRegistryPlan';
import { buildDisputeModulePlan } from './lib/disputeModulePlan';
import type { ModulePlan, PlannedAction } from './lib/types';
import { describeArgs, sameAddress } from './lib/utils';

interface CliOptions {
  execute: boolean;
  json: boolean;
  only?: Set<ModuleKey>;
  skip: Set<ModuleKey>;
  safeOut?: string;
  safeName?: string;
  safeDescription?: string;
}

interface SafeContractInputMeta {
  name: string;
  type: string;
}

interface SafeContractMethodMeta {
  name: string;
  payable: boolean;
  stateMutability: string;
  inputs: SafeContractInputMeta[];
}

interface SafeTransactionEntry {
  to: string;
  value: string;
  data: string;
  description?: string;
  contractInputsValues?: Record<string, string>;
  contractMethod?: SafeContractMethodMeta;
}

interface SafeBundle {
  version: string;
  chainId: number;
  createdAt: string;
  meta: {
    name: string;
    description: string;
    txBuilderVersion: string;
  };
  transactions: SafeTransactionEntry[];
}

interface ResolvedFragment {
  signature: string;
  name: string;
  stateMutability: string;
  inputs: ParamType[];
}

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

function parseListEnv(value?: string | null): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseStringEnv(value?: string | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

type ModuleKey =
  | 'stakeManager'
  | 'feePool'
  | 'jobRegistry'
  | 'disputeModule'
  | 'platformRegistry'
  | 'platformIncentives'
  | 'rewardEngine'
  | 'thermostat'
  | 'randaoCoordinator'
  | 'energyOracle'
  | 'taxPolicy'
  | 'identityRegistry';

const MODULE_ORDER: ModuleKey[] = [
  'stakeManager',
  'feePool',
  'jobRegistry',
  'disputeModule',
  'platformRegistry',
  'platformIncentives',
  'rewardEngine',
  'thermostat',
  'randaoCoordinator',
  'energyOracle',
  'taxPolicy',
  'identityRegistry',
];

const MODULE_ALIASES: Record<string, ModuleKey> = {
  stake: 'stakeManager',
  'stake-manager': 'stakeManager',
  stakemanager: 'stakeManager',
  fee: 'feePool',
  'fee-pool': 'feePool',
  feepool: 'feePool',
  job: 'jobRegistry',
  'job-registry': 'jobRegistry',
  jobregistry: 'jobRegistry',
  dispute: 'disputeModule',
  'dispute-module': 'disputeModule',
  disputemodule: 'disputeModule',
  platform: 'platformRegistry',
  registry: 'platformRegistry',
  'platform-registry': 'platformRegistry',
  platformregistry: 'platformRegistry',
  incentives: 'platformIncentives',
  'platform-incentives': 'platformIncentives',
  reward: 'rewardEngine',
  'reward-engine': 'rewardEngine',
  thermostat: 'thermostat',
  randao: 'randaoCoordinator',
  'randao-coordinator': 'randaoCoordinator',
  oracle: 'energyOracle',
  'energy-oracle': 'energyOracle',
  energy: 'energyOracle',
  tax: 'taxPolicy',
  'tax-policy': 'taxPolicy',
  identity: 'identityRegistry',
  'identity-registry': 'identityRegistry',
};

type AnyConfigResult =
  | StakeManagerConfigResult
  | FeePoolConfigResult
  | JobRegistryConfigResult
  | PlatformRegistryConfigResult
  | PlatformIncentivesConfigResult
  | RewardEngineConfigResult
  | ThermostatConfigResult
  | RandaoCoordinatorConfigResult
  | EnergyOracleConfigResult
  | TaxPolicyConfigResult
  | IdentityRegistryConfigResult;

interface ModuleDefinition<TConfig extends AnyConfigResult> {
  key: ModuleKey;
  label: string;
  artifact: string;
  loadConfig: (opts: LoadContext) => TConfig;
  resolveAddress: (ctx: {
    moduleConfig: TConfig;
    tokenConfig: TokenConfigResult;
  }) => string | undefined;
  buildPlan: (ctx: ModuleBuildContext<TConfig>) => Promise<ModulePlan>;
}

interface LoadContext {
  network: string;
  chainId?: number;
}

interface ModuleBuildContext<TConfig extends AnyConfigResult> {
  contract: Contract;
  moduleConfig: TConfig;
  tokenConfig: TokenConfigResult;
  ownerAddress: string;
  signerAddress: string;
}

interface ModuleExecutionPlan<TConfig extends AnyConfigResult> {
  definition: ModuleDefinition<TConfig>;
  moduleConfig: TConfig;
  plan: ModulePlan;
  ownerAddress: string;
  signerAddress: string;
}

function parseModuleKey(value: string): ModuleKey {
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    throw new Error('Module name cannot be empty');
  }
  if ((MODULE_ALIASES as Record<string, ModuleKey>)[normalised]) {
    return MODULE_ALIASES[normalised];
  }
  const exact = MODULE_ORDER.find((key) => key.toLowerCase() === normalised);
  if (exact) {
    return exact;
  }
  throw new Error(`Unknown module "${value}"`);
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, json: false, skip: new Set() };
  let executeSetByCli = false;
  let jsonSetByCli = false;
  let onlySetByCli = false;
  let safeOutSetByCli = false;
  let safeNameSetByCli = false;
  let safeDescriptionSetByCli = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
      executeSetByCli = true;
    } else if (arg === '--json') {
      options.json = true;
      jsonSetByCli = true;
    } else if (arg.startsWith('--only=')) {
      const [, raw] = arg.split('=');
      if (!raw) {
        throw new Error('--only requires a comma-separated module list');
      }
      const parts = raw.split(',').map(parseModuleKey);
      options.only = new Set(parts);
      onlySetByCli = true;
    } else if (arg === '--only') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--only requires a comma-separated module list');
      }
      const parts = value.split(',').map(parseModuleKey);
      options.only = new Set(parts);
      onlySetByCli = true;
      i += 1;
    } else if (arg.startsWith('--skip=')) {
      const [, raw] = arg.split('=');
      if (!raw) {
        throw new Error('--skip requires a comma-separated module list');
      }
      raw
        .split(',')
        .forEach((entry) => options.skip.add(parseModuleKey(entry)));
    } else if (arg === '--skip') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--skip requires a comma-separated module list');
      }
      value
        .split(',')
        .forEach((entry) => options.skip.add(parseModuleKey(entry)));
      i += 1;
    } else if (arg === '--safe' || arg === '--safe-out') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a file path`);
      }
      options.safeOut = value;
      safeOutSetByCli = true;
      i += 1;
    } else if (arg === '--safe-name') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--safe-name requires a value');
      }
      options.safeName = value;
      safeNameSetByCli = true;
      i += 1;
    } else if (arg === '--safe-desc' || arg === '--safe-description') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      options.safeDescription = value;
      safeDescriptionSetByCli = true;
      i += 1;
    }
  }

  const envExecute = parseBooleanEnv(process.env.OWNER_UPDATE_ALL_EXECUTE);
  if (!executeSetByCli && envExecute !== undefined) {
    options.execute = envExecute;
  }

  const envJson = parseBooleanEnv(process.env.OWNER_UPDATE_ALL_JSON);
  if (!jsonSetByCli && envJson !== undefined) {
    options.json = envJson;
  }

  const envOnly = parseListEnv(process.env.OWNER_UPDATE_ALL_ONLY);
  if (!onlySetByCli && envOnly) {
    options.only = new Set(envOnly.map(parseModuleKey));
  }

  const envSkip = parseListEnv(process.env.OWNER_UPDATE_ALL_SKIP);
  if (envSkip) {
    envSkip.forEach((entry) => {
      try {
        options.skip.add(parseModuleKey(entry));
      } catch (error) {
        const reason = (error as Error).message;
        throw new Error(
          `Invalid module in OWNER_UPDATE_ALL_SKIP: ${entry} (${reason})`
        );
      }
    });
  }

  const envSafeOut = parseStringEnv(process.env.OWNER_UPDATE_ALL_SAFE_OUT);
  if (!safeOutSetByCli && envSafeOut) {
    options.safeOut = envSafeOut;
  }

  const envSafeName = parseStringEnv(process.env.OWNER_UPDATE_ALL_SAFE_NAME);
  if (!safeNameSetByCli && envSafeName) {
    options.safeName = envSafeName;
  }

  const envSafeDescription = parseStringEnv(
    process.env.OWNER_UPDATE_ALL_SAFE_DESCRIPTION
  );
  if (!safeDescriptionSetByCli && envSafeDescription) {
    options.safeDescription = envSafeDescription;
  }

  return options;
}

async function fetchOwnerAddress(contract: Contract): Promise<string> {
  if (typeof (contract as any).owner === 'function') {
    const owner = await (contract as any).owner();
    return ethers.getAddress(owner);
  }
  if (typeof (contract as any).governance === 'function') {
    const governance = await (contract as any).governance();
    return ethers.getAddress(governance);
  }
  throw new Error('Target contract does not expose owner() or governance()');
}

async function ensurePlanContract(
  plan: ModulePlan,
  contract: Contract
): Promise<void> {
  if (!plan.contract) {
    plan.contract = contract;
  }
  if (!plan.iface) {
    plan.iface = contract.interface;
  }
}

function addMetadata(
  plan: ModulePlan,
  metadata: Record<string, unknown>
): void {
  plan.metadata = { ...(plan.metadata ?? {}), ...metadata };
}

function normaliseInputName(param: ParamType, index: number): string {
  if (param.name && param.name.length > 0) {
    return param.name;
  }
  return `arg${index + 1}`;
}

function encodeFunctionData(
  iface: Interface | undefined,
  method: string,
  args: unknown[]
): string | undefined {
  if (!iface) {
    return undefined;
  }
  try {
    return iface.encodeFunctionData(method, args);
  } catch (_) {
    return undefined;
  }
}

function resolveFunctionFragment(
  iface: Interface | undefined,
  method: string
): ResolvedFragment | null {
  if (!iface) {
    return null;
  }
  try {
    const fragment = iface.getFunction(method);
    return {
      signature: fragment.format(),
      name: fragment.name,
      stateMutability: fragment.stateMutability,
      inputs: fragment.inputs,
    };
  } catch (_) {
    return null;
  }
}

function enrichPlanActions(plan: ModulePlan): void {
  const primaryIface = plan.iface as Interface | undefined;
  const fallbackIface = plan.contract?.interface as Interface | undefined;
  for (const action of plan.actions) {
    const args = Array.isArray(action.args) ? action.args : [];
    const encoded =
      action.calldata ??
      encodeFunctionData(primaryIface, action.method, args) ??
      encodeFunctionData(fallbackIface, action.method, args);
    if (encoded) {
      action.calldata = encoded;
    }
    const fragment =
      resolveFunctionFragment(primaryIface, action.method) ??
      resolveFunctionFragment(fallbackIface, action.method);
    if (fragment) {
      action.signature = fragment.signature;
      action.functionName = fragment.name;
      action.stateMutability = fragment.stateMutability;
      action.inputs = fragment.inputs.map((input, index) => ({
        name: normaliseInputName(input, index),
        type: input.type,
      }));
    }
    if (action.value === undefined || action.value === null) {
      action.value = '0';
    } else if (typeof action.value !== 'string') {
      action.value = String(action.value);
    }
  }
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    2
  );
}

function formatSafeInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return ethers.hexlify(value);
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value, (_key, inner) =>
      typeof inner === 'bigint' ? inner.toString() : inner
    );
  }
  return String(value);
}

function buildSafeTransactions(
  plans: ModuleExecutionPlan<any>[]
): SafeTransactionEntry[] {
  const transactions: SafeTransactionEntry[] = [];
  for (const entry of plans) {
    const modulePlan = entry.plan;
    if (!modulePlan.address) {
      throw new Error(
        `${entry.definition.label}: plan is missing a resolved contract address`
      );
    }
    for (const action of modulePlan.actions) {
      if (!action.calldata) {
        throw new Error(
          `${entry.definition.label}: missing calldata for ${action.method}`
        );
      }
      const value =
        typeof action.value === 'string'
          ? action.value
          : String(action.value ?? '0');
      const tx: SafeTransactionEntry = {
        to: modulePlan.address,
        value,
        data: action.calldata,
        description: action.label,
      };
      if (
        action.inputs &&
        action.inputs.length > 0 &&
        action.args &&
        action.args.length === action.inputs.length
      ) {
        const mapped: Record<string, string> = {};
        action.inputs.forEach((input, index) => {
          mapped[input.name] = formatSafeInputValue(action.args[index]);
        });
        if (Object.keys(mapped).length > 0) {
          tx.contractInputsValues = mapped;
        }
      }
      if (action.functionName && action.stateMutability && action.inputs) {
        tx.contractMethod = {
          name: action.functionName,
          payable: action.stateMutability === 'payable',
          stateMutability: action.stateMutability,
          inputs: action.inputs,
        };
      }
      transactions.push(tx);
    }
  }
  return transactions;
}

async function writeSafeBundle(
  destination: string,
  chainId: number,
  transactions: SafeTransactionEntry[],
  options: { name?: string; description?: string }
): Promise<void> {
  if (!Number.isFinite(chainId)) {
    throw new Error('Chain ID required to emit Safe transaction bundle.');
  }
  if (!transactions.length) {
    console.warn(
      'No actions detected – writing an empty Safe bundle for traceability.'
    );
  }
  const bundle: SafeBundle = {
    version: '1.0',
    chainId,
    createdAt: new Date().toISOString(),
    meta: {
      name: options.name || 'AGIJobs owner:update-all bundle',
      description:
        options.description ||
        'Autogenerated multisig bundle for AGIJobs owner:update-all execution.',
      txBuilderVersion: '1.16.6',
    },
    transactions,
  };
  const dir = path.dirname(destination);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(bundle, null, 2)}\n`);
}

async function resolveChainId(): Promise<number> {
  if (typeof network.config?.chainId === 'number') {
    return network.config.chainId;
  }
  const resolved = await ethers.provider.getNetwork();
  return Number(resolved.chainId);
}

const MODULE_DEFINITIONS: Record<ModuleKey, ModuleDefinition<any>> = {
  stakeManager: {
    key: 'stakeManager',
    label: 'StakeManager',
    artifact: 'contracts/v2/StakeManager.sol:StakeManager',
    loadConfig: (ctx: LoadContext) =>
      loadStakeManagerConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.stakeManager ||
        tokenConfig.config.contracts?.stakeManager
      );
    },
    buildPlan: async ({
      contract,
      moduleConfig,
      tokenConfig,
      ownerAddress,
    }) => {
      const decimals = Number(tokenConfig.config.decimals ?? 18);
      const symbol = tokenConfig.config.symbol || 'AGIALPHA';
      const plan = await buildStakeManagerPlan({
        stakeManager: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        decimals,
        symbol,
        ownerAddress,
      });
      return plan;
    },
  },
  feePool: {
    key: 'feePool',
    label: 'FeePool',
    artifact: 'contracts/v2/FeePool.sol:FeePool',
    loadConfig: (ctx: LoadContext) =>
      loadFeePoolConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.feePool ||
        tokenConfig.config.contracts?.feePool
      );
    },
    buildPlan: async ({ contract, moduleConfig, ownerAddress }) =>
      buildFeePoolPlan({
        feePool: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        ownerAddress,
      }),
  },
  jobRegistry: {
    key: 'jobRegistry',
    label: 'JobRegistry',
    artifact: 'contracts/v2/JobRegistry.sol:JobRegistry',
    loadConfig: (ctx: LoadContext) =>
      loadJobRegistryConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.jobRegistry ||
        tokenConfig.config.contracts?.jobRegistry
      );
    },
    buildPlan: async ({ contract, moduleConfig, tokenConfig }) => {
      const decimals = Number(tokenConfig.config.decimals ?? 18);
      const symbol = tokenConfig.config.symbol || 'AGIALPHA';
      return buildJobRegistryPlan({
        registry: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        decimals,
        symbol,
      });
    },
  },
  disputeModule: {
    key: 'disputeModule',
    label: 'DisputeModule',
    artifact: 'contracts/v2/modules/DisputeModule.sol:DisputeModule',
    loadConfig: (ctx: LoadContext) =>
      loadDisputeModuleConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.disputeModule ||
        tokenConfig.config.contracts?.disputeModule
      );
    },
    buildPlan: async ({ contract, moduleConfig }) =>
      buildDisputeModulePlan({
        dispute: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
      }),
  },
  platformRegistry: {
    key: 'platformRegistry',
    label: 'PlatformRegistry',
    artifact: 'contracts/v2/PlatformRegistry.sol:PlatformRegistry',
    loadConfig: (ctx: LoadContext) =>
      loadPlatformRegistryConfig({
        network: ctx.network,
        chainId: ctx.chainId,
      }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.platformRegistry ||
        tokenConfig.config.contracts?.platformRegistry
      );
    },
    buildPlan: async ({
      contract,
      moduleConfig,
      tokenConfig,
      ownerAddress,
    }) => {
      const decimals = Number(tokenConfig.config.decimals ?? 18);
      const symbol = tokenConfig.config.symbol || 'AGIALPHA';
      return buildPlatformRegistryPlan({
        platformRegistry: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        decimals,
        symbol,
        ownerAddress,
      });
    },
  },
  platformIncentives: {
    key: 'platformIncentives',
    label: 'PlatformIncentives',
    artifact: 'contracts/v2/PlatformIncentives.sol:PlatformIncentives',
    loadConfig: (ctx: LoadContext) =>
      loadPlatformIncentivesConfig({
        network: ctx.network,
        chainId: ctx.chainId,
      }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.platformIncentives ||
        tokenConfig.config.contracts?.platformIncentives
      );
    },
    buildPlan: async ({ contract, moduleConfig, ownerAddress }) => {
      const plan = await buildPlatformIncentivesPlan({
        platformIncentives: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        ownerAddress,
      });
      return plan;
    },
  },
  rewardEngine: {
    key: 'rewardEngine',
    label: 'RewardEngine',
    artifact: 'contracts/v2/RewardEngineMB.sol:RewardEngineMB',
    loadConfig: (ctx: LoadContext) =>
      loadRewardEngineConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.rewardEngine ||
        tokenConfig.config.contracts?.rewardEngine
      );
    },
    buildPlan: async ({ contract, moduleConfig }) =>
      buildRewardEnginePlan({
        rewardEngine: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
      }),
  },
  thermostat: {
    key: 'thermostat',
    label: 'Thermostat',
    artifact: 'contracts/v2/Thermostat.sol:Thermostat',
    loadConfig: (ctx: LoadContext) =>
      loadThermostatConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig }) =>
      (moduleConfig.config as any).address ||
      moduleConfig.rewardEngineThermostat,
    buildPlan: async ({ contract, moduleConfig }) =>
      buildThermostatPlan({
        thermostat: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
      }),
  },
  randaoCoordinator: {
    key: 'randaoCoordinator',
    label: 'RandaoCoordinator',
    artifact: 'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator',
    loadConfig: (ctx: LoadContext) =>
      loadRandaoCoordinatorConfig({
        network: ctx.network,
        chainId: ctx.chainId,
      }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.randaoCoordinator ||
        tokenConfig.config.contracts?.randaoCoordinator
      );
    },
    buildPlan: async ({ contract, moduleConfig }) =>
      buildRandaoCoordinatorPlan({
        randao: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
      }),
  },
  energyOracle: {
    key: 'energyOracle',
    label: 'EnergyOracle',
    artifact: 'contracts/v2/EnergyOracle.sol:EnergyOracle',
    loadConfig: (ctx: LoadContext) =>
      loadEnergyOracleConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ tokenConfig }) => {
      const modules = tokenConfig.config.modules ?? {};
      const contracts = tokenConfig.config.contracts ?? {};
      const envCandidate = readEnvCandidate([
        'ENERGY_ORACLE_ADDRESS',
        'ENERGY_ORACLE',
        'AGI_ENERGY_ORACLE',
        'AGJ_ENERGY_ORACLE',
        'AGIALPHA_ENERGY_ORACLE',
        'AGIALPHA_ORACLE',
      ]);
      return (
        envCandidate ||
        modules.energyOracle ||
        contracts.energyOracle ||
        modules.oracle ||
        contracts.oracle
      );
    },
    buildPlan: async ({ contract, moduleConfig, ownerAddress }) =>
      buildEnergyOraclePlan({
        oracle: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        ownerAddress,
        retainUnknown: moduleConfig.config.retainUnknown,
      }),
  },
  taxPolicy: {
    key: 'taxPolicy',
    label: 'TaxPolicy',
    artifact: 'contracts/v2/TaxPolicy.sol:TaxPolicy',
    loadConfig: (ctx: LoadContext) =>
      loadTaxPolicyConfig({ network: ctx.network, chainId: ctx.chainId }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.taxPolicy ||
        tokenConfig.config.contracts?.taxPolicy
      );
    },
    buildPlan: async ({ contract, moduleConfig }) =>
      buildTaxPolicyPlan({
        taxPolicy: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
      }),
  },
  identityRegistry: {
    key: 'identityRegistry',
    label: 'IdentityRegistry',
    artifact: 'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
    loadConfig: (ctx: LoadContext) =>
      loadIdentityRegistryConfig({
        network: ctx.network,
        chainId: ctx.chainId,
      }),
    resolveAddress: ({ moduleConfig, tokenConfig }) => {
      const configAddress = (moduleConfig.config as any).address;
      return (
        configAddress ||
        tokenConfig.config.modules?.identityRegistry ||
        tokenConfig.config.contracts?.identityRegistry
      );
    },
    buildPlan: async ({ contract, moduleConfig, ownerAddress }) =>
      buildIdentityRegistryPlan({
        identity: contract,
        config: moduleConfig.config,
        configPath: moduleConfig.path,
        ownerAddress,
      }),
  },
};

function readEnvCandidate(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null) {
      const trimmed = String(value).trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function selectModules(options: CliOptions): ModuleKey[] {
  const base = options.only ? Array.from(options.only) : MODULE_ORDER.slice();
  return base.filter((key) => !options.skip.has(key));
}

function summariseAction(
  action: PlannedAction,
  index: number,
  iface?: { encodeFunctionData(method: string, values?: unknown[]): string }
): void {
  const callDescription = action.method
    ? `${action.method}(${describeArgs(action.args ?? [])})`
    : 'unknown()';
  console.log(`  ${index + 1}. ${action.label}`);
  if (action.current !== undefined) {
    console.log(`     Current: ${action.current}`);
  }
  if (action.desired !== undefined) {
    console.log(`     Desired: ${action.desired}`);
  }
  if (action.notes?.length) {
    action.notes.forEach((note) => console.log(`     Note: ${note}`));
  }
  console.log(`     Call: ${callDescription}`);
  if (iface && action.method) {
    try {
      const encoded = iface.encodeFunctionData(
        action.method,
        action.args ?? []
      );
      console.log(`     Calldata: ${encoded}`);
    } catch (_) {
      // iface may not expose the function; ignore silently
    }
  }
}

async function buildModulePlan<TConfig extends AnyConfigResult>(
  definition: ModuleDefinition<TConfig>,
  tokenConfig: TokenConfigResult,
  cli: CliOptions
): Promise<ModuleExecutionPlan<TConfig> | undefined> {
  const loadCtx: LoadContext = {
    network: network.name,
    chainId: network.config?.chainId,
  };
  let moduleConfig: TConfig;
  try {
    moduleConfig = definition.loadConfig(loadCtx);
  } catch (err) {
    console.warn(
      `${definition.label}: skipping (failed to load configuration: ${
        (err as Error).message
      })`
    );
    return undefined;
  }

  const addressCandidate = definition.resolveAddress({
    moduleConfig,
    tokenConfig,
  });
  if (!addressCandidate) {
    console.warn(
      `${definition.label}: skipping (no address configured in token or module configuration)`
    );
    return undefined;
  }

  const address = ethers.getAddress(addressCandidate);
  if (address === ethers.ZeroAddress) {
    console.warn(
      `${definition.label}: skipping (address resolves to zero address)`
    );
    return undefined;
  }

  const contract = await ethers.getContractAt(definition.artifact, address);
  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await fetchOwnerAddress(contract);

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `${definition.label}: signer ${signerAddress} is not the contract owner ${ownerAddress}`
    );
  }

  const connected = contract.connect(signer);
  const plan = await definition.buildPlan({
    contract: connected,
    moduleConfig,
    tokenConfig,
    ownerAddress,
    signerAddress,
  });
  await ensurePlanContract(plan, connected);
  addMetadata(plan, {
    ownerAddress,
    signerAddress,
    configPath: moduleConfig.path,
    configSource: (moduleConfig as any).source,
  });
  enrichPlanActions(plan);
  return {
    definition,
    moduleConfig,
    plan,
    ownerAddress,
    signerAddress,
  };
}

async function executePlan(plan: ModuleExecutionPlan<any>): Promise<void> {
  if (!plan.plan.actions.length) {
    return;
  }
  console.log(
    `\nExecuting ${plan.definition.label} updates (${plan.plan.actions.length} actions)...`
  );
  for (const action of plan.plan.actions) {
    const contract = plan.plan.contract as any;
    if (!contract || typeof contract[action.method] !== 'function') {
      throw new Error(
        `${plan.definition.label}: contract does not expose method ${action.method}`
      );
    }
    console.log(`  Calling ${action.method}...`);
    const tx = await contract[action.method](...action.args);
    console.log(`    Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(
        `${plan.definition.label}: transaction ${tx.hash} for ${action.method} failed`
      );
    }
    console.log('    Confirmed');
  }
}

function printPlan(plan: ModuleExecutionPlan<any>): void {
  const {
    definition,
    moduleConfig,
    plan: modulePlan,
    ownerAddress,
    signerAddress,
  } = plan;
  console.log(`\n=== ${definition.label} ===`);
  console.log(`Address:         ${modulePlan.address}`);
  console.log(`Owner/Governance: ${ownerAddress}`);
  console.log(`Connected signer: ${signerAddress}`);
  console.log(`Config file:      ${moduleConfig.path}`);
  if ((moduleConfig as any).source) {
    console.log(`Config source:    ${(moduleConfig as any).source}`);
  }
  if (modulePlan.warnings?.length) {
    console.log('Warnings:');
    modulePlan.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
  if (modulePlan.actions.length === 0) {
    console.log('No changes required.');
    return;
  }
  console.log(`Planned actions (${modulePlan.actions.length}):`);
  modulePlan.actions.forEach((action, index) =>
    summariseAction(action, index, modulePlan.iface as any)
  );
}

async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const tokenConfig = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const modules = selectModules(cli);
  if (!modules.length) {
    console.log('No modules selected after applying filters.');
    return;
  }

  const plans: ModuleExecutionPlan<any>[] = [];
  for (const key of modules) {
    const definition = MODULE_DEFINITIONS[key];
    if (!definition) {
      continue;
    }
    const plan = await buildModulePlan(definition, tokenConfig, cli);
    if (plan) {
      plans.push(plan);
    }
  }

  if (!plans.length) {
    console.log('No actionable modules discovered.');
    return;
  }

  if (cli.json) {
    const output = {
      network: network.name,
      chainId: network.config?.chainId,
      modules: plans.map((entry) => ({
        key: entry.definition.key,
        label: entry.definition.label,
        address: entry.plan.address,
        owner: entry.ownerAddress,
        signer: entry.signerAddress,
        configPath: entry.moduleConfig.path,
        configSource: (entry.moduleConfig as any).source,
        actions: entry.plan.actions,
        warnings: entry.plan.warnings,
        metadata: entry.plan.metadata,
      })),
    };
    console.log(stringifyWithBigInt(output));
    return;
  }

  plans.forEach(printPlan);

  const totalActions = plans.reduce(
    (sum, entry) => sum + entry.plan.actions.length,
    0
  );
  console.log(`\nTotal planned actions: ${totalActions}`);

  if (cli.safeOut) {
    const chainId = await resolveChainId();
    const transactions = buildSafeTransactions(plans);
    await writeSafeBundle(cli.safeOut, chainId, transactions, {
      name: cli.safeName,
      description: cli.safeDescription,
    });
    const suffix = transactions.length === 1 ? '' : 's';
    console.log(
      `\nGnosis Safe bundle written to ${cli.safeOut} (${transactions.length} transaction${suffix}).`
    );
  }

  if (cli.execute) {
    console.log('\nSubmitting transactions...');
    for (const plan of plans) {
      await executePlan(plan);
    }
    console.log('\nAll transactions confirmed.');
  } else {
    console.log(
      '\nDry run complete. Re-run with --execute to submit transactions.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
