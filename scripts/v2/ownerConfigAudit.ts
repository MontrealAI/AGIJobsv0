import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { ethers } from 'ethers';
import {
  loadTokenConfig,
  loadOwnerControlConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadJobRegistryConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadRewardEngineConfig,
  loadThermostatConfig,
  loadThermodynamicsConfig,
  loadRandaoCoordinatorConfig,
  loadEnergyOracleConfig,
  loadTaxPolicyConfig,
  loadIdentityRegistryConfig,
  loadHamiltonianMonitorConfig,
} from '../config';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ZERO_ADDRESS = ethers.ZeroAddress;

type OutputFormat = 'markdown' | 'human' | 'json';

type ModuleCategory = 'owner' | 'support';

type StatusState = 'ok' | 'todo' | 'error';

type AddressRole = 'owner' | 'governance' | 'token' | 'config';

interface CliOptions {
  network?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  outPath?: string;
  help?: boolean;
}

interface FileSummary {
  path: string;
  exists: boolean;
  hash?: string;
  size?: number;
}

interface AddressStatus {
  state: StatusState;
  address?: string;
  detail?: string;
}

type ConfigLoader = (options: { network?: string }) => { config: unknown; path: string };

interface ModuleSpec {
  key: string;
  label: string;
  description: string;
  category: ModuleCategory;
  ownerControlKey?: string;
  tokenModuleKey?: string;
  configPaths: string[];
  updateCommands: string[];
  verifyCommands: string[];
  documentation: string[];
  loader?: ConfigLoader;
}

interface ModuleReport {
  spec: ModuleSpec;
  files: FileSummary[];
  owner?: AddressStatus;
  governance?: AddressStatus;
  token?: AddressStatus;
  type?: string;
  notes: string[];
}

