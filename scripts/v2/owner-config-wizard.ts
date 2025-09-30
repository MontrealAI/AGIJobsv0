import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  loadTokenConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  inferNetworkKey,
  JobRegistryConfig,
  StakeManagerConfig,
  FeePoolConfig,
} from '../config';
import { formatUnits, parseUnits, getAddress, ZeroAddress } from 'ethers';

type ChangeEntry = {
  module: string;
  key: string;
  previous: string;
  next: string;
  configPath: string;
};

type TokenBase = {
  tokens?: string;
  raw?: string;
  base?: string;
};

type TokenPromptResult =
  | (TokenBase & { mode: 'tokens' | 'raw'; changed: true })
  | { changed: true; mode: 'clear' }
  | { changed: false };

type AddressPromptResult =
  | { changed: false }
  | { changed: true; value: string | null };

type IntegerPromptResult =
  | { changed: true; value: number }
  | { changed: false };

type AllowlistPromptResult =
  | { changed: true; value: Record<string, boolean> }
  | { changed: false };

type BooleanPromptResult =
  | { changed: true; value: boolean }
  | { changed: false };

type BigIntPromptResult =
  | { changed: true; value: string | null }
  | { changed: false };

type WizardResult<T> = { config: T; changes: ChangeEntry[] };

const HEADER = `AGIJobs Owner Configuration Wizard\n----------------------------------`;
const SUPPORTED_NETWORKS = ['mainnet', 'sepolia'];
const SUPPORTED_NETWORKS_LABEL = SUPPORTED_NETWORKS.join(', ');

type CliOptions = {
  network?: string;
  networkSource?: string;
  showHelp?: boolean;
};

function withDefaultLabel(question: string, current?: string): string {
  if (!current) {
    return `${question}\n> `;
  }
  return `${question}\n  (current: ${current})\n> `;
}

function describeAddress(value?: string | null): string {
  if (value === null) {
    return 'null (unset)';
  }
  if (!value) {
    return 'unset';
  }
  const normalised = getAddress(value);
  if (normalised === ZeroAddress) {
    return `${normalised} (zero address)`;
  }
  return normalised;
}

function describeToken(
  base: string | undefined,
  decimals: number,
  symbol: string
): string {
  if (!base) {
    return 'unset';
  }
  try {
    const formatted = formatUnits(BigInt(base), decimals);
    return `${formatted} ${symbol} (${base} base units)`;
  } catch (error) {
    return `${base} base units`;
  }
}

function resolveTokenBase(
  tokens?: string | number | null,
  raw?: string | number | null,
  decimals?: number
): string | undefined {
  if (raw !== undefined && raw !== null) {
    try {
      return BigInt(raw).toString();
    } catch (_) {
      return undefined;
    }
  }
  if (tokens === undefined || tokens === null || decimals === undefined) {
    return undefined;
  }
  const asString = typeof tokens === 'number' ? tokens.toString() : tokens;
  if (!asString) {
    return undefined;
  }
  try {
    return parseUnits(asString, decimals).toString();
  } catch (_) {
    return undefined;
  }
}

async function promptToken(
  rl: ReturnType<typeof createInterface>,
  label: string,
  symbol: string,
  decimals: number,
  current: TokenBase,
  { allowClear = false }: { allowClear?: boolean } = {}
): Promise<TokenPromptResult> {
  const defaultBase = current.base;
  const display =
    current.tokens ?? (current.raw ? `raw:${current.raw}` : undefined);
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 'keep') {
      return { changed: false };
    }
    if (
      allowClear &&
      ['none', 'null', 'clear'].includes(answer.toLowerCase())
    ) {
      if (defaultBase === undefined) {
        return { changed: false };
      }
      return { changed: true, mode: 'clear' };
    }
    if (answer.toLowerCase() === 'raw' && current.raw) {
      return { changed: false };
    }
    try {
      if (answer.toLowerCase().startsWith('raw:')) {
        const rawValue = answer.slice(4).trim();
        if (!rawValue) {
          throw new Error('Provide a numeric value after raw:');
        }
        const asBigInt = BigInt(rawValue);
        if (asBigInt < 0n) {
          throw new Error('Raw token amount cannot be negative');
        }
        const base = asBigInt.toString();
        if (base === defaultBase) {
          return { changed: false };
        }
        return {
          changed: true,
          mode: 'raw',
          raw: base,
          base,
          tokens: undefined,
        };
      }
      const parsed = parseUnits(answer, decimals);
      if (parsed < 0n) {
        throw new Error('Token amount cannot be negative');
      }
      const base = parsed.toString();
      if (base === defaultBase) {
        return { changed: false };
      }
      return {
        changed: true,
        mode: 'tokens',
        tokens: answer,
        base,
        raw: undefined,
      };
    } catch (error: any) {
      console.error(`  Invalid amount: ${error?.message ?? error}`);
    }
  }
}

async function promptBoolean(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: boolean | undefined
): Promise<BooleanPromptResult> {
  const display =
    current === undefined
      ? undefined
      : current
      ? 'yes (enabled)'
      : 'no (disabled)';
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    const lower = answer.toLowerCase();
    if (['skip', 'keep'].includes(lower)) {
      return { changed: false };
    }
    if (['yes', 'y', 'true', 'enable', 'enabled', 'on', '1'].includes(lower)) {
      if (current === true) {
        return { changed: false };
      }
      return { changed: true, value: true };
    }
    if (
      ['no', 'n', 'false', 'disable', 'disabled', 'off', '0'].includes(lower)
    ) {
      if (current === false) {
        return { changed: false };
      }
      return { changed: true, value: false };
    }
    console.error('  Please answer yes or no.');
  }
}

