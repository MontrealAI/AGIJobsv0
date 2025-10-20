#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ethers } from 'ethers';

import {
  loadOwnerControlConfig,
  loadTokenConfig,
  type JobRegistryConfig,
  type OwnerControlConfig,
  type StakeManagerConfig,
} from '../config';
import { AGIALPHA_DECIMALS, AGIALPHA_SYMBOL } from '../constants';

type TimelineStep = {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  checkpoints?: string[];
  docs?: string[];
};

type TokenSnapshot = {
  raw: string;
  tokens: string;
  formatted: string;
};

type ModuleDelta<T extends Record<string, TokenSnapshot | string | number | boolean>> = {
  before: T;
  after: T;
  summary: string;
};

type GovernanceSurface = {
  label: string;
  address?: string;
  role: string;
};

type RedenominationPlaybook = {
  meta: {
    generatedAt: string;
    generator: string;
    scenario: string;
    version: string;
  };
  token: {
    currentSymbol: string;
    targetSymbol: string;
    currentDecimals: number;
    targetDecimals: number;
    redenominationFactor: string;
    supplyBefore?: TokenSnapshot;
    supplyAfter?: TokenSnapshot;
    rationale: string[];
  };
  governance: GovernanceSurface[];
  modules: {
    stakeManager: ModuleDelta<Record<string, TokenSnapshot | string>>;
    jobRegistry: ModuleDelta<Record<string, TokenSnapshot | string | number>>;
    feePool: ModuleDelta<Record<string, string | number>>;
  };
  timeline: TimelineStep[];
  invariants: string[];
  verification: string[];
  references: string[];
};

interface CliOptions {
  outputPath: string;
  configOutputDir?: string;
  ratio: bigint;
  newDecimals: number;
  newSymbol: string;
  newName: string;
  scenario: string;
  currentSupplyTokens?: string;
  pretty: boolean;
}

const DEFAULT_OUTPUT = resolve(
  __dirname,
  '../../demo/REDENOMINATION/ui/export/latest.json',
);

const DEFAULT_CONFIG_DIR = resolve(
  __dirname,
  '../../demo/REDENOMINATION/config',
);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: DEFAULT_OUTPUT,
    configOutputDir: DEFAULT_CONFIG_DIR,
    ratio: 1000n,
    newDecimals: AGIALPHA_DECIMALS,
    newSymbol: 'AGIΩ',
    newName: 'AGI Omega',
    scenario: 'Global AGI Jobs v2 redenomination and control drill',
    pretty: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--output':
      case '--out': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a path`);
        }
        options.outputPath = resolve(process.cwd(), value);
        i += 1;
        break;
      }
      case '--config-dir': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--config-dir requires a directory path');
        }
        options.configOutputDir = resolve(process.cwd(), value);
        i += 1;
        break;
      }
      case '--ratio': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--ratio requires an integer value');
        }
        try {
          options.ratio = BigInt(value);
        } catch (error) {
          throw new Error(`Invalid ratio ${value}: ${(error as Error).message}`);
        }
        if (options.ratio <= 0n) {
          throw new Error('Ratio must be a positive integer');
        }
        i += 1;
        break;
      }
      case '--new-decimals': {
        const value = Number(argv[i + 1]);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error('--new-decimals must be a non-negative number');
        }
        options.newDecimals = value;
        i += 1;
        break;
      }
      case '--symbol': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--symbol requires a value');
        }
        options.newSymbol = value.toUpperCase();
        i += 1;
        break;
      }
      case '--name': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--name requires a value');
        }
        options.newName = value;
        i += 1;
        break;
      }
      case '--scenario': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--scenario requires a description');
        }
        options.scenario = value;
        i += 1;
        break;
      }
      case '--current-supply': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--current-supply requires a numeric value');
        }
        options.currentSupplyTokens = value;
        i += 1;
        break;
      }
      case '--compact': {
        options.pretty = false;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument ${arg}`);
        }
        break;
    }
  }

  return options;
}

function ensureDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readConfig<T>(relativePath: string): T {
  const absolute = resolve(__dirname, '..', '..', relativePath);
  const raw = readFileSync(absolute, 'utf8');
  return JSON.parse(raw) as T;
}

function formatTokenValue(raw: bigint, decimals: number, symbol: string): TokenSnapshot {
  const formatted = ethers.formatUnits(raw, decimals);
  return {
    raw: raw.toString(),
    tokens: formatted,
    formatted: `${formatted} ${symbol}`.trim(),
  };
}

