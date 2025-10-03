import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  loadOwnerControlConfig,
  loadStakeManagerConfig,
  loadJobRegistryConfig,
  loadFeePoolConfig,
  loadThermodynamicsConfig,
  loadHamiltonianMonitorConfig,
  loadEnergyOracleConfig,
  loadIdentityRegistryConfig,
  loadTaxPolicyConfig,
  loadPlatformIncentivesConfig,
  loadTokenConfig,
} from '../config';

interface HardhatContext {
  name?: string;
  chainId?: number;
}

interface CliOptions {
  network?: string;
  outDir?: string;
  includeMermaid: boolean;
  help?: boolean;
}

interface SnapshotEntry {
  path: string;
  value: string;
}

interface SnapshotSubsystemDescriptor {
  id: string;
  title: string;
  summary: string;
  documentation: string[];
  updateCommands: string[];
  verifyCommands: string[];
  optional?: boolean;
  loader: (network?: string, context?: HardhatContext) => { config: unknown; path: string };
}

interface SnapshotSubsystemResult {
  descriptor: SnapshotSubsystemDescriptor;
  status: 'ok' | 'missing' | 'error';
  configPath?: string;
  outputPath?: string;
  entries: SnapshotEntry[];
  notes: string[];
  error?: string;
  sha256?: string;
}

interface ManifestSubsystem {
  id: string;
  title: string;
  status: SnapshotSubsystemResult['status'];
  sourcePath?: string;
  outputPath?: string;
  sha256?: string;
  notes?: string[];
  error?: string;
}

interface SnapshotManifest {
  generatedAt: string;
  network?: string;
  hardhat?: HardhatContext;
  outputDirectory: string;
  files: ManifestSubsystem[];
  commands: {
    regenerate: string;
    verify: string[];
  };
}

