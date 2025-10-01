import fs from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadTokenConfig } from '../config';

type ModuleKey =
  | 'jobRegistry'
  | 'stakeManager'
  | 'validationModule'
  | 'disputeModule'
  | 'platformRegistry'
  | 'feePool'
  | 'reputationEngine'
  | 'arbitratorCommittee';

type ModuleAddresses = Record<ModuleKey, string>;

type ModuleConfig = Partial<Record<ModuleKey, string>> & {
  systemPause?: string;
  owner?: string;
  governance?: string;
};

interface CliOptions {
  execute: boolean;
  configPath?: string;
  pauseAddress?: string;
  overrides: Partial<Record<ModuleKey, string>>;
  forceRefresh: boolean;
  skipRefresh: boolean;
  owner?: string;
  governance?: string;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  contract: Contract;
  notes?: string[];
}

const MODULE_KEYS: ModuleKey[] = [
  'jobRegistry',
  'stakeManager',
  'validationModule',
  'disputeModule',
  'platformRegistry',
  'feePool',
  'reputationEngine',
  'arbitratorCommittee',
];

const FLAG_TO_KEY = new Map<string, ModuleKey>([
  ['--job-registry', 'jobRegistry'],
  ['--jobRegistry', 'jobRegistry'],
  ['--stake-manager', 'stakeManager'],
  ['--stakeManager', 'stakeManager'],
  ['--validation-module', 'validationModule'],
  ['--validationModule', 'validationModule'],
  ['--dispute-module', 'disputeModule'],
  ['--disputeModule', 'disputeModule'],
  ['--platform-registry', 'platformRegistry'],
  ['--platformRegistry', 'platformRegistry'],
  ['--fee-pool', 'feePool'],
  ['--feePool', 'feePool'],
  ['--reputation-engine', 'reputationEngine'],
  ['--reputationEngine', 'reputationEngine'],
  ['--arbitrator-committee', 'arbitratorCommittee'],
  ['--arbitratorCommittee', 'arbitratorCommittee'],
]);

const OWNER_AND_PAUSER_ABI = [
  'function owner() view returns (address)',
  'function pauser() view returns (address)',
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    overrides: {},
    forceRefresh: false,
    skipRefresh: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--config requires a file path');
      }
      options.configPath = value;
      i += 1;
      continue;
    }
    if (
      arg === '--pause' ||
      arg === '--system-pause' ||
      arg === '--systemPause'
    ) {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--pause requires an address');
      }
      options.pauseAddress = value;
      i += 1;
      continue;
    }
    if (arg === '--refresh') {
      options.forceRefresh = true;
      continue;
    }
    if (arg === '--no-refresh') {
      options.skipRefresh = true;
      continue;
    }
    if (arg === '--owner' || arg === '--expected-owner') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires an address`);
      }
      const address = ethers.getAddress(value);
      if (address === ethers.ZeroAddress) {
        throw new Error(`${arg} cannot be the zero address`);
      }
      options.owner = address;
      i += 1;
      continue;
    }
    if (arg === '--governance') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--governance requires an address');
      }
      const address = ethers.getAddress(value);
      if (address === ethers.ZeroAddress) {
        throw new Error('--governance cannot be the zero address');
      }
      options.governance = address;
      i += 1;
      continue;
    }
    const key = FLAG_TO_KEY.get(arg);
    if (key) {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires an address`);
      }
      options.overrides[key] = value;
      i += 1;
    }
  }

  if (options.forceRefresh && options.skipRefresh) {
    throw new Error('Cannot use --refresh and --no-refresh together');
  }

  return options;
}

function ensureAddress(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is not configured`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is not configured`);
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const address = ethers.getAddress(prefixed);
  if (address === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return address;
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function readModuleConfig(filePath: string): ModuleConfig {
  const resolved = path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<
    string,
    any
  >;
  const modules =
    raw.modules && typeof raw.modules === 'object' ? raw.modules : {};
  const result: ModuleConfig = {};

  for (const key of MODULE_KEYS) {
    const value = raw[key] ?? modules[key];
    if (typeof value === 'string' && value.trim()) {
      result[key] = value;
    }
  }

  const pauseValue = raw.systemPause ?? modules.systemPause ?? raw.system_pause;
  if (typeof pauseValue === 'string' && pauseValue.trim()) {
    result.systemPause = pauseValue;
  }

  const ownerValue = raw.owner ?? raw.expectedOwner ?? modules.owner;
  if (typeof ownerValue === 'string' && ownerValue.trim()) {
    result.owner = ownerValue;
  }

  const governanceValue = raw.governance ?? modules.governance;
  if (typeof governanceValue === 'string' && governanceValue.trim()) {
    result.governance = governanceValue;
  }

  return result;
}

function describeArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') return arg.toString();
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'boolean') return arg ? 'true' : 'false';
      return JSON.stringify(arg);
    })
    .join(', ');
}

