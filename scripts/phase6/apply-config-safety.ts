import { getAddress, Interface } from 'ethers';
import type { Phase6Plan } from './apply-config-lib';
import managerAbi from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/Phase6ExpansionManager.json';

export const PHASE6_SPEC_VERSION = 'phase6.expansion.v2';
export const PHASE6_INTERFACE = new Interface(managerAbi);
export const DEFAULT_CONFIG =
  'demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json';

export interface Phase6CliArgs {
  manager: string;
  expectedChainId?: bigint;
  configPath: string;
  dryRun: boolean;
  onlyDomains: Set<string>;
  skipGlobal: boolean;
  skipSystemPause: boolean;
  skipEscalation: boolean;
  exportPath?: string;
}

export function parsePhase6Args(argv: string[]): Phase6CliArgs {
  const args: Phase6CliArgs = {
    manager: '',
    configPath: DEFAULT_CONFIG,
    dryRun: true,
    onlyDomains: new Set(),
    skipGlobal: false,
    skipSystemPause: false,
    skipEscalation: false,
  };
  let writeMode: boolean | undefined;
  const singleValueFlags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--') continue;
    const canonicalFlag = flag === '--export' ? '--export-plan' : flag;
    if (
      ['--manager', '--chain-id', '--config', '--export-plan'].includes(
        canonicalFlag
      )
    ) {
      if (singleValueFlags.has(canonicalFlag))
        throw new Error(`Do not repeat ${canonicalFlag}.`);
      singleValueFlags.add(canonicalFlag);
    }
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith('--'))
        throw new Error(`${flag} requires a value.`);
      return next;
    };
    switch (flag) {
      case '--manager':
        args.manager = getAddress(value());
        break;
      case '--chain-id': {
        const raw = value();
        if (!/^[1-9][0-9]*$/.test(raw))
          throw new Error('--chain-id must be a positive decimal integer.');
        args.expectedChainId = BigInt(raw);
        break;
      }
      case '--config':
        args.configPath = value();
        break;
      case '--export-plan':
      case '--export':
        args.exportPath = value();
        break;
      case '--domain': {
        for (const slug of value().split(',')) {
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new Error('--domain requires canonical lowercase slugs.');
          args.onlyDomains.add(slug);
        }
        break;
      }
      case '--skip-global':
        args.skipGlobal = true;
        break;
      case '--skip-pause':
        args.skipSystemPause = true;
        break;
      case '--skip-escalation':
        args.skipEscalation = true;
        break;
      case '--apply':
      case '--dry-run': {
        const requestedWrite = flag === '--apply';
        if (writeMode !== undefined && writeMode !== requestedWrite)
          throw new Error('Do not combine --apply and --dry-run.');
        writeMode = requestedWrite;
        args.dryRun = !requestedWrite;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.manager || /^0x0{40}$/i.test(args.manager))
    throw new Error('Provide --manager <non-zero address>.');
  if (!args.dryRun && args.expectedChainId === undefined)
    throw new Error('--apply requires --chain-id <expected chain id>.');
  if (!args.dryRun && !args.exportPath)
    throw new Error(
      '--apply requires --export-plan <path> for a durable execution record.'
    );
  return args;
}

export function assertPhase6Context(context: {
  actualChainId: bigint;
  expectedChainId?: bigint;
  specVersion: string;
  governance: string;
  signer?: string;
  apply: boolean;
}): void {
  if (context.specVersion !== PHASE6_SPEC_VERSION)
    throw new Error(
      `Unsupported manager spec ${context.specVersion}; expected ${PHASE6_SPEC_VERSION}.`
    );
  if (
    context.expectedChainId !== undefined &&
    context.expectedChainId !== context.actualChainId
  ) {
    throw new Error(
      `Chain mismatch: expected ${context.expectedChainId}, connected to ${context.actualChainId}.`
    );
  }
  if (context.apply) {
    if (context.expectedChainId === undefined)
      throw new Error('Applying requires an explicitly expected chain id.');
    if (
      !context.signer ||
      getAddress(context.signer) !== getAddress(context.governance)
    ) {
      throw new Error(
        'Connected signer is not manager governance. Export the plan and submit its calldata through the configured Safe/timelock governance process.'
      );
    }
  }
}

