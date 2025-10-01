import { promises as fs, existsSync, readFileSync } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadStakeManagerConfig,
  loadJobRegistryConfig,
  loadFeePoolConfig,
  loadThermodynamicsConfig,
  loadHamiltonianMonitorConfig,
  loadEnergyOracleConfig,
  loadPlatformIncentivesConfig,
  loadIdentityRegistryConfig,
  loadTaxPolicyConfig,
  loadTokenConfig,
} from '../config';

type OutputFormat = 'markdown' | 'human' | 'json';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

interface OwnerModuleDescriptor {
  name: string;
  type?: string;
}

interface OwnerEnvelope {
  configPath: string;
  owner?: string;
  governance?: string;
  modules: OwnerModuleDescriptor[];
  issues: string[];
}

interface SubsystemAtlasEntry {
  id: string;
  label: string;
  contract: string;
  configPath: string;
  docs: string[];
  updateCommand: string;
  verifyCommand: string;
  summary: string[];
  issues: string[];
}

interface AtlasPayload {
  generatedAt: string;
  network: string;
  tokenSymbol: string;
  tokenDecimals: number;
  owner: OwnerEnvelope;
  subsystems: SubsystemAtlasEntry[];
}

interface LenientConfigResult {
  config: any;
  path: string;
  error?: Error;
}

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();
const DEFAULT_SYMBOL = '$AGIALPHA';
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
        if (normalised !== 'markdown' && normalised !== 'human' && normalised !== 'json') {
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

function printUsage(): void {
  const script = 'npm run owner:atlas --';
  console.log(`Owner Control Atlas

Usage:
  ${script} [--network <network>] [--out <path>] [--format markdown|human|json] [--no-mermaid]

Examples:
  ${script} --network mainnet
  ${script} --network sepolia --out reports/sepolia-owner-atlas.md
  ${script} --format human
`);
}

async function ensureDirectory(filePath: string): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
}

function toRelative(filePath: string): string {
  const repoRoot = path.join(__dirname, '..', '..');
  return path.relative(repoRoot, filePath) || path.basename(filePath);
}