interface AuditContext {
  timestamp: string;
  network?: string;
  tokenConfigPath: string;
  tokenConfigHash?: string;
  ownerConfigPath: string;
  ownerConfigHash?: string;
  moduleReports: ModuleReport[];
  ownerDefaults: {
    owner?: string;
    governance?: string;
  };
  totals: Record<StatusState, number>;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: 'markdown',
    includeMermaid: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--network requires a value');
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const normalised = value.trim().toLowerCase();
        if (normalised === 'markdown' || normalised === 'md') {
          options.format = 'markdown';
        } else if (normalised === 'human' || normalised === 'text') {
          options.format = 'human';
        } else if (normalised === 'json') {
          options.format = 'json';
        } else {
          throw new Error('Supported formats: markdown, human, json');
        }
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a file path`);
        }
        options.outPath = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

function printHelp(): void {
  const lines = [
    'Usage: ts-node scripts/v2/ownerConfigAudit.ts [options]',
    '',
    'Options:',
    '  --network <name>       Apply per-network overrides when available.',
    '  --format <fmt>         Output format: markdown (default), human, or json.',
    '  --out <path>           Write the report to disk instead of stdout.',
    '  --no-mermaid           Skip Mermaid diagrams in Markdown output.',
    '  --help                 Display this help message.',
  ];
  console.log(lines.join('\n'));
}

async function computeFileSummary(relPath: string): Promise<FileSummary> {
  const absPath = path.isAbsolute(relPath)
    ? relPath
    : path.resolve(ROOT_DIR, relPath);
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return { path: path.relative(ROOT_DIR, absPath), exists: false };
    }
    const data = await fs.readFile(absPath);
    const hash = createHash('sha256').update(data).digest('hex');
    return {
      path: path.relative(ROOT_DIR, absPath),
      exists: true,
      hash,
      size: stat.size,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path: path.relative(ROOT_DIR, absPath), exists: false };
    }
    throw error;
  }
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return ethers.getAddress(trimmed);
  } catch (_) {
    return undefined;
  }
}

function describeStatus(status?: AddressStatus): string {
  if (!status) {
    return 'n/a';
  }
  const { state, address, detail } = status;
  const icon = state === 'ok' ? '✅' : state === 'todo' ? '⚠️' : '❌';
  const parts: string[] = [icon];
  if (address) {
    parts.push(address);
  }
  if (detail) {
    parts.push(`(${detail})`);
  }
  return parts.join(' ');
}

function classifyAddress(
  value: string | undefined,
  role: AddressRole,
  { required }: { required: boolean }
): AddressStatus {
  if (!value) {
    return {
      state: required ? 'error' : 'todo',
      detail: required
        ? `${role} address missing`
        : `${role} address not set`,
    };
  }
  try {
    const address = ethers.getAddress(value);
    if (address === ZERO_ADDRESS) {
      return {
        state: 'todo',
        address,
        detail: 'zero address placeholder',
      };
    }
    return { state: 'ok', address };
  } catch (error) {
    return {
      state: 'error',
      detail: (error as Error).message || 'invalid address',
    };
  }
}

const MODULE_SPECS: ModuleSpec[] = [
  {
    key: 'stakeManager',
    label: 'Stake Manager',
    description:
      'Controls minimum stake levels, treasury routing, slashing weights and the auto-stake PID logic.',
    category: 'owner',
    ownerControlKey: 'stakeManager',
    tokenModuleKey: 'stakeManager',
    configPaths: ['config/stake-manager.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=stakeManager',
      'npx hardhat run scripts/v2/updateStakeManager.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=stakeManager',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/stake-manager-configuration.md',
      'docs/owner-control-handbook.md',
    ],
    loader: loadStakeManagerConfig,
  },
  {
    key: 'feePool',
    label: 'Fee Pool',
    description:
      'Burns protocol fees, routes the remainder to the treasury and tracks authorised reward distributors.',
    category: 'owner',
    ownerControlKey: 'feePool',
    tokenModuleKey: 'feePool',
    configPaths: ['config/fee-pool.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=feePool',
      'npx hardhat run scripts/v2/updateFeePool.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=feePool',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/fee-pool-operations.md',
      'docs/owner-control-command-center.md',
    ],
    loader: loadFeePoolConfig,
  },
  {
    key: 'jobRegistry',
    label: 'Job Registry',
    description:
      'Defines job stakes, validator rewards, fee percentages and registry integrations.',
    category: 'owner',
    ownerControlKey: 'jobRegistry',
    tokenModuleKey: 'jobRegistry',
    configPaths: ['config/job-registry.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=jobRegistry',
      'npx hardhat run scripts/v2/updateJobRegistry.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=jobRegistry',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/job-registry-configuration.md',
      'docs/owner-control-playbook.md',
    ],
    loader: loadJobRegistryConfig,
  },
  {
    key: 'platformRegistry',
    label: 'Platform Registry',
    description:
      'Records approved operators and pausers, plus the minimum stake for third-party platforms.',
    category: 'owner',
    ownerControlKey: 'platformRegistry',
    tokenModuleKey: 'platformRegistry',
    configPaths: ['config/platform-registry.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=platformRegistry',
      'npx hardhat run scripts/v2/updatePlatformRegistry.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=platformRegistry',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/platform-registry-operations.md',
      'docs/owner-control-visual-guide.md',
    ],
    loader: loadPlatformRegistryConfig,
  },
  {
    key: 'platformIncentives',
    label: 'Platform Incentives',
    description:
      'Controls the job router link and maximum discount percentage for approved platforms.',
    category: 'owner',
    ownerControlKey: 'platformIncentives',
    tokenModuleKey: 'platformIncentives',
    configPaths: ['config/platform-incentives.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=platformIncentives',
      'npx hardhat run scripts/v2/updatePlatformIncentives.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=platformIncentives',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/platform-registry-operations.md',
      'docs/owner-control-operations.md',
    ],
    loader: loadPlatformIncentivesConfig,
  },
  {
    key: 'rewardEngine',
    label: 'Reward Engine',
    description:
      'Distributes the thermodynamic reward pool across agents, validators, operators and employers.',
    category: 'owner',
    ownerControlKey: 'rewardEngine',
    configPaths: ['config/reward-engine.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=rewardEngine',
      'npx hardhat run scripts/v2/updateRewardEngine.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=rewardEngine',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/thermodynamics-operations.md',
      'docs/owner-control-blueprint.md',
    ],
    loader: loadRewardEngineConfig,
  },
  {
    key: 'thermostat',
    label: 'Thermostat',
    description:
      'Adjusts system temperature via PID gains, temperature bounds and KPI weights.',
    category: 'owner',
    ownerControlKey: 'thermostat',
    configPaths: ['config/thermodynamics.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=thermostat',
      'npx hardhat run scripts/v2/updateThermostat.ts --network <network>',
      'npx hardhat run scripts/v2/updateThermodynamics.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=thermostat',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/thermodynamics-operations.md',
      'docs/owner-control-zero-downtime-guide.md',
    ],
    loader: (options) => {
      loadThermostatConfig(options);
      return loadThermodynamicsConfig(options);
    },
  },
  {
    key: 'randaoCoordinator',
    label: 'Randao Coordinator',
    description:
      'Maintains commit/reveal windows and validator deposit requirements for randomness beacons.',
    category: 'owner',
    ownerControlKey: 'randaoCoordinator',
    tokenModuleKey: 'randaoCoordinator',
    configPaths: ['config/randao-coordinator.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=randaoCoordinator',
      'npx hardhat run scripts/v2/updateRandaoCoordinator.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=randaoCoordinator',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/owner-control-command-center.md',
      'docs/owner-control-quick-reference.md',
    ],
    loader: loadRandaoCoordinatorConfig,
  },
  {
    key: 'energyOracle',
    label: 'Energy Oracle',
    description:
      'Registers authorised measurement nodes responsible for signing energy attestations.',
    category: 'owner',
    ownerControlKey: 'energyOracle',
    configPaths: ['config/energy-oracle.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=energyOracle',
      'npx hardhat run scripts/v2/updateEnergyOracle.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=energyOracle',
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/thermodynamics-operations.md',
      'docs/owner-control-mission.md',
    ],
    loader: loadEnergyOracleConfig,
  },
  {
    key: 'taxPolicy',
    label: 'Tax Policy',
    description:
      'Publishes the canonical tax acknowledgement text and authorised signers.',
    category: 'owner',
    ownerControlKey: 'taxPolicy',
    tokenModuleKey: 'taxPolicy',
    configPaths: ['config/tax-policy.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=taxPolicy',
      'npx hardhat run scripts/v2/updateTaxPolicy.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=taxPolicy',
    ],
    documentation: [
      'docs/owner-control-handbook.md',
      'docs/owner-control-playbook.md',
    ],
    loader: loadTaxPolicyConfig,
  },
  {
    key: 'identityRegistry',
    label: 'Identity Registry',
    description:
      'Maintains ENS roots, Merkle proofs and emergency allowlists for agents and validators.',
    category: 'owner',
    ownerControlKey: 'identityRegistry',
    tokenModuleKey: 'identityRegistry',
    configPaths: ['config/identity-registry.json'],
    updateCommands: [
      'npm run owner:update-all -- --network <network> --only=identityRegistry',
      'npx hardhat run scripts/v2/updateIdentityRegistry.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=identityRegistry',
      'npm run identity:update -- --network <network>',
    ],
    documentation: [
      'docs/ens-identity-policy.md',
      'docs/owner-control-command-center.md',
    ],
    loader: loadIdentityRegistryConfig,
  },
  {
    key: 'hamiltonianMonitor',
    label: 'Hamiltonian Monitor',
    description:
      'Tracks Hamiltonian metrics for auto-stake tuning and thermodynamic telemetry.',
    category: 'support',
    configPaths: ['config/hamiltonian-monitor.json'],
    updateCommands: [
      'npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:dashboard -- --network <network>',
    ],
    documentation: [
      'docs/thermodynamics-operations.md',
      'docs/owner-control-operations.md',
    ],
    loader: loadHamiltonianMonitorConfig,
  },
  {
    key: 'systemPause',
    label: 'System Pause',
    description:
      'Co-ordinates emergency pausing for all modules and validates ownership wiring.',
    category: 'support',
    ownerControlKey: 'systemPause',
    tokenModuleKey: 'systemPause',
    configPaths: ['config/owner-control.json'],
    updateCommands: [
      'npx hardhat run scripts/v2/updateSystemPause.ts --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network> --modules=systemPause',
    ],
    documentation: [
      'docs/owner-control-zero-downtime-guide.md',
      'docs/owner-control-command-center.md',
    ],
  },
];

async function hashConfig(pathStr: string): Promise<string | undefined> {
  try {
    const data = await fs.readFile(pathStr);
    return createHash('sha256').update(data).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function buildModuleReport(
  spec: ModuleSpec,
  context: {
    network?: string;
    ownerDefaults: { owner?: string; governance?: string };
    ownerModules: Record<string, any>;
    tokenModules: Record<string, string | undefined>;
  }
): Promise<ModuleReport> {
  const files = await Promise.all(spec.configPaths.map((cfg) => computeFileSummary(cfg)));

  const notes: string[] = [];
  const ownerModule = spec.ownerControlKey
    ? context.ownerModules[spec.ownerControlKey]
    : undefined;
  const moduleType: string | undefined = ownerModule?.type;
  const ownerAddress = normaliseAddress(ownerModule?.owner) ?? context.ownerDefaults.owner;
  const governanceAddress =
    normaliseAddress(ownerModule?.governance) ?? context.ownerDefaults.governance;

  let ownerStatus: AddressStatus | undefined;
  let governanceStatus: AddressStatus | undefined;

  if (spec.category === 'owner' || spec.ownerControlKey) {
    if (moduleType === 'governable') {
      governanceStatus = classifyAddress(governanceAddress, 'governance', { required: true });
      ownerStatus = ownerAddress
        ? classifyAddress(ownerAddress, 'owner', { required: false })
        : undefined;
      if (!ownerModule?.governance && !context.ownerDefaults.governance) {
        notes.push('Governance target missing in owner-control config.');
      }
    } else if (moduleType === 'ownable' || moduleType === 'ownable2step') {
      ownerStatus = classifyAddress(ownerAddress, 'owner', { required: true });
      governanceStatus = governanceAddress
        ? classifyAddress(governanceAddress, 'governance', { required: false })
        : undefined;
      if (!ownerModule?.owner && !context.ownerDefaults.owner) {
        notes.push('Owner address missing in owner-control config.');
      }
    } else if (moduleType) {
      ownerStatus = ownerAddress
        ? classifyAddress(ownerAddress, 'owner', { required: false })
        : undefined;
      governanceStatus = governanceAddress
        ? classifyAddress(governanceAddress, 'governance', { required: false })
        : undefined;
      notes.push(`Unknown module type "${moduleType}"; verify owner/governance manually.`);
    } else if (spec.ownerControlKey) {
      ownerStatus = ownerAddress
        ? classifyAddress(ownerAddress, 'owner', { required: false })
        : undefined;
      governanceStatus = governanceAddress
        ? classifyAddress(governanceAddress, 'governance', { required: false })
        : undefined;
      notes.push('Module type not set in owner-control config; defaulting to optional checks.');
    }
  }

  let tokenStatus: AddressStatus | undefined;
  if (spec.tokenModuleKey) {
    const tokenAddress = normaliseAddress(context.tokenModules[spec.tokenModuleKey]);
    tokenStatus = classifyAddress(tokenAddress, 'token', { required: false });
    if (tokenStatus.state !== 'ok') {
      notes.push(
        `Populate config/agialpha*.json → modules.${spec.tokenModuleKey} with the deployed address.`
      );
    }
  }

  for (const file of files) {
    if (!file.exists) {
      notes.push(`Configuration file missing: ${file.path}`);
    }
  }

  if (spec.loader) {
    try {
      spec.loader({ network: context.network });
    } catch (error) {
      notes.push(
        `Loader failed: ${(error as Error).message ?? 'Unable to parse configuration via helper'}`
      );
    }
  }

  return {
    spec,
    files,
    owner: ownerStatus,
    governance: governanceStatus,
    token: tokenStatus,
    type: moduleType,
    notes,
  };
}

async function buildContext(options: CliOptions): Promise<AuditContext> {
  const tokenConfig = loadTokenConfig({ network: options.network });
  const ownerConfig = loadOwnerControlConfig({ network: options.network });

  const ownerDefaults = {
    owner: normaliseAddress(ownerConfig.config.owner),
    governance: normaliseAddress(ownerConfig.config.governance),
  };

  const ownerModules = ownerConfig.config.modules ?? {};
  const tokenModules = tokenConfig.config.modules ?? {};

  const moduleReports: ModuleReport[] = [];
  const totals: Record<StatusState, number> = { ok: 0, todo: 0, error: 0 };

  for (const spec of MODULE_SPECS) {
    const report = await buildModuleReport(spec, {
      network: options.network,
      ownerDefaults,
      ownerModules,
      tokenModules,
    });
    moduleReports.push(report);

    const statuses = [report.owner, report.governance, report.token].filter(
      (status): status is AddressStatus => Boolean(status)
    );
    for (const status of statuses) {
      totals[status.state] += 1;
    }
  }

  const timestamp = new Date().toISOString();
  const tokenConfigHash = await hashConfig(tokenConfig.path);
  const ownerConfigHash = await hashConfig(ownerConfig.path);

  return {
    timestamp,
    network: tokenConfig.network ?? ownerConfig.network ?? options.network,
    tokenConfigPath: path.relative(ROOT_DIR, tokenConfig.path),
    tokenConfigHash,
    ownerConfigPath: path.relative(ROOT_DIR, ownerConfig.path),
    ownerConfigHash,
    moduleReports,
    ownerDefaults,
    totals,
  };
}

function renderMermaid(): string {
  return [
    '```mermaid',
    'flowchart TD',
    '    A[Edit config/*.json] --> B[Run ownerConfigAudit]',
    '    B --> C{All green?}',
    '    C -- No --> A',
    '    C -- Yes --> D[Dry run owner:update-all]',
    '    D --> E[Execute with --execute]',
    '    E --> F[owner:verify-control & dashboard]',
    '```',
  ].join('\n');
}

