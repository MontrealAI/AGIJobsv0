#!/usr/bin/env ts-node
import path from 'path';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadThermodynamicsConfig,
  loadEnergyOracleConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
} from '../config';
import type {
  OwnerControlModuleConfig,
  RewardEngineThermoConfig,
  ThermostatConfigInput,
} from '../config';

type Status = 'pass' | 'warn' | 'fail';

type Severity = 'warn' | 'fail';

interface CheckEntry {
  id: string;
  label: string;
  status: Status;
  path?: string;
  details: string[];
  actions: string[];
  network?: string;
}

interface CliOptions {
  network?: string;
  json: boolean;
  strict: boolean;
  help?: boolean;
}

const STATUS_ORDER: Record<Status, number> = {
  fail: 0,
  warn: 1,
  pass: 2,
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--strict':
      case '--fail-on-warn':
        options.strict = true;
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
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

function createCheck(id: string, label: string, configPath?: string): CheckEntry {
  return {
    id,
    label,
    status: 'pass',
    path: configPath,
    details: [],
    actions: [],
  };
}

function escalateStatus(current: Status, severity: Severity): Status {
  if (severity === 'fail') {
    return 'fail';
  }
  return current === 'pass' ? 'warn' : current;
}

function registerIssue(
  check: CheckEntry,
  severity: Severity,
  message: string,
  action?: string
): void {
  check.status = escalateStatus(check.status, severity);
  check.details.push(message);
  if (action) {
    check.actions.push(action);
  }
}

function normaliseAddress(value?: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  try {
    return ethers.getAddress(text);
  } catch (_) {
    return undefined;
  }
}

function isZeroAddress(value?: unknown): boolean {
  const address = normaliseAddress(value);
  if (!address) {
    return true;
  }
  return address === ethers.ZeroAddress;
}

function formatRelativePath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }
  return path.relative(process.cwd(), filePath);
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return undefined;
      }
      return BigInt(Math.trunc(value));
    }
    const text = String(value).trim();
    if (!text) {
      return undefined;
    }
    return BigInt(text);
  } catch (_) {
    return undefined;
  }
}

