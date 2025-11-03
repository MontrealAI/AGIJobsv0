import { promises as fs } from 'fs';
import path from 'path';
import {
  loadTokenConfig,
  loadStakeManagerConfig,
  loadJobRegistryConfig,
  loadFeePoolConfig,
  loadThermodynamicsConfig,
  loadHamiltonianMonitorConfig,
  loadEnergyOracleConfig,
  loadTaxPolicyConfig,
  loadPlatformIncentivesConfig,
  loadIdentityRegistryConfig,
} from '../config';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
  strict?: boolean;
}

type OutputFormat = 'markdown' | 'json' | 'human';

interface HardhatContext {
  name?: string;
  chainId?: number;
}

interface MatrixRow {
  path: string;
  value: string;
  notes?: string;
}

interface SubsystemMatrix {
  id: string;
  title: string;
  summary: string;
  configPath: string;
  updateCommands: string[];
  verifyCommands: string[];
  documentation: string[];
  rows: MatrixRow[];
}

interface SubsystemBuildResult {
  matrix: SubsystemMatrix;
  error?: string;
}

interface SubsystemDescriptor {
  id: string;
  title: string;
  summary: string;
  documentation: string[];
  updateCommands: string[];
  verifyCommands: string[];
  fallbackConfigPath: string;
  loader: (network?: string) => { config: unknown; path: string };
}

interface MatrixPayload {
  network?: string;
  subsystems: SubsystemMatrix[];
  generatedAt: string;
}

const NEWLINE = '\n';
const DEFAULT_FORMAT: OutputFormat = 'markdown';

async function resolveHardhatContext(): Promise<HardhatContext> {
  try {
    const hardhat = await import('hardhat');
    const { network } = hardhat;
    return {
      name: network?.name,
      chainId: network?.config?.chainId,
    };
  } catch (error) {
    if (process.env.DEBUG_OWNER_MATRIX) {
      console.warn('Failed to load hardhat context:', error);
    }
    return {};
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: DEFAULT_FORMAT,
    includeMermaid: true,
    strict: false,
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
        if (normalised !== 'markdown' && normalised !== 'json' && normalised !== 'human') {
          throw new Error('Supported formats: markdown, json, human');
        }
        options.format = normalised as OutputFormat;
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      case '--strict':
      case '--fail-on-warn':
        options.strict = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

function replaceNetworkPlaceholder(command: string, network?: string): string {
  if (!network) {
    return command;
  }
  return command.replace(/<network>/g, network);
}

function toDisplayValue(input: unknown): string {
  if (input === null || input === undefined) {
    return '—';
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return '""';
    }
    return trimmed;
  }
  if (typeof input === 'number' || typeof input === 'bigint') {
    return String(input);
  }
  if (typeof input === 'boolean') {
    return input ? 'true' : 'false';
  }
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return '[]';
    }
    return `[${input.map((item) => toDisplayValue(item)).join(', ')}]`;
  }
  if (typeof input === 'object') {
    return JSON.stringify(input, null, 2);
  }
  return String(input);
}

function flattenConfig(value: unknown, prefix = '', rows: MatrixRow[] = [], depth = 0): MatrixRow[] {
  if (rows.length > 256) {
    return rows;
  }

  const pathLabel = prefix || '<root>';

  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date) {
    rows.push({ path: pathLabel, value: toDisplayValue(value) });
    return rows;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      rows.push({ path: pathLabel, value: '[]' });
      return rows;
    }
    value.forEach((item, index) => {
      flattenConfig(item, `${pathLabel}[${index}]`, rows, depth + 1);
    });
    return rows;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    rows.push({ path: pathLabel, value: '{}' });
    return rows;
  }

  for (const [key, nestedValue] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    flattenConfig(nestedValue, newPrefix, rows, depth + 1);
    if (rows.length > 256) {
      break;
    }
  }

  return rows;
}

