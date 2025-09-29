import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { ethers } from 'ethers';
import {
  loadTokenConfig,
  loadOwnerControlConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadTaxPolicyConfig,
  loadIdentityRegistryConfig,
  loadThermodynamicsConfig,
  loadEnergyOracleConfig,
  loadRandaoCoordinatorConfig,
} from '../config';

type LoaderResult = {
  config: any;
  path: string;
  network?: string;
};

type LoaderFn = (options?: Record<string, unknown>) => LoaderResult;

type ModuleStatus = 'ok' | 'warn' | 'error';

interface ParameterSummary {
  label: string;
  value: string;
  detail?: string;
}

interface ModuleReport {
  key: string;
  label: string;
  status: ModuleStatus;
  address?: string;
  owner?: string;
  governance?: string;
  controllerType?: string;
  configPath?: string;
  configHash?: string;
  configMTime?: string;
  parameters: ParameterSummary[];
  warnings: string[];
  notes: string[];
}

interface OwnerModuleEntry {
  owner?: string;
  governance?: string;
  type?: string;
  label?: string;
  skip?: boolean;
  notes?: string[];
}

interface CliOptions {
  network?: string;
  chainId?: string;
  json?: boolean;
  outPath?: string;
  format?: 'human' | 'markdown';
  help?: boolean;
}

interface SummaryContext {
  tokenSymbol: string;
  tokenDecimals: number;
}

interface ModuleDescriptor {
  key: string;
  label: string;
  addressKey?: string;
  loader?: LoaderFn;
  cacheKey?: string;
  extract?: (result: LoaderResult) => LoaderResult;
  summary?: (config: any, context: SummaryContext) => ParameterSummary[];
  optional?: boolean;
}

interface FileInfo {
  hash: string;
  mtime: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: 'human' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--network requires a value');
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--chain-id':
      case '--chainId': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.chainId = value;
        i += 1;
        break;
      }
      case '--json':
        options.json = true;
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
        } else {
          throw new Error(`Unknown format ${value}`);
        }
        i += 1;
        break;
      }
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }
  return options;
}

function formatAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) {
      return undefined;
    }
    return address;
  } catch (err) {
    return value;
  }
}

function isZeroLike(value?: string | null): boolean {
  if (!value) {
    return true;
  }
  try {
    return ethers.getAddress(value) === ethers.ZeroAddress;
  } catch (err) {
    return false;
  }
}

function formatTokenAmount(
  raw: unknown,
  decimals: number,
  symbol: string,
  { fallback }: { fallback?: string } = {}
): string | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  try {
    const big =
      typeof raw === 'bigint'
        ? raw
        : BigInt(
            typeof raw === 'number'
              ? Math.trunc(raw)
              : typeof raw === 'string'
              ? raw
              : String(raw)
          );
    return `${ethers.formatUnits(big, decimals)} ${symbol}`;
  } catch (err) {
    return String(raw);
  }
}

function formatTokenWithRaw(
  raw: unknown,
  tokens: unknown,
  decimals: number,
  symbol: string
): string | undefined {
  if (tokens !== undefined && tokens !== null && tokens !== '') {
    return `${tokens} ${symbol}`;
  }
  const converted = formatTokenAmount(raw, decimals, symbol);
  if (converted) {
    try {
      const big =
        typeof raw === 'bigint'
          ? raw
          : BigInt(
              typeof raw === 'number'
                ? Math.trunc(raw)
                : typeof raw === 'string'
                ? raw
                : String(raw)
            );
      return `${converted} (${big.toString()} raw)`;
    } catch (err) {
      return converted;
    }
  }
  if (raw !== undefined && raw !== null && raw !== '') {
    return String(raw);
  }
  return undefined;
}

function formatPercentage(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return String(value);
  }
  return `${num}%`;
}

function formatDuration(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    return String(value);
  }
  const seconds = Math.floor(asNumber);
  const parts: string[] = [];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }
  return `${seconds}s (${parts.join(' ')})`;
}

