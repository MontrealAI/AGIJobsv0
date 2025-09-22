import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import {
  loadTokenConfig,
  loadJobRegistryConfig,
  type JobRegistryConfig,
} from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  registryAddress?: string;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  current?: string;
  desired?: string;
  notes?: string[];
}

const MAX_UINT96 = (1n << 96n) - 1n;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--config requires a file path');
      }
      options.configPath = value;
      i += 1;
    } else if (arg === '--registry') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--registry requires an address');
      }
      options.registryAddress = value;
      i += 1;
    }
  }
  return options;
}

function parseTokenAmount(
  config: JobRegistryConfig,
  key: string,
  decimals: number
): bigint | undefined {
  const direct = config[key];
  if (direct !== undefined && direct !== null) {
    const asString =
      typeof direct === 'string' ? direct.trim() : String(direct);
    if (!asString) {
      return undefined;
    }
    const value = BigInt(asString);
    if (value < 0n) {
      throw new Error(`${key} cannot be negative`);
    }
    return value;
  }
  const tokensKey = `${key}Tokens`;
  const tokenValue = config[tokensKey as keyof JobRegistryConfig];
  if (tokenValue !== undefined && tokenValue !== null) {
    const asString =
      typeof tokenValue === 'string' ? tokenValue.trim() : String(tokenValue);
    if (!asString) {
      return undefined;
    }
    const parsed = ethers.parseUnits(asString, decimals);
    if (parsed < 0n) {
      throw new Error(`${tokensKey} cannot be negative`);
    }
    return parsed;
  }
  return undefined;
}

