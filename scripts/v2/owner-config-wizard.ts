import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  loadTokenConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
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

type WizardResult<T> = { config: T; changes: ChangeEntry[] };

const HEADER = `AGIJobs Owner Configuration Wizard\n----------------------------------`;

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
  current: TokenBase
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
      next: describeToken(minStake.base, decimals, symbol),
      configPath,
    });
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
      next: describeToken(maxStake.base, decimals, symbol),
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

async function main() {
  console.log(HEADER);
  const rl = createInterface({ input, output });
  try {
    const { config: tokenConfig } = loadTokenConfig();
    const decimals = tokenConfig.decimals ?? 18;
    const symbol = tokenConfig.symbol ?? '$AGIALPHA';

    const jobRegistry = loadJobRegistryConfig({ persist: true });
    const stakeManager = loadStakeManagerConfig({ persist: true });
    const feePool = loadFeePoolConfig({ persist: true });

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

main().catch((error) => {
  console.error('\nOwner configuration wizard failed:', error);
  process.exitCode = 1;
});