async function computeFileInfo(
  filePath?: string
): Promise<FileInfo | undefined> {
  if (!filePath) {
    return undefined;
  }
  try {
    const resolved = path.resolve(filePath);
    const [data, stats] = await Promise.all([
      fs.readFile(resolved),
      fs.stat(resolved),
    ]);
    const hash = createHash('sha256').update(data).digest('hex');
    return {
      hash,
      mtime: stats.mtime.toISOString(),
    };
  } catch (err) {
    return undefined;
  }
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function summariseStakeManager(
  config: any,
  context: SummaryContext
): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const minStake = formatTokenWithRaw(
    config?.minStake,
    config?.minStakeTokens,
    context.tokenDecimals,
    context.tokenSymbol
  );
  if (minStake) {
    rows.push({ label: 'Minimum stake', value: minStake });
  }
  const maxStake = formatTokenWithRaw(
    config?.maxStakePerAddress,
    config?.maxStakePerAddressTokens,
    context.tokenDecimals,
    context.tokenSymbol
  );
  if (maxStake) {
    rows.push({ label: 'Max stake / address', value: maxStake });
  }
  const feePct = formatPercentage(config?.feePct);
  if (feePct) {
    rows.push({ label: 'Fee percentage', value: feePct });
  }
  const burnPct = formatPercentage(config?.burnPct);
  if (burnPct) {
    rows.push({ label: 'Burn percentage', value: burnPct });
  }
  const validatorPct = formatPercentage(config?.validatorRewardPct);
  if (validatorPct) {
    rows.push({ label: 'Validator reward %', value: validatorPct });
  }
  if (config?.treasury) {
    rows.push({ label: 'Treasury', value: config.treasury });
  }
  if (config?.autoStake) {
    const auto = config.autoStake;
    const enabled =
      auto.enabled !== undefined ? String(auto.enabled) : undefined;
    if (enabled) {
      rows.push({ label: 'Auto stake', value: enabled });
    }
    const threshold = formatTokenWithRaw(
      auto.threshold,
      auto.thresholdTokens,
      context.tokenDecimals,
      context.tokenSymbol
    );
    if (threshold) {
      rows.push({ label: 'Auto stake threshold', value: threshold });
    }
  }
  return rows;
}

function summariseJobRegistry(
  config: any,
  context: SummaryContext
): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const jobStake = formatTokenWithRaw(
    config?.jobStake,
    config?.jobStakeTokens,
    context.tokenDecimals,
    context.tokenSymbol
  );
  if (jobStake) {
    rows.push({ label: 'Job stake', value: jobStake });
  }
  const minAgentStake = formatTokenWithRaw(
    config?.minAgentStake,
    config?.minAgentStakeTokens,
    context.tokenDecimals,
    context.tokenSymbol
  );
  if (minAgentStake) {
    rows.push({ label: 'Min agent stake', value: minAgentStake });
  }
  const feePct = formatPercentage(config?.feePct);
  if (feePct) {
    rows.push({ label: 'Protocol fee %', value: feePct });
  }
  if (config?.treasury) {
    rows.push({ label: 'Treasury', value: config.treasury });
  }
  if (config?.validationModule) {
    rows.push({ label: 'Validation module', value: config.validationModule });
  }
  if (config?.disputeModule) {
    rows.push({ label: 'Dispute module', value: config.disputeModule });
  }
  if (config?.stakeManager) {
    rows.push({ label: 'Stake manager', value: config.stakeManager });
  }
  return rows;
}

function summariseFeePool(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const burnPct = formatPercentage(config?.burnPct);
  if (burnPct) {
    rows.push({ label: 'Burn percentage', value: burnPct });
  }
  if (config?.treasury) {
    rows.push({ label: 'Treasury', value: config.treasury });
  }
  if (config?.stakeManager) {
    rows.push({ label: 'Stake manager', value: config.stakeManager });
  }
  if (config?.rewardRole) {
    rows.push({ label: 'Reward role', value: String(config.rewardRole) });
  }
  return rows;
}

function summarisePlatformRegistry(
  config: any,
  context: SummaryContext
): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const minStake = formatTokenWithRaw(
    config?.minPlatformStake,
    config?.minPlatformStakeTokens,
    context.tokenDecimals,
    context.tokenSymbol
  );
  if (minStake) {
    rows.push({ label: 'Min platform stake', value: minStake });
  }
  if (config?.stakeManager) {
    rows.push({ label: 'Stake manager', value: config.stakeManager });
  }
  if (config?.reputationEngine) {
    rows.push({ label: 'Reputation engine', value: config.reputationEngine });
  }
  return rows;
}