export interface Phase6Transaction {
  label: string;
  method: string;
  to: string;
  data: string;
  value: '0';
  contractTargets: Array<{ field: string; address: string }>;
}

const CONTRACT_FIELDS: Record<string, string[]> = {
  setGlobalConfig: [
    'iotOracleRouter',
    'defaultL2Gateway',
    'didRegistry',
    'treasuryBridge',
  ],
  setGlobalGuards: ['oversightCouncil'],
  setGlobalInfrastructure: ['meshCoordinator', 'dataLake', 'identityBridge'],
  registerDomain: [
    'validationModule',
    'dataOracle',
    'l2Gateway',
    'executionRouter',
  ],
  updateDomain: [
    'validationModule',
    'dataOracle',
    'l2Gateway',
    'executionRouter',
  ],
  setDomainTelemetry: ['sentinelOracle', 'settlementAsset'],
  setDomainInfrastructure: ['agentOps', 'dataPipeline', 'credentialVerifier'],
};

/** The same ordered, filtered calldata is used for preview, export, and writes. */
export function buildPhase6Transactions(
  plan: Phase6Plan,
  args: Phase6CliArgs
): Phase6Transaction[] {
  const transactions: Phase6Transaction[] = [];
  const add = (method: string, values: unknown[], label = method) => {
    const config = values[values.length - 1] as Record<string, unknown>;
    const contractTargets = (CONTRACT_FIELDS[method] ?? [])
      .filter(
        (field) =>
          typeof config?.[field] === 'string' &&
          !/^0x0{40}$/i.test(config[field] as string)
      )
      .map((field) => ({
        field: `${label}.${field}`,
        address: String(config[field]),
      }));
    if (method === 'setSystemPause' || method === 'setEscalationBridge') {
      contractTargets.push({ field: method, address: String(values[0]) });
    }
    transactions.push({
      label,
      method,
      to: args.manager,
      data: PHASE6_INTERFACE.encodeFunctionData(method, values),
      value: '0',
      contractTargets,
    });
  };
  if (!args.skipGlobal && plan.global)
    add('setGlobalConfig', [plan.global.config]);
  if (!args.skipSystemPause && plan.systemPause)
    add('setSystemPause', [plan.systemPause.target]);
  if (!args.skipEscalation && plan.escalationBridge)
    add('setEscalationBridge', [plan.escalationBridge.target]);
  if (plan.globalGuards) add('setGlobalGuards', [plan.globalGuards.config]);
  if (plan.globalTelemetry)
    add('setGlobalTelemetry', [plan.globalTelemetry.config]);
  if (plan.globalInfrastructure)
    add('setGlobalInfrastructure', [plan.globalInfrastructure.config]);
  const included = (slug: string) =>
    args.onlyDomains.size === 0 || args.onlyDomains.has(slug);
  for (const entry of plan.domains.filter((entry) => included(entry.slug))) {
    const values =
      entry.action === 'registerDomain'
        ? [entry.config]
        : entry.action === 'updateDomain'
        ? [entry.id, entry.config]
        : [entry.id];
    add(entry.action, values, `${entry.action}(${entry.slug})`);
  }
  for (const group of [
    plan.domainOperations,
    plan.domainTelemetry,
    plan.domainInfrastructure,
  ]) {
    for (const entry of group.filter((entry) => included(entry.slug))) {
      add(
        entry.action,
        [entry.id, entry.config],
        `${entry.action}(${entry.slug})`
      );
    }
  }
  return transactions;
}

export async function assertPhase6ContractTargets(
  provider: { getCode(address: string, blockTag?: number): Promise<string> },
  manager: string,
  transactions: Phase6Transaction[],
  blockTag?: number
): Promise<void> {
  const checked = new Set<string>();
  for (const target of [
    { field: 'manager', address: manager },
    ...transactions.flatMap((entry) => entry.contractTargets),
  ]) {
    const address = getAddress(target.address);
    if (checked.has(address)) continue;
    const code = await provider.getCode(address, blockTag);
    if (!/^0x[0-9a-f]+$/i.test(code) || code === '0x')
      throw new Error(
        `${target.field} has no deployed bytecode at ${address}.`
      );
    checked.add(address);
  }
}
