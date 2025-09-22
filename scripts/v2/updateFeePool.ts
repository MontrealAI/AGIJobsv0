import { ethers, network } from 'hardhat';
import type { Contract } from 'ethers';
import { loadTokenConfig, loadFeePoolConfig } from '../config';

interface CliOptions {
  execute: boolean;
  configPath?: string;
  feePoolAddress?: string;
}

interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  current?: string;
  desired?: string;
  notes?: string[];
}

const ROLE_LABELS = ['Agent', 'Validator', 'Platform'];

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
    } else if (arg === '--fee-pool' || arg === '--feePool') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--fee-pool requires an address');
      }
      options.feePoolAddress = value;
      i += 1;
    }
  }
  return options;
}

function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function parseRewardRole(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value >= ROLE_LABELS.length) {
      throw new Error(
        'rewardRole must be 0 (Agent), 1 (Validator), or 2 (Platform)'
      );
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (
        !Number.isInteger(parsed) ||
        parsed < 0 ||
        parsed >= ROLE_LABELS.length
      ) {
        throw new Error(
          'rewardRole must be 0 (Agent), 1 (Validator), or 2 (Platform)'
        );
      }
      return parsed;
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'agent') return 0;
    if (lower === 'validator') return 1;
    if (lower === 'platform' || lower === 'operator') return 2;
    throw new Error(
      "rewardRole must be one of 'agent', 'validator', 'platform' or the corresponding numeric value"
    );
  }
  throw new Error('rewardRole must be a string or number');
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