function renderMarkdown(context: AuditContext, options: CliOptions): string {
  const lines: string[] = [];
  lines.push('# Owner Configuration Audit');
  lines.push('');
  lines.push(`- Generated: \`${context.timestamp}\``);
  if (context.network) {
    lines.push(`- Network context: \`${context.network}\``);
  }
  lines.push(
    `- Token config: \`${context.tokenConfigPath}\`${
      context.tokenConfigHash ? ` (sha256: \`${context.tokenConfigHash}\`)` : ''
    }`
  );
  lines.push(
    `- Owner control config: \`${context.ownerConfigPath}\`${
      context.ownerConfigHash ? ` (sha256: \`${context.ownerConfigHash}\`)` : ''
    }`
  );
  lines.push(
    `- Status totals: ✅ ${context.totals.ok} · ⚠️ ${context.totals.todo} · ❌ ${context.totals.error}`
  );
  lines.push('');
  if (options.includeMermaid) {
    lines.push(renderMermaid());
    lines.push('');
  }

  lines.push('## Module Overview');
  lines.push('');
  lines.push('| Module | Owner | Governance | Token mapping | Config hashes | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const report of context.moduleReports) {
    const configHashes = report.files
      .map((file) =>
        file.exists && file.hash
          ? `\`${file.hash.slice(0, 10)}…\``
          : file.exists
          ? 'present'
          : '**missing**'
      )
      .join('<br/>');
    const notes = report.notes.length > 0 ? report.notes.join('<br/>') : '';
    lines.push(
      `| ${report.spec.label} | ${describeStatus(report.owner)} | ${describeStatus(
        report.governance
      )} | ${describeStatus(report.token)} | ${configHashes} | ${notes} |`
    );
  }
  lines.push('');

  lines.push('## Detailed Guidance');
  lines.push('');
  for (const report of context.moduleReports) {
    lines.push(`### ${report.spec.label}`);
    lines.push('');
    lines.push(`${report.spec.description}`);
    lines.push('');
    if (report.type) {
      lines.push(`- **Owner-control type:** \`${report.type}\``);
    }
    if (report.owner) {
      lines.push(`- **Owner target:** ${describeStatus(report.owner)}`);
    }
    if (report.governance) {
      lines.push(`- **Governance target:** ${describeStatus(report.governance)}`);
    }
    if (report.token) {
      lines.push(`- **Token mapping:** ${describeStatus(report.token)}`);
    }
    if (report.files.length > 0) {
      lines.push('- **Configuration files:**');
      for (const file of report.files) {
        const fragment = file.exists
          ? `\`${file.path}\` (sha256: \`${file.hash}\`, ${file.size ?? 0} bytes)`
          : `\`${file.path}\` (**missing**)`;
        lines.push(`  - ${fragment}`);
      }
    }
    if (report.spec.updateCommands.length > 0) {
      lines.push('- **Update commands:**');
      for (const command of report.spec.updateCommands) {
        lines.push(`  - \`${command}\``);
      }
    }
    if (report.spec.verifyCommands.length > 0) {
      lines.push('- **Verification commands:**');
      for (const command of report.spec.verifyCommands) {
        lines.push(`  - \`${command}\``);
      }
    }
    if (report.spec.documentation.length > 0) {
      lines.push('- **Reference docs:**');
      for (const doc of report.spec.documentation) {
        lines.push(`  - [${doc}](../${doc})`);
      }
    }
    if (report.notes.length > 0) {
      lines.push('- **Action items:**');
      for (const note of report.notes) {
        lines.push(`  - ${note}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderHuman(context: AuditContext): string {
  const lines: string[] = [];
  lines.push(`Owner configuration audit @ ${context.timestamp}`);
  if (context.network) {
    lines.push(`Network: ${context.network}`);
  }
  lines.push(
    `Token config: ${context.tokenConfigPath}${
      context.tokenConfigHash ? ` (sha256 ${context.tokenConfigHash})` : ''
    }`
  );
  lines.push(
    `Owner control config: ${context.ownerConfigPath}${
      context.ownerConfigHash ? ` (sha256 ${context.ownerConfigHash})` : ''
    }`
  );
  lines.push(
    `Status totals → OK: ${context.totals.ok}, TODO: ${context.totals.todo}, ERROR: ${context.totals.error}`
  );
  lines.push('');
  for (const report of context.moduleReports) {
    lines.push(`${report.spec.label}: ${report.spec.description}`);
    const statuses = [];
    if (report.owner) {
      statuses.push(`owner ${describeStatus(report.owner)}`);
    }
    if (report.governance) {
      statuses.push(`governance ${describeStatus(report.governance)}`);
    }
    if (report.token) {
      statuses.push(`token ${describeStatus(report.token)}`);
    }
    if (statuses.length > 0) {
      lines.push(`  → ${statuses.join(' · ')}`);
    }
    if (report.files.length > 0) {
      const details = report.files
        .map((file) =>
          file.exists
            ? `${file.path} (${file.hash?.slice(0, 10)}…, ${file.size ?? 0} bytes)`
            : `${file.path} [missing]`
        )
        .join('; ');
      lines.push(`  Config: ${details}`);
    }
    if (report.spec.updateCommands.length > 0) {
      lines.push(`  Update: ${report.spec.updateCommands.join(' | ')}`);
    }
    if (report.spec.verifyCommands.length > 0) {
      lines.push(`  Verify: ${report.spec.verifyCommands.join(' | ')}`);
    }
    if (report.notes.length > 0) {
      lines.push(`  Notes: ${report.notes.join(' | ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const context = await buildContext(options);
    let output: string;
    if (options.format === 'json') {
      output = JSON.stringify(context, null, 2);
    } else if (options.format === 'human') {
      output = renderHuman(context);
    } else {
      output = renderMarkdown(context, options);
    }
    if (options.outPath) {
      const outPath = path.isAbsolute(options.outPath)
        ? options.outPath
        : path.resolve(options.outPath);
      await ensureDirectory(outPath);
      await fs.writeFile(outPath, output, 'utf8');
      console.log(`Wrote audit report to ${outPath}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('ownerConfigAudit failed:', error);
    process.exitCode = 1;
  }
}

void main();