function evaluateOwnerControl(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck('owner-control', 'Owner control configuration');
  let network: string | undefined;

  try {
    const result = loadOwnerControlConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;

    const { config } = result;
    if (!config.owner) {
      registerIssue(
        check,
        'warn',
        'Default owner fallback is not configured.',
        'Set "owner" in config/owner-control.json to the operational owner address.'
      );
    }
    if (!config.governance) {
      registerIssue(
        check,
        'warn',
        'Default governance signer is not configured.',
        'Set "governance" in config/owner-control.json to the timelock or multisig controller.'
      );
    }

    const modules = (config.modules ?? {}) as Record<string, OwnerControlModuleConfig>;
    const moduleKeys = Object.keys(modules);
    if (moduleKeys.length === 0) {
      registerIssue(
        check,
        'fail',
        'No modules are defined under "modules"; owner tooling cannot discover contracts.',
        'Populate config/owner-control.json with each deployed module under the "modules" key.'
      );
    }

    for (const [key, entry] of Object.entries(modules)) {
      const label = entry.label ?? key;
      const moduleIssues: string[] = [];
      let severity: Severity = 'warn';

      if (!entry.type) {
        moduleIssues.push('controller type missing');
      } else {
        const normalisedType = String(entry.type).trim().toLowerCase();
        if (!['governable', 'ownable', 'ownable2step'].includes(normalisedType)) {
          moduleIssues.push(`unsupported controller type "${entry.type}"`);
          severity = 'fail';
        }
      }

      if (!entry.address) {
        moduleIssues.push('on-chain contract address not recorded');
      }

      if (!entry.owner && !entry.governance) {
        moduleIssues.push('expected owner/governance target missing');
      }

      if (moduleIssues.length > 0) {
        registerIssue(
          check,
          severity,
          `Module ${label} (${key}): ${moduleIssues.join('; ')}.`,
          `Update config/owner-control.json → modules.${key} with type, address, and controller targets.`
        );
      }
    }

    if (check.details.length === 0) {
      check.details.push('All tracked modules expose owner/governance metadata.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load owner-control configuration: ${message}`,
      'Review config/owner-control.json for syntax or address errors.'
    );
  }

  checks.push(check);
  return network;
}

function evaluateThermodynamics(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck(
    'thermodynamics',
    'Thermodynamics & reward engine configuration'
  );
  let network: string | undefined;

  try {
    const result = loadThermodynamicsConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;
    const { config } = result;

    const reward = config.rewardEngine as RewardEngineThermoConfig | undefined;
    if (!reward) {
      registerIssue(
        check,
        'fail',
        'Reward engine section missing.',
        'Add a rewardEngine block to config/thermodynamics.json with contract wiring and share splits.'
      );
    } else {
      const shares = reward.roleShares ?? {};
      const expectedRoles = ['agent', 'validator', 'operator', 'employer'];
      const shareTotals: number[] = [];

      for (const role of expectedRoles) {
        const value = asNumber(shares[role]);
        if (value === undefined) {
          registerIssue(
            check,
            'fail',
            `Missing roleShares.${role}; all four splits must be specified.`,
            'Define roleShares for agent, validator, operator, and employer so they sum to 100%.'
          );
        } else {
          shareTotals.push(value);
          if (value < 0) {
            registerIssue(
              check,
              'fail',
              `roleShares.${role} is negative (${value}).`,
              'Use non-negative integers that sum to 100.'
            );
          }
        }
      }

      if (shareTotals.length === expectedRoles.length) {
        const total = shareTotals.reduce((acc, value) => acc + value, 0);
        if (Math.abs(total - 100) > 0.0001) {
          registerIssue(
            check,
            'fail',
            `roleShares total ${total} ≠ 100.`,
            'Adjust roleShares to allocate exactly 100% across all roles.'
          );
        }
      }

      if (!reward.address) {
        registerIssue(
          check,
          'fail',
          'RewardEngine address is unset or zero.',
          'Set rewardEngine.address in config/thermodynamics.json to the deployed RewardEngine contract.'
        );
      }

      if (isZeroAddress(reward.treasury)) {
        registerIssue(
          check,
          'warn',
          'RewardEngine treasury defaults to the zero address (all residuals burned).',
          'Point rewardEngine.treasury to the protocol treasury wallet if burns are not intended.'
        );
      }

      if (isZeroAddress(reward.thermostat)) {
        registerIssue(
          check,
          'fail',
          'Thermostat controller address is unset.',
          'Assign rewardEngine.thermostat to the Thermostat contract address before deployment.'
        );
      }
    }

    const thermostat = config.thermostat as ThermostatConfigInput | undefined;
    if (!thermostat || Object.keys(thermostat).length === 0) {
      registerIssue(
        check,
        'fail',
        'Thermostat parameters are missing.',
        'Provide a thermostat block in config/thermodynamics.json or config/thermostat.json.'
      );
    } else {
      if (isZeroAddress(thermostat.address)) {
        registerIssue(
          check,
          'fail',
          'Thermostat contract address is unset.',
          'Set thermostat.address to the deployed Thermostat contract.'
        );
      }

      const bounds = thermostat.bounds ?? {};
      const min = asBigInt(bounds.min);
      const max = asBigInt(bounds.max);
      const systemTemperature = asBigInt(thermostat.systemTemperature);

      if (min !== undefined && max !== undefined && min > max) {
        registerIssue(
          check,
          'fail',
          `Thermostat bounds are inverted: min (${min}) > max (${max}).`,
          'Ensure bounds.min ≤ bounds.max to avoid runtime reverts.'
        );
      }

      if (
        systemTemperature !== undefined &&
        min !== undefined &&
        max !== undefined &&
        (systemTemperature < min || systemTemperature > max)
      ) {
        registerIssue(
          check,
          'warn',
          `systemTemperature ${systemTemperature} sits outside the configured bounds (${min} – ${max}).`,
          'Align systemTemperature with the thermostat bounds.'
        );
      }
    }

    if (check.details.length === 0) {
      check.details.push('Reward engine and thermostat parameters satisfy baseline invariants.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load thermodynamics configuration: ${message}`,
      'Review config/thermodynamics.json for placeholder addresses or malformed values.'
    );
  }

  checks.push(check);
  return network;
}

function evaluateEnergyOracle(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck('energy-oracle', 'Energy oracle signer configuration');
  let network: string | undefined;

  try {
    const result = loadEnergyOracleConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;

    const { config } = result;
    const signers = config.signers ?? [];

    if (signers.length === 0) {
      registerIssue(
        check,
        'fail',
        'No authorised energy oracle signers are configured.',
        'Populate config/energy-oracle.json with the signer addresses responsible for attestations.'
      );
    }

    if (signers.length > 0) {
      check.details.push(`Configured signers: ${signers.length}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load energy oracle configuration: ${message}`,
      'Review config/energy-oracle.json for syntax issues.'
    );
  }

  checks.push(check);
  return network;
}

function evaluateJobRegistry(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck('job-registry', 'JobRegistry parameter configuration');
  let network: string | undefined;

  try {
    const result = loadJobRegistryConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;

    const { config } = result;
    if (isZeroAddress(config.identityRegistry)) {
      registerIssue(
        check,
        'fail',
        'identityRegistry address is missing.',
        'Set job-registry.identityRegistry to the deployed IdentityRegistry contract.'
      );
    }
    if (isZeroAddress(config.validationModule)) {
      registerIssue(
        check,
        'fail',
        'validationModule address is missing.',
        'Set job-registry.validationModule to the deployed ValidationModule contract.'
      );
    }
    if (isZeroAddress(config.stakeManager)) {
      registerIssue(
        check,
        'fail',
        'stakeManager address is missing.',
        'Set job-registry.stakeManager to the deployed StakeManager contract.'
      );
    }
    if (isZeroAddress(config.feePool)) {
      registerIssue(
        check,
        'warn',
        'feePool address defaults to zero; protocol fees will burn by default.',
        'Set job-registry.feePool to the deployed FeePool contract to route fees.'
      );
    }
    if (isZeroAddress(config.taxPolicy)) {
      registerIssue(
        check,
        'warn',
        'taxPolicy is zero, disabling tax collection.',
        'Assign job-registry.taxPolicy if tax routing is required.'
      );
    }

    const feePct = asNumber((config as Record<string, unknown>).feePct);
    if (feePct === undefined || feePct < 0 || feePct > 100) {
      registerIssue(
        check,
        'warn',
        `feePct ${feePct ?? 'undefined'} is outside the 0-100 range.`,
        'Tune job-registry.feePct to a percentage between 0 and 100.'
      );
    }

    if (check.details.length === 0) {
      check.details.push('JobRegistry dependencies and fees look consistent.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load job-registry configuration: ${message}`,
      'Review config/job-registry.json for missing fields or malformed addresses.'
    );
  }

  checks.push(check);
  return network;
}

function evaluateStakeManager(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck('stake-manager', 'StakeManager configuration');
  let network: string | undefined;

  try {
    const result = loadStakeManagerConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;

    const { config } = result;
    if (isZeroAddress(config.jobRegistry)) {
      registerIssue(
        check,
        'fail',
        'jobRegistry address is missing.',
        'Set stake-manager.jobRegistry to the deployed JobRegistry contract.'
      );
    }
    if (isZeroAddress(config.feePool)) {
      registerIssue(
        check,
        'warn',
        'feePool address is zero; slashed funds cannot be forwarded.',
        'Set stake-manager.feePool to the FeePool contract to route slashes.'
      );
    }
    if (isZeroAddress(config.pauser)) {
      registerIssue(
        check,
        'warn',
        'pauser is zero, preventing emergency pause delegation.',
        'Assign stake-manager.pauser to the pause guardian or SystemPause contract.'
      );
    }
    if (isZeroAddress(config.thermostat)) {
      registerIssue(
        check,
        'warn',
        'thermostat address is zero; auto-stake feedback will be disabled.',
        'Set stake-manager.thermostat to the Thermostat contract for adaptive staking.'
      );
    }

    const minStake = asBigInt((config as Record<string, unknown>).minStakeTokens);
    if (minStake !== undefined && minStake <= 0n) {
      registerIssue(
        check,
        'warn',
        `minStakeTokens is ${minStake}; agents can join with zero stake.`,
        'Set minStakeTokens to a positive quantity that enforces skin-in-the-game.'
      );
    }

    if (check.details.length === 0) {
      check.details.push('StakeManager parameters and wiring appear complete.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load stake-manager configuration: ${message}`,
      'Review config/stake-manager.json for missing fields or malformed addresses.'
    );
  }

  checks.push(check);
  return network;
}

function evaluateFeePool(options: CliOptions, checks: CheckEntry[]): string | undefined {
  const check = createCheck('fee-pool', 'FeePool configuration');
  let network: string | undefined;

  try {
    const result = loadFeePoolConfig({ network: options.network });
    network = result.network ?? network;
    check.path = formatRelativePath(result.path);
    check.network = result.network ?? undefined;

    const { config } = result;
    if (isZeroAddress(config.stakeManager)) {
      registerIssue(
        check,
        'fail',
        'stakeManager address is missing; rewards cannot settle.',
        'Set fee-pool.stakeManager to the deployed StakeManager contract.'
      );
    }
    if (isZeroAddress(config.treasury)) {
      registerIssue(
        check,
        'warn',
        'treasury defaults to zero; residual fees will burn.',
        'Assign fee-pool.treasury to the treasury wallet if dust should be captured.'
      );
    }
    if (isZeroAddress(config.governance)) {
      registerIssue(
        check,
        'warn',
        'governance is zero; only the owner can tune parameters.',
        'Set fee-pool.governance to the multisig or timelock responsible for updates.'
      );
    }
    if (isZeroAddress(config.pauser)) {
      registerIssue(
        check,
        'warn',
        'pauser is zero; FeePool cannot be paused independently.',
        'Assign fee-pool.pauser to SystemPause or a dedicated guardian.'
      );
    }

    const burnPct = asNumber((config as Record<string, unknown>).burnPct);
    if (burnPct === undefined || burnPct < 0 || burnPct > 100) {
      registerIssue(
        check,
        'warn',
        `burnPct ${burnPct ?? 'undefined'} is outside 0-100.`,
        'Configure fee-pool.burnPct within the inclusive 0-100 range.'
      );
    }

    if (check.details.length === 0) {
      check.details.push('FeePool wiring and split percentages look sane.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    registerIssue(
      check,
      'fail',
      `Failed to load fee-pool configuration: ${message}`,
      'Review config/fee-pool.json for missing fields or malformed addresses.'
    );
  }

  checks.push(check);
  return network;
}

function formatHuman(checks: CheckEntry[], options: CliOptions, networks: string[]): void {
  const pass = checks.filter((entry) => entry.status === 'pass').length;
  const warn = checks.filter((entry) => entry.status === 'warn').length;
  const fail = checks.filter((entry) => entry.status === 'fail').length;
  const headerNetwork = networks.length > 0 ? networks.join(', ') : 'auto';

  console.log(`AGIJobs owner control doctor (network: ${headerNetwork})`);
  console.log(`Summary: ${pass} pass · ${warn} warn · ${fail} fail`);
  console.log('');

  const sorted = [...checks].sort((a, b) => {
    const severity = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (severity !== 0) {
      return severity;
    }
    return a.label.localeCompare(b.label);
  });

  for (const entry of sorted) {
    const symbol = entry.status === 'pass' ? '✓' : entry.status === 'warn' ? '⚠' : '✖';
    const location = entry.path ? ` (${entry.path})` : '';
    console.log(`${symbol} ${entry.label}${location}`);
    if (entry.details.length > 0) {
      for (const detail of entry.details) {
        console.log(`    - ${detail}`);
      }
    }
    if (entry.actions.length > 0) {
      console.log('    Suggested actions:');
      for (const action of entry.actions) {
        console.log(`      • ${action}`);
      }
    }
    console.log('');
  }

  if (fail > 0) {
    console.log('❗ One or more checks failed. Address the issues above before production deployment.');
  } else if (warn > 0) {
    console.log(
      options.strict
        ? '⚠ Warnings treated as failures via --strict. Resolve them before proceeding.'
        : '⚠ Warnings detected. Review them to confirm they are intentional.'
    );
  } else {
    console.log('All owner-facing configuration looks production ready.');
  }
}

function formatJson(checks: CheckEntry[], networks: string[]): void {
  const payload = {
    summary: {
      pass: checks.filter((entry) => entry.status === 'pass').length,
      warn: checks.filter((entry) => entry.status === 'warn').length,
      fail: checks.filter((entry) => entry.status === 'fail').length,
      networks,
    },
    checks,
  };
  console.log(JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(`Usage: ts-node ownerControlDoctor.ts [--network <network>] [--json] [--strict]\n`);
    console.log('Checks production readiness of owner-editable configuration files.');
    console.log('--network <name>  Hardhat network name or chain ID to resolve per-network overrides.');
    console.log('--json            Emit machine-readable JSON instead of human output.');
    console.log('--strict          Exit with code 1 when warnings are present.');
    return;
  }

  const checks: CheckEntry[] = [];
  const networks: Set<string> = new Set();

  const ownerNetwork = evaluateOwnerControl(options, checks);
  if (ownerNetwork) {
    networks.add(ownerNetwork);
  }
  const thermoNetwork = evaluateThermodynamics(options, checks);
  if (thermoNetwork) {
    networks.add(thermoNetwork);
  }
  const energyNetwork = evaluateEnergyOracle(options, checks);
  if (energyNetwork) {
    networks.add(energyNetwork);
  }
  const jobNetwork = evaluateJobRegistry(options, checks);
  if (jobNetwork) {
    networks.add(jobNetwork);
  }
  const stakeNetwork = evaluateStakeManager(options, checks);
  if (stakeNetwork) {
    networks.add(stakeNetwork);
  }
  const feeNetwork = evaluateFeePool(options, checks);
  if (feeNetwork) {
    networks.add(feeNetwork);
  }

  const hasFail = checks.some((entry) => entry.status === 'fail');
  const hasWarn = checks.some((entry) => entry.status === 'warn');

  if (options.json) {
    formatJson(checks, Array.from(networks));
  } else {
    formatHuman(checks, options, Array.from(networks));
  }

  if (hasFail || (options.strict && hasWarn)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