async function buildSubsystemMatrices(network?: string): Promise<SubsystemBuildResult[]> {
  const descriptors: SubsystemDescriptor[] = [
    {
      id: 'token',
      title: '$AGIALPHA token constants',
      summary:
        'Canonical ERC-20 metadata and module addresses consumed by Solidity constants and TypeScript clients.',
      documentation: ['docs/token-operations.md', 'docs/thermodynamics-operations.md'],
      updateCommands: ['npm run compile'],
      verifyCommands: ['npm run verify:agialpha -- --rpc <https-or-ws-url>'],
      fallbackConfigPath: 'config/agialpha.json',
      loader: (ctx) => loadTokenConfig({ network: ctx }),
    },
    {
      id: 'stakeManager',
      title: 'StakeManager parameters',
      summary:
        'Controls staking minimums, slashing weights, treasury routing, and validator incentives.',
      documentation: [
        'docs/owner-control-handbook.md',
        'docs/owner-control-command-center.md',
        'docs/thermodynamics-operations.md',
      ],
      updateCommands: ['npx hardhat run scripts/v2/updateStakeManager.ts --network <network>'],
      verifyCommands: [
        'npm run owner:verify-control -- --network <network> --modules=stakeManager',
      ],
      fallbackConfigPath: 'config/stake-manager.json',
      loader: (ctx) => loadStakeManagerConfig({ network: ctx }),
    },
    {
      id: 'jobRegistry',
      title: 'JobRegistry policy',
      summary: 'Job posting thresholds, fee splits, and lifecycle limits for employer contracts.',
      documentation: [
        'docs/owner-control-playbook.md',
        'docs/owner-control-zero-downtime-guide.md',
      ],
      updateCommands: ['npx hardhat run scripts/v2/updateJobRegistry.ts --network <network>'],
      verifyCommands: [
        'npm run owner:verify-control -- --network <network> --modules=jobRegistry',
      ],
      fallbackConfigPath: 'config/job-registry.json',
      loader: (ctx) => loadJobRegistryConfig({ network: ctx }),
    },
    {
      id: 'feePool',
      title: 'FeePool distribution',
      summary:
        'Treasury routing, burn percentages, and payout pacing for escrowed protocol fees.',
      documentation: ['docs/owner-control-visual-guide.md'],
      updateCommands: ['npx hardhat run scripts/v2/updateFeePool.ts --network <network>'],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=feePool'],
      fallbackConfigPath: 'config/fee-pool.json',
      loader: (ctx) => loadFeePoolConfig({ network: ctx }),
    },
    {
      id: 'thermodynamics',
      title: 'Thermodynamics & Thermostat',
      summary:
        'Energy budgeting, reward weights, and PID control surfaces that tune incentive gradients.',
      documentation: [
        'docs/thermodynamic-incentives.md',
        'docs/thermodynamics-operations.md',
        'docs/reward-settlement-process.md',
      ],
      updateCommands: [
        'npx hardhat run scripts/v2/updateThermodynamics.ts --network <network>',
        'npx hardhat run scripts/v2/updateThermostat.ts --network <network>',
      ],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=rewardEngine,thermostat'],
      fallbackConfigPath: 'config/thermodynamics.json',
      loader: (ctx) => loadThermodynamicsConfig({ network: ctx }),
    },
    {
      id: 'hamiltonianMonitor',
      title: 'HamiltonianMonitor windows',
      summary:
        'Observation window, historical energy records, and telemetry for system temperature guards.',
      documentation: ['docs/thermodynamics-operations.md'],
      updateCommands: ['npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network <network>'],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=rewardEngine'],
      fallbackConfigPath: 'config/hamiltonian-monitor.json',
      loader: (ctx) => loadHamiltonianMonitorConfig({ network: ctx }),
    },
    {
      id: 'energyOracle',
      title: 'EnergyOracle signer set',
      summary:
        'Authorised measurement nodes and quorum settings for the energy attestation oracle.',
      documentation: [
        'docs/energy-oracle-operations.md',
        'docs/owner-control-command-center.md',
      ],
      updateCommands: ['npx hardhat run scripts/v2/updateEnergyOracle.ts --network <network>'],
      verifyCommands: [
        'npm run owner:verify-control -- --network <network> --modules=rewardEngine',
        'npm run owner:surface -- --network <network> --only=rewardEngine',
      ],
      fallbackConfigPath: 'config/energy-oracle.json',
      loader: (ctx) => loadEnergyOracleConfig({ network: ctx }),
    },
    {
      id: 'taxPolicy',
      title: 'TaxPolicy controls',
      summary: 'Dynamic levy brackets for employer jobs and treasury burn ratios.',
      documentation: ['docs/owner-control-command-center.md'],
      updateCommands: ['npx hardhat run scripts/v2/updateTaxPolicy.ts --network <network>'],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=taxPolicy'],
      fallbackConfigPath: 'config/tax-policy.json',
      loader: (ctx) => loadTaxPolicyConfig({ network: ctx }),
    },
    {
      id: 'platformIncentives',
      title: 'PlatformIncentives weights',
      summary: 'Bonus multipliers, vesting schedules, and autopayout tolerances for ecosystem partners.',
      documentation: ['docs/owner-control-visual-guide.md'],
      updateCommands: ['npx hardhat run scripts/v2/updatePlatformIncentives.ts --network <network>'],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=platformIncentives'],
      fallbackConfigPath: 'config/platform-incentives.json',
      loader: (ctx) => loadPlatformIncentivesConfig({ network: ctx }),
    },
    {
      id: 'identityRegistry',
      title: 'IdentityRegistry configuration',
      summary: 'ENS registries, root nodes, and emergency allowlists for identity proofs.',
      documentation: [
        'docs/ens-identity-policy.md',
        'docs/ens-identity-setup.md',
      ],
      updateCommands: ['npx hardhat run scripts/v2/updateIdentityRegistry.ts --network <network>'],
      verifyCommands: ['npm run owner:verify-control -- --network <network> --modules=identityRegistry'],
      fallbackConfigPath: 'config/identity-registry.json',
      loader: (ctx) => loadIdentityRegistryConfig({ network: ctx }),
    },
  ];

  const results: SubsystemBuildResult[] = [];
  for (const descriptor of descriptors) {
    try {
      const loaded = descriptor.loader(network);
      results.push({
        matrix: {
          id: descriptor.id,
          title: descriptor.title,
          summary: descriptor.summary,
          documentation: descriptor.documentation,
          updateCommands: descriptor.updateCommands,
          verifyCommands: descriptor.verifyCommands,
          configPath: path.relative(process.cwd(), loaded.path),
          rows: flattenConfig(loaded.config),
        },
      });
    } catch (error) {
      const fallback = path.relative(process.cwd(), descriptor.fallbackConfigPath);
      const message =
        error instanceof Error ? error.message : 'Unknown error loading configuration';
      results.push({
        matrix: {
          id: descriptor.id,
          title: descriptor.title,
          summary: descriptor.summary,
          documentation: descriptor.documentation,
          updateCommands: descriptor.updateCommands,
          verifyCommands: descriptor.verifyCommands,
          configPath: fallback,
          rows: [
            {
              path: '<error>',
              value: message,
              notes: 'Fix the configuration file then rerun owner:parameters.',
            },
          ],
        },
        error: `${descriptor.id}: ${message}`,
      });
    }
  }

  return results;
}

