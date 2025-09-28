import type { Contract } from 'ethers';
import { ethers } from 'ethers';
import type { JobRegistryConfig } from '../../config';
import { ModulePlan, PlannedAction } from './types';
import {
  describeArgs,
  formatToken,
  normaliseAddress,
  normaliseBytes32,
  parseBigInt,
  parseBoolean,
  parsePercentage,
  parseTokenAmount,
  sameAddress,
  sameBytes32,
} from './utils';

const MAX_UINT96 = (1n << 96n) - 1n;

export interface JobRegistryPlanInput {
  registry: Contract;
  config: JobRegistryConfig;
  configPath?: string;
  decimals: number;
  symbol: string;
}

function ensureFeeBudgetValid(
  fee: number | undefined,
  validator: number | undefined
) {
  if (fee === undefined || validator === undefined) {
    return;
  }
  if (fee + validator > 100) {
    throw new Error('feePct + validatorRewardPct cannot exceed 100');
  }
}

export async function buildJobRegistryPlan(
  input: JobRegistryPlanInput
): Promise<ModulePlan> {
  const { registry, config, configPath, decimals, symbol } = input;

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
    currentPauser,
    currentValidationModule,
    currentStakeManager,
    currentReputationModule,
    currentDisputeModule,
    currentCertificateNFT,
    currentFeePool,
    currentIdentityRegistry,
    currentAgentAuthCacheDuration,
    currentAgentAuthCacheVersion,
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
    registry.pauser(),
    registry.validationModule(),
    registry.stakeManager(),
    registry.reputationEngine(),
    registry.disputeModule(),
    registry.certificateNFT(),
    registry.feePool(),
    registry.identityRegistry(),
    registry.agentAuthCacheDuration(),
    registry.agentAuthCacheVersion(),
  ]);

  const currentPauserAddress = ethers.getAddress(currentPauser);
  const currentValidationModuleAddress = ethers.getAddress(
    currentValidationModule
  );
  const currentStakeManagerAddress = ethers.getAddress(currentStakeManager);
  const currentReputationModuleAddress = ethers.getAddress(
    currentReputationModule
  );
  const currentDisputeModuleAddress = ethers.getAddress(currentDisputeModule);
  const currentCertificateNFTAddress = ethers.getAddress(currentCertificateNFT);
  const currentFeePoolAddress = ethers.getAddress(currentFeePool);
  const currentIdentityRegistryAddress = ethers.getAddress(
    currentIdentityRegistry
  );

  const toBytes32String = (value: string): string =>
    ethers.hexlify(ethers.getBytes(value)).toLowerCase();

  let currentAgentRootNode: string | undefined;
  let currentAgentMerkleRoot: string | undefined;
  let currentValidatorRootNode: string | undefined;
  let currentValidatorMerkleRoot: string | undefined;

  if (currentIdentityRegistryAddress !== ethers.ZeroAddress) {
    if (!registry.runner) {
      throw new Error('JobRegistry contract runner is not configured');
    }
    const identity = new ethers.Contract(
      currentIdentityRegistryAddress,
      [
        'function agentRootNode() view returns (bytes32)',
        'function agentMerkleRoot() view returns (bytes32)',
        'function clubRootNode() view returns (bytes32)',
        'function validatorMerkleRoot() view returns (bytes32)',
      ],
      registry.runner
    );
    const [
      identityAgentRoot,
      identityAgentMerkle,
      identityClubRoot,
      identityValidatorMerkle,
    ] = await Promise.all([
      identity.agentRootNode(),
      identity.agentMerkleRoot(),
      identity.clubRootNode(),
      identity.validatorMerkleRoot(),
    ]);
    currentAgentRootNode = toBytes32String(identityAgentRoot as string);
    currentAgentMerkleRoot = toBytes32String(identityAgentMerkle as string);
    currentValidatorRootNode = toBytes32String(identityClubRoot as string);
    currentValidatorMerkleRoot = toBytes32String(
      identityValidatorMerkle as string
    );
  }

  const desiredJobStake = parseTokenAmount(
    config.jobStake,
    config.jobStakeTokens,
    decimals,
    'jobStake'
  );
  const desiredMinAgentStake = parseTokenAmount(
    config.minAgentStake,
    config.minAgentStakeTokens,
    decimals,
    'minAgentStake'
  );
  const desiredMaxReward = parseTokenAmount(
    config.maxJobReward,
    config.maxJobRewardTokens,
    decimals,
    'maxJobReward'
  );
  const desiredDuration = parseBigInt(
    config.jobDurationLimitSeconds,
    'jobDurationLimitSeconds'
  );
  const desiredMaxActive = parseBigInt(
    config.maxActiveJobsPerAgent,
    'maxActiveJobsPerAgent'
  );
  const desiredExpirationGrace = parseBigInt(
    config.expirationGracePeriodSeconds,
    'expirationGracePeriodSeconds'
  );
  const desiredFeePct = parsePercentage(config.feePct, 'feePct');
  const desiredValidatorPct = parsePercentage(
    config.validatorRewardPct,
    'validatorRewardPct'
  );
  ensureFeeBudgetValid(desiredFeePct, desiredValidatorPct);

  const desiredTreasury = normaliseAddress(config.treasury);
  const desiredTaxPolicy = normaliseAddress(config.taxPolicy, {
    allowZero: false,
  });
  const desiredPauser = normaliseAddress(config.pauser, { allowZero: true });
  const desiredIdentityRegistry = normaliseAddress(config.identityRegistry, {
    allowZero: false,
  });
  const desiredDisputeModule = normaliseAddress(config.disputeModule, {
    allowZero: false,
  });
  const desiredValidationModule = normaliseAddress(config.validationModule, {
    allowZero: false,
  });
  const desiredStakeManager = normaliseAddress(config.stakeManager, {
    allowZero: false,
  });
  const desiredReputationModule = normaliseAddress(config.reputationModule, {
    allowZero: false,
  });
  const desiredCertificateNFT = normaliseAddress(config.certificateNFT, {
    allowZero: false,
  });
  const desiredFeePool = normaliseAddress(config.feePool, { allowZero: false });
  const desiredAgentRootNode =
    config.agentRootNode !== undefined
      ? normaliseBytes32(config.agentRootNode, { allowZero: true })
      : undefined;
  const desiredAgentMerkleRoot =
    config.agentMerkleRoot !== undefined
      ? normaliseBytes32(config.agentMerkleRoot, { allowZero: true })
      : undefined;
  const desiredValidatorRootNode =
    config.validatorRootNode !== undefined
      ? normaliseBytes32(config.validatorRootNode, { allowZero: true })
      : undefined;
  const desiredValidatorMerkleRoot =
    config.validatorMerkleRoot !== undefined
      ? normaliseBytes32(config.validatorMerkleRoot, { allowZero: true })
      : undefined;
  const desiredAgentAuthCacheDuration = parseBigInt(
    config.agentAuthCacheDurationSeconds,
    'agentAuthCacheDurationSeconds'
  );
  const desiredBumpCacheVersion = parseBoolean(
    config.bumpAgentAuthCacheVersion,
    'bumpAgentAuthCacheVersion'
  );

  const actions: PlannedAction[] = [];

  const formatAddressWithStatus = (value?: string): string => {
    if (!value) {
      return 'not set';
    }
    const normalised = ethers.getAddress(value);
    if (normalised === ethers.ZeroAddress) {
      return `${ethers.ZeroAddress} (disabled)`;
    }
    return normalised;
  };

  const formatBytes32Value = (value?: string): string => {
    if (!value) {
      return 'not set';
    }
    return value.toLowerCase();
  };

  if (
    desiredPauser !== undefined &&
    !sameAddress(desiredPauser, currentPauserAddress)
  ) {
    const notes =
      desiredPauser === ethers.ZeroAddress
        ? [
            'Setting the pauser to the zero address restricts pause/unpause to governance only.',
          ]
        : undefined;
    actions.push({
      label:
        desiredPauser === ethers.ZeroAddress
          ? 'Clear dedicated pauser (governance retains control)'
          : `Update pauser to ${desiredPauser}`,
      method: 'setPauser',
      args: [desiredPauser],
      current: formatAddressWithStatus(currentPauserAddress),
      desired: formatAddressWithStatus(desiredPauser),
      ...(notes ? { notes } : {}),
    });
  }

  const enqueueModuleUpdate = (
    desired: string | undefined,
    current: string,
    method: string,
    label: string,
    extraNotes: string[] = []
  ) => {
    if (!desired || sameAddress(desired, current)) {
      return;
    }
    const entry: PlannedAction = {
      label: `Update ${label} to ${desired}`,
      method,
      args: [desired],
      current: formatAddressWithStatus(current),
      desired: formatAddressWithStatus(desired),
    };
    if (extraNotes.length > 0) {
      entry.notes = extraNotes;
    }
    actions.push(entry);
  };

  enqueueModuleUpdate(
    desiredIdentityRegistry,
    currentIdentityRegistryAddress,
    'setIdentityRegistry',
    'identity registry',
    ['Ensure the target identity registry reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredDisputeModule,
    currentDisputeModuleAddress,
    'setDisputeModule',
    'dispute module',
    ['Ensure the dispute module reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredValidationModule,
    currentValidationModuleAddress,
    'setValidationModule',
    'validation module',
    ['Ensure the validation module reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredStakeManager,
    currentStakeManagerAddress,
    'setStakeManager',
    'stake manager',
    ['Ensure the stake manager reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredReputationModule,
    currentReputationModuleAddress,
    'setReputationEngine',
    'reputation engine',
    ['Ensure the reputation engine reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredCertificateNFT,
    currentCertificateNFTAddress,
    'setCertificateNFT',
    'certificate NFT',
    ['Ensure the certificate NFT reports version() == 2.']
  );
  enqueueModuleUpdate(
    desiredFeePool,
    currentFeePoolAddress,
    'setFeePool',
    'fee pool',
    ['Ensure the fee pool reports version() == 2.']
  );

  const identityNotesBase: string[] = [];
  if (currentIdentityRegistryAddress === ethers.ZeroAddress) {
    identityNotesBase.push(
      'Configure the identity registry before applying this change.'
    );
  }
  if (
    desiredIdentityRegistry &&
    !sameAddress(desiredIdentityRegistry, currentIdentityRegistryAddress)
  ) {
    identityNotesBase.push(
      'Execute after updating the identity registry address.'
    );
  }

  if (
    desiredAgentRootNode !== undefined &&
    !sameBytes32(desiredAgentRootNode, currentAgentRootNode)
  ) {
    actions.push({
      label: `Update agent root node to ${desiredAgentRootNode}`,
      method: 'setAgentRootNode',
      args: [desiredAgentRootNode],
      current: formatBytes32Value(currentAgentRootNode),
      desired: formatBytes32Value(desiredAgentRootNode),
      ...(identityNotesBase.length > 0
        ? { notes: [...identityNotesBase] }
        : {}),
    });
  }

  if (
    desiredAgentMerkleRoot !== undefined &&
    !sameBytes32(desiredAgentMerkleRoot, currentAgentMerkleRoot)
  ) {
    actions.push({
      label: `Update agent Merkle root to ${desiredAgentMerkleRoot}`,
      method: 'setAgentMerkleRoot',
      args: [desiredAgentMerkleRoot],
      current: formatBytes32Value(currentAgentMerkleRoot),
      desired: formatBytes32Value(desiredAgentMerkleRoot),
      ...(identityNotesBase.length > 0
        ? { notes: [...identityNotesBase] }
        : {}),
    });
  }

  const validatorNotes: string[] = [...identityNotesBase];
  if (currentValidationModuleAddress === ethers.ZeroAddress) {
    validatorNotes.push(
      'Configure the validation module before applying validator updates.'
    );
  }
  if (
    desiredValidationModule &&
    !sameAddress(desiredValidationModule, currentValidationModuleAddress)
  ) {
    validatorNotes.push(
      'Execute after updating the validation module address.'
    );
  }

  if (
    desiredValidatorRootNode !== undefined &&
    !sameBytes32(desiredValidatorRootNode, currentValidatorRootNode)
  ) {
    actions.push({
      label: `Update validator root node to ${desiredValidatorRootNode}`,
      method: 'setValidatorRootNode',
      args: [desiredValidatorRootNode],
      current: formatBytes32Value(currentValidatorRootNode),
      desired: formatBytes32Value(desiredValidatorRootNode),
      ...(validatorNotes.length > 0 ? { notes: [...validatorNotes] } : {}),
    });
  }

  if (
    desiredValidatorMerkleRoot !== undefined &&
    !sameBytes32(desiredValidatorMerkleRoot, currentValidatorMerkleRoot)
  ) {
    actions.push({
      label: `Update validator Merkle root to ${desiredValidatorMerkleRoot}`,
      method: 'setValidatorMerkleRoot',
      args: [desiredValidatorMerkleRoot],
      current: formatBytes32Value(currentValidatorMerkleRoot),
      desired: formatBytes32Value(desiredValidatorMerkleRoot),
      ...(validatorNotes.length > 0 ? { notes: [...validatorNotes] } : {}),
    });
  }

  if (
    desiredAgentAuthCacheDuration !== undefined &&
    desiredAgentAuthCacheDuration !== currentAgentAuthCacheDuration
  ) {
    actions.push({
      label: `Update agent auth cache duration to ${desiredAgentAuthCacheDuration} seconds`,
      method: 'setAgentAuthCacheDuration',
      args: [desiredAgentAuthCacheDuration],
      current: `${currentAgentAuthCacheDuration.toString()} seconds`,
      desired: `${desiredAgentAuthCacheDuration.toString()} seconds`,
    });
  }

  if (desiredBumpCacheVersion) {
    const nextVersion = currentAgentAuthCacheVersion + 1n;
    actions.push({
      label: 'Bump agent auth cache version',
      method: 'bumpAgentAuthCacheVersion',
      args: [],
      current: `v${currentAgentAuthCacheVersion.toString()}`,
      desired: `v${nextVersion.toString()}`,
      notes: [
        'Forces all agent identity cache entries to refresh after ENS or Merkle updates.',
      ],
    });
  }

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

  if (desiredFeePct !== undefined && desiredFeePct !== currentFee) {
    ensureFeeBudgetValid(
      desiredFeePct,
      desiredValidatorPct ?? currentValidator
    );
    actions.push({
      label: `Update protocol fee percentage to ${desiredFeePct}%`,
      method: 'setFeePct',
      args: [desiredFeePct],
      current: `${currentFee}%`,
      desired: `${desiredFeePct}%`,
    });
  }

  if (
    desiredValidatorPct !== undefined &&
    desiredValidatorPct !== currentValidator
  ) {
    ensureFeeBudgetValid(desiredFeePct ?? currentFee, desiredValidatorPct);
    actions.push({
      label: `Update validator reward percentage to ${desiredValidatorPct}%`,
      method: 'setValidatorRewardPct',
      args: [desiredValidatorPct],
      current: `${currentValidator}%`,
      desired: `${desiredValidatorPct}%`,
    });
  }

  const currentTreasuryAddress = ethers.getAddress(currentTreasury);
  if (
    desiredTreasury !== undefined &&
    !sameAddress(desiredTreasury, currentTreasuryAddress)
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

  const currentTaxPolicyAddress = ethers.getAddress(currentTaxPolicy);
  if (
    desiredTaxPolicy &&
    desiredTaxPolicy !== ethers.ZeroAddress &&
    !sameAddress(desiredTaxPolicy, currentTaxPolicyAddress)
  ) {
    actions.push({
      label: `Update tax policy to ${desiredTaxPolicy}`,
      method: 'setTaxPolicy',
      args: [desiredTaxPolicy],
      current: currentTaxPolicyAddress,
      desired: desiredTaxPolicy,
    });
  }

  const acknowledgers = config.acknowledgers || {};
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

  return {
    module: 'JobRegistry',
    address: registry.target as string,
    actions,
    configPath,
    iface: registry.interface,
    contract: registry,
  };
}

export function renderJobRegistryPlan(plan: ModulePlan): string {
  if (plan.actions.length === 0) {
    return 'All tracked parameters already match the configuration.';
  }
  const lines: string[] = [];
  plan.actions.forEach((action, index) => {
    const data = plan.iface?.encodeFunctionData(action.method, action.args);
    lines.push(`${index + 1}. ${action.label}`);
    if (action.current !== undefined) {
      lines.push(`   Current: ${action.current}`);
    }
    if (action.desired !== undefined) {
      lines.push(`   Desired: ${action.desired}`);
    }
    action.notes?.forEach((note) => {
      lines.push(`   Note: ${note}`);
    });
    lines.push(`   Method: ${action.method}(${describeArgs(action.args)})`);
    if (data) {
      lines.push(`   Calldata: ${data}`);
    }
    lines.push('');
  });
  return lines.join('\n');
}
