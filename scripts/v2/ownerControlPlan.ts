import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  loadTokenConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
} from '../config';
import { buildJobRegistryPlan } from './lib/jobRegistryPlan';
import { buildStakeManagerPlan } from './lib/stakeManagerPlan';
import { buildFeePoolPlan } from './lib/feePoolPlan';
import { describeArgs, sameAddress } from './lib/utils';
import type { ModulePlan, PlannedAction } from './lib/types';

interface CliOptions {
  execute: boolean;
  json: boolean;
  outPath?: string;
}

interface ActionSummary extends PlannedAction {
  calldata?: string | null;
  to: string;
  value: string;
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

function buildActionSummary(plan: ModulePlan, action: PlannedAction): ActionSummary {
  const calldata = plan.iface?.encodeFunctionData(action.method, action.args) ?? null;
  return {
    ...action,
    args: action.args.map((arg) => serialiseArg(arg)),
    calldata,
    to: plan.address,
    value: '0',
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

async function writePlan(plan: AggregatedPlan, destination: string) {
  const resolved = path.resolve(destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`Wrote aggregated call plan to ${resolved}`);
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
    action.notes?.forEach((note) => console.log(`   Note: ${note}`));
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (action.calldata) {
      console.log(`   Calldata: ${action.calldata}`);
    }
  });
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
  try {
    const signers = await ethers.getSigners();
    if (signers.length > 0) {
      signer = signers[0];
      signerAddress = await signers[0].getAddress();
    } else {
      console.warn('No signer available from Hardhat environment; running in read-only mode.');
    }
  } catch (error) {
    console.warn('Unable to resolve Hardhat signer; running in read-only mode.');
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

  const jobRegistryAddress = tokenConfig.modules?.jobRegistry;
  if (jobRegistryAddress) {
    const registryAddress = ethers.getAddress(jobRegistryAddress);
    if (registryAddress === ethers.ZeroAddress) {
      console.warn('JobRegistry address resolves to the zero address; skipping.');
    } else {
    const registry = await ethers.getContractAt(
      'contracts/v2/JobRegistry.sol:JobRegistry',
      registryAddress
    );
    const owner = await ensureContractOwner('JobRegistry', registry, signerAddress, cli.execute);
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
      console.warn('StakeManager address resolves to the zero address; skipping.');
    } else {
    const stakeManager = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      address
    );
    const owner = await ensureContractOwner('StakeManager', stakeManager, signerAddress, cli.execute);
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
    console.warn('StakeManager address missing from agialpha config; skipping.');
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
    const owner = await ensureContractOwner('FeePool', feePool, signerAddress, cli.execute);
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
    chainId: network.config?.chainId,
    signer: signerAddress || '',
    generatedAt: new Date().toISOString(),
    modules: summaries,
    totalActions,
  };

  if (cli.outPath) {
    await writePlan(aggregated, cli.outPath);
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
      console.log('\nDry run complete. Use --execute to apply the plan or --json/--out for offline execution.');
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
