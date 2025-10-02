import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  loadOwnerControlConfig,
  loadTokenConfig,
  loadStakeManagerConfig,
  loadJobRegistryConfig,
  loadFeePoolConfig,
  loadThermodynamicsConfig,
  loadHamiltonianMonitorConfig,
  loadEnergyOracleConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadIdentityRegistryConfig,
  loadRandaoCoordinatorConfig,
} from '../config';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

type OutputFormat = 'markdown' | 'human' | 'json';

interface HardhatContext {
  name?: string;
  chainId?: number;
}

interface StageDescriptor {
  id: string;
  title: string;
  purpose: string;
  commands: string[];
}

interface ModuleDescriptor {
  key: string;
  title: string;
  loader: (options?: { network?: string }) => LoaderResult;
  summary: string;
  configDocs: string[];
  updateCommands: string[];
  verifyCommands: string[];
}

interface LoaderResult {
  config: any;
  path: string;
  network?: string;
}

interface ModuleTicket {
  key: string;
  title: string;
  configPath: string;
  configHash?: string;
  summary: string;
  sampleParameters: ParameterSnippet[];
  updateCommands: string[];
  verifyCommands: string[];
  docs: string[];
  loadError?: string;
}

interface ParameterSnippet {
  key: string;
  value: string;
}

interface TicketPayload {
  generatedAt: string;
  network?: string;
  hardhat?: HardhatContext;
  ownerAddress?: string;
  governanceAddress?: string;
  ownerConfigPath?: string;
  ownerConfigHash?: string;
  tokenConfigPath?: string;
  tokenConfigHash?: string;
  stages: StageDescriptor[];
  modules: ModuleTicket[];
  environmentChecklist: string[];
  attachmentChecklist: string[];
  mermaid?: string;
  blockingIssues?: string[];
}

