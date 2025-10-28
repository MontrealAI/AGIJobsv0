import { Wallet, formatUnits } from 'ethers';
import { NormalisedAlphaNodeConfig } from '../config';
import {
  connectPlatformIncentives,
  connectPlatformRegistry,
  connectStakeManager,
  connectToken,
  connectSystemPause
} from './contracts';

const PLATFORM_ROLE = 2n;

export interface StakeSnapshot {
  readonly currentStake: bigint;
  readonly requiredStake: bigint;
  readonly allowance: bigint;
  readonly tokenBalance: bigint;
  readonly registered: boolean;
  readonly paused: boolean;
  readonly minimums: {
    readonly global: bigint;
    readonly platformRole: bigint;
    readonly registry: bigint;
    readonly config: bigint;
  };
}

export interface StakeActionReport {
  readonly amountStaked: bigint;
  readonly transactionHash?: string;
  readonly activated: boolean;
  readonly notes: string[];
}

export async function fetchStakeSnapshot(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig
): Promise<StakeSnapshot> {
  const stakeManager = connectStakeManager(config.contracts.stakeManager, signer);
  const platformRegistry = connectPlatformRegistry(config.contracts.platformRegistry, signer);
  const token = connectToken(config.contracts.agialphaToken, signer);
  const systemPause = connectSystemPause(config.contracts.systemPause, signer);

  const operator = await signer.getAddress();

  const [currentStake, minStakeGlobal, minStakeRole, registryMin, registered, allowance, balance, paused] =
    await Promise.all([
      stakeManager.stakeOf(operator, PLATFORM_ROLE),
      stakeManager.minStake(),
      stakeManager.roleMinimumStake(PLATFORM_ROLE),
      platformRegistry.minPlatformStake(),
      platformRegistry.registered(operator),
      token.allowance(operator, config.contracts.stakeManager),
      token.balanceOf(operator),
      systemPause.paused()
    ]);

  const required = [
    minStakeGlobal as bigint,
    minStakeRole as bigint,
    registryMin as bigint,
    config.operator.minimumStakeWei
  ].reduce((acc, value) => (value > acc ? value : acc), 0n);

  return {
    currentStake: currentStake as bigint,
    requiredStake: required,
    allowance: allowance as bigint,
    tokenBalance: balance as bigint,
    registered: Boolean(registered),
    paused: Boolean(paused),
    minimums: {
      global: minStakeGlobal as bigint,
      platformRole: minStakeRole as bigint,
      registry: registryMin as bigint,
      config: config.operator.minimumStakeWei
    }
  };
}

export async function ensureStake(
  signer: Wallet,
  config: NormalisedAlphaNodeConfig,
  options?: { dryRun?: boolean; acknowledgeTax?: boolean }
): Promise<StakeActionReport> {
  const snapshot = await fetchStakeSnapshot(signer, config);
  if (snapshot.paused) {
    return {
      amountStaked: 0n,
      activated: false,
      notes: ['SystemPause is active – resolve the incident before staking.']
    };
  }

  const notes: string[] = [];
  const deficit = snapshot.requiredStake > snapshot.currentStake ? snapshot.requiredStake - snapshot.currentStake : 0n;

  if (deficit === 0n) {
    if (snapshot.registered) {
      notes.push('Stake target already satisfied; no action required.');
      return { amountStaked: 0n, activated: true, notes };
    }
    if (options?.dryRun) {
      notes.push('Dry run: would call PlatformIncentives with zero stake to register.');
      return { amountStaked: 0n, activated: false, notes };
    }
    const platformIncentives = connectPlatformIncentives(config.contracts.platformIncentives, signer);
    const method = options?.acknowledgeTax === false ? 'stakeAndActivate' : 'acknowledgeStakeAndActivate';
    const tx = await platformIncentives[method](0);
    notes.push(`Registration transaction broadcast: ${tx.hash}`);
    const receipt = await tx.wait();
    notes.push(`Registration confirmed in block ${receipt.blockNumber}.`);
    return { amountStaked: 0n, transactionHash: tx.hash, activated: true, notes };
  }

  if (snapshot.tokenBalance < deficit) {
    notes.push(
      `Insufficient $AGIALPHA balance. Needed ${formatUnits(deficit, 18)} but wallet holds ${formatUnits(
        snapshot.tokenBalance,
        18
      )}.`
    );
    return { amountStaked: 0n, activated: false, notes };
  }

  if (snapshot.allowance < deficit && deficit > 0n && !(options?.dryRun ?? false)) {
    const token = connectToken(config.contracts.agialphaToken, signer);
    const approveTx = await token.approve(config.contracts.stakeManager, deficit);
    notes.push(`Approve transaction sent: ${approveTx.hash}`);
    await approveTx.wait();
  }

  if (options?.dryRun) {
    notes.push(`Dry run: would stake ${formatUnits(deficit, 18)} $AGIALPHA.`);
    return { amountStaked: deficit, activated: false, notes };
  }

  const platformIncentives = connectPlatformIncentives(config.contracts.platformIncentives, signer);
  const method = options?.acknowledgeTax === false ? 'stakeAndActivate' : 'acknowledgeStakeAndActivate';
  const tx = await platformIncentives[method](deficit);
  notes.push(`Staking transaction broadcast: ${tx.hash}`);
  const receipt = await tx.wait();
  notes.push(`Activation confirmed in block ${receipt.blockNumber}.`);

  return {
    amountStaked: deficit,
    transactionHash: tx.hash,
    activated: true,
    notes
  };
}