function summarisePlatformIncentives(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const discount = formatPercentage(config?.maxDiscountPct);
  if (discount) {
    rows.push({ label: 'Max discount %', value: discount });
  }
  if (config?.jobRouter) {
    rows.push({ label: 'Job router', value: config.jobRouter });
  }
  return rows;
}

function summariseTaxPolicy(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  if (config?.policyURI) {
    rows.push({ label: 'Policy URI', value: config.policyURI });
  }
  if (config?.acknowledgement) {
    rows.push({ label: 'Acknowledgement', value: config.acknowledgement });
  }
  const revocations = Array.isArray(config?.revokeAcknowledgements)
    ? config.revokeAcknowledgements.length
    : 0;
  if (revocations > 0) {
    rows.push({ label: 'Revocations', value: `${revocations}` });
  }
  return rows;
}

function summariseIdentityRegistry(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  if (config?.ens?.agentRoot?.name) {
    rows.push({ label: 'Agent ENS root', value: config.ens.agentRoot.name });
  }
  if (config?.ens?.clubRoot?.name) {
    rows.push({ label: 'Validator ENS root', value: config.ens.clubRoot.name });
  }
  if (config?.merkle?.agent) {
    rows.push({ label: 'Agent Merkle root', value: config.merkle.agent });
  }
  if (config?.merkle?.validator) {
    rows.push({
      label: 'Validator Merkle root',
      value: config.merkle.validator,
    });
  }
  return rows;
}

function summariseRewardEngine(
  config: any,
  context: SummaryContext
): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  if (config?.thermostat) {
    rows.push({ label: 'Thermostat', value: config.thermostat });
  }
  if (config?.treasury) {
    rows.push({ label: 'Treasury', value: config.treasury });
  }
  if (config?.roleShares) {
    const parts = Object.entries(config.roleShares)
      .map(([role, share]) => `${role}: ${share}%`)
      .join(', ');
    rows.push({ label: 'Role shares', value: parts });
  }
  if (config?.temperature) {
    const temp = formatTokenAmount(
      config.temperature,
      context.tokenDecimals,
      context.tokenSymbol,
      { fallback: String(config.temperature) }
    );
    if (temp) {
      rows.push({ label: 'Temperature', value: temp });
    }
  }
  if (config?.kappa) {
    rows.push({ label: 'Kappa', value: String(config.kappa) });
  }
  return rows;
}

function summariseThermostat(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  if (config?.systemTemperature) {
    rows.push({
      label: 'System temperature',
      value: String(config.systemTemperature),
    });
  }
  if (config?.bounds) {
    const { min, max } = config.bounds;
    if (min !== undefined && max !== undefined) {
      rows.push({ label: 'Bounds', value: `${min} – ${max}` });
    }
  }
  if (config?.pid) {
    const { kp, ki, kd } = config.pid;
    rows.push({
      label: 'PID',
      value: `kp=${kp ?? 0}, ki=${ki ?? 0}, kd=${kd ?? 0}`,
    });
  }
  return rows;
}

function summariseEnergyOracle(config: any): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  const signers = ensureArray(config?.signers);
  rows.push({ label: 'Authorised signers', value: `${signers.length}` });
  if (config?.retainUnknown !== undefined) {
    rows.push({
      label: 'Retain unknown signers',
      value: String(config.retainUnknown),
    });
  }
  return rows;
}

function summariseRandaoCoordinator(
  config: any,
  context: SummaryContext
): ParameterSummary[] {
  const rows: ParameterSummary[] = [];
  if (config?.commitWindow !== undefined) {
    const formatted = formatDuration(config.commitWindow);
    if (formatted) {
      rows.push({ label: 'Commit window', value: formatted });
    }
  }
  if (config?.revealWindow !== undefined) {
    const formatted = formatDuration(config.revealWindow);
    if (formatted) {
      rows.push({ label: 'Reveal window', value: formatted });
    }
  }
  if (config?.deposit !== undefined) {
    const deposit = formatTokenAmount(
      config.deposit,
      context.tokenDecimals,
      context.tokenSymbol
    );
    if (deposit) {
      rows.push({ label: 'Deposit', value: deposit });
    }
  }
  if (config?.treasury) {
    rows.push({ label: 'Treasury', value: config.treasury });
  }
  if (config?.token) {
    rows.push({ label: 'Deposit token', value: config.token });
  }
  return rows;
}

