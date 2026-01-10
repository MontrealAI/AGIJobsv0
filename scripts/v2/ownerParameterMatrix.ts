import { spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
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

interface DemoAddressBook {
  taxPolicy: string;
  rewardEngine: string;
  thermostat?: string;
}

interface DemoConfigOverrides {
  jobRegistryPath?: string;
  thermodynamicsPath?: string;
}

interface MatrixPayload {
  network?: string;
  subsystems: SubsystemMatrix[];
  generatedAt: string;
}

const NEWLINE = '\n';
const DEFAULT_FORMAT: OutputFormat = 'markdown';
const LOCAL_NETWORKS = new Set(['hardhat', 'localhost']);
const DEMO_ADDRESS_BOOK_ENV = 'OWNER_MATRIX_DEMO_ADDRESS_BOOK';
const DEFAULT_DEMO_ADDRESS_BOOK = path.join(
  process.cwd(),
  'deployment-config',
  'generated',
  'demo-hardhat-addresses.json'
);
const OWNER_MATRIX_BOOTSTRAP_ENV = 'OWNER_MATRIX_BOOTSTRAP_HARDHAT';
const DEMO_BOOTSTRAP_ENV = 'AGJ_DEMO_BOOTSTRAP_HARDHAT';
const DEMO_BOOTSTRAP_SCRIPT = path.join(
  process.cwd(),
  'scripts',
  'v2',
  'demoHardhatOwnerMatrixConfig.ts'
);

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

export function resolveDemoAddressBookPath(network?: string): string | undefined {
  const override = process.env[DEMO_ADDRESS_BOOK_ENV];
  if (!override || override.trim().length === 0) {
    if (!network || !LOCAL_NETWORKS.has(network)) {
      return undefined;
    }
    return existsSync(DEFAULT_DEMO_ADDRESS_BOOK)
      ? DEFAULT_DEMO_ADDRESS_BOOK
      : undefined;
  }
  const trimmed = override.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.join(process.cwd(), trimmed);
}

function shouldBootstrapDemo(network?: string): boolean {
  const explicit = process.env[OWNER_MATRIX_BOOTSTRAP_ENV];
  if (explicit !== undefined) {
    return explicit.trim() !== '' && explicit !== '0';
  }
  const fallback = process.env[DEMO_BOOTSTRAP_ENV];
  if (fallback !== undefined) {
    return fallback.trim() !== '' && fallback !== '0';
  }
  return Boolean(network && LOCAL_NETWORKS.has(network));
}

function resolveBootstrapAddressBookPath(
  network: string,
  resolvedPath?: string
): string | undefined {
  if (!LOCAL_NETWORKS.has(network)) {
    return undefined;
  }
  return resolvedPath ?? DEFAULT_DEMO_ADDRESS_BOOK;
}

async function readJsonIfExists(filePath?: string): Promise<Record<string, any> | null> {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, any>;
  } catch (error) {
    if (process.env.DEBUG_OWNER_MATRIX) {
      console.warn(`Failed to read demo config ${filePath}:`, error);
    }
    return null;
  }
}

function hasNonZeroAddress(value: unknown): boolean {
  if (!value) {
    return false;
  }
  try {
    const address = ethers.getAddress(String(value).trim());
    return address !== ethers.ZeroAddress;
  } catch (_) {
    return false;
  }
}

function resolveConfigCandidates(baseName: string, network: string): string[] {
  const configDir = path.join(process.cwd(), 'config');
  return [
    path.join(configDir, `${baseName}.${network}.json`),
    path.join(configDir, `${baseName}.json`),
  ];
}

async function demoConfigsHaveAddresses(network: string): Promise<boolean> {
  const [jobNetworkPath, jobDefaultPath] = resolveConfigCandidates('job-registry', network);
  const jobConfig = (await readJsonIfExists(jobNetworkPath)) ?? (await readJsonIfExists(jobDefaultPath));
  if (!jobConfig || !hasNonZeroAddress(jobConfig.taxPolicy)) {
    return false;
  }

  const [thermoNetworkPath, thermoDefaultPath] = resolveConfigCandidates('thermodynamics', network);
  const thermoConfig =
    (await readJsonIfExists(thermoNetworkPath)) ?? (await readJsonIfExists(thermoDefaultPath));
  const rewardEngineAddress = thermoConfig?.rewardEngine?.address;
  if (!hasNonZeroAddress(rewardEngineAddress)) {
    return false;
  }
  return true;
}

async function demoAddressBookHasAddresses(addressBookPath?: string): Promise<boolean> {
  const addressBook = await readJsonIfExists(addressBookPath);
  if (!addressBook) {
    return false;
  }
  return (
    hasNonZeroAddress(addressBook.taxPolicy) && hasNonZeroAddress(addressBook.rewardEngine)
  );
}

