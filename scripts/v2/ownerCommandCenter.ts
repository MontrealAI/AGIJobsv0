import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadFeePoolConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadThermodynamicsConfig,
  loadEnergyOracleConfig,
  loadHamiltonianMonitorConfig,
  loadTaxPolicyConfig,
  loadTokenConfig,
} from '../config';

type OutputFormat = 'human' | 'markdown';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

interface ControlSummary {
  name: string;
  value: string;
  description: string;
}

type RiskLevel = 'nominal' | 'warning' | 'critical';

type IssueSeverity = 'warning' | 'critical';

interface ModuleIssue {
  severity: IssueSeverity;
  message: string;
  recommendation?: string;
}

interface ModuleSummary {
  key: string;
  label: string;
  configPath: string;
  docs?: string[];
  previewCommand?: string;
  executeCommand?: string;
  verifyCommand?: string;
  controls: ControlSummary[];
  notes?: string[];
  riskLevel: RiskLevel;
  issues: ModuleIssue[];
}

interface ReportContext {
  networkLabel: string;
  networkPlaceholder: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  ownerDefault?: string;
  governanceDefault?: string;
  ownerConfigPath: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const RISK_LABELS: Record<RiskLevel, string> = {
  nominal: 'Nominal',
  warning: 'Needs attention',
  critical: 'Action required',
};

const RISK_EMOJIS: Record<RiskLevel, string> = {
  nominal: '✅',
  warning: '⚠️',
  critical: '❌',
};

const RISK_CLASSES: Record<RiskLevel, string> = {
  nominal: 'risk_nominal',
  warning: 'risk_warning',
  critical: 'risk_critical',
};

const RISK_BADGES: Record<RiskLevel, string> = {
  nominal: 'Nominal',
  warning: 'Needs attention',
  critical: 'Action required',
};

interface LoaderResult {
  config: any;
  path: string;
  network?: string;
}

function escalateRiskLevel(current: RiskLevel, severity: IssueSeverity): RiskLevel {
  if (severity === 'critical') {
    return 'critical';
  }
  return current === 'nominal' ? 'warning' : current;
}

function createIssueTracker() {
  const issues: ModuleIssue[] = [];
  let level: RiskLevel = 'nominal';
  return {
    issues,
    register(severity: IssueSeverity, message: string, recommendation?: string) {
      issues.push({ severity, message, recommendation });
      level = escalateRiskLevel(level, severity);
    },
    get riskLevel(): RiskLevel {
      return level;
    },
  };
}

function isUnsetAddressValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  const text = String(value).trim();
  if (!text) {
    return true;
  }
  try {
    return ethers.getAddress(text) === ZERO_ADDRESS;
  } catch (_error) {
    return true;
  }
}

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string' && !value.trim()) {
    return true;
  }
  return false;
}

function isZeroLike(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'number') {
    return value === 0;
  }
  if (typeof value === 'bigint') {
    return value === BigInt(0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || /^0+(\.0+)?$/.test(trimmed)) {
      return true;
    }
    try {
      return BigInt(trimmed) === BigInt(0);
    } catch (_error) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric === 0 : false;
    }
  }
  return false;
}

function normaliseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br />');
}

function riskEmoji(level: RiskLevel): string {
  return RISK_EMOJIS[level];
}

function riskLabel(level: RiskLevel): string {
  return RISK_LABELS[level];
}

function riskClassName(level: RiskLevel): string {
  return RISK_CLASSES[level];
}

function riskBadge(level: RiskLevel): string {
  return RISK_BADGES[level];
}

function buildFallbackCandidates(key: string, network?: string): string[] {
  const candidates = new Set<string>();
  const baseName = key.replace(/\.json$/i, '');
  if (network) {
    const normalised = String(network).toLowerCase();
    candidates.add(path.join('config', `${baseName}.${normalised}.json`));
    candidates.add(path.join('config', `${baseName}.${network}.json`));
  }
  candidates.add(path.join('config', `${baseName}.json`));
  return Array.from(candidates);
}