const MODULE_DESCRIPTORS: ModuleDescriptor[] = [
  {
    key: 'stakeManager',
    label: 'Stake Manager',
    loader: loadStakeManagerConfig,
    summary: summariseStakeManager,
  },
  {
    key: 'jobRegistry',
    label: 'Job Registry',
    loader: loadJobRegistryConfig,
    summary: summariseJobRegistry,
  },
  {
    key: 'feePool',
    label: 'Fee Pool',
    loader: loadFeePoolConfig,
    summary: summariseFeePool,
  },
  {
    key: 'platformRegistry',
    label: 'Platform Registry',
    loader: loadPlatformRegistryConfig,
    summary: summarisePlatformRegistry,
  },
  {
    key: 'platformIncentives',
    label: 'Platform Incentives',
    loader: loadPlatformIncentivesConfig,
    summary: summarisePlatformIncentives,
  },
  {
    key: 'rewardEngine',
    label: 'Reward Engine',
    loader: loadThermodynamicsConfig,
    cacheKey: 'thermodynamics',
    extract: (result) => ({
      config: result.config.rewardEngine ?? {},
      path: result.path,
      network: result.network,
    }),
    summary: summariseRewardEngine,
  },
  {
    key: 'thermostat',
    label: 'Thermostat',
    loader: loadThermodynamicsConfig,
    cacheKey: 'thermodynamics',
    extract: (result) => ({
      config: result.config.thermostat ?? {},
      path: result.path,
      network: result.network,
    }),
    summary: summariseThermostat,
  },
  {
    key: 'taxPolicy',
    label: 'Tax Policy',
    loader: loadTaxPolicyConfig,
    summary: summariseTaxPolicy,
  },
  {
    key: 'identityRegistry',
    label: 'Identity Registry',
    loader: loadIdentityRegistryConfig,
    summary: summariseIdentityRegistry,
  },
  {
    key: 'energyOracle',
    label: 'Energy Oracle',
    loader: loadEnergyOracleConfig,
    summary: summariseEnergyOracle,
  },
  {
    key: 'randaoCoordinator',
    label: 'Randao Coordinator',
    loader: loadRandaoCoordinatorConfig,
    summary: summariseRandaoCoordinator,
  },
  {
    key: 'systemPause',
    label: 'System Pause',
    summary: () => [
      {
        label: 'Configuration',
        value:
          'Managed via updateSystemPause.ts helper; ensure owner is the pause contract',
      },
    ],
    optional: true,
  },
];

function resolveOwnerEntry(
  modules: Record<string, OwnerModuleEntry> | undefined,
  key: string
): OwnerModuleEntry {
  if (!modules) {
    return {};
  }
  const raw = modules[key];
  if (!raw) {
    return {};
  }
  const entry: OwnerModuleEntry = { ...raw };
  if (entry.owner && isZeroLike(entry.owner)) {
    delete entry.owner;
  }
  if (entry.governance && isZeroLike(entry.governance)) {
    delete entry.governance;
  }
  return entry;
}

function humanStatus(status: ModuleStatus): string {
  switch (status) {
    case 'ok':
      return '✅ OK';
    case 'warn':
      return '⚠️  Needs review';
    case 'error':
      return '❌ Action required';
    default:
      return status;
  }
}

function computeStatus(warnings: string[], fatal: boolean): ModuleStatus {
  if (fatal) {
    return 'error';
  }
  if (warnings.length > 0) {
    return 'warn';
  }
  return 'ok';
}