function resolveConfigPath(baseName: string, network?: string): string {
  const repoRoot = path.join(__dirname, '..', '..');
  const configDir = path.join(repoRoot, 'config');
  if (network) {
    const candidate = path.join(configDir, `${baseName}.${network}.json`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(configDir, `${baseName}.json`);
}

function loadRawConfig(baseName: string, network?: string): { config: any; path: string } {
  const filePath = resolveConfigPath(baseName, network);
  const raw = readFileSync(filePath, 'utf8');
  return { config: JSON.parse(raw), path: filePath };
}

function loadConfigLenient(
  baseName: string,
  loader: (options: { network?: string }) => { config: any; path: string },
  options: CliOptions,
  networkHintPath?: string
): LenientConfigResult {
  try {
    return loader({ network: options.network });
  } catch (error) {
    const networkKey = inferNetworkLabel(options.network, networkHintPath);
    return {
      ...loadRawConfig(baseName, networkKey),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function inferNetworkLabel(explicit?: string, configPath?: string): string {
  if (explicit) {
    return explicit;
  }
  if (!configPath) {
    return 'default';
  }
  const basename = path.basename(configPath);
  const match = basename.match(/\.([^.]+)\.json$/);
  if (match && match[1]) {
    return match[1];
  }
  return 'default';
}

function normaliseAddress(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  try {
    return ethers.getAddress(String(value));
  } catch (_error) {
    return undefined;
  }
}

function isZeroAddress(value: unknown): boolean {
  const address = normaliseAddress(value);
  return !!address && address.toLowerCase() === ZERO_ADDRESS;
}

function formatAddress(value: unknown): string {
  const address = normaliseAddress(value);
  if (!address) {
    return 'Not configured';
  }
  if (address.toLowerCase() === ZERO_ADDRESS) {
    return `${address} (zero)`;
  }
  return address;
}

function formatPercent(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return `${parsed}%`;
}

function formatTokens(value: unknown, symbol: string): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  if (typeof value === 'string' && !value.trim()) {
    return '—';
  }
  return `${String(value)} ${symbol}`;
}

function formatDurationSeconds(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return `${value} s`;
  }
  const seconds = Math.floor(parsed);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${seconds}s`);
  return `${seconds.toLocaleString()} s (${parts.join(' ')})`;
}

function summariseOwnerEnvelope(config: any, configPath: string): OwnerEnvelope {
  const issues: string[] = [];
  const ownerAddress = normaliseAddress(config?.owner);
  const governanceAddress = normaliseAddress(config?.governance);

  if (!ownerAddress || ownerAddress.toLowerCase() === ZERO_ADDRESS) {
    issues.push('Owner address is zero – assign a production controller.');
  }
  if (!governanceAddress || governanceAddress.toLowerCase() === ZERO_ADDRESS) {
    issues.push('Governance address is zero – set multisig or timelock.');
  }

  const modules: OwnerModuleDescriptor[] = Object.entries(config?.modules ?? {}).map(
    ([name, descriptor]) => {
      const typedDescriptor =
        descriptor && typeof descriptor === 'object'
          ? (descriptor as { type?: string })
          : undefined;
      return {
        name,
        type: typedDescriptor?.type,
      };
    }
  );

  return {
    configPath,
    owner: ownerAddress,
    governance: governanceAddress,
    modules,
    issues,
  };
}

function summariseStakeManager(
  config: any,
  configPath: string,
  symbol: string
): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (isZeroAddress(config?.treasury)) {
    issues.push('Treasury address is zero – platform rewards will burn.');
  }
  if (!config || config.minStakeTokens === undefined) {
    issues.push('Minimum stake is missing from configuration.');
  }

  const summary: string[] = [
    `Minimum stake: ${formatTokens(config?.minStakeTokens ?? '—', symbol)}.`,
    `Employer slash: ${formatPercent(config?.employerSlashPct)} | Treasury slash: ${formatPercent(
      config?.treasurySlashPct
    )}.`,
    `Validator reward: ${formatPercent(config?.validatorRewardPct)} | Job fee: ${formatPercent(
      config?.feePct
    )}.`,
    `Unbonding period: ${formatDurationSeconds(config?.unbondingPeriodSeconds)}.`,
    `Auto-stake: ${config?.autoStake?.enabled ? 'enabled' : 'disabled'} (window ${formatDurationSeconds(
      config?.autoStake?.windowSeconds
    )}).`,
  ];

  return {
    id: 'stakeManager',
    label: 'Stake Manager',
    contract: 'StakeManager',
    configPath,
    docs: ['docs/owner-control-operations.md', 'docs/owner-control-handbook.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateStakeManager.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=stakeManager',
    summary,
    issues,
  };
}

function summariseJobRegistry(
  config: any,
  configPath: string,
  symbol: string
): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (!config) {
    issues.push('Job registry configuration missing.');
  }

  const summary: string[] = [
    `Job stake: ${formatTokens(config?.jobStakeTokens ?? '—', symbol)} | Max reward: ${formatTokens(
      config?.maxJobRewardTokens ?? '—',
      symbol
    )}.`,
    `Agent minimum stake: ${formatTokens(config?.minAgentStakeTokens ?? '—', symbol)}.`,
    `Job duration cap: ${formatDurationSeconds(config?.jobDurationLimitSeconds)} (grace ${formatDurationSeconds(
      config?.expirationGracePeriodSeconds
    )}).`,
    `Max active jobs per agent: ${config?.maxActiveJobsPerAgent ?? '—'}.`,
    `Protocol fee: ${formatPercent(config?.feePct)} | Validator reward: ${formatPercent(
      config?.validatorRewardPct
    )}.`,
  ];

  if (isZeroAddress(config?.treasury)) {
    issues.push('Treasury address is zero – settle treasuries to capture fees.');
  }
  if (isZeroAddress(config?.taxPolicy)) {
    issues.push('Tax policy address is zero – tax acknowledgements cannot be enforced.');
  }

  return {
    id: 'jobRegistry',
    label: 'Job Registry',
    contract: 'JobRegistry',
    configPath,
    docs: ['docs/owner-control-playbook.md', 'docs/owner-control-master-checklist.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateJobRegistry.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=jobRegistry',
    summary,
    issues,
  };
}

function summariseFeePool(config: any, configPath: string): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (isZeroAddress(config?.treasury)) {
    issues.push('Treasury address is zero – dust will burn.');
  }
  if (isZeroAddress(config?.stakeManager)) {
    issues.push('Stake manager address missing – reward distribution blocked.');
  }

  const summary: string[] = [
    `Burn percentage: ${formatPercent(config?.burnPct)}.`,
    `Reward role: ${config?.rewardRole ?? 'platform'}.`,
    `Treasury: ${formatAddress(config?.treasury)}.`,
    `Stake manager: ${formatAddress(config?.stakeManager)}.`,
  ];

  return {
    id: 'feePool',
    label: 'Fee Pool',
    contract: 'FeePool',
    configPath,
    docs: ['docs/owner-control-operations.md'],
    updateCommand: 'npx hardhat run scripts/v2/updateFeePool.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=feePool',
    summary,
    issues,
  };
}

function summariseThermodynamics(config: any, configPath: string): SubsystemAtlasEntry {
  const rewardShares = config?.rewardEngine?.roleShares ?? {};
  const totalShare = Object.values(rewardShares).reduce<number>((acc, value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? acc + parsed : acc;
  }, 0);

  const issues: string[] = [];
  if (totalShare !== 100) {
    issues.push(`Role shares total ${totalShare}% – expected 100%.`);
  }
  if (isZeroAddress(config?.rewardEngine?.treasury)) {
    issues.push('Reward engine treasury is zero – configure before settlement.');
  }

  const summary: string[] = [
    `Role shares (agents/validators/operators/employers): ${[
      rewardShares?.agent ?? '—',
      rewardShares?.validator ?? '—',
      rewardShares?.operator ?? '—',
      rewardShares?.employer ?? '—',
    ].join('% / ')}%.`,
    `Temperature: ${config?.rewardEngine?.temperature ?? '—'} wei | κ: ${config?.rewardEngine?.kappa ?? '—'}.`,
    `Thermostat PID (kp/ki/kd): ${config?.thermostat?.pid?.kp ?? '0'} / ${config?.thermostat?.pid?.ki ?? '0'} / ${config?.thermostat?.pid?.kd ?? '0'}.`,
    `Thermostat bounds: min ${config?.thermostat?.bounds?.min ?? '—'} | max ${config?.thermostat?.bounds?.max ?? '—'}.`,
  ];

  return {
    id: 'thermodynamics',
    label: 'Thermodynamic Controls',
    contract: 'RewardEngineMB / Thermostat',
    configPath,
    docs: ['docs/thermodynamics-operations.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateThermodynamics.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=rewardEngine,thermostat',
    summary,
    issues,
  };
}

function summariseHamiltonian(config: any, configPath: string): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (!config) {
    issues.push('Hamiltonian monitor configuration missing.');
  }
  if (config && Number(config.window) <= 0) {
    issues.push('Window size is non-positive – increase to retain history.');
  }

  const summary: string[] = [
    `Window size: ${config?.window ?? '—'} samples.`,
    `Reset history on next run: ${config?.resetHistory ? 'yes' : 'no'}.`,
    `Seeded records: ${Array.isArray(config?.records) ? config.records.length : 0}.`,
  ];

  return {
    id: 'hamiltonian',
    label: 'Hamiltonian Monitor',
    contract: 'HamiltonianMonitor',
    configPath,
    docs: ['docs/hamiltonian-monitor.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=hamiltonianMonitor',
    summary,
    issues,
  };
}

function summariseEnergyOracle(config: any, configPath: string): SubsystemAtlasEntry {
  const signers = Array.isArray(config?.signers) ? config.signers : [];
  const issues: string[] = [];
  if (signers.length === 0) {
    issues.push('No authorised energy oracle signers configured.');
  }

  const summary: string[] = [
    `Authorised signers: ${signers.length}.`,
    `Retain unknown signers on-chain: ${config?.retainUnknown ? 'yes' : 'no'}.`,
  ];

  return {
    id: 'energyOracle',
    label: 'Energy Oracle',
    contract: 'EnergyOracle',
    configPath,
    docs: ['docs/owner-control-command-center.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateEnergyOracle.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=energyOracle',
    summary,
    issues,
  };
}

function summarisePlatformIncentives(config: any, configPath: string): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (isZeroAddress(config?.stakeManager) || isZeroAddress(config?.platformRegistry)) {
    issues.push('Platform incentives wiring incomplete – set stake manager and registry addresses.');
  }

  const summary: string[] = [
    `Stake manager: ${formatAddress(config?.stakeManager)}.`,
    `Platform registry: ${formatAddress(config?.platformRegistry)}.`,
    `Job router: ${formatAddress(config?.jobRouter)}.`,
    `Maximum discount: ${formatPercent(config?.maxDiscountPct)}.`,
  ];

  return {
    id: 'platformIncentives',
    label: 'Platform Incentives',
    contract: 'PlatformIncentives',
    configPath,
    docs: ['docs/universal-platform-incentive-architecture.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updatePlatformIncentives.ts --network <network> --execute',
    verifyCommand:
      'npm run owner:verify-control -- --network <network> --modules=platformIncentives,platformRegistry',
    summary,
    issues,
  };
}

function summariseIdentityRegistry(config: any, configPath: string): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (!config?.ens?.agentRoot?.name || !config?.ens?.clubRoot?.name) {
    issues.push('ENS root names missing – configure agent and validator namespaces.');
  }
  if (isZeroAddress(config?.address)) {
    issues.push('Identity registry address is zero – update before executing.');
  }

  const summary: string[] = [
    `Registry address: ${formatAddress(config?.address)}.`,
    `Agent ENS root: ${config?.ens?.agentRoot?.name ?? '—'} (aliases: ${
      Array.isArray(config?.ens?.agentRoot?.aliases)
        ? config.ens.agentRoot.aliases.join(', ')
        : '—'
    }).`,
    `Validator ENS root: ${config?.ens?.clubRoot?.name ?? '—'} (aliases: ${
      Array.isArray(config?.ens?.clubRoot?.aliases)
        ? config.ens.clubRoot.aliases.join(', ')
        : '—'
    }).`,
    `Additional agents: ${Object.keys(config?.additionalAgents ?? {}).length} | Validators: ${Object.keys(
      config?.additionalValidators ?? {}
    ).length}.`,
  ];

  return {
    id: 'identityRegistry',
    label: 'Identity Registry',
    contract: 'IdentityRegistry',
    configPath,
    docs: ['docs/ens-identity-policy.md', 'docs/owner-control-non-technical-guide.md'],
    updateCommand:
      'npx hardhat run scripts/v2/updateIdentityRegistry.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=identityRegistry',
    summary,
    issues,
  };
}

function summariseTaxPolicy(config: any, configPath: string): SubsystemAtlasEntry {
  const issues: string[] = [];
  if (!config?.policyURI) {
    issues.push('Tax policy URI missing – publish IPFS document.');
  }

  const summary: string[] = [
    `Policy URI: ${config?.policyURI ?? '—'}.`,
    `Acknowledgement text: ${(config?.acknowledgement ?? '—').slice(0, 140)}${
      config?.acknowledgement && config.acknowledgement.length > 140 ? '…' : ''
    }`,
    `Pre-approved acknowledgers: ${Object.keys(config?.acknowledgers ?? {}).length}.`,
    `Pending revocations: ${Array.isArray(config?.revokeAcknowledgements)
      ? config.revokeAcknowledgements.length
      : 0}.`,
  ];

  return {
    id: 'taxPolicy',
    label: 'Tax Policy',
    contract: 'TaxPolicy',
    configPath,
    docs: ['docs/owner-control-zero-downtime-guide.md'],
    updateCommand: 'npx hardhat run scripts/v2/updateTaxPolicy.ts --network <network> --execute',
    verifyCommand: 'npm run owner:verify-control -- --network <network> --modules=taxPolicy',
    summary,
    issues,
  };
}

function buildAtlas(options: CliOptions): AtlasPayload {
  const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
    network: options.network,
  });
  const tokenSymbol =
    typeof tokenConfig?.symbol === 'string' && tokenConfig.symbol.trim()
      ? tokenConfig.symbol.trim()
      : DEFAULT_SYMBOL;
  const tokenDecimals = Number(tokenConfig?.decimals ?? 18);

  const networkLabel = inferNetworkLabel(options.network, tokenConfigPath);

  const { config: ownerConfig, path: ownerConfigPath } = loadOwnerControlConfig({
    network: options.network,
  });

  const ownerEnvelope = summariseOwnerEnvelope(ownerConfig, toRelative(ownerConfigPath));

  const stakeResult = loadConfigLenient(
    'stake-manager',
    loadStakeManagerConfig,
    options,
    tokenConfigPath
  );
  const jobResult = loadConfigLenient('job-registry', loadJobRegistryConfig, options, tokenConfigPath);
  const feeResult = loadConfigLenient('fee-pool', loadFeePoolConfig, options, tokenConfigPath);
  const thermoResult = loadConfigLenient(
    'thermodynamics',
    loadThermodynamicsConfig,
    options,
    tokenConfigPath
  );
  const hamiltonianResult = loadConfigLenient(
    'hamiltonian-monitor',
    loadHamiltonianMonitorConfig,
    options,
    tokenConfigPath
  );
  const oracleResult = loadConfigLenient('energy-oracle', loadEnergyOracleConfig, options, tokenConfigPath);
  const incentivesResult = loadConfigLenient(
    'platform-incentives',
    loadPlatformIncentivesConfig,
    options,
    tokenConfigPath
  );
  const identityResult = loadConfigLenient(
    'identity-registry',
    loadIdentityRegistryConfig,
    options,
    tokenConfigPath
  );
  const taxResult = loadConfigLenient('tax-policy', loadTaxPolicyConfig, options, tokenConfigPath);

  const stakeSubsystem = summariseStakeManager(
    stakeResult.config,
    toRelative(stakeResult.path),
    tokenSymbol
  );
  if (stakeResult.error) {
    stakeSubsystem.issues.push(
      `Normalisation warning: ${stakeResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const jobSubsystem = summariseJobRegistry(
    jobResult.config,
    toRelative(jobResult.path),
    tokenSymbol
  );
  if (jobResult.error) {
    jobSubsystem.issues.push(
      `Normalisation warning: ${jobResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const feeSubsystem = summariseFeePool(feeResult.config, toRelative(feeResult.path));
  if (feeResult.error) {
    feeSubsystem.issues.push(
      `Normalisation warning: ${feeResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const thermoSubsystem = summariseThermodynamics(
    thermoResult.config,
    toRelative(thermoResult.path)
  );
  if (thermoResult.error) {
    thermoSubsystem.issues.push(
      `Normalisation warning: ${thermoResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const hamiltonianSubsystem = summariseHamiltonian(
    hamiltonianResult.config,
    toRelative(hamiltonianResult.path)
  );
  if (hamiltonianResult.error) {
    hamiltonianSubsystem.issues.push(
      `Normalisation warning: ${hamiltonianResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const oracleSubsystem = summariseEnergyOracle(
    oracleResult.config,
    toRelative(oracleResult.path)
  );
  if (oracleResult.error) {
    oracleSubsystem.issues.push(
      `Normalisation warning: ${oracleResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const incentivesSubsystem = summarisePlatformIncentives(
    incentivesResult.config,
    toRelative(incentivesResult.path)
  );
  if (incentivesResult.error) {
    incentivesSubsystem.issues.push(
      `Normalisation warning: ${incentivesResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const identitySubsystem = summariseIdentityRegistry(
    identityResult.config,
    toRelative(identityResult.path)
  );
  if (identityResult.error) {
    identitySubsystem.issues.push(
      `Normalisation warning: ${identityResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const taxSubsystem = summariseTaxPolicy(taxResult.config, toRelative(taxResult.path));
  if (taxResult.error) {
    taxSubsystem.issues.push(
      `Normalisation warning: ${taxResult.error.message.replace(/\s+/g, ' ')}`
    );
  }

  const subsystems: SubsystemAtlasEntry[] = [
    stakeSubsystem,
    jobSubsystem,
    feeSubsystem,
    thermoSubsystem,
    hamiltonianSubsystem,
    oracleSubsystem,
    incentivesSubsystem,
    identitySubsystem,
    taxSubsystem,
  ];

  return {
    generatedAt: new Date().toISOString(),
    network: networkLabel,
    tokenSymbol,
    tokenDecimals,
    owner: ownerEnvelope,
    subsystems,
  };
}

function renderMermaid(atlas: AtlasPayload): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('  classDef config fill:#e8f6ff,stroke:#0984e3,stroke-width:1px;');
  lines.push('  classDef tooling fill:#fff4e6,stroke:#ff9f43,stroke-width:1px;');
  lines.push('  classDef contract fill:#f5e6ff,stroke:#a55eea,stroke-width:1px;');
  lines.push('  OWN[Owner / Governance]');
  lines.push('  subgraph CFG[Configuration layer]');
  atlas.subsystems.forEach((subsystem, index) => {
    const configNode = `CFG_${index}`;
    lines.push(`    ${configNode}[${subsystem.configPath}]:::config`);
  });
  lines.push('  end');

  atlas.subsystems.forEach((subsystem, index) => {
    const toolingNode = `TOOL_${index}`;
    const contractNode = `CON_${index}`;
    const configNode = `CFG_${index}`;
    const updateParts = subsystem.updateCommand.split(/\s+/);
    const scriptToken =
      updateParts.find((part) => part.endsWith('.ts') || part.endsWith('.js')) ?? updateParts[0];
    lines.push(`  ${toolingNode}[${scriptToken}]:::tooling`);
    lines.push(`  ${contractNode}[${subsystem.contract}]:::contract`);
    lines.push(`  OWN --> ${configNode}`);
    lines.push(`  ${configNode} --> ${toolingNode}`);
    lines.push(`  ${toolingNode} --> ${contractNode}`);
  });
  lines.push('```');
  return lines.join('\n');
}

function renderMarkdown(atlas: AtlasPayload, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push(`# Owner Control Atlas`);
  lines.push('');
  lines.push(`- **Generated:** ${atlas.generatedAt}`);
  lines.push(`- **Network:** ${atlas.network}`);
  lines.push(`- **Token:** ${atlas.tokenSymbol} (decimals: ${atlas.tokenDecimals})`);
  lines.push(`- **Owner config:** ${atlas.owner.configPath}`);
  lines.push('');

  if (atlas.owner.issues.length > 0) {
    lines.push('> ⚠️ **Owner envelope issues**');
    atlas.owner.issues.forEach((issue) => {
      lines.push(`> - ${issue}`);
    });
    lines.push('');
  }

  if (includeMermaid) {
    lines.push('## Visual topology');
    lines.push('');
    lines.push(renderMermaid(atlas));
    lines.push('');
  }

  lines.push('## Module directory');
  lines.push('');
  lines.push('| Status | Subsystem | Config | Update command | Verify command | Key controls |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  atlas.subsystems.forEach((subsystem) => {
    const status = subsystem.issues.length > 0 ? '⚠️' : '✅';
    const controls = subsystem.summary.map((line) => line.replace(/\|/g, '\\|')).join('<br />');
    lines.push(
      `| ${status} | ${subsystem.label} | \`${subsystem.configPath}\` | \`${subsystem.updateCommand}\` | \`${subsystem.verifyCommand}\` | ${controls} |`
    );
  });
  lines.push('');

  lines.push('## Detailed notes');
  lines.push('');

  atlas.subsystems.forEach((subsystem) => {
    lines.push(`### ${subsystem.label}`);
    lines.push('');
    lines.push(`- **Contract:** ${subsystem.contract}`);
    lines.push(`- **Config file:** \`${subsystem.configPath}\``);
    lines.push(`- **Update:** \`${subsystem.updateCommand}\``);
    lines.push(`- **Verify:** \`${subsystem.verifyCommand}\``);
    if (subsystem.docs.length > 0) {
      const docLinks = subsystem.docs
        .map((doc) => `[${doc}](../${doc})`)
        .join(', ');
      lines.push(`- **Documentation:** ${docLinks}`);
    }
    if (subsystem.issues.length > 0) {
      lines.push('- **⚠️ Issues:**');
      subsystem.issues.forEach((issue) => {
        lines.push(`  - ${issue}`);
      });
    }
    lines.push('');
    subsystem.summary.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

function renderHuman(atlas: AtlasPayload): string {
  const lines: string[] = [];
  lines.push(`Owner Control Atlas — ${atlas.network}`);
  lines.push(`Generated: ${atlas.generatedAt}`);
  lines.push(`Token: ${atlas.tokenSymbol} (decimals ${atlas.tokenDecimals})`);
  lines.push(`Owner envelope: ${atlas.owner.configPath}`);
  if (atlas.owner.owner) {
    lines.push(`  Owner: ${atlas.owner.owner}`);
  }
  if (atlas.owner.governance) {
    lines.push(`  Governance: ${atlas.owner.governance}`);
  }
  if (atlas.owner.issues.length > 0) {
    lines.push('  Issues:');
    atlas.owner.issues.forEach((issue) => lines.push(`    - ${issue}`));
  }

  atlas.subsystems.forEach((subsystem) => {
    lines.push('');
    lines.push(`${subsystem.issues.length > 0 ? '⚠️' : '✅'} ${subsystem.label}`);
    lines.push(`  Config: ${subsystem.configPath}`);
    lines.push(`  Update: ${subsystem.updateCommand}`);
    lines.push(`  Verify: ${subsystem.verifyCommand}`);
    if (subsystem.issues.length > 0) {
      lines.push('  Issues:');
      subsystem.issues.forEach((issue) => lines.push(`    - ${issue}`));
    }
    subsystem.summary.forEach((item) => lines.push(`  - ${item}`));
  });

  return lines.join('\n');
}

async function main() {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('Failed to parse arguments:', error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printUsage();
    return;
  }

  let atlas: AtlasPayload;
  try {
    atlas = buildAtlas(options);
  } catch (error) {
    console.error('Failed to build atlas:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  let output: string;
  if (options.format === 'json') {
    output = JSON.stringify(atlas, null, 2);
  } else if (options.format === 'human') {
    output = renderHuman(atlas);
  } else {
    output = renderMarkdown(atlas, options.includeMermaid);
  }

  if (options.outPath) {
    const outPath = path.isAbsolute(options.outPath)
      ? options.outPath
      : path.join(process.cwd(), options.outPath);
    try {
      await ensureDirectory(outPath);
      await fs.writeFile(outPath, output, 'utf8');
    } catch (error) {
      console.error('Failed to write output:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
      return;
    }
    console.log(`Owner Control Atlas written to ${outPath}`);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