function parseInteger(value: unknown, label: string): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!asString) {
    return undefined;
  }
  if (!/^[-+]?\d+$/.test(asString)) {
    throw new Error(`${label} must be an integer`);
  }
  const parsed = BigInt(asString);
  if (parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

function parsePercentage(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be an integer between 0 and 100`);
  }
  if (numberValue < 0 || numberValue > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return numberValue;
}

function normaliseAddress(
  value: string | null | undefined
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return ethers.ZeroAddress;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === ethers.ZeroAddress) {
    return ethers.ZeroAddress;
  }
  return ethers.getAddress(trimmed);
}

function sameAddress(a: string, b: string): boolean {
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function formatToken(value: bigint, decimals: number, symbol: string): string {
  return `${ethers.formatUnits(value, decimals)} ${symbol}`.trim();
}

function describeArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') {
        return arg.toString();
      }
      if (typeof arg === 'string') {
        return arg;
      }
      if (typeof arg === 'boolean') {
        return arg ? 'true' : 'false';
      }
      return JSON.stringify(arg);
    })
    .join(', ');
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { config: tokenConfig } = loadTokenConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const { config: jobConfig, path: jobConfigPath } = loadJobRegistryConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const decimals =
    typeof tokenConfig.decimals === 'number' ? tokenConfig.decimals : 18;
  const symbol =
    typeof tokenConfig.symbol === 'string' && tokenConfig.symbol
      ? tokenConfig.symbol
      : 'tokens';

  const registryAddressCandidate =
    cli.registryAddress || tokenConfig.modules?.jobRegistry;
  if (!registryAddressCandidate) {
    throw new Error('Job registry address is not configured');
  }
  const jobRegistryAddress = ethers.getAddress(registryAddressCandidate);
  if (jobRegistryAddress === ethers.ZeroAddress) {
    throw new Error('Job registry address cannot be the zero address');
  }

  const registry = (await ethers.getContractAt(
    'contracts/v2/JobRegistry.sol:JobRegistry',
    jobRegistryAddress
  )) as Contract;

  const signer = await ethers.getSigner();
  const ownerAddress = await registry.owner();
  const signerAddress = await signer.getAddress();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the governance owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the governance owner ${ownerAddress}. ` +
        'Running in dry-run mode.'
    );
  }

  const [
    currentJobStake,
    currentMaxJobReward,
    currentMinAgentStake,
    currentFeePct,
    currentValidatorRewardPct,
    currentMaxDuration,
    currentMaxActiveJobs,
    currentExpirationGrace,
    currentTreasury,
    currentTaxPolicy,
  ] = await Promise.all([
    registry.jobStake(),
    registry.maxJobReward(),
    registry.minAgentStake(),
    registry.feePct(),
    registry.validatorRewardPct(),
    registry.maxJobDuration(),
    registry.maxActiveJobsPerAgent(),
    registry.expirationGracePeriod(),
    registry.treasury(),
    registry.taxPolicy(),
  ]);

  const desiredJobStake = parseTokenAmount(jobConfig, 'jobStake', decimals);
  const desiredMinAgentStake = parseTokenAmount(
    jobConfig,
    'minAgentStake',
    decimals
  );
  const desiredMaxReward = parseTokenAmount(
    jobConfig,
    'maxJobReward',
    decimals
  );
  const desiredDuration = parseInteger(
    jobConfig.jobDurationLimitSeconds,
    'jobDurationLimitSeconds'
  );
  const desiredMaxActive = parseInteger(
    jobConfig.maxActiveJobsPerAgent,
    'maxActiveJobsPerAgent'
  );
  const desiredExpirationGrace = parseInteger(
    jobConfig.expirationGracePeriodSeconds,
    'expirationGracePeriodSeconds'
  );
  const desiredFeePct = parsePercentage(jobConfig.feePct, 'feePct');
  const desiredValidatorPct = parsePercentage(
    jobConfig.validatorRewardPct,
    'validatorRewardPct'
  );
  const desiredTreasury = normaliseAddress(
    jobConfig.treasury as string | null | undefined
  );
  const desiredTaxPolicy = normaliseAddress(
    jobConfig.taxPolicy as string | null | undefined
  );

  const actions: PlannedAction[] = [];

  if (desiredJobStake !== undefined && desiredJobStake !== currentJobStake) {
    if (desiredJobStake > MAX_UINT96) {
      throw new Error('jobStake exceeds uint96 range');
    }
    actions.push({
      label: `Update job stake to ${formatToken(
        desiredJobStake,
        decimals,
        symbol
      )}`,
      method: 'setJobStake',
      args: [desiredJobStake],
      current: formatToken(currentJobStake, decimals, symbol),
      desired: formatToken(desiredJobStake, decimals, symbol),
    });
  }

  if (
    desiredMinAgentStake !== undefined &&
    desiredMinAgentStake !== currentMinAgentStake
  ) {
    if (desiredMinAgentStake > MAX_UINT96) {
      throw new Error('minAgentStake exceeds uint96 range');
    }
    actions.push({
      label: `Update minimum agent stake to ${formatToken(
        desiredMinAgentStake,
        decimals,
        symbol
      )}`,
      method: 'setMinAgentStake',
      args: [desiredMinAgentStake],
      current: formatToken(currentMinAgentStake, decimals, symbol),
      desired: formatToken(desiredMinAgentStake, decimals, symbol),
    });
  }

  if (
    desiredMaxReward !== undefined &&
    desiredMaxReward !== currentMaxJobReward
  ) {
    actions.push({
      label: `Update maximum job reward to ${formatToken(
        desiredMaxReward,
        decimals,
        symbol
      )}`,
      method: 'setMaxJobReward',
      args: [desiredMaxReward],
      current: formatToken(currentMaxJobReward, decimals, symbol),
      desired: formatToken(desiredMaxReward, decimals, symbol),
    });
  }

  if (desiredDuration !== undefined && desiredDuration !== currentMaxDuration) {
    actions.push({
      label: `Update job duration limit to ${desiredDuration} seconds`,
      method: 'setJobDurationLimit',
      args: [desiredDuration],
      current: `${currentMaxDuration.toString()} seconds`,
      desired: `${desiredDuration.toString()} seconds`,
    });
  }

  if (
    desiredMaxActive !== undefined &&
    desiredMaxActive !== currentMaxActiveJobs
  ) {
    actions.push({
      label: `Update maximum active jobs per agent to ${desiredMaxActive}`,
      method: 'setMaxActiveJobsPerAgent',
      args: [desiredMaxActive],
      current: currentMaxActiveJobs.toString(),
      desired: desiredMaxActive.toString(),
    });
  }

  if (
    desiredExpirationGrace !== undefined &&
    desiredExpirationGrace !== currentExpirationGrace
  ) {
    actions.push({
      label: `Update expiration grace period to ${desiredExpirationGrace} seconds`,
      method: 'setExpirationGracePeriod',
      args: [desiredExpirationGrace],
      current: `${currentExpirationGrace.toString()} seconds`,
      desired: `${desiredExpirationGrace.toString()} seconds`,
    });
  }

  const currentFee = Number(currentFeePct);
  const currentValidator = Number(currentValidatorRewardPct);

  if (desiredFeePct !== undefined) {
    const validatorTarget =
      desiredValidatorPct !== undefined
        ? desiredValidatorPct
        : currentValidator;
    if (desiredFeePct + validatorTarget > 100) {
      throw new Error('feePct + validatorRewardPct cannot exceed 100');
    }
    if (desiredFeePct !== currentFee) {
      actions.push({
        label: `Update protocol fee percentage to ${desiredFeePct}%`,
        method: 'setFeePct',
        args: [desiredFeePct],
        current: `${currentFee}%`,
        desired: `${desiredFeePct}%`,
      });
    }
  }

  if (desiredValidatorPct !== undefined) {
    const feeTarget = desiredFeePct !== undefined ? desiredFeePct : currentFee;
    if (desiredValidatorPct + feeTarget > 100) {
      throw new Error('feePct + validatorRewardPct cannot exceed 100');
    }
    if (desiredValidatorPct !== currentValidator) {
      actions.push({
        label: `Update validator reward percentage to ${desiredValidatorPct}%`,
        method: 'setValidatorRewardPct',
        args: [desiredValidatorPct],
        current: `${currentValidator}%`,
        desired: `${desiredValidatorPct}%`,
      });
    }
  }

  const currentTreasuryAddress =
    currentTreasury === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTreasury);
  if (
    desiredTreasury !== undefined &&
    desiredTreasury !== currentTreasuryAddress
  ) {
    actions.push({
      label: `Update treasury to ${desiredTreasury}`,
      method: 'setTreasury',
      args: [desiredTreasury],
      current: currentTreasuryAddress,
      desired: desiredTreasury,
      notes: ['Passing the zero address burns forfeited payouts.'],
    });
  }

  const currentTaxPolicyAddress =
    currentTaxPolicy === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTaxPolicy);
  if (
    desiredTaxPolicy &&
    desiredTaxPolicy !== ethers.ZeroAddress &&
    desiredTaxPolicy !== currentTaxPolicyAddress
  ) {
    actions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: currentTaxPolicyAddress,
      desired: desiredTaxPolicy,
    });
  }

  const acknowledgers = jobConfig.acknowledgers || {};
  const sortedAcks = Object.keys(acknowledgers).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const ack of sortedAcks) {
    const desired = acknowledgers[ack];
    const current = await registry.acknowledgers(ack);
    if (Boolean(desired) !== current) {
      actions.push({
        label: `${desired ? 'Enable' : 'Disable'} acknowledger ${ack}`,
        method: 'setAcknowledger',
        args: [ack, Boolean(desired)],
        current: current ? 'allowed' : 'blocked',
        desired: desired ? 'allowed' : 'blocked',
      });
    }
  }

  console.log('Job Registry:', jobRegistryAddress);
  console.log('Configuration file:', jobConfigPath);

  if (actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }

  console.log(`Planned actions (${actions.length}):`);
  const iface = registry.interface;
  actions.forEach((action, index) => {
    const data = iface.encodeFunctionData(action.method, action.args);
    console.log(`\n${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      console.log(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      console.log(`   Desired: ${action.desired}`);
    }
    if (action.notes) {
      for (const note of action.notes) {
        console.log(`   Note: ${note}`);
      }
    }
    console.log(`   Method: ${action.method}(${describeArgs(action.args)})`);
    console.log(`   Calldata: ${data}`);
  });

  if (!cli.execute || !sameAddress(ownerAddress, signerAddress)) {
    console.log(
      '\nDry run complete. Re-run with --execute once ready to submit transactions.'
    );
    return;
  }

  console.log('\nSubmitting transactions...');
  for (const action of actions) {
    console.log(`Executing ${action.method}...`);
    const tx = await (registry as any)[action.method](...action.args);
    console.log(`   Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`Transaction for ${action.method} failed`);
    }
    console.log('   Confirmed');
  }
  console.log('All transactions confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
