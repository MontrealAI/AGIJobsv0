import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadTokenConfig,
  loadOwnerControlConfig,
  type OwnerControlConfig,
  type OwnerControlModuleConfig,
  type OwnerControlModuleType,
} from '../config';
import { describeArgs, sameAddress } from './lib/utils';

type ModuleType = OwnerControlModuleType;

type ExtraActionPosition = 'before' | 'after';

interface EnsureGovernanceExtraDefinition {
  kind: 'ensureGovernance';
  method: 'setGovernance';
  read: 'governance';
  abi: string[];
  note?: string;
  position?: ExtraActionPosition;
}

type ModuleExtraDefinition = EnsureGovernanceExtraDefinition;

interface ModuleDefinition {
  key: string;
  label: string;
  type: ModuleType;
  extras?: ModuleExtraDefinition[];
}

interface ModuleOverride extends OwnerControlModuleConfig {
  notes?: string[];
  extras?: ModuleExtraDefinition[];
}

interface CliOptions {
  execute: boolean;
  json: boolean;
  configPath?: string;
  governance?: string;
  owner?: string;
  safeOut?: string;
  safeName?: string;
  safeDescription?: string;
}

interface RotationAction {
  moduleKey: string;
  moduleName: string;
  type: ModuleType;
  address: string;
  method: 'setGovernance' | 'transferOwnership';
  args: [string];
  currentOwner?: string;
  desiredOwner: string;
  pendingOwner?: string;
  targetSource?: string;
  notes: string[];
  contract: Contract;
  calldata: string;
}

interface PendingAcceptance {
  moduleKey: string;
  moduleName: string;
  address: string;
  pendingOwner: string;
}

interface MissingEntry {
  moduleKey: string;
  moduleName: string;
  reason: string;
}

interface RotationPlan {
  network: string;
  chainId?: number;
  signer?: string;
  tokenConfigPath: string;
  ownerControlPath?: string;
  actions: RotationAction[];
  pendingAcceptances: PendingAcceptance[];
  missingTargets: MissingEntry[];
  missingAddresses: MissingEntry[];
  skipped: MissingEntry[];
  upToDate: {
    moduleKey: string;
    moduleName: string;
    address: string;
    owner?: string;
  }[];
}

const DEFAULT_MODULES: Record<string, ModuleDefinition> = {
  stakeManager: {
    key: 'stakeManager',
    label: 'StakeManager',
    type: 'governable',
  },
  jobRegistry: { key: 'jobRegistry', label: 'JobRegistry', type: 'governable' },
  rewardEngine: {
    key: 'rewardEngine',
    label: 'RewardEngineMB',
    type: 'governable',
  },
  thermostat: { key: 'thermostat', label: 'Thermostat', type: 'governable' },
  systemPause: { key: 'systemPause', label: 'SystemPause', type: 'governable' },
  validationModule: {
    key: 'validationModule',
    label: 'ValidationModule',
    type: 'ownable',
  },
  reputationEngine: {
    key: 'reputationEngine',
    label: 'ReputationEngine',
    type: 'ownable',
  },
  disputeModule: {
    key: 'disputeModule',
    label: 'DisputeModule',
    type: 'ownable',
  },
  arbitratorCommittee: {
    key: 'arbitratorCommittee',
    label: 'ArbitratorCommittee',
    type: 'ownable',
  },
  certificateNFT: {
    key: 'certificateNFT',
    label: 'CertificateNFT',
    type: 'ownable',
  },
  feePool: {
    key: 'feePool',
    label: 'FeePool',
    type: 'ownable',
    extras: [
      {
        kind: 'ensureGovernance',
        method: 'setGovernance',
        read: 'governance',
        abi: [
          'function governance() view returns (address)',
          'function setGovernance(address _governance)',
        ],
        note: 'Align FeePool.governance so emergency withdrawals require the multisig/timelock.',
        position: 'before',
      },
    ],
  },
  platformRegistry: {
    key: 'platformRegistry',
    label: 'PlatformRegistry',
    type: 'ownable',
  },
  platformIncentives: {
    key: 'platformIncentives',
    label: 'PlatformIncentives',
    type: 'ownable',
  },
  jobRouter: { key: 'jobRouter', label: 'JobRouter', type: 'ownable' },
  taxPolicy: { key: 'taxPolicy', label: 'TaxPolicy', type: 'ownable2step' },
  identityRegistry: {
    key: 'identityRegistry',
    label: 'IdentityRegistry',
    type: 'ownable2step',
  },
  attestationRegistry: {
    key: 'attestationRegistry',
    label: 'AttestationRegistry',
    type: 'ownable',
  },
};

