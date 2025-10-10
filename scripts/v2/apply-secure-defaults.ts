import { promises as fs } from 'fs';
import path from 'path';

import parseDuration from '../utils/parseDuration';
import { ethers } from 'hardhat';

import { AGIALPHA_DECIMALS } from '../constants';

interface SecureDefaultsConfig {
  pauseOnLaunch?: boolean;
  maxJobRewardAgia?: number;
  maxJobDurationSeconds?: number;
  validatorCommitWindowSeconds?: number;
  validatorRevealWindowSeconds?: number;
}

interface EconConfig {
  minStake?: string | number;
  jobStake?: string | number;
  commitWindow?: string | number;
  revealWindow?: string | number;
  employerSlashPct?: number;
  treasurySlashPct?: number;
  validatorSlashRewardPct?: number;
  burnPct?: number;
}

interface DeployConfig {
  secureDefaults?: SecureDefaultsConfig;
  econ?: EconConfig;
  output?: string;
}

interface AddressBook {
  jobRegistry?: string;
  validationModule?: string;
  stakeManager?: string;
  systemPause?: string;
}

type Args = {
  [key: string]: string | boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function ensureAddress(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} address missing in deployment artefacts`);
  }
  return ethers.getAddress(value);
}

async function readJson<T>(filePath: string): Promise<T> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, 'utf8');
  return JSON.parse(raw) as T;
}

function parseTokenAmount(value: string | number | undefined, decimals = AGIALPHA_DECIMALS): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric token amount ${value}`);
    }
    return ethers.parseUnits(value.toString(), decimals);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return ethers.parseUnits(trimmed, decimals);
}

function parseSeconds(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return Math.max(0, Math.floor(value));
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = parseDuration(trimmed, 's');
  if (parsed === null || parsed === undefined) {
    throw new Error(`Unable to parse duration "${value}"`);
  }
  return Math.max(0, Math.floor(parsed));
}

function parsePercentage(value: number | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid percentage value ${value}`);
  }
  const scaled = value > 0 && value < 1 ? value * 100 : value;
  if (scaled < 0 || scaled > 100) {
    throw new Error(`Percentage out of range 0-100: ${value}`);
  }
  return Math.round(scaled);
}

async function applySecureDefaults(config: DeployConfig, addresses: AddressBook) {
  const registryAddress = ensureAddress(addresses.jobRegistry, 'JobRegistry');
  const validationAddress = ensureAddress(addresses.validationModule, 'ValidationModule');
  const stakeAddress = ensureAddress(addresses.stakeManager, 'StakeManager');

  const registry = await ethers.getContractAt('contracts/v2/JobRegistry.sol:JobRegistry', registryAddress);
  const validation = await ethers.getContractAt(
    'contracts/v2/ValidationModule.sol:ValidationModule',
    validationAddress,
  );
  const stake = await ethers.getContractAt('contracts/v2/StakeManager.sol:StakeManager', stakeAddress);

  const defaults = config.secureDefaults || {};
  const econ = config.econ || {};

  const minStake = parseTokenAmount(econ.minStake);
  if (minStake !== undefined) {
    const tx = await stake.setMinStake(minStake);
    await tx.wait();
    console.log(`✓ Set StakeManager minStake to ${ethers.formatUnits(minStake, AGIALPHA_DECIMALS)}`);
  }

  const employerPct = parsePercentage(econ.employerSlashPct);
  const treasuryPct = parsePercentage(econ.treasurySlashPct);
  const validatorPct = parsePercentage(econ.validatorSlashRewardPct);
  if (employerPct !== undefined || treasuryPct !== undefined || validatorPct !== undefined) {
    const currentEmployer = employerPct ?? 0;
    const currentTreasury = treasuryPct ?? 100;
    const currentValidator = validatorPct ?? 0;
    const tx = await stake.setSlashingDistribution(currentEmployer, currentTreasury, currentValidator);
    await tx.wait();
    console.log(
      `✓ Updated slashing distribution employer=${currentEmployer}% treasury=${currentTreasury}% validator=${currentValidator}%`,
    );
  }

  const commitWindow = defaults.validatorCommitWindowSeconds ?? parseSeconds(econ.commitWindow);
  if (commitWindow && commitWindow > 0) {
    const tx = await validation.setCommitWindow(commitWindow);
    await tx.wait();
    console.log(`✓ ValidationModule commit window set to ${commitWindow}s`);
  }

  const revealWindow = defaults.validatorRevealWindowSeconds ?? parseSeconds(econ.revealWindow);
  if (revealWindow && revealWindow > 0) {
    const tx = await validation.setRevealWindow(revealWindow);
    await tx.wait();
    console.log(`✓ ValidationModule reveal window set to ${revealWindow}s`);
  }

  const jobReward = defaults.maxJobRewardAgia;
  const jobStake = econ.jobStake;
  if (jobReward !== undefined || jobStake !== undefined) {
    const rewardAmount = jobReward !== undefined
      ? ethers.parseUnits(jobReward.toString(), AGIALPHA_DECIMALS)
      : 0n;
    const stakeAmount = parseTokenAmount(jobStake) ?? 0n;
    const tx = await registry.setJobParameters(rewardAmount, stakeAmount);
    await tx.wait();
    console.log(
      `✓ JobRegistry job parameters capped at reward=${ethers.formatUnits(rewardAmount, AGIALPHA_DECIMALS)} AGIA, stake=${ethers.formatUnits(stakeAmount, AGIALPHA_DECIMALS)}`,
    );
  }

  const durationLimit = defaults.maxJobDurationSeconds;
  if (durationLimit !== undefined && durationLimit > 0) {
    const tx = await registry.setJobDurationLimit(durationLimit);
    await tx.wait();
    console.log(`✓ JobRegistry job duration limit set to ${durationLimit}s`);
  }

  if (defaults.pauseOnLaunch) {
    const pauseAddress = addresses.systemPause;
    if (pauseAddress && pauseAddress !== ethers.ZeroAddress) {
      const systemPause = await ethers.getContractAt(
        'contracts/v2/SystemPause.sol:SystemPause',
        ethers.getAddress(pauseAddress),
      );
      const tx = await systemPause.pauseAll();
      await tx.wait();
      console.log('✓ SystemPause.pauseAll invoked – contracts start in paused state');
    } else {
      console.warn('⚠️  SystemPause address missing; unable to pause automatically.');
    }
  }
}

async function main() {
  const args = parseArgs();
  const getArg = (key: string): string | boolean | undefined => {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return args[key];
    }
    const lower = key.toLowerCase();
    if (lower !== key && Object.prototype.hasOwnProperty.call(args, lower)) {
      return args[lower];
    }
    const envKey = `ONECLICK_${key
      .replace(/([A-Z])/g, '_$1')
      .replace(/__/g, '_')
      .toUpperCase()}`;
    if (process.env[envKey] !== undefined) {
      return process.env[envKey];
    }
    return undefined;
  };

  const configPath =
    (getArg('config') as string) ??
    path.join('deployment-config', 'deployer.sample.json');
  const addressesPath =
    (getArg('addresses') as string) ?? path.join('docs', 'deployment-addresses.json');

  const config = await readJson<DeployConfig>(configPath);
  const addresses = await readJson<AddressBook>(addressesPath);

  await applySecureDefaults(config, addresses);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