const DEFAULT_FORMAT: OutputFormat = 'markdown';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: DEFAULT_FORMAT,
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
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a path`);
        }
        options.outPath = value;
        i += 1;
        break;
      }
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const normalised = value.trim().toLowerCase();
        if (
          normalised !== 'markdown' &&
          normalised !== 'human' &&
          normalised !== 'json'
        ) {
          throw new Error('Supported formats: markdown, human, json');
        }
        options.format = normalised as OutputFormat;
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

async function resolveHardhatContext(): Promise<HardhatContext> {
  try {
    const hardhat = await import('hardhat');
    const { network } = hardhat;
    return {
      name: network?.name,
      chainId: network?.config?.chainId,
    };
  } catch (error) {
    if (process.env.DEBUG_OWNER_TICKET) {
      console.warn('Failed to load hardhat context:', error);
    }
    return {};
  }
}

async function computeHash(filePath?: string): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);
    const data = await fs.readFile(resolved);
    return createHash('sha256').update(data).digest('hex');
  } catch (error) {
    if (process.env.DEBUG_OWNER_TICKET) {
      console.warn(`Unable to hash ${filePath}:`, error);
    }
    return undefined;
  }
}

function normalisePath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }
  return path.relative(process.cwd(), filePath);
}

function toSnippetEntries(config: any): ParameterSnippet[] {
  if (!config || typeof config !== 'object') {
    return [];
  }

  const entries = Object.entries(config as Record<string, unknown>);
  const snippets: ParameterSnippet[] = [];

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      snippets.push({ key, value: `array(${value.length})` });
    } else if (value && typeof value === 'object') {
      snippets.push({ key, value: `object(${Object.keys(value).length})` });
    } else if (typeof value === 'bigint') {
      snippets.push({ key, value: value.toString() });
    } else if (value === undefined) {
      snippets.push({ key, value: 'undefined' });
    } else {
      snippets.push({ key, value: String(value) });
    }
    if (snippets.length >= 8) {
      break;
    }
  }

  return snippets;
}

function formatSnippet(snippet: ParameterSnippet): string {
  return `- **${snippet.key}:** ${snippet.value}`;
}

function buildMermaid(stages: StageDescriptor[]): string {
  const lines = ['flowchart LR'];
  for (let i = 0; i < stages.length; i += 1) {
    const current = stages[i];
    const next = stages[i + 1];
    const currentId = current.id.replace(/[^a-zA-Z0-9]/g, '');
    lines.push(`    ${currentId}[${current.title}]`);
    if (next) {
      const nextId = next.id.replace(/[^a-zA-Z0-9]/g, '');
      lines.push(`    ${currentId} --> ${nextId}`);
    }
  }
  return lines.join('\n');
}

async function buildModuleTicket(
  descriptor: ModuleDescriptor,
  network?: string
): Promise<ModuleTicket> {
  try {
    const result = descriptor.loader({ network });
    const configPath = normalisePath(result.path) ?? result.path;
    const configHash = await computeHash(result.path);
    return {
      key: descriptor.key,
      title: descriptor.title,
      configPath,
      configHash,
      summary: descriptor.summary,
      sampleParameters: toSnippetEntries(result.config),
      updateCommands: descriptor.updateCommands.map((command) =>
        replaceNetworkPlaceholder(command, network)
      ),
      verifyCommands: descriptor.verifyCommands.map((command) =>
        replaceNetworkPlaceholder(command, network)
      ),
      docs: descriptor.configDocs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      key: descriptor.key,
      title: descriptor.title,
      configPath: 'unavailable',
      summary: descriptor.summary,
      sampleParameters: [],
      updateCommands: descriptor.updateCommands.map((command) =>
        replaceNetworkPlaceholder(command, network)
      ),
      verifyCommands: descriptor.verifyCommands.map((command) =>
        replaceNetworkPlaceholder(command, network)
      ),
      docs: descriptor.configDocs,
      loadError: message,
    };
  }
}

function replaceNetworkPlaceholder(command: string, network?: string): string {
  if (!network) {
    return command;
  }
  return command.replace(/<network>/g, network);
}

async function buildTicket(options: CliOptions): Promise<TicketPayload> {
  const hardhatContext = await resolveHardhatContext();
  const ownerControl = loadOwnerControlConfig({ network: options.network });
  const token = loadTokenConfig({ network: options.network });

  const stages: StageDescriptor[] = [
    {
      id: 'baseline',
      title: 'Baseline',
      purpose: 'Capture current control surface and credentials.',
      commands: [
        'npm run owner:surface -- --network <network> --format markdown --out reports/<network>/owner-surface.md',
        'npm run owner:doctor -- --network <network>',
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      purpose: 'Edit JSON configs, document intent, and preview transactions.',
      commands: [
        'npm run owner:wizard -- --network <network>',
        'npm run owner:plan -- --network <network> --out reports/<network>/owner-plan.json',
      ],
    },
    {
      id: 'execute',
      title: 'Execute',
      purpose:
        'Submit Safe bundle or direct owner transactions once previews are clean.',
      commands: [
        'npm run owner:plan:safe -- --network <network> --safe reports/<network>/owner-safe-bundle.json',
        'npm run owner:update-all -- --network <network> --execute',
      ],
    },
    {
      id: 'verify',
      title: 'Verify',
      purpose: 'Cross-check deployed state against the configuration manifest.',
      commands: [
        'npm run owner:verify-control -- --network <network>',
        'npm run verify:agialpha -- --network <network>',
      ],
    },
    {
      id: 'archive',
      title: 'Archive',
      purpose: 'Store receipts, hashes, and documentation for compliance.',
      commands: [
        'npm run owner:audit -- --network <network> --out reports/<network>/owner-audit.md',
        'npm run owner:atlas -- --network <network> --format markdown --out reports/<network>/owner-atlas.md',
      ],
    },
  ];

  const moduleDescriptors: ModuleDescriptor[] = [
    {
      key: 'jobRegistry',
      title: 'Job Registry',
      loader: loadJobRegistryConfig,
      summary:
        'Controls job lifecycle fees, treasury routing, and policy hooks.',
      configDocs: [
        'docs/owner-control-blueprint.md',
        'docs/owner-control-handbook.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateJobRegistry.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'stakeManager',
      title: 'Stake Manager',
      loader: loadStakeManagerConfig,
      summary:
        'Manages stake weights, cooldowns, treasuries, and slashing parameters.',
      configDocs: [
        'docs/owner-parameter-matrix.md',
        'docs/owner-control-master-checklist.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateStakeManager.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'feePool',
      title: 'Fee Pool',
      loader: loadFeePoolConfig,
      summary:
        'Allocates burn vs treasury split for protocol fees and rounding dust.',
      configDocs: ['docs/owner-control-handbook.md'],
      updateCommands: [
        'npx hardhat run scripts/v2/updateFeePool.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'platformIncentives',
      title: 'Platform Incentives',
      loader: loadPlatformIncentivesConfig,
      summary:
        'Configures incentive programs for operators and off-chain services.',
      configDocs: ['docs/owner-control-atlas.md'],
      updateCommands: [
        'npx hardhat run scripts/v2/updatePlatformIncentives.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'thermodynamics',
      title: 'Thermodynamics',
      loader: loadThermodynamicsConfig,
      summary:
        'Governs reward weights, PID controller values, and entropy balancing.',
      configDocs: [
        'docs/thermodynamics-operations.md',
        'docs/owner-control-zero-downtime-guide.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateThermodynamics.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'hamiltonian',
      title: 'Hamiltonian Monitor',
      loader: loadHamiltonianMonitorConfig,
      summary:
        'Controls Hamiltonian window, observation history, and reporting cadence.',
      configDocs: ['docs/hamiltonian-monitor.md'],
      updateCommands: [
        'npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network <network>',
      ],
      verifyCommands: [
        'npm run owner:verify-control -- --network <network>',
        'npm run hamiltonian:report -- --network <network>',
      ],
    },
    {
      key: 'energyOracle',
      title: 'Energy Oracle',
      loader: loadEnergyOracleConfig,
      summary:
        'Authorises measurement signers and quorum thresholds for energy attestations.',
      configDocs: ['docs/energy-oracle-operations.md'],
      updateCommands: [
        'npx hardhat run scripts/v2/updateEnergyOracle.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'identityRegistry',
      title: 'Identity Registry',
      loader: loadIdentityRegistryConfig,
      summary:
        'Defines ENS roots, alias handling, and emergency allowlists for identities.',
      configDocs: [
        'docs/ens-identity-policy.md',
        'docs/owner-control-non-technical-guide.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateIdentityRegistry.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'randaoCoordinator',
      title: 'Randao Coordinator',
      loader: loadRandaoCoordinatorConfig,
      summary:
        'Coordinates randomness beacons, commit/reveal cadence, and slashing tolerances.',
      configDocs: ['docs/owner-control-command-center.md'],
      updateCommands: [
        'npx hardhat run scripts/v2/updateRandaoCoordinator.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
    {
      key: 'taxPolicy',
      title: 'Tax Policy',
      loader: loadTaxPolicyConfig,
      summary:
        'Manages jurisdictional tax routing and optional withholding wallets.',
      configDocs: [
        'docs/owner-control-handbook.md',
        'docs/owner-control-zero-downtime-guide.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateTaxPolicy.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network>'],
    },
  ];

  const modules = await Promise.all(
    moduleDescriptors.map((descriptor) =>
      buildModuleTicket(descriptor, options.network)
    )
  );
  const blockingIssues = modules
    .filter((module) => module.loadError)
    .map((module) => `${module.title}: ${module.loadError}`);

  const ticket: TicketPayload = {
    generatedAt: new Date().toISOString(),
    network: ownerControl.network ?? options.network ?? token.network,
    hardhat: hardhatContext,
    ownerAddress: ownerControl.config.owner,
    governanceAddress: ownerControl.config.governance,
    ownerConfigPath: normalisePath(ownerControl.path),
    ownerConfigHash: await computeHash(ownerControl.path),
    tokenConfigPath: normalisePath(token.path),
    tokenConfigHash: await computeHash(token.path),
    stages: stages.map((stage) => ({
      ...stage,
      commands: stage.commands.map((command) =>
        replaceNetworkPlaceholder(command, options.network)
      ),
    })),
    modules,
    environmentChecklist: [
      'Set RPC_URL or pass --rpc to commands that require chain access.',
      'Export OWNER_PRIVATE_KEY and GOVERNANCE_PRIVATE_KEY in a secure shell, never in Git.',
      'Ensure reports/<network>/ exists and is git-ignored for sensitive artefacts.',
      'Record multisig policy approvals before executing owner:update-all.',
    ],
    attachmentChecklist: [
      'owner-surface.md snapshot',
      'owner-plan.json dry-run',
      'owner-safe-bundle.json (if Safe execution)',
      'owner-audit.md and owner-atlas.md',
      'Transaction receipts + Safe execution logs',
    ],
    mermaid: undefined,
    blockingIssues: blockingIssues.length ? blockingIssues : undefined,
  };

  if (options.includeMermaid) {
    ticket.mermaid = buildMermaid(ticket.stages);
  }

  return ticket;
}

function renderMarkdown(ticket: TicketPayload): string {
  const lines: string[] = [];
  lines.push('# Owner Change Ticket');
  lines.push('');
  lines.push(`Generated: ${ticket.generatedAt}`);
  if (ticket.network) {
    lines.push(`Network: **${ticket.network}**`);
  }
  if (ticket.hardhat?.name || ticket.hardhat?.chainId) {
    lines.push(
      `Hardhat Context: ${ticket.hardhat?.name ?? '—'} (chainId: ${
        ticket.hardhat?.chainId ?? 'unknown'
      })`
    );
  }
  lines.push('');

  lines.push('## Control Envelope');
  lines.push('');
  lines.push(`- Owner: \`${ticket.ownerAddress ?? 'unset'}\``);
  lines.push(`- Governance: \`${ticket.governanceAddress ?? 'unset'}\``);
  lines.push(
    `- Owner Control Config: ${ticket.ownerConfigPath ?? 'unknown'}${
      ticket.ownerConfigHash ? ` (sha256: ${ticket.ownerConfigHash})` : ''
    }`
  );
  lines.push(
    `- Token Config: ${ticket.tokenConfigPath ?? 'unknown'}${
      ticket.tokenConfigHash ? ` (sha256: ${ticket.tokenConfigHash})` : ''
    }`
  );
  lines.push('');

  if (ticket.environmentChecklist.length) {
    lines.push('### Environment Checklist');
    lines.push('');
    for (const item of ticket.environmentChecklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  if (ticket.blockingIssues && ticket.blockingIssues.length) {
    lines.push('### Blocking Issues');
    lines.push('');
    for (const issue of ticket.blockingIssues) {
      lines.push(`- ❌ ${issue}`);
    }
    lines.push('');
  }

  if (ticket.mermaid) {
    lines.push('```mermaid');
    lines.push(ticket.mermaid);
    lines.push('```');
    lines.push('');
  }

  lines.push('## Stage Plan');
  lines.push('');
  for (const stage of ticket.stages) {
    lines.push(`### ${stage.title}`);
    lines.push('');
    lines.push(`${stage.purpose}`);
    lines.push('');
    for (const command of stage.commands) {
      lines.push(`- \`${command}\``);
    }
    lines.push('');
  }

  lines.push('## Module Control Surface');
  lines.push('');
  for (const module of ticket.modules) {
    lines.push(`### ${module.title}`);
    lines.push('');
    lines.push(`${module.summary}`);
    lines.push('');
    lines.push(
      `- Config: ${module.configPath}${
        module.configHash ? ` (sha256: ${module.configHash})` : ''
      }`
    );
    if (module.loadError) {
      lines.push('');
      lines.push(`> **Load error:** ${module.loadError}`);
      lines.push('');
    }
    if (module.sampleParameters.length) {
      lines.push('');
      lines.push('Key parameters:');
      lines.push('');
      for (const snippet of module.sampleParameters) {
        lines.push(formatSnippet(snippet));
      }
      lines.push('');
    }
    if (module.updateCommands.length) {
      lines.push('Update commands:');
      lines.push('');
      for (const command of module.updateCommands) {
        lines.push(`- \`${command}\``);
      }
      lines.push('');
    }
    if (module.verifyCommands.length) {
      lines.push('Verification commands:');
      lines.push('');
      for (const command of module.verifyCommands) {
        lines.push(`- \`${command}\``);
      }
      lines.push('');
    }
    if (module.docs.length) {
      lines.push('Docs:');
      lines.push('');
      for (const doc of module.docs) {
        lines.push(`- [${path.basename(doc)}](${doc})`);
      }
      lines.push('');
    }
  }

  if (ticket.attachmentChecklist.length) {
    lines.push('## Attachments');
    lines.push('');
    for (const item of ticket.attachmentChecklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
function renderHuman(ticket: TicketPayload): string {
  const lines: string[] = [];
  lines.push('=== Owner Change Ticket ===');
  lines.push(`Generated: ${ticket.generatedAt}`);
  lines.push(`Network: ${ticket.network ?? 'unknown'}`);
  lines.push(
    `Hardhat: ${ticket.hardhat?.name ?? 'n/a'} (chainId: ${
      ticket.hardhat?.chainId ?? 'n/a'
    })`
  );
  lines.push(`Owner: ${ticket.ownerAddress ?? 'unset'}`);
  lines.push(`Governance: ${ticket.governanceAddress ?? 'unset'}`);
  lines.push(
    `Owner Config: ${ticket.ownerConfigPath ?? 'unknown'}${
      ticket.ownerConfigHash ? ` (sha256: ${ticket.ownerConfigHash})` : ''
    }`
  );
  lines.push(
    `Token Config: ${ticket.tokenConfigPath ?? 'unknown'}${
      ticket.tokenConfigHash ? ` (sha256: ${ticket.tokenConfigHash})` : ''
    }`
  );
  lines.push('');

  if (ticket.environmentChecklist.length) {
    lines.push('Environment Checklist:');
    for (const item of ticket.environmentChecklist) {
      lines.push(`  [ ] ${item}`);
    }
    lines.push('');
  }

  if (ticket.blockingIssues && ticket.blockingIssues.length) {
    lines.push('Blocking Issues:');
    for (const issue of ticket.blockingIssues) {
      lines.push(`  ❌ ${issue}`);
    }
    lines.push('');
  }

  lines.push('Stage Plan:');
  for (const stage of ticket.stages) {
    lines.push(`- ${stage.title}: ${stage.purpose}`);
    for (const command of stage.commands) {
      lines.push(`    • ${command}`);
    }
  }
  lines.push('');

  lines.push('Modules:');
  for (const module of ticket.modules) {
    lines.push(`- ${module.title}: ${module.summary}`);
    lines.push(
      `    Config: ${module.configPath}${
        module.configHash ? ` (sha256: ${module.configHash})` : ''
      }`
    );
    if (module.loadError) {
      lines.push(`    Load error: ${module.loadError}`);
    }
    if (module.sampleParameters.length) {
      lines.push('    Parameters:');
      for (const snippet of module.sampleParameters) {
        lines.push(`      - ${snippet.key}: ${snippet.value}`);
      }
    }
    if (module.updateCommands.length) {
      lines.push('    Update:');
      for (const command of module.updateCommands) {
        lines.push(`      • ${command}`);
      }
    }
    if (module.verifyCommands.length) {
      lines.push('    Verify:');
      for (const command of module.verifyCommands) {
        lines.push(`      • ${command}`);
      }
    }
    if (module.docs.length) {
      lines.push('    Docs:');
      for (const doc of module.docs) {
        lines.push(`      • ${doc}`);
      }
    }
  }
  lines.push('');

  if (ticket.attachmentChecklist.length) {
    lines.push('Attachments:');
    for (const item of ticket.attachmentChecklist) {
      lines.push(`  [ ] ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function emit(ticket: TicketPayload, options: CliOptions): Promise<void> {
  let output: string;
  if (options.format === 'json') {
    output = `${JSON.stringify(ticket, null, 2)}\n`;
  } else if (options.format === 'human') {
    output = `${renderHuman(ticket)}\n`;
  } else {
    output = `${renderMarkdown(ticket)}\n`;
  }

  if (options.outPath) {
    const outDir = path.dirname(options.outPath);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(options.outPath, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

function printUsage(): void {
  console.log(
    'Usage: ts-node ownerChangeTicket.ts [--network <network>] [--out <path>] [--format markdown|human|json] [--no-mermaid]'
  );
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }
    const ticket = await buildTicket(options);
    await emit(ticket, options);
  } catch (error) {
    console.error('owner:change-ticket failed:', error);
    process.exitCode = 1;
  }
}

void main();
