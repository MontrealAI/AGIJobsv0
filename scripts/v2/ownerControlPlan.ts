import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  loadTokenConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadIdentityRegistryConfig,
  loadThermodynamicsConfig,
  loadRandaoCoordinatorConfig,
} from '../config';
import { buildJobRegistryPlan } from './lib/jobRegistryPlan';
import { buildStakeManagerPlan } from './lib/stakeManagerPlan';
import { buildFeePoolPlan } from './lib/feePoolPlan';
import { buildPlatformRegistryPlan } from './lib/platformRegistryPlan';
import { buildPlatformIncentivesPlan } from './lib/platformIncentivesPlan';
import { buildTaxPolicyPlan } from './lib/taxPolicyPlan';
import { buildIdentityRegistryPlan } from './lib/identityRegistryPlan';
import { buildRewardEnginePlan } from './lib/rewardEnginePlan';
import { buildThermostatPlan } from './lib/thermostatPlan';
import { buildRandaoCoordinatorPlan } from './lib/randaoCoordinatorPlan';
import { describeArgs, sameAddress } from './lib/utils';
import type { ModulePlan, PlannedAction } from './lib/types';

interface CliOptions {
  execute: boolean;
  json: boolean;
  outPath?: string;
  safeOut?: string;
  safeName?: string;
  safeDescription?: string;
}

interface ContractInputMeta {
  name: string;
  type: string;
}

interface ActionSummary extends PlannedAction {
  calldata?: string | null;
  to: string;
  value: string;
  signature?: string | null;
  functionName?: string | null;
  stateMutability?: string | null;
  inputs?: ContractInputMeta[];
}

interface ModuleSummary {
  module: string;
  address: string;
  owner?: string;
  configPath?: string;
  actions: ActionSummary[];
  totalActions: number;
}

interface AggregatedPlan {
  network: string;
  chainId?: number;
  signer: string;
  generatedAt: string;
  modules: ModuleSummary[];
  totalActions: number;
}

interface SafeContractMethodMeta {
  name: string;
  payable: boolean;
  stateMutability: string;
  inputs: ContractInputMeta[];
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

function readEnvBoolean(key: string): boolean | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
    return false;
  }
  return undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, json: false };
  const envExecute = readEnvBoolean('OWNER_PLAN_EXECUTE');
  const envJson = readEnvBoolean('OWNER_PLAN_JSON');
  if (envExecute !== undefined) {
    options.execute = envExecute;
  }
  if (envJson !== undefined) {
    options.json = envJson;
  }
  if (process.env.OWNER_PLAN_OUT) {
    options.outPath = process.env.OWNER_PLAN_OUT;
  }
  if (process.env.OWNER_PLAN_SAFE_OUT) {
    options.safeOut = process.env.OWNER_PLAN_SAFE_OUT;
  }
  if (process.env.OWNER_PLAN_SAFE_NAME) {
    options.safeName = process.env.OWNER_PLAN_SAFE_NAME;
  }
  if (process.env.OWNER_PLAN_SAFE_DESCRIPTION) {
    options.safeDescription = process.env.OWNER_PLAN_SAFE_DESCRIPTION;
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--out' || arg === '--output') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--out requires a file path');
      }
      options.outPath = value;
      i += 1;
    } else if (arg === '--safe' || arg === '--safe-out') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a file path`);
      }
      options.safeOut = value;
      i += 1;
    } else if (arg === '--safe-name') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--safe-name requires a value');
      }
      options.safeName = value;
      i += 1;
    } else if (arg === '--safe-desc' || arg === '--safe-description') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      options.safeDescription = value;
      i += 1;
    }
  }
  return options;
}

function serialiseArg(value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serialiseArg(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, val]) => [
      key,
      serialiseArg(val),
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

function buildActionSummary(
  plan: ModulePlan,
  action: PlannedAction
): ActionSummary {
  const iface = plan.iface;
  let signature: string | null = null;
  let functionName: string | null = null;
  let stateMutability: string | null = null;
  let inputs: ContractInputMeta[] | undefined;
  let calldata: string | null = null;
  if (iface) {
    try {
      calldata = iface.encodeFunctionData(action.method, action.args);
      const fragment = iface.getFunction(action.method);
      signature = fragment.format();
      functionName = fragment.name;
      stateMutability = fragment.stateMutability;
      inputs = fragment.inputs.map((input, index) => ({
        name: input.name && input.name.length ? input.name : `arg${index + 1}`,
        type: input.type,
      }));
    } catch (error) {
      if (process.env.DEBUG) {
        console.warn(
          `Failed to resolve ABI metadata for ${plan.module}.${action.method}:`,
          error
        );
      }
      calldata = iface.encodeFunctionData(action.method, action.args);
    }
  }
  if (calldata === null) {
    try {
      calldata =
        plan.contract?.interface?.encodeFunctionData(
          action.method,
          action.args
        ) ?? null;
    } catch (_) {
      calldata = null;
    }
  }
  return {
    ...action,
    args: action.args.map((arg) => serialiseArg(arg)),
    calldata,
    to: plan.address,
    value: '0',
    signature,
    functionName,
    stateMutability,
    inputs,
  };
}

async function ensureContractOwner(
  label: string,
  contract: any,
  signerAddress: string | undefined,
  enforce: boolean
): Promise<string> {
  if (!contract || typeof contract.owner !== 'function') {
    throw new Error(`${label} does not expose owner()`);
  }
  const owner = await contract.owner();
  if (enforce && (!signerAddress || !sameAddress(owner, signerAddress))) {
    throw new Error(
      `Signer ${signerAddress} is not the owner of ${label} (${owner}). Use --json to generate a call plan for offline execution.`
    );
  }
  return owner;
}

async function writeJsonFile(
  destination: string,
  payload: unknown,
  label: string
) {
  const resolved = path.resolve(destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${label} to ${resolved}`);
}