function formatRole(value: bigint | number): string {
  const index = Number(value);
  return ROLE_LABELS[index] ?? `Role(${index})`;
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
  const { config: feeConfig, path: feeConfigPath } = loadFeePoolConfig({
    network: network.name,
    chainId: network.config?.chainId,
    path: cli.configPath,
  });

  const feePoolCandidate = cli.feePoolAddress || tokenConfig.modules?.feePool;
  if (!feePoolCandidate) {
    throw new Error('Fee pool address is not configured');
  }
  const feePoolAddress = ethers.getAddress(feePoolCandidate);
  if (feePoolAddress === ethers.ZeroAddress) {
    throw new Error('Fee pool address cannot be the zero address');
  }

  const feePool = (await ethers.getContractAt(
    'contracts/v2/FeePool.sol:FeePool',
    feePoolAddress
  )) as Contract;

  const version = await feePool.version();
  if (version !== 2n) {
    throw new Error(
      `FeePool at ${feePoolAddress} reports version ${version}, expected 2`
    );
  }

  const signer = await ethers.getSigner();
  const ownerAddress = await feePool.owner();
  const signerAddress = await signer.getAddress();

  if (cli.execute && !sameAddress(ownerAddress, signerAddress)) {
    throw new Error(
      `Signer ${signerAddress} is not the contract owner ${ownerAddress}`
    );
  }

  if (!sameAddress(ownerAddress, signerAddress)) {
    console.warn(
      `Warning: connected signer ${signerAddress} is not the contract owner ${ownerAddress}. ` +
        'Running in dry-run mode.'
    );
  }

  const [
    currentStakeManager,
    currentRewardRole,
    currentBurnPct,
    currentTreasury,
    currentGovernance,
    currentPauser,
    currentTaxPolicy,
  ] = await Promise.all([
    feePool.stakeManager(),
    feePool.rewardRole(),
    feePool.burnPct(),
    feePool.treasury(),
    feePool.governance(),
    feePool.pauser(),
    feePool.taxPolicy(),
  ]);

  const currentStakeManagerAddress =
    currentStakeManager === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentStakeManager);
  const currentTreasuryAddress =
    currentTreasury === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTreasury);
  const currentGovernanceAddress =
    currentGovernance === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentGovernance);
  const currentPauserAddress =
    currentPauser === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentPauser);
  const currentTaxPolicyAddress =
    currentTaxPolicy === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(currentTaxPolicy);

  const desiredStakeManager =
    feeConfig.stakeManager && feeConfig.stakeManager !== ethers.ZeroAddress
      ? ethers.getAddress(feeConfig.stakeManager as string)
      : undefined;
  const desiredRewardRole = parseRewardRole(feeConfig.rewardRole);
  const desiredBurnPct = parsePercentage(feeConfig.burnPct, 'burnPct');
  const desiredTreasury =
    feeConfig.treasury !== undefined
      ? ethers.getAddress(feeConfig.treasury as string)
      : undefined;
  const desiredGovernance =
    feeConfig.governance !== undefined &&
    feeConfig.governance !== ethers.ZeroAddress
      ? ethers.getAddress(feeConfig.governance as string)
      : undefined;
  const desiredPauser =
    feeConfig.pauser !== undefined
      ? ethers.getAddress(feeConfig.pauser as string)
      : undefined;
  const desiredTaxPolicy =
    feeConfig.taxPolicy !== undefined &&
    feeConfig.taxPolicy !== ethers.ZeroAddress
      ? ethers.getAddress(feeConfig.taxPolicy as string)
      : undefined;

  const allowlistActions: PlannedAction[] = [];
  const mainActions: PlannedAction[] = [];
  const rewarderActions: PlannedAction[] = [];

  const allowlistState = new Map<string, boolean>();
  async function syncAllowlistEntry(
    addr: string,
    desired: boolean,
    note?: string
  ) {
    const normalized = ethers.getAddress(addr);
    if (normalized === ethers.ZeroAddress) {
      return;
    }
    const current = allowlistState.has(normalized)
      ? allowlistState.get(normalized)!
      : Boolean(await feePool.treasuryAllowlist(normalized));
    if (current === desired) {
      allowlistState.set(normalized, desired);
      return;
    }
    const action: PlannedAction = {
      label: `${desired ? 'Allow' : 'Block'} treasury ${normalized}`,
      method: 'setTreasuryAllowlist',
      args: [normalized, desired],
      current: current ? 'allowed' : 'blocked',
      desired: desired ? 'allowed' : 'blocked',
    };
    if (note) {
      action.notes = [note];
    }
    allowlistActions.push(action);
    allowlistState.set(normalized, desired);
  }

  const allowlistConfig = (feeConfig.treasuryAllowlist || {}) as Record<
    string,
    boolean
  >;
  const sortedAllowlist = Object.keys(allowlistConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const addr of sortedAllowlist) {
    await syncAllowlistEntry(addr, Boolean(allowlistConfig[addr]));
  }

  const rewarderState = new Map<string, boolean>();
  async function syncRewarder(addr: string, desired: boolean) {
    const normalized = ethers.getAddress(addr);
    if (normalized === ethers.ZeroAddress) {
      return;
    }
    const current = rewarderState.has(normalized)
      ? rewarderState.get(normalized)!
      : Boolean(await feePool.rewarders(normalized));
    if (current === desired) {
      rewarderState.set(normalized, desired);
      return;
    }
    rewarderActions.push({
      label: `${desired ? 'Authorize' : 'Revoke'} rewarder ${normalized}`,
      method: 'setRewarder',
      args: [normalized, desired],
      current: current ? 'authorized' : 'revoked',
      desired: desired ? 'authorized' : 'revoked',
    });
    rewarderState.set(normalized, desired);
  }

  const rewarderConfig = (feeConfig.rewarders || {}) as Record<string, boolean>;
  const sortedRewarders = Object.keys(rewarderConfig).sort((a, b) =>
    a.localeCompare(b)
  );
  for (const addr of sortedRewarders) {
    await syncRewarder(addr, Boolean(rewarderConfig[addr]));
  }

  if (
    desiredStakeManager &&
    !sameAddress(desiredStakeManager, currentStakeManagerAddress)
  ) {
    const stakeManager = await ethers.getContractAt(
      ['function version() view returns (uint256)'],
      desiredStakeManager
    );
    const stakeVersion = await stakeManager.version();
    if (stakeVersion !== 2n) {
      throw new Error(
        `StakeManager at ${desiredStakeManager} reports version ${stakeVersion}, expected 2`
      );
    }
    mainActions.push({
      label: `Update StakeManager to ${desiredStakeManager}`,
      method: 'setStakeManager',
      args: [desiredStakeManager],
      current: currentStakeManagerAddress,
      desired: desiredStakeManager,
      notes: ['StakeManager must expose version() == 2.'],
    });
  }

  if (
    desiredRewardRole !== undefined &&
    desiredRewardRole !== Number(currentRewardRole)
  ) {
    mainActions.push({
      label: `Update reward role to ${formatRole(desiredRewardRole)}`,
      method: 'setRewardRole',
      args: [desiredRewardRole],
      current: formatRole(currentRewardRole),
      desired: formatRole(desiredRewardRole),
    });
  }

  if (
    desiredBurnPct !== undefined &&
    desiredBurnPct !== Number(currentBurnPct)
  ) {
    mainActions.push({
      label: `Update burn percentage to ${desiredBurnPct}%`,
      method: 'setBurnPct',
      args: [desiredBurnPct],
      current: `${Number(currentBurnPct)}%`,
      desired: `${desiredBurnPct}%`,
    });
  }

  if (desiredTreasury !== undefined) {
    if (
      desiredTreasury !== ethers.ZeroAddress &&
      sameAddress(desiredTreasury, ownerAddress)
    ) {
      throw new Error('Treasury cannot be set to the contract owner');
    }
    const normalizedTreasury = desiredTreasury;
    if (
      normalizedTreasury !== ethers.ZeroAddress &&
      allowlistConfig[normalizedTreasury] === false
    ) {
      throw new Error(
        `Treasury ${normalizedTreasury} is disabled in treasuryAllowlist; set it to true before updating`
      );
    }
    if (
      normalizedTreasury !== ethers.ZeroAddress &&
      (!allowlistState.has(normalizedTreasury) ||
        allowlistState.get(normalizedTreasury) !== true)
    ) {
      await syncAllowlistEntry(
        normalizedTreasury,
        true,
        'Automatically allowing treasury address before updating.'
      );
    }
    if (!sameAddress(normalizedTreasury, currentTreasuryAddress)) {
      const notes = [] as string[];
      if (normalizedTreasury === ethers.ZeroAddress) {
        notes.push(
          'Zero address burns rounding dust instead of forwarding it.'
        );
      }
      mainActions.push({
        label: `Update treasury to ${normalizedTreasury}`,
        method: 'setTreasury',
        args: [normalizedTreasury],
        current: currentTreasuryAddress,
        desired: normalizedTreasury,
        notes: notes.length ? notes : undefined,
      });
    }
  }

  if (
    desiredGovernance &&
    !sameAddress(desiredGovernance, currentGovernanceAddress)
  ) {
    mainActions.push({
      label: `Update governance to ${desiredGovernance}`,
      method: 'setGovernance',
      args: [desiredGovernance],
      current: currentGovernanceAddress,
      desired: desiredGovernance,
      notes: [
        'Governance address must be a TimelockController capable of calling governanceWithdraw.',
      ],
    });
  }

  if (
    desiredPauser !== undefined &&
    !sameAddress(desiredPauser, currentPauserAddress)
  ) {
    mainActions.push({
      label: `Update pauser to ${desiredPauser}`,
      method: 'setPauser',
      args: [desiredPauser],
      current: currentPauserAddress,
      desired: desiredPauser,
    });
  }

  if (
    desiredTaxPolicy &&
    !sameAddress(desiredTaxPolicy, currentTaxPolicyAddress)
  ) {
    const policy = await ethers.getContractAt(
      ['function isTaxExempt() view returns (bool)'],
      desiredTaxPolicy
    );
    const exempt = await policy.isTaxExempt();
    if (!exempt) {
      throw new Error(
        `Tax policy at ${desiredTaxPolicy} must return true for isTaxExempt()`
      );
    }
    mainActions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: currentTaxPolicyAddress,
      desired: desiredTaxPolicy,
      notes: ['Target policy must remain tax exempt.'],
    });
  }

  const actions = [...allowlistActions, ...mainActions, ...rewarderActions];

  console.log('FeePool:', feePoolAddress);
  console.log('Configuration file:', feeConfigPath);

  if (actions.length === 0) {
    console.log('All tracked parameters already match the configuration.');
    return;
  }

  console.log(`Planned actions (${actions.length}):`);
  const iface = feePool.interface;
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
    const tx = await (feePool as any)[action.method](...action.args);
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