async function promptBigInt(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: string | number | null | undefined,
  {
    allowNegative = false,
    allowNull = true,
  }: { allowNegative?: boolean; allowNull?: boolean } = {}
): Promise<BigIntPromptResult> {
  const display =
    current === null
      ? 'unset'
      : current === undefined
      ? undefined
      : String(current);
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    const lower = answer.toLowerCase();
    if (['skip', 'keep'].includes(lower)) {
      return { changed: false };
    }
    if (allowNull && ['none', 'null', 'clear'].includes(lower)) {
      if (current === null || current === undefined || current === '') {
        return { changed: false };
      }
      return { changed: true, value: null };
    }
    if (!/^[-+]?\d+$/.test(answer)) {
      console.error('  Please enter an integer value.');
      continue;
    }
    try {
      const value = BigInt(answer);
      if (!allowNegative && value < 0) {
        console.error('  Value cannot be negative.');
        continue;
      }
      const normalised = value.toString();
      if (
        current !== undefined &&
        current !== null &&
        String(current) === normalised
      ) {
        return { changed: false };
      }
      return { changed: true, value: normalised };
    } catch (error: any) {
      console.error(`  Invalid integer: ${error?.message ?? error}`);
    }
  }
}

async function promptInteger(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: number | undefined,
  { min, max }: { min?: number; max?: number } = {}
): Promise<IntegerPromptResult> {
  const display = current !== undefined ? current.toString() : undefined;
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 'keep') {
      return { changed: false };
    }
    const parsed = Number(answer);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      console.error('  Please enter an integer value.');
      continue;
    }
    if (min !== undefined && parsed < min) {
      console.error(`  Value must be at least ${min}.`);
      continue;
    }
    if (max !== undefined && parsed > max) {
      console.error(`  Value must be at most ${max}.`);
      continue;
    }
    if (current !== undefined && parsed === current) {
      return { changed: false };
    }
    return { changed: true, value: parsed };
  }
}

async function promptPercentage(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: number | undefined,
  max = 100
): Promise<IntegerPromptResult> {
  return promptInteger(rl, `${label} (0-${max})`, current, { min: 0, max });
}

async function promptAddress(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: string | null | undefined,
  {
    allowZero = true,
    allowNull = true,
  }: { allowZero?: boolean; allowNull?: boolean } = {}
): Promise<AddressPromptResult> {
  const display = current
    ? describeAddress(current)
    : allowNull
    ? 'null (unset)'
    : undefined;
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    const lower = answer.toLowerCase();
    if (['skip', 'keep'].includes(lower)) {
      return { changed: false };
    }
    if (allowNull && ['none', 'null', 'unset'].includes(lower)) {
      if (current === null) {
        return { changed: false };
      }
      return { changed: true, value: null };
    }
    if (
      allowZero &&
      ['zero', '0', '0x0', ZeroAddress.toLowerCase()].includes(lower)
    ) {
      const value = ZeroAddress;
      if (current && getAddress(current) === value) {
        return { changed: false };
      }
      return { changed: true, value };
    }
    try {
      const normalised = getAddress(answer);
      if (current && getAddress(current) === normalised) {
        return { changed: false };
      }
      return { changed: true, value: normalised };
    } catch (error: any) {
      console.error(`  Invalid address: ${error?.message ?? error}`);
    }
  }
}

async function promptAllowlist(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: Record<string, boolean> | undefined
): Promise<AllowlistPromptResult> {
  const enabled = Object.entries(current || {})
    .filter(([, value]) => Boolean(value))
    .map(([address]) => address);
  const display = enabled.length > 0 ? enabled.join(', ') : 'none';
  for (;;) {
    const answer = (await rl.question(withDefaultLabel(label, display))).trim();
    if (!answer) {
      return { changed: false };
    }
    const lower = answer.toLowerCase();
    if (['skip', 'keep'].includes(lower)) {
      return { changed: false };
    }
    if (['none', 'null', 'clear'].includes(lower)) {
      if (enabled.length === 0) {
        return { changed: false };
      }
      return { changed: true, value: {} };
    }
    const parts = answer
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      console.error('  Provide at least one address or type none to clear.');
      continue;
    }
    try {
      const mapped: Record<string, boolean> = {};
      for (const part of parts) {
        const normalised = getAddress(part);
        mapped[normalised] = true;
      }
      const currentKeys = enabled.map((addr) => getAddress(addr)).sort();
      const nextKeys = Object.keys(mapped)
        .map((addr) => getAddress(addr))
        .sort();
      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every((value, index) => value === nextKeys[index])
      ) {
        return { changed: false };
      }
      return { changed: true, value: mapped };
    } catch (error: any) {
      console.error(`  Invalid address provided: ${error?.message ?? error}`);
    }
  }
}

function ensureDirectory(filePath: string): Promise<void> {
  return fs
    .mkdir(path.dirname(filePath), { recursive: true })
    .then(() => undefined);
}

function describeNetwork(network?: string, source?: string): string {
  if (!network) {
    return 'default (shared config files)';
  }
  if (source) {
    return `${network} (via ${source})`;
  }
  return network;
}

function normaliseNetworkInput(
  value: string | undefined,
  source: string
): string {
  if (!value) {
    throw new Error(`${source} requires a value`);
  }
  const resolved = inferNetworkKey(value);
  if (!resolved) {
    throw new Error(
      `${source} expected one of ${SUPPORTED_NETWORKS_LABEL}, received "${value}"`
    );
  }
  if (!SUPPORTED_NETWORKS.includes(resolved)) {
    throw new Error(
      `${source} references unsupported network "${resolved}". Supported networks: ${SUPPORTED_NETWORKS_LABEL}`
    );
  }
  return resolved;
}