const SUBSYSTEMS: SnapshotSubsystemDescriptor[] = [
  {
    id: 'owner-control',
    title: 'Owner Control Surface',
    summary:
      'Primary owner/governance controllers plus module-specific overrides that gate every privileged action.',
    documentation: [
      'docs/owner-control-non-technical-guide.md',
      'docs/owner-control-systems-map.md',
    ],
    updateCommands: [
      'npm run owner:wizard -- --network <network>',
      'npm run owner:update-all -- --network <network>',
    ],
    verifyCommands: [
      'npm run owner:verify-control -- --network <network>',
      'npm run owner:surface -- --network <network>',
    ],
    loader: (network, context) =>
      loadOwnerControlConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'token',
    title: '$AGIALPHA Token Constants',
    summary: 'Canonical ERC-20 parameters powering staking, fees, and settlement.',
    documentation: ['docs/token-operations.md'],
    updateCommands: ['npm run compile'],
    verifyCommands: ['npm run verify:agialpha -- --rpc <https-url>'],
    loader: (network, context) =>
      loadTokenConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'job-registry',
    title: 'Job Registry',
    summary: 'Controls job lifecycle, fee routing, and cross-module wiring.',
    documentation: ['docs/owner-control-playbook.md', 'docs/owner-control-handbook.md'],
    updateCommands: ['npm run owner:wizard -- --network <network>'],
    verifyCommands: ['npm run owner:update-all -- --network <network> --plan reports/<network>/plan.md'],
    loader: (network, context) =>
      loadJobRegistryConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'stake-manager',
    title: 'Stake Manager',
    summary: 'Defines staking minima, treasury routing, and slashing policy for every role.',
    documentation: ['docs/owner-control-blueprint.md', 'docs/owner-control-quick-reference-cli.md'],
    updateCommands: ['npm run owner:wizard -- --network <network>'],
    verifyCommands: ['npm run owner:parameters -- --network <network>'],
    loader: (network, context) =>
      loadStakeManagerConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'fee-pool',
    title: 'Fee Pool',
    summary: 'Splits protocol fees, applies burn percentage, and routes treasuries.',
    documentation: ['docs/owner-control-atlas.md', 'docs/owner-control-audit.md'],
    updateCommands: ['npm run owner:wizard -- --network <network>'],
    verifyCommands: ['npm run owner:doctor -- --network <network>'],
    loader: (network, context) =>
      loadFeePoolConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'thermodynamics',
    title: 'Thermodynamic Incentives',
    summary: 'Role weightings, PID controller, and energy balancing parameters.',
    documentation: ['docs/thermodynamics-operations.md'],
    updateCommands: ['npm run thermostat:update -- --network <network>'],
    verifyCommands: ['npm run owner:doctor -- --network <network>'],
    loader: (network, context) =>
      loadThermodynamicsConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'energy-oracle',
    title: 'Energy Oracle',
    summary: 'Signer allowlists, quorum thresholds, and measurement cadence.',
    documentation: ['docs/owner-control-pulse.md', 'docs/owner-control-doctor.md'],
    updateCommands: ['npm run owner:wizard -- --network <network> --focus energy-oracle'],
    verifyCommands: ['npm run owner:pulse -- --network <network>'],
    loader: (network, context) =>
      loadEnergyOracleConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'identity-registry',
    title: 'Identity Registry',
    summary: 'ENS roots, merkle allowlists, and recovery overrides for agent onboarding.',
    documentation: ['docs/ens-identity-policy.md', 'docs/ens-identity-setup.md'],
    updateCommands: ['npm run identity:update -- --network <network>'],
    verifyCommands: ['npm run owner:surface -- --network <network> --focus identity'],
    loader: (network, context) =>
      loadIdentityRegistryConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'hamiltonian-monitor',
    title: 'Hamiltonian Monitor',
    summary: 'Energy window sizing and datapoint buffers for thermodynamic safety rails.',
    documentation: ['docs/hamiltonian-monitor-operations.md'],
    updateCommands: ['npm run hamiltonian:update -- --network <network>'],
    verifyCommands: ['npm run owner:doctor -- --network <network>'],
    loader: (network, context) =>
      loadHamiltonianMonitorConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'tax-policy',
    title: 'Tax Policy',
    summary: 'Progressive fee bands, exemptions, and routing metadata.',
    documentation: ['docs/tax-policy-operations.md'],
    updateCommands: ['npm run owner:wizard -- --network <network> --focus tax-policy'],
    verifyCommands: ['npm run owner:audit -- --network <network>'],
    optional: true,
    loader: (network, context) =>
      loadTaxPolicyConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
  {
    id: 'platform-incentives',
    title: 'Platform Incentives',
    summary: 'Custom multipliers for strategic partner cohorts.',
    documentation: ['docs/owner-mission-bundle.md'],
    updateCommands: ['npm run owner:wizard -- --network <network> --focus incentives'],
    verifyCommands: ['npm run owner:parameters -- --network <network> --format json'],
    optional: true,
    loader: (network, context) =>
      loadPlatformIncentivesConfig({ network, chainId: context?.chainId, name: context?.name }),
  },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
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
          throw new Error(`${arg} requires a directory path`);
        }
        options.outDir = value;
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
  } catch (_) {
    return {};
  }
}

function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '—';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '""';
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return JSON.stringify(value);
}

function flattenObject(input: unknown, prefix = ''): SnapshotEntry[] {
  if (input === null || input === undefined) {
    return [
      {
        path: prefix || '(root)',
        value: formatValue(input),
      },
    ];
  }
  if (typeof input !== 'object') {
    return [
      {
        path: prefix || '(root)',
        value: formatValue(input),
      },
    ];
  }

  const entries: SnapshotEntry[] = [];
  if (Array.isArray(input)) {
    if (input.length === 0) {
      entries.push({ path: prefix || '(root)', value: '[]' });
      return entries;
    }
    input.forEach((value, index) => {
      const childPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      entries.push(...flattenObject(value, childPrefix));
    });
    return entries;
  }

  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.length === 0) {
    entries.push({ path: prefix || '(root)', value: '{}' });
    return entries;
  }

  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    entries.push(...flattenObject(value, childPrefix));
  }
  return entries;
}

function replaceNetworkPlaceholder(command: string, network?: string): string {
  if (!network) {
    return command;
  }
  return command.replace(/<network>/g, network);
}