function renderHumanReport(
  reports: ModuleReport[],
  tokenSymbol: string,
  options: CliOptions
): string {
  const lines: string[] = [];
  lines.push('AGIJobs Owner Control Surface');
  lines.push('================================');
  if (options.network) {
    lines.push(`Network context: ${options.network}`);
  }
  lines.push(`Token: ${tokenSymbol}`);
  const totals = {
    ok: reports.filter((r) => r.status === 'ok').length,
    warn: reports.filter((r) => r.status === 'warn').length,
    error: reports.filter((r) => r.status === 'error').length,
  };
  lines.push(
    `Summary: ${totals.ok} ready, ${totals.warn} with warnings, ${totals.error} requiring action.`
  );
  for (const report of reports) {
    lines.push('');
    lines.push(`${humanStatus(report.status)} ${report.label}`);
    if (report.address) {
      lines.push(`  Address: ${report.address}`);
    } else {
      lines.push('  Address: (not set)');
    }
    if (report.owner) {
      lines.push(`  Owner: ${report.owner}`);
    } else {
      lines.push('  Owner: (not defined)');
    }
    if (report.governance) {
      lines.push(`  Governance: ${report.governance}`);
    }
    if (report.controllerType) {
      lines.push(`  Control type: ${report.controllerType}`);
    }
    if (report.configPath) {
      lines.push(
        `  Config: ${path.relative(process.cwd(), report.configPath)}`
      );
    } else {
      lines.push('  Config: (no dedicated file)');
    }
    if (report.configHash) {
      lines.push(`  Config hash: ${report.configHash}`);
    }
    if (report.configMTime) {
      lines.push(`  Last modified: ${report.configMTime}`);
    }
    if (report.parameters.length > 0) {
      lines.push('  Key parameters:');
      for (const param of report.parameters) {
        const detail = param.detail ? ` (${param.detail})` : '';
        lines.push(`    • ${param.label}: ${param.value}${detail}`);
      }
    }
    if (report.warnings.length > 0) {
      lines.push('  Warnings:');
      for (const warning of report.warnings) {
        lines.push(`    • ${warning}`);
      }
    }
    if (report.notes.length > 0) {
      lines.push('  Notes:');
      for (const note of report.notes) {
        lines.push(`    • ${note}`);
      }
    }
  }
  lines.push('');
  lines.push('Legend: ✅ ok, ⚠️ review recommended, ❌ action required.');
  return lines.join('\n');
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderMarkdownReport(reports: ModuleReport[]): string {
  const header =
    '| Module | Status | Owner | Governance | Address | Config | Key parameters | Warnings |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = reports.map((report) => {
    const params =
      report.parameters.length > 0
        ? report.parameters
            .map(
              (param) =>
                `${escapeMarkdown(param.label)}: ${escapeMarkdown(param.value)}`
            )
            .join('<br/>')
        : '—';
    const warnings =
      report.warnings.length > 0
        ? report.warnings.map((w) => escapeMarkdown(w)).join('<br/>')
        : '—';
    const address = report.address ? escapeMarkdown(report.address) : '—';
    const owner = report.owner ? escapeMarkdown(report.owner) : '—';
    const governance = report.governance
      ? escapeMarkdown(report.governance)
      : '—';
    const config = report.configPath
      ? escapeMarkdown(path.relative(process.cwd(), report.configPath))
      : '—';
    return `| ${escapeMarkdown(report.label)} | ${escapeMarkdown(
      humanStatus(report.status)
    )} | ${owner} | ${governance} | ${address} | ${config} | ${params} | ${warnings} |`;
  });
  return [header, ...rows].join('\n');
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Argument error: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(`Usage: ts-node ownerControlSurface.ts [options]\n\n`);
    console.log('Options:');
    console.log(
      '  --network <name>       Network context (mainnet, sepolia, etc.)'
    );
    console.log('  --chain-id <id>        Optional chain ID override');
    console.log('  --json                 Output structured JSON');
    console.log('  --format <human|markdown>  Output format for text mode');
    console.log(
      '  --out <file>           Write output to file instead of stdout'
    );
    console.log('  --help                 Show this message');
    return;
  }

  const loadOptions: Record<string, unknown> = {};
  if (options.network) {
    loadOptions.network = options.network;
  }
  if (options.chainId) {
    loadOptions.chainId = options.chainId;
  }

  const ownerControl = loadOwnerControlConfig(loadOptions);
  const token = loadTokenConfig(loadOptions);

  const context: SummaryContext = {
    tokenSymbol: token.config.symbol || 'AGIALPHA',
    tokenDecimals: token.config.decimals ?? 18,
  };

  const moduleEntries = ownerControl.config.modules || {};
  const loaderCache = new Map<string, LoaderResult>();
  const fileInfoCache = new Map<string, FileInfo>();
  const reports: ModuleReport[] = [];

  for (const descriptor of MODULE_DESCRIPTORS) {
    const ownerEntry = resolveOwnerEntry(moduleEntries, descriptor.key);
    const warnings: string[] = [];
    const notes: string[] = [];
    let fatal = false;

    if (ownerEntry.skip) {
      notes.push('Marked as skipped in owner-control.json');
    }

    const moduleAddress =
      token.config.modules?.[descriptor.addressKey ?? descriptor.key];
    const formattedAddress = formatAddress(moduleAddress);
    if (!formattedAddress) {
      if (!descriptor.optional) {
        warnings.push('Module address not configured in config/agialpha.json');
      }
    }

    let loadResult: LoaderResult | undefined;
    if (descriptor.loader) {
      const cacheKey = descriptor.cacheKey ?? descriptor.key;
      if (!loaderCache.has(cacheKey)) {
        try {
          loaderCache.set(cacheKey, descriptor.loader(loadOptions));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!descriptor.optional) {
            warnings.push(`Failed to load config: ${message}`);
            fatal = true;
          } else {
            notes.push(`Config not loaded: ${message}`);
          }
        }
      }
      const cached = loaderCache.get(cacheKey);
      if (cached) {
        loadResult = descriptor.extract ? descriptor.extract(cached) : cached;
      }
    }

    let parameters: ParameterSummary[] = [];
    let configPath: string | undefined;

    if (loadResult) {
      configPath = loadResult.path;
      try {
        parameters = descriptor.summary
          ? descriptor.summary(loadResult.config, context)
          : [];
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to summarise config: ${message}`);
      }
    }

    let fileInfo: FileInfo | undefined;
    if (configPath) {
      if (!fileInfoCache.has(configPath)) {
        const info = await computeFileInfo(configPath);
        if (info) {
          fileInfoCache.set(configPath, info);
        }
      }
      fileInfo = fileInfoCache.get(configPath);
    }

    const owner = ownerEntry.owner
      ? formatAddress(ownerEntry.owner) ?? ownerEntry.owner
      : ownerControl.config.owner && !isZeroLike(ownerControl.config.owner)
      ? formatAddress(ownerControl.config.owner) ?? ownerControl.config.owner
      : undefined;
    const governance = ownerEntry.governance
      ? formatAddress(ownerEntry.governance) ?? ownerEntry.governance
      : ownerControl.config.governance &&
        !isZeroLike(ownerControl.config.governance)
      ? formatAddress(ownerControl.config.governance) ??
        ownerControl.config.governance
      : undefined;

    if (!owner) {
      warnings.push('Owner not defined in owner-control.json');
    }

    if (!configPath && !descriptor.optional) {
      warnings.push('No configuration file for this module');
    }

    const status = computeStatus(warnings, fatal);

    const report: ModuleReport = {
      key: descriptor.key,
      label: descriptor.label,
      status,
      address: formattedAddress,
      owner,
      governance,
      controllerType: ownerEntry.type,
      configPath,
      configHash: fileInfo?.hash,
      configMTime: fileInfo?.mtime,
      parameters,
      warnings,
      notes: [
        ...notes,
        ...(ownerEntry.notes ? ensureArray(ownerEntry.notes) : []),
      ],
    };

    reports.push(report);
  }

  if (options.json) {
    const payload = {
      token: {
        symbol: context.tokenSymbol,
        decimals: context.tokenDecimals,
      },
      network: options.network ?? ownerControl.network ?? token.network,
      generatedAt: new Date().toISOString(),
      reports,
    };
    const json = JSON.stringify(payload, null, 2);
    if (options.outPath) {
      await fs.writeFile(path.resolve(options.outPath), `${json}\n`);
    } else {
      console.log(json);
    }
    if (reports.some((r) => r.status === 'error')) {
      process.exitCode = 1;
    }
    return;
  }

  const rendered =
    options.format === 'markdown'
      ? renderMarkdownReport(reports)
      : renderHumanReport(reports, context.tokenSymbol, options);

  if (options.outPath) {
    await fs.writeFile(path.resolve(options.outPath), `${rendered}\n`);
  } else {
    console.log(rendered);
  }

  if (reports.some((r) => r.status === 'error')) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${(err as Error).stack || err}`);
  process.exit(1);
});