function parseCliOptions(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const options: CliOptions = {};

  const envSources: Array<[string, string | undefined]> = [
    ['OWNER_WIZARD_NETWORK', env.OWNER_WIZARD_NETWORK],
    ['OWNER_CONFIG_NETWORK', env.OWNER_CONFIG_NETWORK],
    ['OWNER_PLAN_NETWORK', env.OWNER_PLAN_NETWORK],
    ['AGIALPHA_NETWORK', env.AGIALPHA_NETWORK],
    ['AGJ_NETWORK', env.AGJ_NETWORK],
    ['HARDHAT_NETWORK', env.HARDHAT_NETWORK],
    ['TRUFFLE_NETWORK', env.TRUFFLE_NETWORK],
  ];

  for (const [key, value] of envSources) {
    if (!value) continue;
    const resolved = inferNetworkKey(value);
    if (resolved && SUPPORTED_NETWORKS.includes(resolved)) {
      options.network = resolved;
      options.networkSource = `env:${key}`;
      break;
    }
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.showHelp = true;
        break;
      case '--network':
      case '-n': {
        const value = argv[i + 1];
        options.network = normaliseNetworkInput(value, arg);
        options.networkSource = arg;
        i += 1;
        break;
      }
      case '--mainnet':
        options.network = 'mainnet';
        options.networkSource = arg;
        break;
      case '--sepolia':
        options.network = 'sepolia';
        options.networkSource = arg;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument ${arg}`);
        }
        throw new Error(`Unexpected positional argument ${arg}`);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`Usage: npm run owner:wizard -- [options]\n`);
  console.log('Options:');
  console.log('  -h, --help           Show this message and exit');
  console.log(
    '  -n, --network NAME   Select config network (mainnet | sepolia)'
  );
  console.log('      --mainnet        Shortcut for --network mainnet');
  console.log('      --sepolia        Shortcut for --network sepolia');
  console.log('\nExamples:');
  console.log('  npm run owner:wizard -- --network mainnet');
  console.log('  npm run owner:wizard -- --sepolia');
}

async function backupFile(filePath: string) {
  try {
    const backupPath = `${filePath}.bak`;
    await ensureDirectory(backupPath);
    await fs.copyFile(filePath, backupPath);
    console.log(`  Backup written to ${backupPath}`);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }
    console.warn(
      `  Warning: unable to create backup for ${filePath}: ${
        error?.message ?? error
      }`
    );
  }
}

function computeTokenBaseFromConfig(
  config: Record<string, any>,
  keyBase: string,
  keyTokens: string,
  decimals: number
): TokenBase {
  const raw = config[keyBase];
  const tokens = config[keyTokens];
  const base = resolveTokenBase(tokens, raw, decimals);
  return {
    raw: raw !== undefined ? String(raw) : undefined,
    tokens: tokens !== undefined ? String(tokens) : undefined,
    base,
  };
}

function applyTokenChange(
  target: Record<string, any>,
  keyBase: string,
  keyTokens: string,
  result: TokenPromptResult
): void {
  if (!result.changed) {
    return;
  }
  if (result.mode === 'tokens') {
    target[keyTokens] = result.tokens;
    delete target[keyBase];
    return;
  }
  if (result.mode === 'raw') {
    target[keyBase] = result.raw;
    delete target[keyTokens];
    return;
  }
  if (result.mode === 'clear') {
    delete target[keyBase];
    delete target[keyTokens];
  }
}

function describeSimple(value: unknown, suffix = ''): string {
  if (value === undefined || value === null || value === '') {
    return 'unset';
  }
  return `${value}${suffix}`;
}

function normaliseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normaliseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const lower = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(lower)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(lower)) {
    return false;
  }
  return undefined;
}

function describeBoolean(value: unknown): string {
  const resolved = normaliseBoolean(value);
  if (resolved === undefined) {
    return 'unset';
  }
  return resolved ? 'enabled' : 'disabled';
}

async function configureJobRegistry(
  rl: ReturnType<typeof createInterface>,
  config: JobRegistryConfig,
  configPath: string,
  decimals: number,
  symbol: string
): Promise<WizardResult<JobRegistryConfig>> {
  console.log('\nJob Registry settings');
  const updated: JobRegistryConfig = { ...config };
  const changes: ChangeEntry[] = [];

  const jobStakeCurrent = computeTokenBaseFromConfig(
    updated,
    'jobStake',
    'jobStakeTokens',
    decimals
  );
  const jobStake = await promptToken(
    rl,
    'Minimum stake an employer deposits per job (tokens or raw:<amount>)',
    symbol,
    decimals,
    jobStakeCurrent
  );
  if (jobStake.changed) {
    const previous = describeToken(jobStakeCurrent.base, decimals, symbol);
    if (jobStake.mode === 'tokens') {
      updated.jobStakeTokens = jobStake.tokens;
      delete (updated as any).jobStake;
      changes.push({
        module: 'JobRegistry',
        key: 'jobStakeTokens',
        previous,
        next: describeToken(jobStake.base, decimals, symbol),
        configPath,
      });
    } else {
      updated.jobStake = jobStake.raw;
      delete (updated as any).jobStakeTokens;
      changes.push({
        module: 'JobRegistry',
        key: 'jobStake',
        previous,
        next: describeToken(jobStake.base, decimals, symbol),
        configPath,
      });
    }
  }

  const minAgentStakeCurrent = computeTokenBaseFromConfig(
    updated,
    'minAgentStake',
    'minAgentStakeTokens',
    decimals
  );
  const minAgentStake = await promptToken(
    rl,
    'Minimum stake agents must lock to participate',
    symbol,
    decimals,
    minAgentStakeCurrent
  );
  if (minAgentStake.changed) {
    const previous = describeToken(minAgentStakeCurrent.base, decimals, symbol);
    if (minAgentStake.mode === 'tokens') {
      updated.minAgentStakeTokens = minAgentStake.tokens;
      delete (updated as any).minAgentStake;
    } else {
      updated.minAgentStake = minAgentStake.raw;
      delete (updated as any).minAgentStakeTokens;
    }
    changes.push({
      module: 'JobRegistry',
      key:
        minAgentStake.mode === 'tokens'
          ? 'minAgentStakeTokens'
          : 'minAgentStake',
      previous,
      next: describeToken(minAgentStake.base, decimals, symbol),
      configPath,
    });
  }

  const maxRewardCurrent = computeTokenBaseFromConfig(
    updated,
    'maxJobReward',
    'maxJobRewardTokens',
    decimals
  );
  const maxReward = await promptToken(
    rl,
    'Maximum job reward (tokens or raw)',
    symbol,
    decimals,
    maxRewardCurrent
  );
  if (maxReward.changed) {
    const previous = describeToken(maxRewardCurrent.base, decimals, symbol);
    if (maxReward.mode === 'tokens') {
      updated.maxJobRewardTokens = maxReward.tokens;
      delete (updated as any).maxJobReward;
    } else {
      updated.maxJobReward = maxReward.raw;
      delete (updated as any).maxJobRewardTokens;
    }
    changes.push({
      module: 'JobRegistry',
      key: maxReward.mode === 'tokens' ? 'maxJobRewardTokens' : 'maxJobReward',
      previous,
      next: describeToken(maxReward.base, decimals, symbol),
      configPath,
    });
  }

  const jobDuration = await promptInteger(
    rl,
    'Maximum job duration in seconds',
    updated.jobDurationLimitSeconds
  );
  if (jobDuration.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'jobDurationLimitSeconds',
      previous:
        updated.jobDurationLimitSeconds !== undefined
          ? `${updated.jobDurationLimitSeconds} seconds`
          : 'unset',
      next: `${jobDuration.value} seconds`,
      configPath,
    });
    updated.jobDurationLimitSeconds = jobDuration.value;
  }

  const maxActive = await promptInteger(
    rl,
    'Maximum number of active jobs per agent',
    updated.maxActiveJobsPerAgent
  );
  if (maxActive.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'maxActiveJobsPerAgent',
      previous:
        updated.maxActiveJobsPerAgent !== undefined
          ? updated.maxActiveJobsPerAgent.toString()
          : 'unset',
      next: maxActive.value.toString(),
      configPath,
    });
    updated.maxActiveJobsPerAgent = maxActive.value;
  }

  const expirationGrace = await promptInteger(
    rl,
    'Expiration grace period in seconds',
    updated.expirationGracePeriodSeconds
  );
  if (expirationGrace.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'expirationGracePeriodSeconds',
      previous:
        updated.expirationGracePeriodSeconds !== undefined
          ? `${updated.expirationGracePeriodSeconds} seconds`
          : 'unset',
      next: `${expirationGrace.value} seconds`,
      configPath,
    });
    updated.expirationGracePeriodSeconds = expirationGrace.value;
  }

  const feePct = await promptPercentage(
    rl,
    'Protocol fee percentage',
    updated.feePct
  );
  if (feePct.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'feePct',
      previous: updated.feePct !== undefined ? `${updated.feePct}%` : 'unset',
      next: `${feePct.value}%`,
      configPath,
    });
    updated.feePct = feePct.value;
  }

  const validatorPct = await promptPercentage(
    rl,
    'Validator reward percentage',
    updated.validatorRewardPct
  );
  if (validatorPct.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'validatorRewardPct',
      previous:
        updated.validatorRewardPct !== undefined
          ? `${updated.validatorRewardPct}%`
          : 'unset',
      next: `${validatorPct.value}%`,
      configPath,
    });
    updated.validatorRewardPct = validatorPct.value;
  }

  const treasury = await promptAddress(
    rl,
    'Treasury address (zero burns rounding dust)',
    updated.treasury,
    { allowZero: true, allowNull: false }
  );
  if (treasury.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'treasury',
      previous: describeAddress(updated.treasury),
      next: describeAddress(treasury.value),
      configPath,
    });
    updated.treasury = treasury.value ?? ZeroAddress;
  }

  const taxPolicy = await promptAddress(
    rl,
    'Tax policy module address (type none to clear)',
    updated.taxPolicy,
    { allowZero: false, allowNull: true }
  );
  if (taxPolicy.changed) {
    changes.push({
      module: 'JobRegistry',
      key: 'taxPolicy',
      previous: describeAddress(updated.taxPolicy),
      next: describeAddress(taxPolicy.value),
      configPath,
    });
    updated.taxPolicy = taxPolicy.value ?? null;
  }

  return { config: updated, changes };
}

async function configureStakeManager(
  rl: ReturnType<typeof createInterface>,
  config: StakeManagerConfig,
  configPath: string,
  decimals: number,
  symbol: string
): Promise<WizardResult<StakeManagerConfig>> {
  console.log('\nStake Manager settings');
  const updated: StakeManagerConfig = { ...config };
  const changes: ChangeEntry[] = [];

  const minStakeCurrent = computeTokenBaseFromConfig(
    updated,
    'minStake',
    'minStakeTokens',
    decimals
  );
  const minStake = await promptToken(
    rl,
    'Minimum stake required for participants',
    symbol,
    decimals,
    minStakeCurrent
  );
  if (minStake.changed) {
    const previous = describeToken(minStakeCurrent.base, decimals, symbol);
    if (minStake.mode === 'tokens') {
      updated.minStakeTokens = minStake.tokens;
      delete (updated as any).minStake;
    } else {
      updated.minStake = minStake.raw;
      delete (updated as any).minStakeTokens;
    }
    changes.push({
      module: 'StakeManager',
      key: minStake.mode === 'tokens' ? 'minStakeTokens' : 'minStake',
      previous,
      next:
        'mode' in minStake && minStake.mode !== 'clear'
          ? describeToken(minStake.base, decimals, symbol)
          : 'unset',
      configPath,
    });
  }

  const recommendations = { ...(updated.stakeRecommendations ?? {}) };
  const recMinCurrent = computeTokenBaseFromConfig(
    recommendations,
    'min',
    'minTokens',
    decimals
  );
  const recMin = await promptToken(
    rl,
    'Recommended minimum participant stake (tokens or raw, type none to clear)',
    symbol,
    decimals,
    recMinCurrent,
    { allowClear: true }
  );
  if (recMin.changed) {
    const previous = describeToken(recMinCurrent.base, decimals, symbol);
    applyTokenChange(recommendations, 'min', 'minTokens', recMin);
    const next =
      'mode' in recMin && recMin.mode !== 'clear'
        ? describeToken(recMin.base, decimals, symbol)
        : 'unset';
    changes.push({
      module: 'StakeManager',
      key: 'stakeRecommendations.min',
      previous,
      next,
      configPath,
    });
  }

  const recMaxCurrent = computeTokenBaseFromConfig(
    recommendations,
    'max',
    'maxTokens',
    decimals
  );
  const recMax = await promptToken(
    rl,
    'Recommended maximum participant stake (tokens or raw, type none to clear)',
    symbol,
    decimals,
    recMaxCurrent,
    { allowClear: true }
  );
  if (recMax.changed) {
    const previous = describeToken(recMaxCurrent.base, decimals, symbol);
    applyTokenChange(recommendations, 'max', 'maxTokens', recMax);
    const next =
      'mode' in recMax && recMax.mode !== 'clear'
        ? describeToken(recMax.base, decimals, symbol)
        : 'unset';
    changes.push({
      module: 'StakeManager',
      key: 'stakeRecommendations.max',
      previous,
      next,
      configPath,
    });
  }

  if (Object.keys(recommendations).length > 0) {
    updated.stakeRecommendations = recommendations;
  } else {
    delete (updated as any).stakeRecommendations;
  }

  const maxStakeCurrent = computeTokenBaseFromConfig(
    updated,
    'maxStakePerAddress',
    'maxStakePerAddressTokens',
    decimals
  );
  const maxStake = await promptToken(
    rl,
    'Maximum stake per address (tokens or raw, zero disables the cap)',
    symbol,
    decimals,
    maxStakeCurrent
  );
  if (maxStake.changed) {
    const previous = describeToken(maxStakeCurrent.base, decimals, symbol);
    if (maxStake.mode === 'tokens') {
      updated.maxStakePerAddressTokens = maxStake.tokens;
      delete (updated as any).maxStakePerAddress;
    } else {
      updated.maxStakePerAddress = maxStake.raw;
      delete (updated as any).maxStakePerAddressTokens;
    }
    changes.push({
      module: 'StakeManager',
      key:
        maxStake.mode === 'tokens'
          ? 'maxStakePerAddressTokens'
          : 'maxStakePerAddress',
      previous,
      next:
        'mode' in maxStake && maxStake.mode !== 'clear'
          ? describeToken(maxStake.base, decimals, symbol)
          : 'unset',
      configPath,
    });
  }

  const feePct = await promptPercentage(
    rl,
    'Platform fee percentage',
    updated.feePct
  );
  if (feePct.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'feePct',
      previous: updated.feePct !== undefined ? `${updated.feePct}%` : 'unset',
      next: `${feePct.value}%`,
      configPath,
    });
    updated.feePct = feePct.value;
  }

  const burnPct = await promptPercentage(
    rl,
    'Burn percentage applied to slashed stake',
    updated.burnPct
  );
  if (burnPct.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'burnPct',
      previous: updated.burnPct !== undefined ? `${updated.burnPct}%` : 'unset',
      next: `${burnPct.value}%`,
      configPath,
    });
    updated.burnPct = burnPct.value;
  }

  const validatorPct = await promptPercentage(
    rl,
    'Validator reward percentage',
    updated.validatorRewardPct
  );
  if (validatorPct.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'validatorRewardPct',
      previous:
        updated.validatorRewardPct !== undefined
          ? `${updated.validatorRewardPct}%`
          : 'unset',
      next: `${validatorPct.value}%`,
      configPath,
    });
    updated.validatorRewardPct = validatorPct.value;
  }

  const employerSlash = await promptPercentage(
    rl,
    'Employer slash percentage (sent to FeePool)',
    updated.employerSlashPct
  );
  if (employerSlash.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'employerSlashPct',
      previous:
        updated.employerSlashPct !== undefined
          ? `${updated.employerSlashPct}%`
          : 'unset',
      next: `${employerSlash.value}%`,
      configPath,
    });
    updated.employerSlashPct = employerSlash.value;
  }

  const validatorSlash = await promptPercentage(
    rl,
    'Validator slash reward percentage (from slashed funds)',
    updated.validatorSlashRewardPct
  );
  if (validatorSlash.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'validatorSlashRewardPct',
      previous:
        updated.validatorSlashRewardPct !== undefined
          ? `${updated.validatorSlashRewardPct}%`
          : 'unset',
      next: `${validatorSlash.value}%`,
      configPath,
    });
    updated.validatorSlashRewardPct = validatorSlash.value;
  }

  const treasurySlash = await promptPercentage(
    rl,
    'Treasury slash percentage (from slashed funds)',
    updated.treasurySlashPct
  );
  if (treasurySlash.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'treasurySlashPct',
      previous:
        updated.treasurySlashPct !== undefined
          ? `${updated.treasurySlashPct}%`
          : 'unset',
      next: `${treasurySlash.value}%`,
      configPath,
    });
    updated.treasurySlashPct = treasurySlash.value;
  }

  const autoConfig = { ...(updated.autoStake ?? {}) };
  const prevAutoConfig = { ...autoConfig };
  const autoEnabledCurrent = normaliseBoolean(autoConfig.enabled);
  const autoEnabled = await promptBoolean(
    rl,
    'Enable automatic stake tuning? (yes/no, skip to leave unchanged)',
    autoEnabledCurrent
  );
  if (autoEnabled.changed) {
    autoConfig.enabled = autoEnabled.value;
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.enabled',
      previous: describeBoolean(prevAutoConfig.enabled),
      next: describeBoolean(autoEnabled.value),
      configPath,
    });
  }

  const autoThreshold = await promptBigInt(
    rl,
    'Auto stake dispute threshold (type none to clear)',
    autoConfig.threshold,
    { allowNegative: false, allowNull: true }
  );
  if (autoThreshold.changed) {
    const previous = describeSimple(prevAutoConfig.threshold);
    if (autoThreshold.value === null) {
      delete autoConfig.threshold;
    } else {
      autoConfig.threshold = autoThreshold.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.threshold',
      previous,
      next: describeSimple(autoThreshold.value),
      configPath,
    });
  }

  const autoIncreaseCurrent = normaliseNumber(autoConfig.increasePct);
  const autoIncrease = await promptPercentage(
    rl,
    'Auto stake increase percentage',
    autoIncreaseCurrent
  );
  if (autoIncrease.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.increasePct',
      previous: describeSimple(prevAutoConfig.increasePct, '%'),
      next: `${autoIncrease.value}%`,
      configPath,
    });
    autoConfig.increasePct = autoIncrease.value;
  }

  const autoDecreaseCurrent = normaliseNumber(autoConfig.decreasePct);
  const autoDecrease = await promptPercentage(
    rl,
    'Auto stake decrease percentage',
    autoDecreaseCurrent
  );
  if (autoDecrease.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.decreasePct',
      previous: describeSimple(prevAutoConfig.decreasePct, '%'),
      next: `${autoDecrease.value}%`,
      configPath,
    });
    autoConfig.decreasePct = autoDecrease.value;
  }

  const autoWindow = await promptBigInt(
    rl,
    'Auto stake tuning window in seconds (type none to keep default)',
    autoConfig.windowSeconds,
    { allowNegative: false, allowNull: true }
  );
  if (autoWindow.changed) {
    const previous = describeSimple(prevAutoConfig.windowSeconds, ' seconds');
    if (autoWindow.value === null) {
      delete autoConfig.windowSeconds;
    } else {
      autoConfig.windowSeconds = autoWindow.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.windowSeconds',
      previous,
      next: describeSimple(autoWindow.value, ' seconds'),
      configPath,
    });
  }

  const autoFloorCurrent = computeTokenBaseFromConfig(
    autoConfig,
    'floor',
    'floorTokens',
    decimals
  );
  const autoFloor = await promptToken(
    rl,
    'Auto stake floor (tokens or raw, type none to clear)',
    symbol,
    decimals,
    autoFloorCurrent,
    { allowClear: true }
  );
  if (autoFloor.changed) {
    const previous = describeToken(autoFloorCurrent.base, decimals, symbol);
    applyTokenChange(autoConfig, 'floor', 'floorTokens', autoFloor);
    const next =
      'mode' in autoFloor && autoFloor.mode !== 'clear'
        ? describeToken(autoFloor.base, decimals, symbol)
        : 'unset';
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.floor',
      previous,
      next,
      configPath,
    });
  }

  const autoCeilCurrent = computeTokenBaseFromConfig(
    autoConfig,
    'ceiling',
    'ceilingTokens',
    decimals
  );
  const autoCeil = await promptToken(
    rl,
    'Auto stake ceiling (tokens or raw, zero disables the cap, type none to clear)',
    symbol,
    decimals,
    autoCeilCurrent,
    { allowClear: true }
  );
  if (autoCeil.changed) {
    const previous = describeToken(autoCeilCurrent.base, decimals, symbol);
    applyTokenChange(autoConfig, 'ceiling', 'ceilingTokens', autoCeil);
    const next =
      'mode' in autoCeil && autoCeil.mode !== 'clear'
        ? describeToken(autoCeil.base, decimals, symbol)
        : 'unset';
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.ceiling',
      previous,
      next,
      configPath,
    });
  }

  const autoTempThreshold = await promptBigInt(
    rl,
    'Auto stake temperature threshold (can be negative, type none to clear)',
    autoConfig.temperatureThreshold,
    { allowNegative: true, allowNull: true }
  );
  if (autoTempThreshold.changed) {
    const previous = describeSimple(prevAutoConfig.temperatureThreshold);
    if (autoTempThreshold.value === null) {
      delete autoConfig.temperatureThreshold;
    } else {
      autoConfig.temperatureThreshold = autoTempThreshold.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.temperatureThreshold',
      previous,
      next: describeSimple(autoTempThreshold.value),
      configPath,
    });
  }

  const autoHamThreshold = await promptBigInt(
    rl,
    'Auto stake Hamiltonian threshold (can be negative, type none to clear)',
    autoConfig.hamiltonianThreshold,
    { allowNegative: true, allowNull: true }
  );
  if (autoHamThreshold.changed) {
    const previous = describeSimple(prevAutoConfig.hamiltonianThreshold);
    if (autoHamThreshold.value === null) {
      delete autoConfig.hamiltonianThreshold;
    } else {
      autoConfig.hamiltonianThreshold = autoHamThreshold.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.hamiltonianThreshold',
      previous,
      next: describeSimple(autoHamThreshold.value),
      configPath,
    });
  }

  const autoDisputeWeight = await promptBigInt(
    rl,
    'Auto stake dispute weight (type none to clear)',
    autoConfig.disputeWeight,
    { allowNegative: false, allowNull: true }
  );
  if (autoDisputeWeight.changed) {
    const previous = describeSimple(prevAutoConfig.disputeWeight);
    if (autoDisputeWeight.value === null) {
      delete autoConfig.disputeWeight;
    } else {
      autoConfig.disputeWeight = autoDisputeWeight.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.disputeWeight',
      previous,
      next: describeSimple(autoDisputeWeight.value),
      configPath,
    });
  }

  const autoTempWeight = await promptBigInt(
    rl,
    'Auto stake temperature weight (type none to clear)',
    autoConfig.temperatureWeight,
    { allowNegative: false, allowNull: true }
  );
  if (autoTempWeight.changed) {
    const previous = describeSimple(prevAutoConfig.temperatureWeight);
    if (autoTempWeight.value === null) {
      delete autoConfig.temperatureWeight;
    } else {
      autoConfig.temperatureWeight = autoTempWeight.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.temperatureWeight',
      previous,
      next: describeSimple(autoTempWeight.value),
      configPath,
    });
  }

  const autoHamWeight = await promptBigInt(
    rl,
    'Auto stake Hamiltonian weight (type none to clear)',
    autoConfig.hamiltonianWeight,
    { allowNegative: false, allowNull: true }
  );
  if (autoHamWeight.changed) {
    const previous = describeSimple(prevAutoConfig.hamiltonianWeight);
    if (autoHamWeight.value === null) {
      delete autoConfig.hamiltonianWeight;
    } else {
      autoConfig.hamiltonianWeight = autoHamWeight.value;
    }
    changes.push({
      module: 'StakeManager',
      key: 'autoStake.hamiltonianWeight',
      previous,
      next: describeSimple(autoHamWeight.value),
      configPath,
    });
  }

  const cleanedAutoConfig = Object.fromEntries(
    Object.entries(autoConfig).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(cleanedAutoConfig).length > 0) {
    updated.autoStake = cleanedAutoConfig;
  } else {
    delete (updated as any).autoStake;
  }

  const unbonding = await promptInteger(
    rl,
    'Unbonding period in seconds',
    updated.unbondingPeriodSeconds,
    { min: 0 }
  );
  if (unbonding.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'unbondingPeriodSeconds',
      previous:
        updated.unbondingPeriodSeconds !== undefined
          ? `${updated.unbondingPeriodSeconds} seconds`
          : 'unset',
      next: `${unbonding.value} seconds`,
      configPath,
    });
    updated.unbondingPeriodSeconds = unbonding.value;
  }

  const treasury = await promptAddress(
    rl,
    'Treasury address for slashed stake (zero burns)',
    updated.treasury,
    { allowZero: true, allowNull: false }
  );
  if (treasury.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'treasury',
      previous: describeAddress(updated.treasury),
      next: describeAddress(treasury.value),
      configPath,
    });
    updated.treasury = treasury.value ?? ZeroAddress;
  }

  const allowlist = await promptAllowlist(
    rl,
    'Treasury allowlist (comma-separated addresses, none clears)',
    updated.treasuryAllowlist
  );
  if (allowlist.changed) {
    const previous =
      Object.keys(updated.treasuryAllowlist || {}).join(', ') || 'none';
    const next = Object.keys(allowlist.value).join(', ') || 'none';
    changes.push({
      module: 'StakeManager',
      key: 'treasuryAllowlist',
      previous,
      next,
      configPath,
    });
    updated.treasuryAllowlist = allowlist.value;
  }

  const pauser = await promptAddress(
    rl,
    'Pauser address (type none to clear)',
    updated.pauser,
    { allowZero: true, allowNull: true }
  );
  if (pauser.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'pauser',
      previous: describeAddress(updated.pauser),
      next: describeAddress(pauser.value),
      configPath,
    });
    updated.pauser = pauser.value ?? null;
  }

  const thermostat = await promptAddress(
    rl,
    'Thermostat module address (type none to clear)',
    updated.thermostat,
    { allowZero: true, allowNull: true }
  );
  if (thermostat.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'thermostat',
      previous: describeAddress(updated.thermostat),
      next: describeAddress(thermostat.value),
      configPath,
    });
    updated.thermostat = thermostat.value ?? null;
  }

  const hamiltonianFeed = await promptAddress(
    rl,
    'Hamiltonian feed module address (type none to clear)',
    updated.hamiltonianFeed,
    { allowZero: true, allowNull: true }
  );
  if (hamiltonianFeed.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'hamiltonianFeed',
      previous: describeAddress(updated.hamiltonianFeed),
      next: describeAddress(hamiltonianFeed.value),
      configPath,
    });
    updated.hamiltonianFeed = hamiltonianFeed.value ?? null;
  }

  const jobRegistry = await promptAddress(
    rl,
    'Job registry address (type none to clear)',
    updated.jobRegistry,
    { allowZero: false, allowNull: true }
  );
  if (jobRegistry.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'jobRegistry',
      previous: describeAddress(updated.jobRegistry),
      next: describeAddress(jobRegistry.value),
      configPath,
    });
    updated.jobRegistry = jobRegistry.value ?? null;
  }

  const disputeModule = await promptAddress(
    rl,
    'Dispute module address (type none to clear)',
    updated.disputeModule,
    { allowZero: false, allowNull: true }
  );
  if (disputeModule.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'disputeModule',
      previous: describeAddress(updated.disputeModule),
      next: describeAddress(disputeModule.value),
      configPath,
    });
    updated.disputeModule = disputeModule.value ?? null;
  }

  const validationModule = await promptAddress(
    rl,
    'Validation module address (type none to clear)',
    updated.validationModule,
    { allowZero: false, allowNull: true }
  );
  if (validationModule.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'validationModule',
      previous: describeAddress(updated.validationModule),
      next: describeAddress(validationModule.value),
      configPath,
    });
    updated.validationModule = validationModule.value ?? null;
  }

  const feePool = await promptAddress(
    rl,
    'Fee pool address (type none to clear)',
    updated.feePool,
    { allowZero: false, allowNull: true }
  );
  if (feePool.changed) {
    changes.push({
      module: 'StakeManager',
      key: 'feePool',
      previous: describeAddress(updated.feePool),
      next: describeAddress(feePool.value),
      configPath,
    });
    updated.feePool = feePool.value ?? null;
  }

  const maxAGITypesCurrent = normaliseNumber(updated.maxAGITypes);
  const maxAGITypes = await promptInteger(
    rl,
    'Maximum number of AGI types supported (0-50)',
    maxAGITypesCurrent,
    { min: 0, max: 50 }
  );
  if (maxAGITypes.changed) {
    const previous = describeSimple(updated.maxAGITypes);
    changes.push({
      module: 'StakeManager',
      key: 'maxAGITypes',
      previous,
      next: `${maxAGITypes.value}`,
      configPath,
    });
    updated.maxAGITypes = maxAGITypes.value;
  }

  const maxTotalPayoutPctCurrent = normaliseNumber(updated.maxTotalPayoutPct);
  const maxTotalPayoutPct = await promptInteger(
    rl,
    'Maximum cumulative payout percentage (0-200)',
    maxTotalPayoutPctCurrent,
    { min: 0, max: 200 }
  );
  if (maxTotalPayoutPct.changed) {
    const previous = describeSimple(updated.maxTotalPayoutPct, '%');
    changes.push({
      module: 'StakeManager',
      key: 'maxTotalPayoutPct',
      previous,
      next: `${maxTotalPayoutPct.value}%`,
      configPath,
    });
    updated.maxTotalPayoutPct = maxTotalPayoutPct.value;
  }

  return { config: updated, changes };
}
async function configureFeePool(
  rl: ReturnType<typeof createInterface>,
  config: FeePoolConfig,
  configPath: string
): Promise<WizardResult<FeePoolConfig>> {
  console.log('\nFee Pool settings');
  const updated: FeePoolConfig = { ...config };
  const changes: ChangeEntry[] = [];

  const burnPct = await promptPercentage(
    rl,
    'Burn percentage applied to incoming rewards',
    updated.burnPct
  );
  if (burnPct.changed) {
    changes.push({
      module: 'FeePool',
      key: 'burnPct',
      previous: updated.burnPct !== undefined ? `${updated.burnPct}%` : 'unset',
      next: `${burnPct.value}%`,
      configPath,
    });
    updated.burnPct = burnPct.value;
  }

  const treasury = await promptAddress(
    rl,
    'Treasury address receiving remaining rewards (zero burns)',
    updated.treasury,
    { allowZero: true, allowNull: true }
  );
  if (treasury.changed) {
    changes.push({
      module: 'FeePool',
      key: 'treasury',
      previous: describeAddress(updated.treasury),
      next: describeAddress(treasury.value),
      configPath,
    });
    updated.treasury = treasury.value ?? null;
  }

  const allowlist = await promptAllowlist(
    rl,
    'Treasury allowlist (comma-separated addresses, none clears)',
    updated.treasuryAllowlist
  );
  if (allowlist.changed) {
    const previous =
      Object.keys(updated.treasuryAllowlist || {}).join(', ') || 'none';
    const next = Object.keys(allowlist.value).join(', ') || 'none';
    changes.push({
      module: 'FeePool',
      key: 'treasuryAllowlist',
      previous,
      next,
      configPath,
    });
    updated.treasuryAllowlist = allowlist.value;
  }

  return { config: updated, changes };
}

async function confirmWrite(
  rl: ReturnType<typeof createInterface>,
  pendingChanges: ChangeEntry[]
): Promise<boolean> {
  if (pendingChanges.length === 0) {
    console.log('\nNo changes selected. Configuration files remain untouched.');
    return false;
  }

  console.log('\nSummary of pending updates:');
  pendingChanges.forEach((change, index) => {
    console.log(`\n${index + 1}. [${change.module}] ${change.key}`);
    console.log(`    From: ${change.previous}`);
    console.log(`    To:   ${change.next}`);
    console.log(`    File: ${change.configPath}`);
  });

  for (;;) {
    const answer = (
      await rl.question('\nWrite these changes to disk? (yes/no)\n> ')
    )
      .trim()
      .toLowerCase();
    if (['y', 'yes'].includes(answer)) {
      return true;
    }
    if (['n', 'no'].includes(answer)) {
      return false;
    }
    console.log('  Please enter yes or no.');
  }
}

async function persistConfig(filePath: string, data: unknown) {
  await ensureDirectory(filePath);
  await backupFile(filePath);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, json, 'utf8');
  console.log(`  Updated ${filePath}`);
}

async function main(options: CliOptions) {
  console.log(HEADER);
  const networkDescription = describeNetwork(
    options.network,
    options.networkSource
  );
  console.log(`Target network: ${networkDescription}`);
  const rl = createInterface({ input, output });
  try {
    const { config: tokenConfig, path: tokenPath } = loadTokenConfig({
      network: options.network,
    });
    const decimals = tokenConfig.decimals ?? 18;
    const symbol = tokenConfig.symbol ?? '$AGIALPHA';

    const jobRegistry = loadJobRegistryConfig({
      persist: true,
      network: options.network,
    });
    const stakeManager = loadStakeManagerConfig({
      persist: true,
      network: options.network,
    });
    const feePool = loadFeePoolConfig({
      persist: true,
      network: options.network,
    });

    console.log('\nLoaded configuration files:');
    console.log(`  Token:         ${tokenPath}`);
    console.log(`  Job Registry:  ${jobRegistry.path}`);
    console.log(`  Stake Manager: ${stakeManager.path}`);
    console.log(`  Fee Pool:      ${feePool.path}`);

    const jobResult = await configureJobRegistry(
      rl,
      jobRegistry.config,
      jobRegistry.path,
      decimals,
      symbol
    );
    const stakeResult = await configureStakeManager(
      rl,
      stakeManager.config,
      stakeManager.path,
      decimals,
      symbol
    );
    const feeResult = await configureFeePool(rl, feePool.config, feePool.path);

    const pendingChanges = [
      ...jobResult.changes,
      ...stakeResult.changes,
      ...feeResult.changes,
    ];
    const shouldWrite = await confirmWrite(rl, pendingChanges);
    if (!shouldWrite) {
      console.log('\nNo files were modified.');
      return;
    }

    await persistConfig(jobRegistry.path, jobResult.config);
    await persistConfig(stakeManager.path, stakeResult.config);
    await persistConfig(feePool.path, feeResult.config);

    console.log('\nAll configuration files updated successfully.');
    console.log(
      'Next: run `npm run owner:plan` to generate the transaction plan, then execute as needed.'
    );
  } finally {
    rl.close();
  }
}

let cliOptions: CliOptions;
try {
  cliOptions = parseCliOptions(process.argv.slice(2), process.env);
} catch (error: any) {
  console.error('\nInvalid arguments:', error?.message ?? error);
  printUsage();
  process.exit(1);
  throw error;
}

if (cliOptions.showHelp) {
  printUsage();
  process.exit(0);
} else {
  main(cliOptions).catch((error) => {
    console.error('\nOwner configuration wizard failed:', error);
    process.exitCode = 1;
  });
}