async function runDemoBootstrap(
  network: string,
  addressBookPath?: string
): Promise<void> {
  const outputPath = resolveBootstrapAddressBookPath(network, addressBookPath);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        'hardhat',
        'run',
        '--no-compile',
        DEMO_BOOTSTRAP_SCRIPT,
        '--network',
        network,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(outputPath ? { [DEMO_ADDRESS_BOOK_ENV]: outputPath } : {}),
        },
        stdio: 'inherit',
      }
    );
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Demo bootstrap exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

function normaliseDemoAddress(value: unknown, label: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Demo address book missing ${label}`);
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    throw new Error(`Demo address book missing ${label}`);
  }
  const address = ethers.getAddress(trimmed);
  if (address === ethers.ZeroAddress) {
    throw new Error(`Demo address book ${label} cannot be the zero address`);
  }
  return address;
}

async function loadDemoAddressBook(filePath: string): Promise<DemoAddressBook> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    taxPolicy: normaliseDemoAddress(parsed.taxPolicy, 'taxPolicy'),
    rewardEngine: normaliseDemoAddress(parsed.rewardEngine, 'rewardEngine'),
    thermostat: parsed.thermostat
      ? normaliseDemoAddress(parsed.thermostat, 'thermostat')
      : undefined,
  };
}

async function deriveDemoAddressBookFromConfigs(
  network: string
): Promise<DemoAddressBook | null> {
  const configDir = path.join(process.cwd(), 'config');
  const jobRegistryPath = path.join(configDir, `job-registry.${network}.json`);
  const thermodynamicsPath = path.join(configDir, `thermodynamics.${network}.json`);

  if (!existsSync(jobRegistryPath) || !existsSync(thermodynamicsPath)) {
    return null;
  }

  try {
    const jobRegistryRaw = await fs.readFile(jobRegistryPath, 'utf8');
    const jobRegistryConfig = JSON.parse(jobRegistryRaw) as Record<string, unknown>;
    const thermodynamicsRaw = await fs.readFile(thermodynamicsPath, 'utf8');
    const thermodynamicsConfig = JSON.parse(thermodynamicsRaw) as Record<string, any>;

    const thermostatCandidate =
      thermodynamicsConfig?.thermostat?.address ??
      thermodynamicsConfig?.rewardEngine?.thermostat;

    return {
      taxPolicy: normaliseDemoAddress(jobRegistryConfig.taxPolicy, 'taxPolicy'),
      rewardEngine: normaliseDemoAddress(
        thermodynamicsConfig?.rewardEngine?.address,
        'rewardEngine'
      ),
      thermostat: thermostatCandidate
        ? normaliseDemoAddress(thermostatCandidate, 'thermostat')
        : undefined,
    };
  } catch (error) {
    if (process.env.DEBUG_OWNER_MATRIX) {
      console.warn('Failed to derive demo address book from configs:', error);
    }
    return null;
  }
}

async function writeDemoConfigOverrides(
  addressBook: DemoAddressBook,
  network?: string
): Promise<DemoConfigOverrides> {
  const outputDir = path.join(
    process.cwd(),
    'deployment-config',
    'generated',
    'demo-hardhat-owner-matrix'
  );
  await fs.mkdir(outputDir, { recursive: true });

  const jobRegistrySource = path.join(process.cwd(), 'config', 'job-registry.json');
  const jobRegistryRaw = await fs.readFile(jobRegistrySource, 'utf8');
  const jobRegistryConfig = JSON.parse(jobRegistryRaw) as Record<string, unknown>;
  jobRegistryConfig.taxPolicy = addressBook.taxPolicy;
  const jobRegistryPath = path.join(
    outputDir,
    `job-registry.${network ?? 'hardhat'}.json`
  );
  await fs.writeFile(jobRegistryPath, `${JSON.stringify(jobRegistryConfig, null, 2)}\n`);

  const thermoSource = path.join(process.cwd(), 'config', 'thermodynamics.json');
  const thermoRaw = await fs.readFile(thermoSource, 'utf8');
  const thermoConfig = JSON.parse(thermoRaw) as Record<string, any>;
  const rewardEngineConfig = {
    ...(thermoConfig.rewardEngine ?? {}),
    address: addressBook.rewardEngine,
  };
  if (addressBook.thermostat) {
    rewardEngineConfig.thermostat = addressBook.thermostat;
  }
  thermoConfig.rewardEngine = rewardEngineConfig;
  thermoConfig.thermostat = {
    ...(thermoConfig.thermostat ?? {}),
    address: addressBook.thermostat ?? rewardEngineConfig.thermostat,
  };
  const thermodynamicsPath = path.join(
    outputDir,
    `thermodynamics.${network ?? 'hardhat'}.json`
  );
  await fs.writeFile(thermodynamicsPath, `${JSON.stringify(thermoConfig, null, 2)}\n`);

  return { jobRegistryPath, thermodynamicsPath };
}

export async function prepareDemoOverrides(
  network?: string
): Promise<DemoConfigOverrides | null> {
  const addressBookPath = resolveDemoAddressBookPath(network);
  if (!network || !LOCAL_NETWORKS.has(network)) {
    if (process.env[DEMO_ADDRESS_BOOK_ENV]) {
      throw new Error(
        `${DEMO_ADDRESS_BOOK_ENV} is only supported on local hardhat networks`
      );
    }
    return null;
  }
  let addressBook: DemoAddressBook | null = null;
  if (addressBookPath) {
    try {
      addressBook = await loadDemoAddressBook(addressBookPath);
    } catch (error) {
      if (process.env.DEBUG_OWNER_MATRIX) {
        console.warn('Failed to load demo address book, falling back:', error);
      }
    }
  }
  let bootstrapped = false;
  const bootstrapPath =
    network && LOCAL_NETWORKS.has(network)
      ? resolveBootstrapAddressBookPath(network, addressBookPath)
      : undefined;
  if (network && LOCAL_NETWORKS.has(network) && shouldBootstrapDemo(network)) {
    const addressBookReady =
      (await demoAddressBookHasAddresses(addressBookPath)) ||
      (await demoConfigsHaveAddresses(network));
    if (!addressBookReady) {
      await runDemoBootstrap(network, bootstrapPath);
      bootstrapped = true;
    }
  }
  if (!addressBook) {
    addressBook = await deriveDemoAddressBookFromConfigs(network);
  }
  if (!addressBook && bootstrapped && bootstrapPath) {
    try {
      addressBook = await loadDemoAddressBook(bootstrapPath);
    } catch (error) {
      if (process.env.DEBUG_OWNER_MATRIX) {
        console.warn('Failed to load demo address book after bootstrap:', error);
      }
    }
  }
  if (
    !addressBook &&
    !bootstrapped &&
    network &&
    LOCAL_NETWORKS.has(network) &&
    shouldBootstrapDemo(network)
  ) {
    await runDemoBootstrap(network, bootstrapPath);
    try {
      if (bootstrapPath) {
        addressBook = await loadDemoAddressBook(bootstrapPath);
      }
    } catch (error) {
      if (process.env.DEBUG_OWNER_MATRIX) {
        console.warn('Failed to load demo address book after bootstrap:', error);
      }
    }
  }
  if (!addressBook) {
    return null;
  }
  return writeDemoConfigOverrides(addressBook, network);
}

function shouldRetryWithDemoOverrides(
  descriptorId: string,
  error: unknown,
  network?: string,
  demoOverrides?: DemoConfigOverrides | null
): boolean {
  if (demoOverrides) {
    return false;
  }
  if (!network || !LOCAL_NETWORKS.has(network)) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (descriptorId === 'jobRegistry') {
    return message.includes('JobRegistry tax policy cannot be the zero address');
  }
  if (descriptorId === 'thermodynamics') {
    return message.includes('RewardEngine address cannot be the zero address');
  }
  return false;
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

async function buildSubsystemMatrices(
  network?: string,
  demoOverrides?: DemoConfigOverrides
): Promise<SubsystemBuildResult[]> {
  let resolvedOverrides = demoOverrides;
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
      loader: (ctx) =>
        loadJobRegistryConfig({
          network: ctx,
          path: resolvedOverrides?.jobRegistryPath,
        }),
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
      loader: (ctx) =>
        loadThermodynamicsConfig({
          network: ctx,
          path: resolvedOverrides?.thermodynamicsPath,
        }),
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
      if (shouldRetryWithDemoOverrides(descriptor.id, error, network, resolvedOverrides)) {
        const overrides = await prepareDemoOverrides(network);
        if (overrides) {
          resolvedOverrides = overrides;
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
            continue;
          } catch (retryError) {
            error = retryError;
          }
        }
      }
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
      '',
      `Environment:`,
      `  ${DEMO_ADDRESS_BOOK_ENV}=<path>  Path to demo address book JSON for hardhat demos.`,
      `  ${OWNER_MATRIX_BOOTSTRAP_ENV}=1  Auto-deploy demo contracts when addresses are missing (hardhat only).`,
      `  ${DEMO_BOOTSTRAP_ENV}=1         Alias to bootstrap local demo contracts.`,
      '  -h, --help             Show this message',
    ].join(NEWLINE);
    process.stdout.write(`${helpText}\n`);
    return;
  }

  const hardhat = await resolveHardhatContext();
  const selectedNetwork = options.network ?? process.env.HARDHAT_NETWORK ?? hardhat.name;

  const demoOverrides = await prepareDemoOverrides(selectedNetwork);
  const buildResults = await buildSubsystemMatrices(selectedNetwork, demoOverrides);
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
    console.error(
      `Owner parameter matrix encountered ${errors.length} configuration issue${
        errors.length === 1 ? '' : 's'
      }: ${errors.join('; ')}`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('ownerParameterMatrix failed:', error);
    process.exitCode = 1;
  });
}