function renderHuman(matrix: MatrixPayload): string {
  const lines: string[] = [];
  lines.push(`Owner parameter matrix (${matrix.network ?? 'no network selected'})`);
  lines.push(`Generated at: ${matrix.generatedAt}`);
  lines.push('');
  for (const subsystem of matrix.subsystems) {
    lines.push(`${subsystem.title}`);
    lines.push('-'.repeat(subsystem.title.length));
    lines.push(subsystem.summary);
    lines.push(`Config: ${subsystem.configPath}`);
    if (subsystem.updateCommands.length > 0) {
      lines.push('Update:');
      subsystem.updateCommands.forEach((cmd) => lines.push(`  • ${cmd}`));
    }
    if (subsystem.verifyCommands.length > 0) {
      lines.push('Verify:');
      subsystem.verifyCommands.forEach((cmd) => lines.push(`  • ${cmd}`));
    }
    if (subsystem.documentation.length > 0) {
      lines.push('Docs:');
      subsystem.documentation.forEach((doc) => lines.push(`  • ${doc}`));
    }
    lines.push('Parameters:');
    subsystem.rows.forEach((row) => {
      const note = row.notes ? ` (${row.notes})` : '';
      lines.push(`  - ${row.path}: ${row.value}${note}`);
    });
    lines.push('');
  }
  return lines.join(NEWLINE);
}