const ABI_BY_TYPE: Record<ModuleType, string[]> = {
  governable: [
    'function owner() view returns (address)',
    'function governance() view returns (address)',
    'function setGovernance(address _governance)',
  ],
  ownable: [
    'function owner() view returns (address)',
    'function transferOwnership(address newOwner)',
  ],
  ownable2step: [
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
    'function transferOwnership(address newOwner)',
    'function acceptOwnership()',
  ],
};

const FUNCTION_METADATA: Record<
  RotationAction['method'],
  { inputName: string }
> = {
  setGovernance: { inputName: '_governance' },
  transferOwnership: { inputName: 'newOwner' },
};

function parseAddressOption(
  value: string | undefined,
  label: string
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) {
      throw new Error(`${label} cannot be the zero address`);
    }
    return address;
  } catch (error: any) {
    throw new Error(
      `${label} must be a valid address: ${error?.message || error}`
    );
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--execute':
        options.execute = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--config': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--config requires a file path');
        }
        options.configPath = value;
        i += 1;
        break;
      }
      case '--governance': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--governance requires an address');
        }
        options.governance = parseAddressOption(value, '--governance');
        i += 1;
        break;
      }
      case '--owner': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--owner requires an address');
        }
        options.owner = parseAddressOption(value, '--owner');
        i += 1;
        break;
      }
      case '--safe':
      case '--safe-out': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a file path`);
        }
        options.safeOut = value;
        i += 1;
        break;
      }
      case '--safe-name': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--safe-name requires a value');
        }
        options.safeName = value;
        i += 1;
        break;
      }
      case '--safe-description':
      case '--safe-desc': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.safeDescription = value;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }
  return options;
}

function normaliseCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const address = ethers.getAddress(value);
    return address === ethers.ZeroAddress ? undefined : address;
  } catch (_) {
    throw new Error(`Invalid address ${value}`);
  }
}

function pickTarget(
  moduleKey: string,
  type: ModuleType,
  override: ModuleOverride | undefined,
  cli: CliOptions,
  ownerConfig: OwnerControlConfig,
  tokenConfig: ReturnType<typeof loadTokenConfig>['config']
): { value?: string; source?: string } {
  const candidates: { value?: string; source: string }[] = [];

  if (type === 'governable') {
    candidates.push(
      {
        value: override?.governance,
        source: `owner-control.modules.${moduleKey}.governance`,
      },
      { value: cli.governance, source: '--governance' },
      { value: ownerConfig.governance, source: 'owner-control.governance' },
      {
        value: override?.owner,
        source: `owner-control.modules.${moduleKey}.owner`,
      },
      { value: cli.owner, source: '--owner' },
      { value: ownerConfig.owner, source: 'owner-control.owner' },
      {
        value: tokenConfig.governance?.timelock,
        source: 'agialpha.governance.timelock',
      },
      {
        value: tokenConfig.governance?.govSafe,
        source: 'agialpha.governance.govSafe',
      }
    );
  } else {
    candidates.push(
      {
        value: override?.owner,
        source: `owner-control.modules.${moduleKey}.owner`,
      },
      { value: cli.owner, source: '--owner' },
      { value: ownerConfig.owner, source: 'owner-control.owner' },
      {
        value: override?.governance,
        source: `owner-control.modules.${moduleKey}.governance`,
      },
      { value: cli.governance, source: '--governance' },
      { value: ownerConfig.governance, source: 'owner-control.governance' },
      {
        value: tokenConfig.governance?.timelock,
        source: 'agialpha.governance.timelock',
      },
      {
        value: tokenConfig.governance?.govSafe,
        source: 'agialpha.governance.govSafe',
      }
    );
  }

  for (const candidate of candidates) {
    if (!candidate.value) {
      continue;
    }
    const normalised = normaliseCandidate(candidate.value);
    if (normalised) {
      return { value: normalised, source: candidate.source };
    }
  }
  return {};
}

async function readAddress(
  contract: Contract,
  method: string
): Promise<string | undefined> {
  try {
    const value = await (contract as any)[method]();
    if (typeof value === 'string') {
      return ethers.getAddress(value);
    }
  } catch (_) {
    // ignore
  }
  return undefined;
}

function determineModuleDefinition(
  moduleKey: string,
  override: ModuleOverride | undefined
): ModuleDefinition {
  const base = DEFAULT_MODULES[moduleKey];
  const typeCandidate =
    (override?.type as ModuleType | undefined) || base?.type;
  if (!typeCandidate) {
    throw new Error(
      `Module ${moduleKey} is unknown. Specify type in owner-control configuration.`
    );
  }
  const label = override?.label || base?.label || moduleKey;
  const extras = override?.extras || base?.extras;
  return { key: moduleKey, label, type: typeCandidate, extras };
}

interface ExtraActionPlan {
  pre: RotationAction[];
  post: RotationAction[];
  satisfied: boolean;
}

async function evaluateModuleExtras(
  definition: ModuleDefinition,
  moduleKey: string,
  moduleName: string,
  moduleAddress: string,
  desired: { value?: string; source?: string },
  currentOwner: string | undefined,
  pendingOwner: string | undefined,
  contract: Contract
): Promise<ExtraActionPlan> {
  const extras = definition.extras || [];
  if (extras.length === 0 || !desired.value) {
    return { pre: [], post: [], satisfied: true };
  }

  const pre: RotationAction[] = [];
  const post: RotationAction[] = [];

  for (const extra of extras) {
    switch (extra.kind) {
      case 'ensureGovernance': {
        const currentGovernance = await readAddress(contract, extra.read);
        if (
          currentGovernance &&
          sameAddress(currentGovernance, desired.value)
        ) {
          break;
        }
        const args: [string] = [desired.value];
        const calldata = contract.interface.encodeFunctionData(
          extra.method,
          args
        );
        const notes: string[] = [];
        if (desired.source) {
          notes.push(`Target derived from ${desired.source}`);
        }
        if (extra.note) {
          notes.push(extra.note);
        }
        const action: RotationAction = {
          moduleKey,
          moduleName,
          type: definition.type,
          address: moduleAddress,
          method: extra.method,
          args,
          currentOwner,
          desiredOwner: desired.value,
          pendingOwner,
          targetSource: desired.source,
          notes,
          contract,
          calldata,
        };
        if ((extra.position || 'after') === 'before') {
          pre.push(action);
        } else {
          post.push(action);
        }
        break;
      }
      default:
        throw new Error(
          `Unsupported extra action ${extra.kind} for module ${moduleKey}`
        );
    }
  }

  return { pre, post, satisfied: pre.length === 0 && post.length === 0 };
}

async function buildRotationPlan(
  cli: CliOptions,
  ownerConfig: OwnerControlConfig,
  tokenConfig: ReturnType<typeof loadTokenConfig>['config']
): Promise<RotationPlan> {
  const plan: RotationPlan = {
    network: network.name,
    chainId: Number(network.config?.chainId || 0) || undefined,
    tokenConfigPath: '',
    ownerControlPath: '',
    actions: [],
    pendingAcceptances: [],
    missingTargets: [],
    missingAddresses: [],
    skipped: [],
    upToDate: [],
  };

  const ownerModules = ownerConfig.modules || {};
  const moduleKeys = new Set([
    ...Object.keys(DEFAULT_MODULES),
    ...Object.keys(ownerModules),
  ]);

  for (const moduleKey of moduleKeys) {
    const override = ownerModules[moduleKey] as ModuleOverride | undefined;
    if (override?.skip) {
      plan.skipped.push({
        moduleKey,
        moduleName: determineModuleDefinition(moduleKey, override).label,
        reason: 'Skipped via owner-control configuration',
      });
      continue;
    }

    const definition = determineModuleDefinition(moduleKey, override);
    const moduleName = definition.label;
    const type = definition.type;

    const addressCandidate =
      override?.address ||
      tokenConfig.modules?.[moduleKey] ||
      tokenConfig.contracts?.[moduleKey];

    const moduleAddress = normaliseCandidate(addressCandidate);
    if (!moduleAddress) {
      plan.missingAddresses.push({
        moduleKey,
        moduleName,
        reason: 'Missing contract address in configuration',
      });
      continue;
    }

    const code = await ethers.provider.getCode(moduleAddress);
    if (!code || code === '0x') {
      plan.missingAddresses.push({
        moduleKey,
        moduleName,
        reason: `No contract deployed at ${moduleAddress}`,
      });
      continue;
    }

    const desired = pickTarget(
      moduleKey,
      type,
      override,
      cli,
      ownerConfig,
      tokenConfig
    );

    if (!desired.value) {
      plan.missingTargets.push({
        moduleKey,
        moduleName,
        reason: 'No governance/owner target configured',
      });
      continue;
    }

    const abi = [...ABI_BY_TYPE[type]];
    if (definition.extras) {
      for (const extra of definition.extras) {
        for (const fragment of extra.abi) {
          if (!abi.includes(fragment)) {
            abi.push(fragment);
          }
        }
      }
    }
    const contract = await ethers.getContractAt(abi, moduleAddress);
    const currentOwner = await readAddress(contract, 'owner');
    const pendingOwner =
      type === 'governable'
        ? undefined
        : await readAddress(contract, 'pendingOwner');

    const extraPlan = await evaluateModuleExtras(
      definition,
      moduleKey,
      moduleName,
      moduleAddress,
      desired,
      currentOwner,
      pendingOwner,
      contract
    );

    if (currentOwner && sameAddress(currentOwner, desired.value)) {
      if (extraPlan.satisfied) {
        plan.upToDate.push({
          moduleKey,
          moduleName,
          address: moduleAddress,
          owner: currentOwner,
        });
      } else {
        plan.actions.push(...extraPlan.pre, ...extraPlan.post);
      }
      continue;
    }

    if (
      type === 'ownable2step' &&
      pendingOwner &&
      sameAddress(pendingOwner, desired.value) &&
      !sameAddress(currentOwner, desired.value) &&
      extraPlan.satisfied
    ) {
      plan.pendingAcceptances.push({
        moduleKey,
        moduleName,
        address: moduleAddress,
        pendingOwner,
      });
      continue;
    }

    const method: RotationAction['method'] =
      type === 'governable' ? 'setGovernance' : 'transferOwnership';
    const args: [string] = [desired.value];
    const calldata = contract.interface.encodeFunctionData(method, args);

    const notes: string[] = [];
    if (desired.source) {
      notes.push(`Target derived from ${desired.source}`);
    }
    if (override?.notes) {
      notes.push(...override.notes.map((note) => String(note)));
    }
    if (type === 'ownable2step') {
      notes.push(
        'Transfer requires acceptOwnership() by the new owner after execution.'
      );
    }
    if (!currentOwner) {
      notes.push(
        'Current owner() could not be read; ensure signer has control.'
      );
    }

    plan.actions.push(...extraPlan.pre);

    plan.actions.push({
      moduleKey,
      moduleName,
      type,
      address: moduleAddress,
      method,
      args,
      currentOwner,
      desiredOwner: desired.value,
      pendingOwner,
      targetSource: desired.source,
      notes,
      contract,
      calldata,
    });

    plan.actions.push(...extraPlan.post);
  }

  return plan;
}

function formatAddress(address?: string): string {
  if (!address) {
    return 'unknown';
  }
  const normalised = ethers.getAddress(address);
  if (normalised === ethers.ZeroAddress) {
    return `${normalised} (zero address)`;
  }
  return normalised;
}

function describePlan(plan: RotationPlan) {
  console.log('Governance & Ownership Rotation Plan');
  console.log('====================================');
  console.log(`Network: ${plan.network}`);
  if (plan.chainId !== undefined) {
    console.log(`Chain ID: ${plan.chainId}`);
  }
  if (plan.signer) {
    console.log(`Signer: ${plan.signer}`);
  }
  console.log('');
  console.log(`Actions required: ${plan.actions.length}`);
  if (plan.upToDate.length > 0) {
    console.log(`Modules already aligned: ${plan.upToDate.length}`);
  }
  if (plan.pendingAcceptances.length > 0) {
    console.log(
      `Pending acceptOwnership calls: ${plan.pendingAcceptances.length}`
    );
  }
  if (plan.missingTargets.length > 0) {
    console.log(`Modules missing target owner: ${plan.missingTargets.length}`);
  }
  if (plan.missingAddresses.length > 0) {
    console.log(
      `Modules missing address deployment: ${plan.missingAddresses.length}`
    );
  }
  if (plan.skipped.length > 0) {
    console.log(`Modules skipped: ${plan.skipped.length}`);
  }
  console.log('');

  plan.actions.forEach((action, index) => {
    console.log(`${index + 1}. ${action.moduleName} (${action.type})`);
    console.log(`   Address: ${action.address}`);
    if (action.currentOwner) {
      console.log(`   Current owner: ${formatAddress(action.currentOwner)}`);
    } else {
      console.log('   Current owner: unavailable');
    }
    console.log(`   Desired owner: ${formatAddress(action.desiredOwner)}`);
    console.log(
      `   Call: ${action.method}(${describeArgs(action.args as any[])})`
    );
    console.log(`   Calldata: ${action.calldata}`);
    action.notes.forEach((note) => {
      console.log(`   Note: ${note}`);
    });
    console.log('');
  });

  if (plan.pendingAcceptances.length > 0) {
    console.log('Pending acceptOwnership required:');
    plan.pendingAcceptances.forEach((entry) => {
      console.log(
        ` - ${entry.moduleName} (${entry.address}) waiting for ${formatAddress(
          entry.pendingOwner
        )} to accept`
      );
    });
    console.log('');
  }

  if (plan.missingTargets.length > 0) {
    console.log('Missing target owner configuration:');
    plan.missingTargets.forEach((entry) => {
      console.log(` - ${entry.moduleName}: ${entry.reason}`);
    });
    console.log('');
  }

  if (plan.missingAddresses.length > 0) {
    console.log('Missing or invalid contract addresses:');
    plan.missingAddresses.forEach((entry) => {
      console.log(` - ${entry.moduleName}: ${entry.reason}`);
    });
    console.log('');
  }
}

interface SafeTransactionEntry {
  to: string;
  value: string;
  data: string;
  description?: string;
  contractInputsValues?: Record<string, string>;
  contractMethod?: {
    name: string;
    payable: boolean;
    stateMutability: string;
    inputs: { name: string; type: string }[];
  };
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

async function writeJsonFile(
  destination: string,
  value: unknown,
  label: string
) {
  const dir = path.dirname(destination);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    destination,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
  console.log(`${label} written to ${destination}`);
}

async function writeSafeBundle(
  plan: RotationPlan,
  actions: RotationAction[],
  destination: string,
  options: { name?: string; description?: string }
) {
  if (!plan.chainId) {
    throw new Error('Chain ID required for Safe transaction bundle.');
  }

  const transactions: SafeTransactionEntry[] = actions.map((action) => {
    const metadata = FUNCTION_METADATA[action.method];
    const inputsValues: Record<string, string> = {};
    inputsValues[metadata.inputName] = action.desiredOwner;
    return {
      to: action.address,
      value: '0',
      data: action.calldata,
      description: `${action.moduleName}: ${action.method}`,
      contractInputsValues: inputsValues,
      contractMethod: {
        name: action.method,
        payable: false,
        stateMutability: 'nonpayable',
        inputs: [{ name: metadata.inputName, type: 'address' }],
      },
    };
  });

  const bundle: SafeBundle = {
    version: '1.0',
    chainId: plan.chainId,
    createdAt: new Date().toISOString(),
    meta: {
      name: options.name || 'AGIJobs Governance Rotation',
      description:
        options.description ||
        'Autogenerated multisig bundle for governance and ownership rotation.',
      txBuilderVersion: '1.16.6',
    },
    transactions,
  };

  await writeJsonFile(destination, bundle, 'Safe transaction bundle');
}

async function executeActions(actions: RotationAction[]) {
  if (actions.length === 0) {
    console.log('No governance updates to execute.');
    return;
  }
  console.log('\nSubmitting transactions...');
  for (const action of actions) {
    console.log(`→ ${action.moduleName}: ${action.method}`);
    const tx = await (action.contract as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.moduleName} failed`);
    }
    console.log('   Confirmed');
  }
}