async function writePlan(plan: AggregatedPlan, destination: string) {
  await writeJsonFile(destination, plan, 'aggregated call plan');
}

function logModulePlan(module: ModuleSummary) {
  console.log(`\n=== ${module.module} ===`);
  console.log(`Address: ${module.address}`);
  if (module.owner) {
    console.log(`Owner:   ${module.owner}`);
  }
  if (module.configPath) {
    console.log(`Config:  ${module.configPath}`);
  }
  if (module.actions.length === 0) {
    console.log('No changes required.');
    return;
  }
  console.log(`Planned actions (${module.actions.length}):`);
  module.actions.forEach((action, index) => {
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    if (action.signature) {
      console.log(`   Signature: ${action.signature}`);
    }
    action.notes?.forEach((note) => console.log(`   Note: ${note}`));
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (action.calldata) {
      console.log(`   Calldata: ${action.calldata}`);
    }
  });
}

function formatSafeInputValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

async function writeSafeBundle(
  plan: AggregatedPlan,
  destination: string,
  options: { name?: string; description?: string }
) {
  if (plan.chainId === undefined) {
    throw new Error('Chain ID required to emit Safe transaction bundle.');
  }
  const transactions: SafeTransactionEntry[] = [];
  for (const module of plan.modules) {
    for (const action of module.actions) {
      if (!action.calldata) {
        throw new Error(
          `Missing calldata for ${module.module}.${action.method}`
        );
      }
      const inputsValues: Record<string, string> = {};
      if (action.inputs && action.inputs.length === action.args.length) {
        action.inputs.forEach((input, index) => {
          inputsValues[input.name] = formatSafeInputValue(action.args[index]);
        });
      }
      const entry: SafeTransactionEntry = {
        to: action.to,
        value: action.value,
        data: action.calldata,
        description: action.label,
      };
      if (Object.keys(inputsValues).length > 0) {
        entry.contractInputsValues = inputsValues;
      }
      if (action.functionName && action.stateMutability) {
        entry.contractMethod = {
          name: action.functionName,
          payable: action.stateMutability === 'payable',
          stateMutability: action.stateMutability,
          inputs: action.inputs ?? [],
        };
      }
      transactions.push(entry);
    }
  }

  const bundle: SafeBundle = {
    version: '1.0',
    chainId: plan.chainId,
    createdAt: new Date().toISOString(),
    meta: {
      name: options.name || 'AGIJobs Owner Control Plan',
      description:
        options.description ||
        'Autogenerated multisig bundle for AGIJobs governance updates.',
      txBuilderVersion: '1.16.6',
    },
    transactions,
  };

  await writeJsonFile(destination, bundle, 'Safe transaction bundle');
}