function renderMarkdown(matrix: MatrixPayload, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push(`# Owner parameter matrix`);
  lines.push('');
  lines.push(`- Generated at: \`${matrix.generatedAt}\``);
  if (matrix.network) {
    lines.push(`- Network context: \`${matrix.network}\``);
  }
  lines.push('');
  if (includeMermaid) {
    lines.push('```mermaid');
    lines.push('flowchart TD');
    lines.push('    subgraph Owner Workflow');
    lines.push('        A[Edit configuration JSON] --> B[Dry-run helper script]');
    lines.push('        B --> C[Submit update transaction]');
    lines.push('        C --> D[Verify owner control & telemetry]');
    lines.push('    end');
    lines.push('    E((Matrix report)) --> A');
    lines.push('    E --> B');
    lines.push('    E --> D');
    lines.push('```');
    lines.push('');
  }

  for (const subsystem of matrix.subsystems) {
    lines.push(`## ${subsystem.title}`);
    lines.push('');
    lines.push(subsystem.summary);
    lines.push('');
    lines.push(`- **Config file:** \`${subsystem.configPath}\``);
    if (subsystem.updateCommands.length > 0) {
      lines.push('- **Update with:**');
      subsystem.updateCommands.forEach((cmd) => {
        lines.push(`  - \`${cmd}\``);
      });
    }
    if (subsystem.verifyCommands.length > 0) {
      lines.push('- **Verify with:**');
      subsystem.verifyCommands.forEach((cmd) => {
        lines.push(`  - \`${cmd}\``);
      });
    }
    if (subsystem.documentation.length > 0) {
      lines.push('- **Reference docs:**');
      subsystem.documentation.forEach((doc) => {
        lines.push(`  - [${doc}](${doc})`);
      });
    }
    lines.push('');
    lines.push('| Parameter | Value |');
    lines.push('| --- | --- |');
    subsystem.rows.forEach((row) => {
      const sanitizedValue = row.value.replace(/\n/g, '<br />');
      lines.push(`| \`${row.path}\` | ${sanitizedValue} |`);
    });
    lines.push('');
  }

  return lines.join(NEWLINE);
}

async function writeOutput(content: string, outPath?: string): Promise<void> {
  if (!outPath) {
    process.stdout.write(content);
    if (!content.endsWith('\n')) {
      process.stdout.write('\n');
    }
    return;
  }
  const absolute = path.resolve(outPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    const helpText = [
      'Usage: ts-node scripts/v2/ownerParameterMatrix.ts [options]',
      '',
      'Options:',
      '  --network <name>       Network alias for config overrides',
      '  --format <format>      Output format: markdown (default), json, human',
      '  --out <path>           Write to file instead of stdout',
      '  --no-mermaid           Omit Mermaid diagrams in markdown mode',
      '  --strict               Treat configuration degradations as hard errors',
      '  -h, --help             Show this message',
    ].join(NEWLINE);
    process.stdout.write(`${helpText}\n`);
    return;
  }

  const hardhat = await resolveHardhatContext();
  const selectedNetwork = options.network ?? process.env.HARDHAT_NETWORK ?? hardhat.name;

  const buildResults = await buildSubsystemMatrices(selectedNetwork);
  const subsystems = buildResults.map((entry) => entry.matrix);
  const matrix: MatrixPayload = {
    network: selectedNetwork,
    subsystems: subsystems.map((entry) => ({
      ...entry,
      updateCommands: entry.updateCommands.map((cmd) => replaceNetworkPlaceholder(cmd, selectedNetwork)),
      verifyCommands: entry.verifyCommands.map((cmd) => replaceNetworkPlaceholder(cmd, selectedNetwork)),
    })),
    generatedAt: new Date().toISOString(),
  };

  let output: string;
  switch (options.format) {
    case 'json':
      output = JSON.stringify(matrix, null, 2);
      break;
    case 'human':
      output = renderHuman(matrix);
      break;
    case 'markdown':
    default:
      output = renderMarkdown(matrix, options.includeMermaid);
      break;
  }

  await writeOutput(output, options.outPath);

  const errors = buildResults
    .map((entry) => entry.error)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (errors.length > 0) {
    const message =
      `Owner parameter matrix encountered ${errors.length} configuration issue${
        errors.length === 1 ? '' : 's'
      }: ${errors.join('; ')}`;

    if (options.strict) {
      console.error(message);
      process.exitCode = 1;
    } else {
      console.warn(`${message}. Re-run with --strict to fail on these warnings.`);
    }
  }
}

main().catch((error) => {
  console.error('ownerParameterMatrix failed:', error);
  process.exitCode = 1;
});