async function ensureDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyWithHash(source: string, destination: string): Promise<string> {
  const contents = await fs.readFile(source);
  await ensureDirectory(destination);
  await fs.writeFile(destination, contents);
  const hash = createHash('sha256').update(contents).digest('hex');
  return hash;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderSubsystemMarkdown(
  result: SnapshotSubsystemResult,
  network?: string,
  includeMermaid = true
): string {
  const { descriptor } = result;
  const lines: string[] = [];

  lines.push(`### ${descriptor.title}`);
  lines.push('');
  lines.push(descriptor.summary);
  lines.push('');

  if (result.status !== 'ok') {
    const statusLabel =
      result.status === 'missing' ? '⚠️ Optional configuration not present.' : '❌ Error loading configuration.';
    lines.push(statusLabel);
    if (result.error) {
      lines.push('');
      lines.push('```');
      lines.push(result.error);
      lines.push('```');
    }
    lines.push('');
    return lines.join('\n');
  }

  if (result.configPath) {
    lines.push(`- **Source file:** \`${result.configPath}\``);
  }
  if (result.outputPath) {
    lines.push(`- **Snapshot copy:** \`${result.outputPath}\``);
  }
  if (result.sha256) {
    lines.push(`- **SHA-256:** \`${result.sha256}\``);
  }
  if (descriptor.documentation.length > 0) {
    lines.push(
      `- **Documentation:** ${descriptor.documentation
        .map((doc) => `[${doc}](../${doc})`)
        .join(', ')}`
    );
  }
  if (descriptor.updateCommands.length > 0) {
    lines.push(
      `- **Update:** ${descriptor.updateCommands
        .map((command) => `\`${replaceNetworkPlaceholder(command, network)}\``)
        .join(', ')}`
    );
  }
  if (descriptor.verifyCommands.length > 0) {
    lines.push(
      `- **Verify:** ${descriptor.verifyCommands
        .map((command) => `\`${replaceNetworkPlaceholder(command, network)}\``)
        .join(', ')}`
    );
  }
  lines.push('');

  if (includeMermaid) {
    lines.push('```mermaid');
    lines.push('flowchart LR');
    const nodeId = descriptor.id.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push(`    Snapshot((Snapshot)) --> |inputs| ${nodeId}`);
    lines.push(`    ${nodeId}[${descriptor.title}] --> |apply updates| Chain[(Deployed Contracts)]`);
    lines.push('```');
    lines.push('');
  }

  if (result.entries.length > 0) {
    lines.push('| Path | Value |');
    lines.push('| ---- | ----- |');
    for (const entry of result.entries) {
      lines.push(`| \`${entry.path}\` | \`${escapeMarkdown(entry.value)}\` |`);
    }
    lines.push('');
  }

  if (result.notes.length > 0) {
    lines.push('> Notes:');
    for (const note of result.notes) {
      lines.push(`> - ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderOverviewTable(results: SnapshotSubsystemResult[], network?: string): string {
  const lines: string[] = [];
  lines.push('| Subsystem | Status | Source | Snapshot |');
  lines.push('| --------- | ------ | ------ | -------- |');
  for (const result of results) {
    const { descriptor } = result;
    const statusIcon =
      result.status === 'ok' ? '✅' : result.status === 'missing' ? '⚠️ optional' : '❌ error';
    lines.push(
      `| ${descriptor.title} | ${statusIcon} | ${result.configPath ? `\`${result.configPath}\`` : '—'} | ${
        result.outputPath ? `\`${result.outputPath}\`` : '—'
      } |`
    );
  }
  lines.push('');
  lines.push(
    `_Regenerate with \`npm run owner:snapshot -- --network ${network ?? '<network>'} --out <directory>\`._`
  );
  lines.push('');
  return lines.join('\n');
}

function renderMermaidOverview(results: SnapshotSubsystemResult[]): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart TB');
  lines.push('    Intent[Owner Intent] --> Configs[Versioned Configs]');
  lines.push('    Configs --> SnapshotKit[Snapshot Kit]');
  lines.push('    SnapshotKit --> Owners[Owners & Compliance]');
  lines.push('    Owners --> CLI[Owner CLI Commands]');
  lines.push('    CLI --> Chain[(Ethereum Network)]');
  for (const result of results) {
    const id = result.descriptor.id.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push(`    SnapshotKit --> ${id}[${result.descriptor.title}]`);
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function renderReadme(
  results: SnapshotSubsystemResult[],
  manifest: SnapshotManifest,
  options: CliOptions
): string {
  const lines: string[] = [];
  const networkLabel = manifest.network ?? 'unspecified network';
  lines.push(`# Owner Control Snapshot – ${networkLabel}`);
  lines.push('');
  lines.push(
    'This bundle captures every owner-governed parameter in a portable, non-technical format. Share it with executives, auditors, or operations partners to prove who controls the protocol and how to change any setting without Solidity tooling.'
  );
  lines.push('');
  lines.push('## Quick Start');
  lines.push('');
  lines.push('1. Review the overview table below to confirm every subsystem was captured.');
  lines.push(
    '2. Open each subsection to inspect current parameters. Tables are sorted by JSON path for easy diffing against prior runs.'
  );
  lines.push('3. Follow the suggested commands to apply updates or re-verify ownership before executing changes.');
  lines.push('4. Attach `manifest.json` and `README.md` to your change-management ticket for complete audit trails.');
  lines.push('');
  lines.push('## Snapshot Contents');
  lines.push('');
  lines.push(renderOverviewTable(results, manifest.network));
  if (options.includeMermaid) {
    lines.push(renderMermaidOverview(results));
  }
  lines.push('## Subsystem Deep Dive');
  lines.push('');
  for (const result of results) {
    lines.push(renderSubsystemMarkdown(result, manifest.network, options.includeMermaid));
  }
  return lines.join('\n');
}

async function writeManifest(
  manifestPath: string,
  manifest: SnapshotManifest
): Promise<void> {
  await ensureDirectory(manifestPath);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function generateSnapshot(
  options: CliOptions,
  hardhatContext: HardhatContext
): Promise<{ results: SnapshotSubsystemResult[]; manifest: SnapshotManifest; outDir: string }> {
  const selectedNetwork =
    options.network ??
    (hardhatContext.name === 'hardhat'
      ? 'mainnet'
      : hardhatContext.name || process.env.AGJ_NETWORK || process.env.HARDHAT_NETWORK || 'mainnet');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(
    options.outDir ?? path.join('reports', selectedNetwork ?? 'network', `owner-control-snapshot-${timestamp}`)
  );

  const results: SnapshotSubsystemResult[] = [];

  for (const descriptor of SUBSYSTEMS) {
    const result: SnapshotSubsystemResult = {
      descriptor,
      status: 'ok',
      entries: [],
      notes: [],
    };

    try {
      const loaded = descriptor.loader(selectedNetwork, hardhatContext);
      const configPathRelative = path.relative(process.cwd(), loaded.path) || loaded.path;
      const snapshotPath = path.join(outDir, 'configs', configPathRelative);
      const hash = await copyWithHash(loaded.path, snapshotPath);
      result.sha256 = hash;
      result.configPath = configPathRelative;
      result.outputPath = path.relative(outDir, snapshotPath);
      result.entries = flattenObject(loaded.config).sort((a, b) => a.path.localeCompare(b.path));
    } catch (error: any) {
      if (descriptor.optional) {
        result.status = 'missing';
        result.notes.push('Configuration file not found or optional module disabled.');
      } else {
        result.status = 'error';
        result.error = error?.message ?? String(error);
      }
    }

    results.push(result);
  }

  const manifest: SnapshotManifest = {
    generatedAt: new Date().toISOString(),
    network: selectedNetwork,
    hardhat: hardhatContext,
    outputDirectory: path.relative(process.cwd(), outDir) || outDir,
    files: results.map((result) => ({
      id: result.descriptor.id,
      title: result.descriptor.title,
      status: result.status,
      sourcePath: result.configPath,
      outputPath: result.outputPath,
      sha256: result.sha256,
      notes: result.notes.length > 0 ? result.notes : undefined,
      error: result.error,
    })),
    commands: {
      regenerate: `npm run owner:snapshot -- --network ${selectedNetwork} --out ${path.relative(
        process.cwd(),
        outDir
      ) || outDir}`,
      verify: ['npm run owner:verify-control -- --network <network>', 'npm run owner:parameters -- --network <network>'],
    },
  };

  return { results, manifest, outDir };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    console.log('Usage: npm run owner:snapshot -- [--network <name>] [--out <directory>] [--no-mermaid]');
    return;
  }

  const hardhatContext = await resolveHardhatContext();
  const { results, manifest, outDir } = await generateSnapshot(cli, hardhatContext);

  await ensureDirectory(outDir);

  const readmePath = path.join(outDir, 'README.md');
  const manifestPath = path.join(outDir, 'manifest.json');

  const readme = renderReadme(results, manifest, cli);
  await ensureDirectory(readmePath);
  await fs.writeFile(readmePath, readme, 'utf8');
  await writeManifest(manifestPath, manifest);

  console.log(`Snapshot written to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