async function executeModulePlan(plan: ModulePlan) {
  if (!plan.contract) {
    throw new Error(`Missing contract instance for ${plan.module}`);
  }
  if (plan.actions.length === 0) {
    console.log(`No actions for ${plan.module}, skipping.`);
    return [] as string[];
  }
  console.log(`\nExecuting ${plan.module} updates...`);
  const txHashes: string[] = [];
  for (const action of plan.actions) {
    console.log(`→ ${action.method}`);
    const tx = await (plan.contract as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    txHashes.push(tx.hash);
    console.log('   Confirmed');
  }
  return txHashes;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  let signerAddress: string | undefined;
  let signer;
  let detectedChainId: number | undefined;
  try {
    const signers = await ethers.getSigners();
    if (signers.length > 0) {
      signer = signers[0];
      signerAddress = await signers[0].getAddress();
    } else {
      console.warn(
        'No signer available from Hardhat environment; running in read-only mode.'
      );
    }
  } catch (error) {
    console.warn(
      'Unable to resolve Hardhat signer; running in read-only mode.'
    );
    if (process.env.DEBUG) {
      console.warn(error);
    }
  }
  try {
    const net = await ethers.provider.getNetwork();
    if (typeof net.chainId === 'bigint') {
      detectedChainId = Number(net.chainId);
    } else if (typeof (net as any).chainId === 'number') {
      detectedChainId = (net as any).chainId;
    }
  } catch (error) {
    console.warn(
      'Unable to detect chain ID from provider; Safe bundle generation may be unavailable.'
    );
    if (process.env.DEBUG) {
      console.warn(error);
    }
  }

  const tokenResult = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const tokenConfig = tokenResult.config;
  const decimals =
    typeof tokenConfig.decimals === 'number' ? tokenConfig.decimals : 18;
  const symbol =
    typeof tokenConfig.symbol === 'string' && tokenConfig.symbol
      ? tokenConfig.symbol
      : 'tokens';

  const plans: ModulePlan[] = [];
  const summaries: ModuleSummary[] = [];

  let thermodynamicsConfig: ReturnType<typeof loadThermodynamicsConfig> | null =
    null;
  try {
    thermodynamicsConfig = loadThermodynamicsConfig({
      network: network.name,
      chainId: network.config?.chainId,
    });
  } catch (error) {
    console.warn(
      `Thermodynamics config not found or invalid: ${(error as Error).message}`
    );
  }

  let randaoConfig: ReturnType<typeof loadRandaoCoordinatorConfig> | null = null;
  try {
    randaoConfig = loadRandaoCoordinatorConfig({
      network: network.name,
      chainId: network.config?.chainId,
    });
  } catch (error) {
    console.warn(
      `Randao coordinator config not found or invalid: ${(error as Error).message}`
    );
  }

  const jobRegistryAddress = tokenConfig.modules?.jobRegistry;
  if (jobRegistryAddress) {
    const registryAddress = ethers.getAddress(jobRegistryAddress);
    if (registryAddress === ethers.ZeroAddress) {
      console.warn(
        'JobRegistry address resolves to the zero address; skipping.'
      );
    } else {
      const registry = await ethers.getContractAt(
        'contracts/v2/JobRegistry.sol:JobRegistry',
        registryAddress
      );
      const owner = await ensureContractOwner(
        'JobRegistry',
        registry,
        signerAddress,
        cli.execute
      );
      const jobConfig = loadJobRegistryConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const jobPlan = await buildJobRegistryPlan({
        registry,
        config: jobConfig.config,
        configPath: jobConfig.path,
        decimals,
        symbol,
      });
      jobPlan.metadata = { ...(jobPlan.metadata || {}), owner };
      plans.push(jobPlan);
    }
  } else {
    console.warn('JobRegistry address missing from agialpha config; skipping.');
  }

  const stakeManagerAddress = tokenConfig.modules?.stakeManager;
  if (stakeManagerAddress) {
    const address = ethers.getAddress(stakeManagerAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'StakeManager address resolves to the zero address; skipping.'
      );
    } else {
      const stakeManager = await ethers.getContractAt(
        'contracts/v2/StakeManager.sol:StakeManager',
        address
      );
      const owner = await ensureContractOwner(
        'StakeManager',
        stakeManager,
        signerAddress,
        cli.execute
      );
      const stakeConfig = loadStakeManagerConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const stakePlan = await buildStakeManagerPlan({
        stakeManager,
        config: stakeConfig.config,
        configPath: stakeConfig.path,
        decimals,
        symbol,
        ownerAddress: owner,
      });
      stakePlan.metadata = { ...(stakePlan.metadata || {}), owner };
      plans.push(stakePlan);
    }
  } else {
    console.warn(
      'StakeManager address missing from agialpha config; skipping.'
    );
  }

  const feePoolAddress = tokenConfig.modules?.feePool;
  if (feePoolAddress) {
    const address = ethers.getAddress(feePoolAddress);
    if (address === ethers.ZeroAddress) {
      console.warn('FeePool address resolves to the zero address; skipping.');
    } else {
      const feePool = await ethers.getContractAt(
        'contracts/v2/FeePool.sol:FeePool',
        address
      );
      const version = await feePool.version();
      if (version !== 2n) {
        throw new Error(
          `FeePool at ${address} reports version ${version}, expected 2`
        );
      }
      const owner = await ensureContractOwner(
        'FeePool',
        feePool,
        signerAddress,
        cli.execute
      );
      const feeConfig = loadFeePoolConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const feePlan = await buildFeePoolPlan({
        feePool,
        config: feeConfig.config,
        configPath: feeConfig.path,
        ownerAddress: owner,
      });
      feePlan.metadata = { ...(feePlan.metadata || {}), owner };
      plans.push(feePlan);
    }
  } else {
    console.warn('FeePool address missing from agialpha config; skipping.');
  }

  const platformRegistryAddress = tokenConfig.modules?.platformRegistry;
  if (platformRegistryAddress) {
    const address = ethers.getAddress(platformRegistryAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'PlatformRegistry address resolves to the zero address; skipping.'
      );
    } else {
      const platformRegistry = await ethers.getContractAt(
        'contracts/v2/PlatformRegistry.sol:PlatformRegistry',
        address
      );
      const owner = await ensureContractOwner(
        'PlatformRegistry',
        platformRegistry,
        signerAddress,
        cli.execute
      );
      const platformConfig = loadPlatformRegistryConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const platformPlan = await buildPlatformRegistryPlan({
        platformRegistry,
        config: platformConfig.config,
        configPath: platformConfig.path,
        decimals,
        symbol,
        ownerAddress: owner,
      });
      platformPlan.metadata = { ...(platformPlan.metadata || {}), owner };
      plans.push(platformPlan);
    }
  }

  const platformIncentivesAddress = tokenConfig.modules?.platformIncentives;
  if (platformIncentivesAddress) {
    const address = ethers.getAddress(platformIncentivesAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'PlatformIncentives address resolves to the zero address; skipping.'
      );
    } else {
      const platformIncentives = await ethers.getContractAt(
        'contracts/v2/PlatformIncentives.sol:PlatformIncentives',
        address
      );
      const owner = await ensureContractOwner(
        'PlatformIncentives',
        platformIncentives,
        signerAddress,
        cli.execute
      );
      const incentivesConfig = loadPlatformIncentivesConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const incentivesPlan = await buildPlatformIncentivesPlan({
        platformIncentives,
        config: incentivesConfig.config,
        configPath: incentivesConfig.path,
        ownerAddress: owner,
      });
      incentivesPlan.metadata = { ...(incentivesPlan.metadata || {}), owner };
      plans.push(incentivesPlan);
    }
  }

  const taxPolicyAddress = tokenConfig.modules?.taxPolicy;
  if (taxPolicyAddress) {
    const address = ethers.getAddress(taxPolicyAddress);
    if (address === ethers.ZeroAddress) {
      console.warn('TaxPolicy address resolves to the zero address; skipping.');
    } else {
      const taxPolicy = await ethers.getContractAt(
        'contracts/v2/TaxPolicy.sol:TaxPolicy',
        address
      );
      const owner = await ensureContractOwner(
        'TaxPolicy',
        taxPolicy,
        signerAddress,
        cli.execute
      );
      const taxConfig = loadTaxPolicyConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const taxPlan = await buildTaxPolicyPlan({
        taxPolicy,
        config: taxConfig.config,
        configPath: taxConfig.path,
      });
      taxPlan.metadata = { ...(taxPlan.metadata || {}), owner };
      plans.push(taxPlan);
    }
  }

  const randaoAddressCandidate =
    tokenConfig.modules?.randaoCoordinator || randaoConfig?.config.address;
  if (randaoAddressCandidate) {
    const address = ethers.getAddress(randaoAddressCandidate);
    if (address === ethers.ZeroAddress) {
      console.warn('RandaoCoordinator address resolves to the zero address; skipping.');
    } else {
      const randao = await ethers.getContractAt(
        'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator',
        address
      );
      const owner = await ensureContractOwner(
        'RandaoCoordinator',
        randao,
        signerAddress,
        cli.execute
      );
      const plan = await buildRandaoCoordinatorPlan({
        randao,
        config: randaoConfig?.config || {},
        configPath: randaoConfig?.path,
      });
      plan.metadata = { ...(plan.metadata || {}), owner };
      plans.push(plan);
    }
  }

  const identityRegistryAddress = tokenConfig.modules?.identityRegistry;
  if (identityRegistryAddress) {
    const address = ethers.getAddress(identityRegistryAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'IdentityRegistry address resolves to the zero address; skipping.'
      );
    } else {
      const identityRegistry = await ethers.getContractAt(
        'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
        address
      );
      const owner = await ensureContractOwner(
        'IdentityRegistry',
        identityRegistry,
        signerAddress,
        cli.execute
      );
      const identityConfig = loadIdentityRegistryConfig({
        network: network.name,
        chainId: network.config?.chainId,
      });
      const identityPlan = await buildIdentityRegistryPlan({
        identityRegistry,
        config: identityConfig.config,
        configPath: identityConfig.path,
      });
      identityPlan.metadata = { ...(identityPlan.metadata || {}), owner };
      plans.push(identityPlan);
    }
  }

  const rewardEngineAddress =
    tokenConfig.modules?.rewardEngine ||
    thermodynamicsConfig?.config.rewardEngine?.address;
  if (rewardEngineAddress) {
    const address = ethers.getAddress(rewardEngineAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'RewardEngineMB address resolves to the zero address; skipping.'
      );
    } else {
      const rewardEngine = await ethers.getContractAt(
        'contracts/v2/RewardEngineMB.sol:RewardEngineMB',
        address
      );
      const owner = await ensureContractOwner(
        'RewardEngineMB',
        rewardEngine,
        signerAddress,
        cli.execute
      );
      const rewardPlan = await buildRewardEnginePlan({
        rewardEngine,
        config: thermodynamicsConfig?.config.rewardEngine || {},
        configPath: thermodynamicsConfig?.path,
      });
      rewardPlan.metadata = { ...(rewardPlan.metadata || {}), owner };
      plans.push(rewardPlan);
    }
  }

  const thermostatAddress = thermodynamicsConfig?.config.thermostat?.address;
  if (thermostatAddress) {
    const address = ethers.getAddress(thermostatAddress);
    if (address === ethers.ZeroAddress) {
      console.warn(
        'Thermostat address resolves to the zero address; skipping.'
      );
    } else {
      const thermostat = await ethers.getContractAt(
        'contracts/v2/Thermostat.sol:Thermostat',
        address
      );
      const owner = await ensureContractOwner(
        'Thermostat',
        thermostat,
        signerAddress,
        cli.execute
      );
      const thermoPlan = await buildThermostatPlan({
        thermostat,
        config: thermodynamicsConfig?.config.thermostat || {},
        configPath: thermodynamicsConfig?.path,
      });
      thermoPlan.metadata = { ...(thermoPlan.metadata || {}), owner };
      plans.push(thermoPlan);
    }
  }

  if (plans.length === 0) {
    console.warn('No module addresses resolved; nothing to plan.');
  }

  let totalActions = 0;
  for (const plan of plans) {
    const owner = (plan.metadata?.owner as string | undefined) ?? undefined;
    const moduleSummary: ModuleSummary = {
      module: plan.module,
      address: plan.address,
      owner,
      configPath: plan.configPath,
      actions: plan.actions.map((action) => buildActionSummary(plan, action)),
      totalActions: plan.actions.length,
    };
    totalActions += plan.actions.length;
    summaries.push(moduleSummary);
  }

  const aggregated: AggregatedPlan = {
    network: tokenResult.network || network.name,
    chainId:
      detectedChainId !== undefined
        ? detectedChainId
        : typeof network.config?.chainId === 'number'
        ? network.config?.chainId
        : undefined,
    signer: signerAddress || '',
    generatedAt: new Date().toISOString(),
    modules: summaries,
    totalActions,
  };

  if (cli.outPath) {
    await writePlan(aggregated, cli.outPath);
  }

  if (cli.safeOut) {
    await writeSafeBundle(aggregated, cli.safeOut, {
      name: cli.safeName,
      description: cli.safeDescription,
    });
  }

  if (cli.json) {
    console.log(JSON.stringify(aggregated, null, 2));
  } else {
    console.log(`Signer:   ${aggregated.signer || 'n/a (read-only)'}`);
    console.log(`Network:  ${aggregated.network}`);
    if (aggregated.chainId) {
      console.log(`Chain ID: ${aggregated.chainId}`);
    }
    console.log(`Modules planned: ${summaries.length}`);
    console.log(`Total actions:   ${totalActions}`);
    summaries.forEach((summary) => logModulePlan(summary));
  }

  if (!cli.execute) {
    if (!cli.json) {
      console.log(
        '\nDry run complete. Use --execute to apply the plan or --json/--out for offline execution.'
      );
    }
    return;
  }

  for (const plan of plans) {
    await executeModulePlan(plan);
  }
  console.log('\nAll module updates confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