async function loadConfigWithFallback(
  label: string,
  loader: () => LoaderResult,
  key: string,
  network?: string
): Promise<LoaderResult> {
  try {
    return loader();
  } catch (error) {
    const verbose = process.env.DEBUG_OWNER_COMMAND_CENTER === '1';
    if (verbose) {
      console.warn(`Falling back to raw JSON for ${label}:`, error);
    }
    const candidates = buildFallbackCandidates(key, network);
    for (const candidate of candidates) {
      const resolved = path.isAbsolute(candidate)
        ? candidate
        : path.join(process.cwd(), candidate);
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const config = JSON.parse(raw);
        return { config, path: resolved, network };
      } catch (readError) {
        if (verbose) {
          console.warn(`Failed to read fallback ${resolved}:`, readError);
        }
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${label}: ${reason}`);
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: 'human',
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
        if (normalised !== 'human' && normalised !== 'markdown') {
          throw new Error('Supported formats: human, markdown');
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

function formatAddress(value?: string | null): string {
  if (!value) {
    return 'Unset';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Unset';
  }
  try {
    const address = ethers.getAddress(trimmed);
    if (address === ZERO_ADDRESS) {
      return 'Unset (0x0000…0000)';
    }
    return address;
  } catch (_error) {
    return trimmed;
  }
}

function shortenAddress(value?: string): string {
  if (!value) {
    return 'unset';
  }
  const formatted = formatAddress(value);
  if (!formatted.startsWith('0x') || formatted.length !== 42) {
    return formatted;
  }
  return `${formatted.slice(0, 6)}…${formatted.slice(-4)}`;
}

function asPercent(value: unknown): string {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  if (typeof value === 'number') {
    return `${value}%`;
  }
  const text = String(value);
  return text.endsWith('%') ? text : `${text}%`;
}

function relativePath(configPath: string): string {
  const cwd = process.cwd();
  return path.relative(cwd, configPath) || '.';
}

function buildOwnerModule(context: ReportContext, ownerConfig: any): ModuleSummary {
  const modules = ownerConfig?.modules ?? {};
  const moduleCount = Object.keys(modules).length;
  const delegated = Object.entries(modules).filter(([, entry]) => {
    const typed = entry as { skip?: boolean } | undefined;
    return Boolean(typed?.skip);
  }).length;
  const tracker = createIssueTracker();
  const ownerUnset = isUnsetAddressValue(context.ownerDefault);
  const governanceUnset = isUnsetAddressValue(context.governanceDefault);
  if (ownerUnset) {
    tracker.register(
      'critical',
      'Owner default controller is unset. All Ownable modules will reject rotations.',
      'Populate `owner` in config/owner-control.json with the production multisig or timelock.'
    );
  }
  if (governanceUnset) {
    tracker.register(
      'warning',
      'Governance default is unset. Governable modules fall back to owner, reducing safety.',
      'Set `governance` in config/owner-control.json to the governance controller address.'
    );
  }
  if (moduleCount === 0) {
    tracker.register(
      'warning',
      'No modules are configured under owner control. Updates cannot be orchestrated centrally.',
      'Add modules to config/owner-control.json to describe ownership expectations.'
    );
  }

  return {
    key: 'ownerControl',
    label: 'Owner & Governance Routing',
    configPath: context.ownerConfigPath,
    docs: [
      'docs/owner-control-command-center.md',
      'docs/owner-control-surface.md',
      'docs/owner-control-non-technical-guide.md',
    ],
    previewCommand: `npm run owner:surface -- --network ${context.networkPlaceholder}`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:verify-control -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Owner default',
        value: context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset',
        description: 'Address receiving ownership for Ownable modules when not overridden.',
      },
      {
        name: 'Governance default',
        value: context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset',
        description: 'Timelock or multisig authorised to govern Governable modules.',
      },
      {
        name: 'Configured modules',
        value: `${moduleCount} tracked (${delegated} skipped)`,
        description: 'Modules listed under config.modules with governance/ownership strategy.',
      },
    ],
    notes: [
      'Run the preview command before every change to capture the current control surface.',
      'Use --safe to generate a Gnosis Safe bundle for multi-sig execution.',
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildFeePoolModule(context: ReportContext, feePool: any): ModuleSummary {
  const allowlist = Object.keys(feePool?.treasuryAllowlist ?? {}).length;
  const rewarders = Object.keys(feePool?.rewarders ?? {}).length;
  const tracker = createIssueTracker();
  const burnPct = normaliseNumber(feePool?.burnPct) ?? 0;
  if (burnPct < 0 || burnPct > 100) {
    tracker.register(
      'critical',
      `Burn percentage ${burnPct}% is outside the 0-100% range.`,
      'Update `burnPct` in config/fee-pool.json to a value between 0 and 100.'
    );
  }
  const treasuryUnset = isUnsetAddressValue(feePool?.treasury);
  if (treasuryUnset && burnPct < 100) {
    tracker.register(
      'warning',
      'Treasury is unset while burn percentage is below 100%. Residual fees will be lost.',
      'Set `treasury` to a valid recipient or increase `burnPct` to 100%.'
    );
  }
  if (allowlist > 0 && treasuryUnset) {
    tracker.register(
      'warning',
      'Treasury allowlist entries exist but treasury address is unset.',
      'Either clear the allowlist or configure `treasury` in config/fee-pool.json.'
    );
  }
  return {
    key: 'feePool',
    label: 'Fee Pool',
    configPath: feePool?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#1-update-treasury-destination', 'docs/owner-control-handbook.md'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=feePool`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=feePool --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Burn percentage',
        value: asPercent(feePool?.burnPct ?? 0),
        description: 'Portion of protocol fees burned on each settlement.',
      },
      {
        name: 'Treasury address',
        value: formatAddress(feePool?.treasury),
        description: 'Destination for non-burned fees (set to zero to burn all residuals).',
      },
      {
        name: 'Treasury allowlist',
        value: `${allowlist} address${allowlist === 1 ? '' : 'es'}`,
        description: 'Approved treasury targets for FeePool.setTreasury.',
      },
      {
        name: 'Rewarder agents',
        value: `${rewarders} configured`,
        description: 'Active rewarder contracts permitted to pull rewards.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildJobRegistryModule(context: ReportContext, jobRegistry: any): ModuleSummary {
  const tracker = createIssueTracker();
  if (isZeroLike(jobRegistry?.jobStakeTokens)) {
    tracker.register(
      'warning',
      'Job stake requirement is zero. Employers can post jobs without bonded funds.',
      'Set `jobStakeTokens` in config/job-registry.json to a positive value.'
    );
  }
  if (isZeroLike(jobRegistry?.minAgentStakeTokens)) {
    tracker.register(
      'warning',
      'Minimum agent stake is zero. Agents can accept jobs without collateral.',
      'Raise `minAgentStakeTokens` in config/job-registry.json to enforce staking.'
    );
  }
  const feePct = normaliseNumber(jobRegistry?.feePct) ?? 0;
  if (feePct < 0 || feePct > 100) {
    tracker.register(
      'critical',
      `Protocol fee ${feePct}% is outside the 0-100% range.`,
      'Clamp `feePct` in config/job-registry.json between 0 and 100.'
    );
  }
  if (isUnsetAddressValue(jobRegistry?.treasury) && feePct > 0) {
    tracker.register(
      'warning',
      'Treasury is unset while fees are enabled. Protocol fees will be burned.',
      'Set `treasury` to a treasury address or disable fees.'
    );
  }
  return {
    key: 'jobRegistry',
    label: 'Job Registry',
    configPath: jobRegistry?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-playbook.md', 'docs/owner-control-zero-downtime-guide.md'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=jobRegistry`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=jobRegistry --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Job stake requirement',
        value: `${jobRegistry?.jobStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Tokens escrowed per job posting.',
      },
      {
        name: 'Minimum agent stake',
        value: `${jobRegistry?.minAgentStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Threshold stake before agents may accept work.',
      },
      {
        name: 'Protocol fee',
        value: asPercent(jobRegistry?.feePct ?? 0),
        description: 'Percentage of job rewards collected as fees.',
      },
      {
        name: 'Treasury address',
        value: formatAddress(jobRegistry?.treasury),
        description: 'Optional treasury recipient for fees collected by the registry.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildStakeManagerModule(context: ReportContext, stakeManager: any): ModuleSummary {
  const autoStake = stakeManager?.autoStake ?? {};
  const tracker = createIssueTracker();
  if (isZeroLike(stakeManager?.minStakeTokens)) {
    tracker.register(
      'warning',
      'Minimum stake is zero. Agents can operate without collateral.',
      'Set `minStakeTokens` in config/stake-manager.json to a positive value.'
    );
  }
  const unbonding = normaliseNumber(stakeManager?.unbondingPeriodSeconds) ?? 0;
  if (unbonding <= 0) {
    tracker.register(
      'warning',
      'Unbonding period is zero. Stake withdrawals become instantaneous.',
      'Increase `unbondingPeriodSeconds` to enforce a cooling-off period.'
    );
  }
  const burnPct = normaliseNumber(stakeManager?.burnPct) ?? 0;
  if (burnPct < 0 || burnPct > 100) {
    tracker.register(
      'critical',
      `StakeManager burn percentage ${burnPct}% is outside 0-100%.`,
      'Adjust `burnPct` in config/stake-manager.json to be within bounds.'
    );
  }
  if (isUnsetAddressValue(stakeManager?.treasury) && burnPct > 0 && burnPct < 100) {
    tracker.register(
      'warning',
      'Treasury unset while burns are partial. Slashed funds will be lost.',
      'Configure `treasury` or set `burnPct` to 0 or 100 depending on policy.'
    );
  }
  if (autoStake?.enabled) {
    const floorZero = isZeroLike(autoStake.floorTokens);
    const ceilingZero = isZeroLike(autoStake.ceilingTokens);
    if (floorZero && ceilingZero) {
      tracker.register(
        'warning',
        'Auto-stake enabled but floor and ceiling tokens are zero.',
        'Populate `autoStake.floorTokens` and `autoStake.ceilingTokens` with realistic bounds.'
      );
    }
    const threshold = normaliseNumber(autoStake.threshold);
    if (threshold === undefined || threshold <= 0) {
      tracker.register(
        'warning',
        'Auto-stake threshold is missing or zero.',
        'Set `autoStake.threshold` to the percentage deviation that should trigger adjustments.'
      );
    }
  }
  return {
    key: 'stakeManager',
    label: 'Stake Manager',
    configPath: stakeManager?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-handbook.md', 'docs/owner-control-command-center.md#scenario-playbooks'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=stakeManager`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=stakeManager --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Minimum stake',
        value: `${stakeManager?.minStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Minimum collateral for participating agents.',
      },
      {
        name: 'Unbonding period',
        value: `${stakeManager?.unbondingPeriodSeconds ?? 0} seconds`,
        description: 'Cooling-off period before stake withdrawals unlock.',
      },
      {
        name: 'Burn percentage',
        value: asPercent(stakeManager?.burnPct ?? 0),
        description: 'Slash share that is permanently burned.',
      },
      {
        name: 'Auto-stake',
        value: autoStake.enabled ? 'Enabled' : 'Disabled',
        description: 'Automatic stake tuning based on Hamiltonian/temperature data.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildThermodynamicsModule(context: ReportContext, thermodynamics: any): ModuleSummary {
  const shares = thermodynamics?.rewardEngine?.roleShares ?? {};
  const pid = thermodynamics?.thermostat?.pid ?? {};
  const bounds = thermodynamics?.thermostat?.bounds ?? {};
  const tracker = createIssueTracker();
  const requiredShares: Array<'agent' | 'validator' | 'operator' | 'employer'> = [
    'agent',
    'validator',
    'operator',
    'employer',
  ];
  const shareValues = requiredShares.map((role) => normaliseNumber((shares as any)[role]));
  shareValues.forEach((value, index) => {
    if (value === undefined) {
      tracker.register(
        'critical',
        `Missing ${requiredShares[index]} role share.`,
        'Set each roleShares entry to a percentage that sums to 100.'
      );
    }
  });
  const totalShare = shareValues.reduce((sum, value) => sum + (value ?? 0), 0);
  if (Number.isFinite(totalShare) && Math.abs(totalShare - 100) > 0.001) {
    tracker.register(
      'warning',
      `Role shares sum to ${totalShare.toFixed(2)}%.`,
      'Adjust roleShares so that the total equals 100% to avoid reward drift.'
    );
  }
  const systemTemperature = normaliseNumber(thermodynamics?.thermostat?.systemTemperature);
  if (systemTemperature === undefined || systemTemperature <= 0) {
    tracker.register(
      'warning',
      'System temperature is unset or zero.',
      'Configure `thermostat.systemTemperature` to the calibrated base temperature (scaled by 1e18).'
    );
  }
  const minBound = normaliseNumber(bounds.min);
  const maxBound = normaliseNumber(bounds.max);
  if (
    minBound !== undefined &&
    maxBound !== undefined &&
    Number.isFinite(minBound) &&
    Number.isFinite(maxBound) &&
    minBound >= maxBound
  ) {
    tracker.register(
      'warning',
      `Thermostat bounds are inverted (min ${bounds.min}, max ${bounds.max}).`,
      'Ensure `bounds.min` is lower than `bounds.max` in config/thermodynamics.json.'
    );
  }
  if (isUnsetAddressValue(thermodynamics?.rewardEngine?.address)) {
    tracker.register(
      'warning',
      'Reward engine address is unset.',
      'Populate `rewardEngine.address` once deployed to enable automated verification.'
    );
  }
  if (isUnsetAddressValue(thermodynamics?.thermostat?.address)) {
    tracker.register(
      'warning',
      'Thermostat address is unset.',
      'Set `thermostat.address` in config/thermodynamics.json after deployment.'
    );
  }
  return {
    key: 'thermodynamics',
    label: 'Thermodynamics & Reward Engine',
    configPath:
      thermodynamics?.__path ?? thermodynamics?.rewardEngine?.__path ?? context.ownerConfigPath,
    docs: ['docs/thermodynamic-incentives.md', 'docs/thermodynamics-operations.md'],
    previewCommand: `npx hardhat run scripts/v2/updateThermodynamics.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateThermodynamics.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:health -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Role shares',
        value: `A ${shares.agent ?? 0}% / V ${shares.validator ?? 0}% / O ${shares.operator ?? 0}% / E ${shares.employer ?? 0}%`,
        description: 'Reward distribution between agents, validators, operators, and employers.',
      },
      {
        name: 'System temperature',
        value: thermodynamics?.thermostat?.systemTemperature ?? '0',
        description: 'Base temperature controlling reward spread (scaled by 1e18).',
      },
      {
        name: 'PID gains',
        value: `kp ${pid.kp ?? '0'} / ki ${pid.ki ?? '0'} / kd ${pid.kd ?? '0'}`,
        description: 'Thermostat PID controller coefficients.',
      },
      {
        name: 'Temperature bounds',
        value: `${bounds.min ?? '0'} → ${bounds.max ?? '0'}`,
        description: 'Minimum and maximum allowable thermostat temperature.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildEnergyOracleModule(context: ReportContext, energyOracle: any): ModuleSummary {
  const signerCount = (energyOracle?.signers ?? []).length;
  const tracker = createIssueTracker();
  if (signerCount === 0) {
    tracker.register(
      'critical',
      'No authorised energy oracle signers configured.',
      'List at least one signer in config/energy-oracle.json before going live.'
    );
  }
  return {
    key: 'energyOracle',
    label: 'Energy Oracle',
    configPath: energyOracle?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#3-refresh-energy-oracle-signers'],
    previewCommand: `npx hardhat run scripts/v2/updateEnergyOracle.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateEnergyOracle.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Authorised signers',
        value: `${signerCount} configured`,
        description: 'Measurement nodes allowed to sign energy attestations.',
      },
      {
        name: 'Retain unknown signers',
        value: energyOracle?.retainUnknown === false ? 'Disabled' : 'Enabled',
        description: 'Whether to keep signers present on-chain but absent from configuration.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildHamiltonianModule(context: ReportContext, monitor: any): ModuleSummary {
  const records = monitor?.records ?? [];
  const tracker = createIssueTracker();
  const windowSize = normaliseNumber(monitor?.window);
  if (windowSize === undefined || windowSize <= 0) {
    tracker.register(
      'warning',
      'Hamiltonian monitor window is unset or zero.',
      'Set `window` in `config/hamiltonian-monitor.json` to the number of epochs to retain.'
    );
  }
  if (isUnsetAddressValue(monitor?.address)) {
    tracker.register(
      'warning',
      'Hamiltonian monitor address is unset.',
      'Populate `address` once deployed for end-to-end verification.'
    );
  }
  return {
    key: 'hamiltonianMonitor',
    label: 'Hamiltonian Monitor',
    configPath: monitor?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#scenario-playbooks'],
    previewCommand: `npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Window size',
        value: monitor?.window ?? '0',
        description: 'Number of epochs retained for Hamiltonian averaging.',
      },
      {
        name: 'Recorded observations',
        value: `${records.length} stored`,
        description: 'Existing Hamiltonian snapshots in the configuration file.',
      },
      {
        name: 'Reset history',
        value: monitor?.resetHistory ? 'Enabled' : 'Disabled',
        description: 'If true, helper will wipe on-chain monitor history on next update.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildTaxPolicyModule(context: ReportContext, taxPolicy: any): ModuleSummary {
  const acknowledgers = Object.keys(taxPolicy?.acknowledgers ?? {}).length;
  const revocations = taxPolicy?.revokeAcknowledgements ?? [];
  const tracker = createIssueTracker();
  if (isMissing(taxPolicy?.policyURI)) {
    tracker.register(
      'warning',
      'Tax policy URI is unset.',
      'Set `policyURI` in config/tax-policy.json to an IPFS or HTTPS location.'
    );
  }
  if (isMissing(taxPolicy?.acknowledgement)) {
    tracker.register(
      'warning',
      'Acknowledgement text is missing.',
      'Define `acknowledgement` to require explicit acceptance from participants.'
    );
  }
  return {
    key: 'taxPolicy',
    label: 'Tax Policy',
    configPath: taxPolicy?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-handbook.md', 'docs/owner-control-quick-reference.md'],
    previewCommand: `npx hardhat run scripts/v2/updateTaxPolicy.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateTaxPolicy.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Policy URI',
        value: taxPolicy?.policyURI ?? 'unset',
        description: 'Content-addressed URI describing the live tax policy.',
      },
      {
        name: 'Acknowledgement text',
        value: taxPolicy?.acknowledgement ?? 'unset',
        description: 'Statement users must accept before participating.',
      },
      {
        name: 'Allowlist entries',
        value: `${acknowledgers} address${acknowledgers === 1 ? '' : 'es'}`,
        description: 'Accounts already acknowledged via config.',
      },
      {
        name: 'Revocations queued',
        value: `${revocations.length} pending`,
        description: 'Acknowledgements to revoke on next execution.',
      },
    ],
    riskLevel: tracker.riskLevel,
    issues: tracker.issues,
  };
}

function buildModules(context: ReportContext, configs: {
  ownerConfig: any;
  feePool: any;
  jobRegistry: any;
  stakeManager: any;
  thermodynamics: any;
  energyOracle: any;
  hamiltonianMonitor: any;
  taxPolicy: any;
}): ModuleSummary[] {
  const modules: ModuleSummary[] = [];
  modules.push(buildOwnerModule(context, configs.ownerConfig));
  modules.push(buildFeePoolModule(context, configs.feePool));
  modules.push(buildJobRegistryModule(context, configs.jobRegistry));
  modules.push(buildStakeManagerModule(context, configs.stakeManager));
  modules.push(buildThermodynamicsModule(context, configs.thermodynamics));
  modules.push(buildEnergyOracleModule(context, configs.energyOracle));
  modules.push(buildHamiltonianModule(context, configs.hamiltonianMonitor));
  modules.push(buildTaxPolicyModule(context, configs.taxPolicy));
  return modules;
}

function renderHuman(context: ReportContext, modules: ModuleSummary[], includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('AGIJobs Owner Command Center');
  lines.push('='.repeat(32));
  lines.push(`Network: ${context.networkLabel}`);
  lines.push(`Token: ${context.tokenSymbol} (${shortenAddress(context.tokenAddress)}), ${context.tokenDecimals} decimals`);
  lines.push('');
  lines.push('Governance defaults');
  lines.push('-'.repeat(20));
  lines.push(`• Owner default: ${context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset'}`);
  lines.push(`• Governance default: ${context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset'}`);
  lines.push('');

  lines.push('Flight readiness dashboard');
  lines.push('-'.repeat(26));
  const anyIssues = modules.some((module) => module.issues.length > 0);
  modules.forEach((module) => {
    const statusLine = `${riskEmoji(module.riskLevel)} ${module.label} – ${riskLabel(module.riskLevel)}`;
    lines.push(statusLine);
    module.issues.forEach((issue) => {
      const severity = issue.severity === 'critical' ? 'CRITICAL' : 'WARNING';
      const action = issue.recommendation ? ` Action: ${issue.recommendation}` : '';
      lines.push(`   • ${severity}: ${issue.message}${action}`);
    });
  });
  if (!anyIssues) {
    lines.push('All modules nominal.');
  }
  lines.push('');

  modules.forEach((module) => {
    lines.push(`Module: ${module.label}`);
    lines.push('-'.repeat(8 + module.label.length));
    lines.push(`Config file: ${relativePath(module.configPath)}`);
    if (module.docs?.length) {
      lines.push(`Docs: ${module.docs.join(', ')}`);
    }
    if (module.previewCommand) {
      lines.push(`Preview: ${module.previewCommand}`);
    }
    if (module.executeCommand) {
      lines.push(`Execute: ${module.executeCommand}`);
    }
    if (module.verifyCommand) {
      lines.push(`Verify: ${module.verifyCommand}`);
    }
    module.controls.forEach((control) => {
      lines.push(`  - ${control.name}: ${control.value}`);
      lines.push(`      ${control.description}`);
    });
    if (module.issues.length) {
      module.issues.forEach((issue) => {
        const prefix = issue.severity === 'critical' ? '❌' : '⚠️';
        const action = issue.recommendation ? ` Action: ${issue.recommendation}` : '';
        lines.push(`      ${prefix} ${issue.message}${action}`);
      });
    }
    if (module.notes?.length) {
      module.notes.forEach((note) => lines.push(`      Note: ${note}`));
    }
    lines.push('');
  });

  if (includeMermaid) {
    lines.push('Mermaid overview');
    lines.push('-'.repeat(16));
    lines.push(renderMermaid(context, modules));
  }

  return lines.join('\n');
}

function renderMarkdown(context: ReportContext, modules: ModuleSummary[], includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('# AGIJobs Owner Command Center');
  lines.push('');
  lines.push(`- **Network:** ${context.networkLabel}`);
  lines.push(`- **Token:** ${context.tokenSymbol} (${formatAddress(context.tokenAddress)})`);
  lines.push(`- **Decimals:** ${context.tokenDecimals}`);
  lines.push(`- **Owner default:** ${context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset'}`);
  lines.push(`- **Governance default:** ${context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset'}`);
  lines.push('');

  lines.push('## Flight Readiness Dashboard');
  lines.push('');
  lines.push('| Module | Status | Issues | Recommended Actions |');
  lines.push('| --- | --- | --- | --- |');
  modules.forEach((module) => {
    const status = `${riskEmoji(module.riskLevel)} ${riskLabel(module.riskLevel)}`;
    if (module.issues.length === 0) {
      lines.push(`| ${module.label} | ${status} | _None_ | _None_ |`);
      return;
    }
    const issuesText = module.issues
      .map((issue) => {
        const severity = issue.severity === 'critical' ? '**Critical**' : '**Warning**';
        return `${severity} ${issue.message}`;
      })
      .join('<br />');
    const actionText = module.issues
      .map((issue) => issue.recommendation ?? 'See documentation for remediation steps.')
      .join('<br />');
    lines.push(
      `| ${module.label} | ${status} | ${escapeMarkdownTable(issuesText)} | ${escapeMarkdownTable(actionText)} |`
    );
  });
  lines.push('');

  modules.forEach((module) => {
    lines.push(`## ${module.label}`);
    lines.push('');
    lines.push(`- **Config:** \`${relativePath(module.configPath)}\``);
    if (module.docs?.length) {
      lines.push(`- **Docs:** ${module.docs.map((doc) => `[\`${doc}\`](${doc})`).join(', ')}`);
    }
    if (module.previewCommand) {
      lines.push(`- **Preview:** \`${module.previewCommand}\``);
    }
    if (module.executeCommand) {
      lines.push(`- **Execute:** \`${module.executeCommand}\``);
    }
    if (module.verifyCommand) {
      lines.push(`- **Verify:** \`${module.verifyCommand}\``);
    }
    lines.push('');
    lines.push('| Control | Value | Purpose |');
    lines.push('| --- | --- | --- |');
    module.controls.forEach((control) => {
      lines.push(`| ${control.name} | ${control.value} | ${control.description} |`);
    });
    if (module.notes?.length) {
      lines.push('');
      module.notes.forEach((note) => lines.push(`> ${note}`));
    }
    if (module.issues.length) {
      lines.push('');
      module.issues.forEach((issue) => {
        const prefix = issue.severity === 'critical' ? '❌' : '⚠️';
        const action = issue.recommendation ? ` — _${issue.recommendation}_` : '';
        lines.push(`> ${prefix} **${issue.severity === 'critical' ? 'Critical' : 'Warning'}:** ${issue.message}${action}`);
      });
    }
    lines.push('');
  });

  if (includeMermaid) {
    lines.push('## Visual Overview');
    lines.push('');
    lines.push(renderMermaid(context, modules));
    lines.push('');
  }

  return lines.join('\n');
}

function moduleNodeId(module: ModuleSummary): string {
  const raw = module.key || module.label;
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '_');
  return cleaned ? cleaned.toUpperCase() : 'MODULE';
}

function renderMermaid(context: ReportContext, modules: ModuleSummary[]): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');
  lines.push('    classDef risk_nominal fill:#ecfdf5,stroke:#047857,stroke-width:1px;');
  lines.push('    classDef risk_warning fill:#fef3c7,stroke:#b45309,stroke-width:1px;');
  lines.push('    classDef risk_critical fill:#fee2e2,stroke:#b91c1c,stroke-width:1px;');
  const ownerModule = modules.find((module) => module.key === 'ownerControl');
  const ownerClass = ownerModule ? riskClassName(ownerModule.riskLevel) : riskClassName('nominal');
  lines.push('    subgraph Governance');
  lines.push(`        OWNER[Owner Default\\n${shortenAddress(context.ownerDefault)}]`);
  lines.push(`        GOV[Governance Default\\n${shortenAddress(context.governanceDefault)}]`);
  lines.push('    end');
  lines.push(`    class OWNER ${ownerClass};`);
  lines.push(`    class GOV ${ownerClass};`);
  modules
    .filter((module) => module.key !== 'ownerControl')
    .forEach((module) => {
      const highlight = module.controls
        .slice(0, 2)
        .map((control) => `${control.name}: ${control.value}`)
        .join('\\n');
      const nodeId = moduleNodeId(module);
      const badge = riskBadge(module.riskLevel);
      const block = highlight ? `\\n${highlight}` : '';
      lines.push(`    ${nodeId}[${module.label}\\n${badge}${block}]`);
      lines.push(`    OWNER --> ${nodeId}`);
      lines.push(`    GOV --> ${nodeId}`);
      lines.push(`    class ${nodeId} ${riskClassName(module.riskLevel)};`);
    });
  lines.push('```');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: ts-node scripts/v2/ownerCommandCenter.ts [--network <name>] [--format human|markdown] [--output <file>] [--no-mermaid]');
    return;
  }

  const loadOptions = options.network ? { network: options.network } : {};

  const ownerConfig = await loadConfigWithFallback(
    'owner control config',
    () => loadOwnerControlConfig(loadOptions),
    'owner-control',
    options.network
  );
  const feePool = await loadConfigWithFallback(
    'fee pool config',
    () => loadFeePoolConfig(loadOptions),
    'fee-pool',
    options.network
  );
  const jobRegistry = await loadConfigWithFallback(
    'job registry config',
    () => loadJobRegistryConfig(loadOptions),
    'job-registry',
    options.network
  );
  const stakeManager = await loadConfigWithFallback(
    'stake manager config',
    () => loadStakeManagerConfig(loadOptions),
    'stake-manager',
    options.network
  );
  const thermodynamics = await loadConfigWithFallback(
    'thermodynamics config',
    () => loadThermodynamicsConfig(loadOptions),
    'thermodynamics',
    options.network
  );
  const energyOracle = await loadConfigWithFallback(
    'energy oracle config',
    () => loadEnergyOracleConfig(loadOptions),
    'energy-oracle',
    options.network
  );
  const hamiltonianMonitor = await loadConfigWithFallback(
    'hamiltonian monitor config',
    () => loadHamiltonianMonitorConfig(loadOptions),
    'hamiltonian-monitor',
    options.network
  );
  const taxPolicy = await loadConfigWithFallback(
    'tax policy config',
    () => loadTaxPolicyConfig(loadOptions),
    'tax-policy',
    options.network
  );
  const tokenConfig = await loadConfigWithFallback(
    'token config',
    () => loadTokenConfig(loadOptions),
    'agialpha',
    options.network
  );

  const networkLabel = ownerConfig.network ?? options.network ?? 'default';
  const networkPlaceholder = options.network ?? ownerConfig.network ?? '<network>';

  const context: ReportContext = {
    networkLabel,
    networkPlaceholder,
    tokenSymbol: tokenConfig?.config?.symbol ?? '$AGI',
    tokenAddress: tokenConfig?.config?.address ?? ZERO_ADDRESS,
    tokenDecimals: tokenConfig?.config?.decimals ?? 18,
    ownerDefault: ownerConfig?.config?.owner,
    governanceDefault: ownerConfig?.config?.governance,
    ownerConfigPath: ownerConfig?.path ?? path.join(process.cwd(), 'config', 'owner-control.json'),
  };

  const modules = buildModules(context, {
    ownerConfig: ownerConfig?.config,
    feePool: {
      ...feePool?.config,
      __path:
        feePool?.path ?? path.join(process.cwd(), 'config', 'fee-pool.json'),
    },
    jobRegistry: {
      ...jobRegistry?.config,
      __path:
        jobRegistry?.path ?? path.join(process.cwd(), 'config', 'job-registry.json'),
    },
    stakeManager: {
      ...stakeManager?.config,
      __path:
        stakeManager?.path ?? path.join(process.cwd(), 'config', 'stake-manager.json'),
    },
    thermodynamics: {
      ...thermodynamics?.config,
      __path:
        thermodynamics?.path ?? path.join(process.cwd(), 'config', 'thermodynamics.json'),
    },
    energyOracle: {
      ...energyOracle?.config,
      __path:
        energyOracle?.path ?? path.join(process.cwd(), 'config', 'energy-oracle.json'),
    },
    hamiltonianMonitor: {
      ...hamiltonianMonitor?.config,
      __path:
        hamiltonianMonitor?.path ??
        path.join(process.cwd(), 'config', 'hamiltonian-monitor.json'),
    },
    taxPolicy: {
      ...taxPolicy?.config,
      __path:
        taxPolicy?.path ?? path.join(process.cwd(), 'config', 'tax-policy.json'),
    },
  });

  let output: string;
  if (options.format === 'markdown') {
    output = renderMarkdown(context, modules, options.includeMermaid);
  } else {
    output = renderHuman(context, modules, options.includeMermaid);
  }

  if (options.outPath) {
    await fs.writeFile(options.outPath, output, 'utf8');
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error('ownerCommandCenter failed:', error);
  process.exitCode = 1;
});