function serialisePlanForJson(plan: RotationPlan) {
  return {
    network: plan.network,
    chainId: plan.chainId,
    signer: plan.signer,
    actions: plan.actions.map((action) => ({
      moduleKey: action.moduleKey,
      moduleName: action.moduleName,
      type: action.type,
      address: action.address,
      method: action.method,
      args: action.args,
      currentOwner: action.currentOwner,
      desiredOwner: action.desiredOwner,
      pendingOwner: action.pendingOwner,
      targetSource: action.targetSource,
      notes: action.notes,
      calldata: action.calldata,
    })),
    pendingAcceptances: plan.pendingAcceptances,
    missingTargets: plan.missingTargets,
    missingAddresses: plan.missingAddresses,
    skipped: plan.skipped,
    upToDate: plan.upToDate,
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const { config: ownerConfig, path: ownerConfigPath } = loadOwnerControlConfig(
    {
      network: network.name,
      chainId: network.config?.chainId,
      path: cli.configPath,
    }
  );

  const plan = await buildRotationPlan(cli, ownerConfig, tokenConfig);
  plan.tokenConfigPath = tokenConfigPath;
  plan.ownerControlPath = ownerConfigPath;

  const signers = await ethers.getSigners();
  if (signers.length > 0) {
    plan.signer = await signers[0].getAddress();
  }

  if (cli.json) {
    console.log(JSON.stringify(serialisePlanForJson(plan), null, 2));
    return;
  }

  describePlan(plan);

  if (cli.safeOut) {
    await writeSafeBundle(plan, plan.actions, cli.safeOut, {
      name: cli.safeName,
      description: cli.safeDescription,
    });
  }

  if (plan.actions.length === 0) {
    console.log(
      'All configured modules already target the desired governance.'
    );
    return;
  }

  if (!cli.execute) {
    console.log(
      '\nDry run complete. Re-run with --execute once ready to submit transactions.'
    );
    return;
  }

  if (!plan.signer) {
    throw new Error('No signer available to execute transactions.');
  }

  for (const action of plan.actions) {
    if (action.currentOwner && !sameAddress(action.currentOwner, plan.signer)) {
      throw new Error(
        `${action.moduleName}: signer ${plan.signer} does not control current owner ${action.currentOwner}`
      );
    }
  }

  await executeActions(plan.actions);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