async function executeActions(
  actions: PlannedAction[],
  execute: boolean
): Promise<void> {
  if (!actions.length) {
    console.log('No changes required.');
    return;
  }

  console.log('\nPlanned actions:');
  for (const action of actions) {
    const lines = [
      `- ${action.label}: ${action.method}(${describeArgs(action.args)})`,
    ];
    if (action.notes && action.notes.length) {
      for (const note of action.notes) {
        lines.push(`    note: ${note}`);
      }
    }
    console.log(lines.join('\n'));
  }

  if (!execute) {
    console.log('\nDry run complete. Re-run with --execute to apply changes.');
    return;
  }

  for (const action of actions) {
    console.log(`\nExecuting ${action.label}...`);
    const tx = await (action.contract as any)[action.method](...action.args);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log('  confirmed');
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });

  const configModules: ModuleConfig = cli.configPath
    ? readModuleConfig(cli.configPath)
    : {};

  const modules: ModuleAddresses = {} as ModuleAddresses;
  for (const key of MODULE_KEYS) {
    const candidate =
      cli.overrides[key] ??
      configModules[key] ??
      (tokenConfig.modules && typeof tokenConfig.modules[key] === 'string'
        ? (tokenConfig.modules[key] as string)
        : undefined);
    modules[key] = ensureAddress(candidate, `${key} address`);
  }

  const pauseAddressCandidate =
    cli.pauseAddress ??
    configModules.systemPause ??
    (tokenConfig.modules && typeof tokenConfig.modules.systemPause === 'string'
      ? (tokenConfig.modules.systemPause as string)
      : undefined);
  const pauseAddress = ensureAddress(
    pauseAddressCandidate,
    'SystemPause address'
  );

  const governanceOwnerCandidate =
    cli.owner ??
    cli.governance ??
    configModules.owner ??
    configModules.governance ??
    tokenConfig.governance?.timelock ??
    tokenConfig.governance?.govSafe;
  const expectedOwner = governanceOwnerCandidate
    ? ensureAddress(governanceOwnerCandidate, 'governance owner')
    : undefined;
  if (!expectedOwner) {
    console.warn(
      'No governance owner configured; module ownership checks will be skipped.'
    );
  }

  const pause = await ethers.getContractAt(
    'contracts/v2/SystemPause.sol:SystemPause',
    pauseAddress
  );
  const signer = await ethers.getSigner();
  const signerAddress = await signer.getAddress();
  const ownerAddress = await pause.owner();
  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner (${ownerAddress}) of SystemPause`
    );
  }

  const current: ModuleAddresses = {
    jobRegistry: await pause.jobRegistry(),
    stakeManager: await pause.stakeManager(),
    validationModule: await pause.validationModule(),
    disputeModule: await pause.disputeModule(),
    platformRegistry: await pause.platformRegistry(),
    feePool: await pause.feePool(),
    reputationEngine: await pause.reputationEngine(),
    arbitratorCommittee: await pause.arbitratorCommittee(),
  };

  const differences: ModuleKey[] = [];
  for (const key of MODULE_KEYS) {
    if (!sameAddress(current[key], modules[key])) {
      differences.push(key);
    }
  }

  const ownershipIssues: string[] = [];
  const pauserIssues: string[] = [];
  const moduleOwners: Partial<Record<ModuleKey, string>> = {};

  for (const key of MODULE_KEYS) {
    const target = modules[key];
    const inspection = new ethers.Contract(
      target,
      OWNER_AND_PAUSER_ABI,
      ethers.provider
    );
    let owner: string;
    try {
      owner = await inspection.owner();
      moduleOwners[key] = owner;
    } catch (error) {
      ownershipIssues.push(`${key}: owner() not available`);
      continue;
    }
    if (expectedOwner && !sameAddress(owner, expectedOwner)) {
      ownershipIssues.push(
        `${key}: owner is ${owner} (expected ${expectedOwner})`
      );
    }

    try {
      const pauser = await inspection.pauser();
      if (!sameAddress(pauser, pauseAddress)) {
        pauserIssues.push(`${key}: pauser is ${pauser}`);
      }
    } catch (error) {
      pauserIssues.push(`${key}: pauser() not available`);
    }
  }

  if (ownershipIssues.length) {
    console.warn('\nOwnership mismatches detected:');
    for (const note of ownershipIssues) {
      console.warn(` - ${note}`);
    }
    if (cli.execute) {
      throw new Error(
        'Resolve ownership mismatches before executing wiring updates.'
      );
    }
  }

  if (pauserIssues.length) {
    console.warn('\nPauser mismatches detected:');
    for (const note of pauserIssues) {
      console.warn(` - ${note}`);
    }
  }

  const actions: PlannedAction[] = [];
  const pauseOwnsAll = MODULE_KEYS.every((key) =>
    sameAddress(moduleOwners[key], pauseAddress)
  );

  if (differences.length) {
    const notes: string[] = [];
    for (const key of differences) {
      notes.push(`${key}: ${current[key]} -> ${modules[key]}`);
    }
    actions.push({
      label: 'Update SystemPause module wiring',
      method: 'setModules',
      args: MODULE_KEYS.map((key) => modules[key]),
      contract: pause,
      notes,
    });
  }

  const needsRefresh =
    !cli.skipRefresh &&
    (cli.forceRefresh || pauserIssues.length > 0 || differences.length > 0);

  if (needsRefresh) {
    const notes: string[] = [];
    if (pauserIssues.length) {
      for (const note of pauserIssues) {
        notes.push(note);
      }
    }
    if (differences.length) {
      notes.push('Refreshing pauser roles after module wiring changes.');
    } else if (cli.forceRefresh) {
      notes.push('Forced refresh requested; reapplying pauser roles.');
    }
    if (!pauseOwnsAll) {
      notes.push(
        'Skipping refresh: SystemPause is not the owner of all modules. Update pauser roles via the governance owner if required.'
      );
      console.warn(
        '\nSkipping SystemPause.refreshPausers because SystemPause is not the owner of all modules.'
      );
    } else {
      actions.push({
        label: 'Refresh SystemPause pauser roles',
        method: 'refreshPausers',
        args: [],
        contract: pause,
        notes,
      });
    }
  }

  await executeActions(actions, cli.execute);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