function parseTokens(
  value: string | number | undefined,
  decimals: number,
): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const asString = String(value).trim();
  if (!asString) {
    return undefined;
  }
  return ethers.parseUnits(asString, decimals);
}

function scaleDown(value: bigint | undefined, factor: bigint): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value / factor;
}

function stringify(value: unknown, pretty: boolean): string {
  return JSON.stringify(
    value,
    (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    pretty ? 2 : 0,
  );
}

function buildGovernanceSurfaces(config: OwnerControlConfig): GovernanceSurface[] {
  const surfaces: GovernanceSurface[] = [];
  const ownerAddress = config.owner && config.owner !== ethers.ZeroAddress ? config.owner : undefined;
  const governanceAddress =
    config.governance && config.governance !== ethers.ZeroAddress ? config.governance : undefined;

  surfaces.push({
    label: 'Protocol owner',
    address: ownerAddress ?? 'Assign via config/owner-control.json',
    role: 'Executes redenomination transactions and parameter updates',
  });

  surfaces.push({
    label: 'Governance multisig',
    address: governanceAddress ?? 'Assign via governance safe',
    role: 'Approves upgrades, pause actions, and emergency overrides',
  });

  for (const [moduleKey, moduleConfig] of Object.entries(config.modules ?? {})) {
    const moduleOwner =
      moduleConfig.owner && moduleConfig.owner !== ethers.ZeroAddress
        ? moduleConfig.owner
        : undefined;
    surfaces.push({
      label: `${moduleKey} owner`,
      address: moduleOwner ?? 'Delegate before mainnet activation',
      role: 'Direct module executor (post-governance approval)',
    });
  }
  return surfaces;
}

function buildStakeManagerDelta(
  config: StakeManagerConfig,
  decimals: number,
  symbol: string,
  factor: bigint,
): ModuleDelta<Record<string, TokenSnapshot | string>> {
  const minStakeRaw = parseTokens(config.minStakeTokens ?? config.minStake, decimals) ?? 0n;
  const roleAgentRaw = parseTokens(
    config.roleMinimums?.agentTokens ?? config.roleMinimums?.agent,
    decimals,
  ) ?? 0n;
  const roleValidatorRaw = parseTokens(
    config.roleMinimums?.validatorTokens ?? config.roleMinimums?.validator,
    decimals,
  ) ?? 0n;
  const rolePlatformRaw = parseTokens(
    config.roleMinimums?.platformTokens ?? config.roleMinimums?.platform,
    decimals,
  ) ?? 0n;
  const recommendationMinRaw = parseTokens(
    config.stakeRecommendations?.minTokens ?? config.stakeRecommendations?.min,
    decimals,
  ) ?? minStakeRaw;
  const recommendationMaxRaw = parseTokens(
    config.stakeRecommendations?.maxTokens ?? config.stakeRecommendations?.max,
    decimals,
  ) ?? 0n;

  const minStakeAfter = scaleDown(minStakeRaw, factor) ?? 0n;
  const agentAfter = scaleDown(roleAgentRaw, factor) ?? 0n;
  const validatorAfter = scaleDown(roleValidatorRaw, factor) ?? 0n;
  const platformAfter = scaleDown(rolePlatformRaw, factor) ?? 0n;
  const recMinAfter = scaleDown(recommendationMinRaw, factor) ?? 0n;
  const recMaxAfter = scaleDown(recommendationMaxRaw, factor) ?? 0n;

  return {
    summary:
      'Owner re-baselines staking guardrails so that existing economic thresholds remain invariant after redenominating the unit of account.',
    before: {
      minStake: formatTokenValue(minStakeRaw, decimals, symbol),
      agentRoleMinimum: formatTokenValue(roleAgentRaw, decimals, symbol),
      validatorRoleMinimum: formatTokenValue(roleValidatorRaw, decimals, symbol),
      platformRoleMinimum: formatTokenValue(rolePlatformRaw, decimals, symbol),
      recommendationMin: formatTokenValue(recommendationMinRaw, decimals, symbol),
      recommendationMax: formatTokenValue(recommendationMaxRaw, decimals, symbol),
      unbondingPeriodSeconds: String(config.unbondingPeriodSeconds ?? 604800),
      feePct: String(config.feePct ?? 5),
      burnPct: String(config.burnPct ?? 1),
      validatorRewardPct: String(config.validatorRewardPct ?? 10),
    },
    after: {
      minStake: formatTokenValue(minStakeAfter, decimals, symbol),
      agentRoleMinimum: formatTokenValue(agentAfter, decimals, symbol),
      validatorRoleMinimum: formatTokenValue(validatorAfter, decimals, symbol),
      platformRoleMinimum: formatTokenValue(platformAfter, decimals, symbol),
      recommendationMin: formatTokenValue(recMinAfter, decimals, symbol),
      recommendationMax: formatTokenValue(recMaxAfter, decimals, symbol),
      unbondingPeriodSeconds: String(config.unbondingPeriodSeconds ?? 604800),
      feePct: String(config.feePct ?? 5),
      burnPct: String(config.burnPct ?? 1),
      validatorRewardPct: String(config.validatorRewardPct ?? 10),
    },
  };
}

function buildJobRegistryDelta(
  config: JobRegistryConfig,
  decimals: number,
  symbol: string,
  factor: bigint,
): ModuleDelta<Record<string, TokenSnapshot | string | number>> {
  const jobStakeRaw = parseTokens(config.jobStakeTokens ?? config.jobStake, decimals) ?? 0n;
  const minAgentStakeRaw =
    parseTokens(config.minAgentStakeTokens ?? config.minAgentStake, decimals) ?? 0n;
  const maxJobRewardRaw =
    parseTokens(config.maxJobRewardTokens ?? config.maxJobReward, decimals) ?? 0n;

  const jobStakeAfter = scaleDown(jobStakeRaw, factor) ?? 0n;
  const minAgentAfter = scaleDown(minAgentStakeRaw, factor) ?? 0n;
  const maxRewardAfter = scaleDown(maxJobRewardRaw, factor) ?? 0n;

  return {
    summary:
      'Every job escrow, validator incentive, and employer commitment now references the redenominated token so treasury budgets stay constant in fiat terms.',
    before: {
      jobStake: formatTokenValue(jobStakeRaw, decimals, symbol),
      minAgentStake: formatTokenValue(minAgentStakeRaw, decimals, symbol),
      maxJobReward: formatTokenValue(maxJobRewardRaw, decimals, symbol),
      jobDurationLimitSeconds: Number(config.jobDurationLimitSeconds ?? 604800),
      maxActiveJobsPerAgent: Number(config.maxActiveJobsPerAgent ?? 3),
      feePct: String(config.feePct ?? 5),
      validatorRewardPct: String(config.validatorRewardPct ?? 10),
    },
    after: {
      jobStake: formatTokenValue(jobStakeAfter, decimals, symbol),
      minAgentStake: formatTokenValue(minAgentAfter, decimals, symbol),
      maxJobReward: formatTokenValue(maxRewardAfter, decimals, symbol),
      jobDurationLimitSeconds: Number(config.jobDurationLimitSeconds ?? 604800),
      maxActiveJobsPerAgent: Number(config.maxActiveJobsPerAgent ?? 3),
      feePct: String(config.feePct ?? 5),
      validatorRewardPct: String(config.validatorRewardPct ?? 10),
    },
  };
}

function buildFeePoolDelta(
  decimals: number,
  symbol: string,
  factor: bigint,
): ModuleDelta<Record<string, string | number>> {
  // Fee pool configuration is denominated in percentages; redenomination keeps ratios.
  return {
    summary:
      'Fee pool parameters remain constant – only balances migrate to the redenominated token and burn accounting scales by the conversion factor.',
    before: {
      burnPct: '1',
      treasuryPct: '4',
      validatorRewardPct: '10',
      note: `All fee pool balances migrate by dividing raw balances by ${factor.toString()} to preserve purchasing power in ${symbol}.`,
    },
    after: {
      burnPct: '1',
      treasuryPct: '4',
      validatorRewardPct: '10',
      note: `Post-migration balances exist entirely in ${symbol} at the new unit size.`,
    },
  };
}

function maybeWriteConfigSnapshot(
  options: CliOptions,
  stakeDelta: ModuleDelta<Record<string, TokenSnapshot | string>>,
  jobDelta: ModuleDelta<Record<string, TokenSnapshot | string | number>>,
): void {
  if (!options.configOutputDir) {
    return;
  }

  ensureDirectory(options.configOutputDir);

  const stakeConfigPath = resolve(options.configOutputDir, 'stake-manager-redenominated.json');
  const jobConfigPath = resolve(options.configOutputDir, 'job-registry-redenominated.json');

  const stakeConfig = {
    minStakeTokens: (stakeDelta.after.minStake as TokenSnapshot).tokens,
    roleMinimums: {
      agentTokens: (stakeDelta.after.agentRoleMinimum as TokenSnapshot).tokens,
      validatorTokens: (stakeDelta.after.validatorRoleMinimum as TokenSnapshot).tokens,
      platformTokens: (stakeDelta.after.platformRoleMinimum as TokenSnapshot).tokens,
    },
    stakeRecommendations: {
      minTokens: (stakeDelta.after.recommendationMin as TokenSnapshot).tokens,
      maxTokens: (stakeDelta.after.recommendationMax as TokenSnapshot).tokens,
    },
    feePct: Number(stakeDelta.after.feePct),
    burnPct: Number(stakeDelta.after.burnPct),
    validatorRewardPct: Number(stakeDelta.after.validatorRewardPct),
    employerSlashPct: 50,
    treasurySlashPct: 50,
    unbondingPeriodSeconds: Number(stakeDelta.after.unbondingPeriodSeconds),
  };

  const jobConfig = {
    jobStakeTokens: (jobDelta.after.jobStake as TokenSnapshot).tokens,
    minAgentStakeTokens: (jobDelta.after.minAgentStake as TokenSnapshot).tokens,
    maxJobRewardTokens: (jobDelta.after.maxJobReward as TokenSnapshot).tokens,
    jobDurationLimitSeconds: jobDelta.after.jobDurationLimitSeconds,
    maxActiveJobsPerAgent: jobDelta.after.maxActiveJobsPerAgent,
    feePct: Number(jobDelta.after.feePct),
    validatorRewardPct: Number(jobDelta.after.validatorRewardPct),
  };

  writeFileSync(stakeConfigPath, stringify(stakeConfig, true));
  writeFileSync(jobConfigPath, stringify(jobConfig, true));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  const { config: tokenConfig } = loadTokenConfig();
  const { config: ownerConfig } = loadOwnerControlConfig();

  const stakeManagerConfig = readConfig<StakeManagerConfig>('config/stake-manager.json');
  const jobRegistryConfig = readConfig<JobRegistryConfig>('config/job-registry.json');

  const decimals = AGIALPHA_DECIMALS;
  const symbol = AGIALPHA_SYMBOL;

  const supplyBeforeRaw = options.currentSupplyTokens
    ? ethers.parseUnits(options.currentSupplyTokens, decimals)
    : undefined;
  const supplyAfterRaw = scaleDown(supplyBeforeRaw, options.ratio);

  const stakeDelta = buildStakeManagerDelta(
    stakeManagerConfig,
    decimals,
    symbol,
    options.ratio,
  );
  const jobDelta = buildJobRegistryDelta(
    jobRegistryConfig,
    decimals,
    symbol,
    options.ratio,
  );
  const feeDelta = buildFeePoolDelta(decimals, symbol, options.ratio);

  maybeWriteConfigSnapshot(options, stakeDelta, jobDelta);

  const playbook: RedenominationPlaybook = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'scripts/v2/redenominationPlaybook.ts',
      scenario: options.scenario,
      version: '1.0.0',
    },
    token: {
      currentSymbol: tokenConfig.symbol ?? symbol,
      targetSymbol: options.newSymbol,
      currentDecimals: decimals,
      targetDecimals: options.newDecimals,
      redenominationFactor: options.ratio.toString(),
      supplyBefore:
        supplyBeforeRaw !== undefined
          ? formatTokenValue(supplyBeforeRaw, decimals, symbol)
          : undefined,
      supplyAfter:
        supplyAfterRaw !== undefined
          ? formatTokenValue(supplyAfterRaw, options.newDecimals, options.newSymbol)
          : undefined,
      rationale: [
        'Stabilise headline token balances so that enterprise treasuries can reason about orders of magnitude without spreadsheets.',
        'Keep validator and agent economic incentives untouched by automatically scaling every threshold, escrow, and reserve.',
        'Demonstrate that AGI Jobs v2 governance can execute macro-level monetary operations in a single scripted run.',
      ],
    },
    governance: buildGovernanceSurfaces(ownerConfig as OwnerControlConfig),
    modules: {
      stakeManager: stakeDelta,
      jobRegistry: jobDelta,
      feePool: feeDelta,
    },
    timeline: [
      {
        id: 'snapshot',
        title: 'Capture current ledger and staking telemetry',
        description:
          'Run the sovereign owner snapshot to export all balances and validator stakes before the redenomination begins.',
        commands: [
          'npm run owner:control:snapshot -- --format json --out reports/redenomination/pre.json',
        ],
        checkpoints: [
          'Confirm stake totals, validator quorum, and treasury balances at T-0.',
          'Archive the export so auditors can reconcile supply rebasing.',
        ],
      },
      {
        id: 'pause',
        title: 'Enter supervised pause window',
        description:
          'The governance multisig invokes the emergency pause so no new jobs, stakes, or payouts execute during unit conversion.',
        commands: [
          'npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network hardhat -- --mode pause',
        ],
        checkpoints: [
          'Registry, stake manager, and validation module emit Paused events.',
          'Operations channel announces maintenance window to employers and agents.',
        ],
      },
      {
        id: 'migrate-ledgers',
        title: 'Re-denominate treasuries and vaults',
        description:
          'Treasury controllers divide each escrow, validator pool, and pending payout by the redenomination factor inside the migration script.',
        commands: [
          'npx ts-node scripts/v2/redenominationPlaybook.ts --out demo/REDENOMINATION/ui/export/latest.json',
          'node scripts/v2/ledger-migrate.js --factor 1000 --dry-run reports/redenomination/pre.json',
        ],
        checkpoints: [
          'Post-migration ledgers report identical fiat value when multiplied by the factor.',
          'Burn vaults emit audit log entries describing every adjustment.',
        ],
      },
      {
        id: 'update-parameters',
        title: 'Apply redenominated guardrails',
        description:
          'Owners push new stake manager and job registry configs generated by this playbook, keeping every threshold coherent with the new unit.',
        commands: [
          'npx hardhat run --no-compile scripts/v2/updateStakeManager.ts --network hardhat -- --config demo/REDENOMINATION/config/stake-manager-redenominated.json',
          'npx hardhat run --no-compile scripts/v2/updateJobRegistry.ts --network hardhat -- --config demo/REDENOMINATION/config/job-registry-redenominated.json',
        ],
        checkpoints: [
          'Validator dashboards show the same required economic commitment as before.',
          'Employer UI displays the redenominated token symbol and updated upper bounds.',
        ],
      },
      {
        id: 'resume',
        title: 'Resume production and broadcast certificate proof',
        description:
          'Governance lifts the pause, validators mint a ceremonial completion certificate NFT, and agents receive translated balances in their control room.',
        commands: [
          'npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network hardhat -- --mode resume',
          'npm run observability:redenomination -- --export reports/redenomination/post.json',
        ],
        checkpoints: [
          'No disputes pending from the pause window.',
          'Monitoring dashboards show supplyBefore * factor ≈ supplyAfter.',
        ],
      },
    ],
    invariants: [
      'Total on-chain supply multiplied by the redenomination factor equals the pre-migration supply within one wei tolerance.',
      'Validator reputation weights remain unchanged; only nominal stake units shift.',
      'All paused modules resume and emit Unpaused events signed by the governance multisig.',
      'Certificate NFT metadata references the redenomination event hash for future audits.',
    ],
    verification: [
      'npm run demo:redenomination:export',
      'npm run demo:redenomination:control-room',
      'npx hardhat test test/v2/redenomination.e2e.ts --network hardhat (optional owner E2E)',
    ],
    references: [
      'docs/AGI_Jobs_v0_Whitepaper_v2.md',
      'docs/legacy/ProductionScaleAGIJobsPlatformSprintPlanv0.md',
      'scripts/v2/updateStakeManager.ts',
      'scripts/v2/updateJobRegistry.ts',
    ],
  };

  ensureDirectory(options.outputPath);
  writeFileSync(options.outputPath, stringify(playbook, options.pretty));

  console.log(
    `Redenomination playbook exported to ${options.outputPath} (factor ${options.ratio.toString()})`,
  );
}

main().catch((error) => {
  console.error('Failed to build redenomination playbook:', error);
  process.exitCode = 1;
});

