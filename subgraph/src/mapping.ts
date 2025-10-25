import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';

import { JobCreated, JobFinalized } from '../generated/JobRegistry/JobRegistry';
import {
  StakeDeposited,
  StakeSlashed,
} from '../generated/StakeManager/StakeManager';
import { ValidationRevealed } from '../generated/ValidationModule/ValidationModule';
import {
  AgentProfileApproval as RegistryAgentProfileApproval,
  AgentProfileRegistered as RegistryAgentProfileRegistered,
  AgentProfileStatus as RegistryAgentProfileStatus,
  AgentProfileUpdated as RegistryAgentProfileUpdated,
  AgentSkillsSnapshot as RegistryAgentSkillsSnapshot,
  CredentialRuleUpdated as RegistryCredentialRuleUpdated,
  DomainRegistered as RegistryDomainRegistered,
  DomainStatusChanged as RegistryDomainStatusChanged,
  DomainUpdated as RegistryDomainUpdated,
  SkillRegistered as RegistrySkillRegistered,
  SkillUpdated as RegistrySkillUpdated,
  Phase6DomainRegistry,
} from '../generated/Phase6DomainRegistry/Phase6DomainRegistry';
import {
  Job,
  Phase6Domain,
  Phase6GlobalConfig,
  Phase6Registry,
  Phase6RegistryAgent,
  Phase6RegistryDomain,
  Phase6RegistrySkill,
  ProtocolStats,
  Stake,
  StakeAggregate,
  Validator,
  ValidatorVote,
} from '../generated/schema';

const ZERO = BigInt.zero();
const PROTOCOL_ID = 'agi-jobs';
const PHASE6_GLOBAL_ID = 'phase6-global';
const PHASE6_REGISTRY_ID = 'phase6-registry';

function safeDecrement(value: i32): i32 {
  return value > 0 ? value - 1 : 0;
}

function getOrCreateProtocol(): ProtocolStats {
  let stats = ProtocolStats.load(PROTOCOL_ID);
  if (stats == null) {
    stats = new ProtocolStats(PROTOCOL_ID);
    stats.totalJobs = 0;
    stats.openJobs = 0;
    stats.finalizedJobs = 0;
    stats.totalEscrowed = ZERO;
    stats.totalStaked = ZERO;
    stats.totalSlashed = ZERO;
    stats.totalValidatorVotes = 0;
    stats.updatedAtBlock = ZERO;
    stats.updatedAtTimestamp = ZERO;
  }
  return stats as ProtocolStats;
}

function touchProtocol(stats: ProtocolStats, event: ethereum.Event): void {
  stats.updatedAtBlock = event.block.number;
  stats.updatedAtTimestamp = event.block.timestamp;
}

function roleName(role: i32): string {
  if (role == 0) {
    return 'Agent';
  }
  if (role == 1) {
    return 'Validator';
  }
  if (role == 2) {
    return 'Platform';
  }
  return 'Unknown';
}

function stakeId(address: Address, role: string): string {
  return address.toHexString() + ':' + role;
}

function getOrCreateStakeAggregate(role: string): StakeAggregate {
  let aggregate = StakeAggregate.load(role);
  if (aggregate == null) {
    aggregate = new StakeAggregate(role);
    aggregate.role = role;
    aggregate.currentBalance = ZERO;
    aggregate.totalDeposited = ZERO;
    aggregate.totalSlashed = ZERO;
    aggregate.participantCount = 0;
    aggregate.updatedAtBlock = ZERO;
    aggregate.updatedAtTimestamp = ZERO;
  }
  return aggregate as StakeAggregate;
}

export function handleJobCreated(event: JobCreated): void {
  const jobId = event.params.jobId.toString();
  let job = Job.load(jobId);
  const assigned = !event.params.agent.equals(Address.zero());

  if (job == null) {
    job = new Job(jobId);
    job.jobId = event.params.jobId;
    job.employer = event.params.employer;
    job.reward = event.params.reward;
    job.stake = event.params.stake;
    job.fee = event.params.fee;
    job.escrowed = event.params.reward.plus(event.params.stake);
    job.validatorQuorum = 0;
    job.approvals = 0;
    job.rejections = 0;
    job.uri = event.params.uri;
    job.specHash = event.params.specHash;
    job.createdAtBlock = event.block.number;
    job.createdAtTimestamp = event.block.timestamp;
  }

  if (assigned) {
    job.assignedTo = event.params.agent;
    job.state = 'Assigned';
  } else {
    job.assignedTo = null;
    job.state = 'Open';
  }

  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;

  job.save();

  const stats = getOrCreateProtocol();
  stats.totalJobs += 1;
  stats.openJobs += 1;
  stats.totalEscrowed = stats.totalEscrowed.plus(job.escrowed);
  touchProtocol(stats, event);
  stats.save();
}

export function handleJobFinalized(event: JobFinalized): void {
  const jobId = event.params.jobId.toString();
  const job = Job.load(jobId);
  if (job == null) {
    return;
  }

  const previousEscrow = job.escrowed;
  job.state = 'Finalized';
  job.assignedTo = event.params.worker;
  job.escrowed = ZERO;
  job.finalizedAtBlock = event.block.number;
  job.finalizedAtTimestamp = event.block.timestamp;
  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;
  job.save();

  const stats = getOrCreateProtocol();
  if (stats.openJobs > 0) {
    stats.openJobs -= 1;
  }
  stats.finalizedJobs += 1;
  if (previousEscrow.gt(ZERO)) {
    stats.totalEscrowed = stats.totalEscrowed.minus(previousEscrow);
  }
  touchProtocol(stats, event);
  stats.save();
}

export function handleStakeDeposited(event: StakeDeposited): void {
  const role = roleName(event.params.role);
  const id = stakeId(event.params.user, role);
  let stake = Stake.load(id);
  const amount = event.params.amount;

  let wasEmpty = false;
  if (stake == null) {
    stake = new Stake(id);
    stake.user = event.params.user;
    stake.role = role;
    stake.currentBalance = ZERO;
    stake.totalDeposited = ZERO;
    stake.totalSlashed = ZERO;
    stake.updatedAtBlock = ZERO;
    stake.updatedAtTimestamp = ZERO;
    wasEmpty = true;
  } else if (stake.currentBalance.equals(ZERO)) {
    wasEmpty = true;
  }

  stake.currentBalance = stake.currentBalance.plus(amount);
  stake.totalDeposited = stake.totalDeposited.plus(amount);
  stake.updatedAtBlock = event.block.number;
  stake.updatedAtTimestamp = event.block.timestamp;
  stake.save();

  const aggregate = getOrCreateStakeAggregate(role);
  if (wasEmpty) {
    aggregate.participantCount += 1;
  }
  aggregate.currentBalance = aggregate.currentBalance.plus(amount);
  aggregate.totalDeposited = aggregate.totalDeposited.plus(amount);
  aggregate.updatedAtBlock = event.block.number;
  aggregate.updatedAtTimestamp = event.block.timestamp;
  aggregate.save();

  const stats = getOrCreateProtocol();
  stats.totalStaked = stats.totalStaked.plus(amount);
  touchProtocol(stats, event);
  stats.save();
}

export function handleStakeSlashed(event: StakeSlashed): void {
  const role = roleName(event.params.role);
  const id = stakeId(event.params.user, role);
  const stake = Stake.load(id);
  const slashAmount = event.params.employerShare
    .plus(event.params.treasuryShare)
    .plus(event.params.operatorShare)
    .plus(event.params.validatorShare)
    .plus(event.params.burnShare);

  let reduced = ZERO;
  if (stake != null) {
    const previousBalance = stake.currentBalance;
    if (slashAmount.ge(previousBalance)) {
      reduced = previousBalance;
      stake.currentBalance = ZERO;
    } else {
      reduced = slashAmount;
      stake.currentBalance = previousBalance.minus(slashAmount);
    }
    stake.totalSlashed = stake.totalSlashed.plus(slashAmount);
    stake.updatedAtBlock = event.block.number;
    stake.updatedAtTimestamp = event.block.timestamp;
    stake.save();

    const aggregate = getOrCreateStakeAggregate(role);
    const current = aggregate.currentBalance;
    const effectiveReduction = current.ge(reduced) ? reduced : current;
    if (previousBalance.gt(ZERO) && stake.currentBalance.equals(ZERO)) {
      if (aggregate.participantCount > 0) {
        aggregate.participantCount -= 1;
      }
    }
    aggregate.currentBalance = current.minus(effectiveReduction);
    aggregate.totalSlashed = aggregate.totalSlashed.plus(slashAmount);
    aggregate.updatedAtBlock = event.block.number;
    aggregate.updatedAtTimestamp = event.block.timestamp;
    aggregate.save();
  } else {
    const aggregate = getOrCreateStakeAggregate(role);
    aggregate.totalSlashed = aggregate.totalSlashed.plus(slashAmount);
    aggregate.updatedAtBlock = event.block.number;
    aggregate.updatedAtTimestamp = event.block.timestamp;
    aggregate.save();
  }

  const stats = getOrCreateProtocol();
  stats.totalSlashed = stats.totalSlashed.plus(slashAmount);
  if (reduced.gt(ZERO)) {
    stats.totalStaked = stats.totalStaked.minus(reduced);
  }
  touchProtocol(stats, event);
  stats.save();
}

export function handleValidatorVoted(event: ValidationRevealed): void {
  const jobId = event.params.jobId.toString();
  let job = Job.load(jobId);
  if (job == null) {
    job = new Job(jobId);
    job.jobId = event.params.jobId;
    job.employer = Address.zero();
    job.reward = ZERO;
    job.stake = ZERO;
    job.fee = ZERO;
    job.escrowed = ZERO;
    job.state = 'Unknown';
    job.validatorQuorum = 0;
    job.approvals = 0;
    job.rejections = 0;
    job.createdAtBlock = event.block.number;
    job.createdAtTimestamp = event.block.timestamp;
    job.updatedAtBlock = event.block.number;
    job.updatedAtTimestamp = event.block.timestamp;
  }

  const validatorId = event.params.validator.toHexString();
  let validator = Validator.load(validatorId);
  if (validator == null) {
    validator = new Validator(validatorId);
    validator.address = event.params.validator;
    validator.totalVotes = 0;
    validator.totalApprovals = 0;
    validator.totalRejections = 0;
  }
  const voteId = job.id + ':' + validatorId;
  let vote = ValidatorVote.load(voteId);
  let hadPrevious = false;
  let previousApproval = false;
  if (vote == null) {
    vote = new ValidatorVote(voteId);
    vote.job = job.id;
    vote.validator = validator.id;
  } else {
    hadPrevious = true;
    previousApproval = vote.approved;
  }

  if (hadPrevious) {
    job.validatorQuorum = safeDecrement(job.validatorQuorum);
    validator.totalVotes = safeDecrement(validator.totalVotes);
    if (previousApproval) {
      job.approvals = safeDecrement(job.approvals);
      validator.totalApprovals = safeDecrement(validator.totalApprovals);
    } else {
      job.rejections = safeDecrement(job.rejections);
      validator.totalRejections = safeDecrement(validator.totalRejections);
    }
  }

  job.validatorQuorum += 1;
  if (event.params.approve) {
    job.approvals += 1;
    validator.totalApprovals += 1;
  } else {
    job.rejections += 1;
    validator.totalRejections += 1;
  }
  validator.totalVotes += 1;
  validator.lastVotedAtBlock = event.block.number;
  validator.lastVotedAtTimestamp = event.block.timestamp;

  const stake = Stake.load(stakeId(event.params.validator, 'Validator'));
  if (stake != null) {
    validator.stake = stake.id;
  }
  validator.save();

  vote.approved = event.params.approve;
  vote.burnTxHash = event.params.burnTxHash;
  vote.txHash = event.transaction.hash;
  vote.logIndex = event.logIndex;
  vote.revealedAtBlock = event.block.number;
  vote.revealedAtTimestamp = event.block.timestamp;
  vote.save();

  if (job.state != 'Finalized') {
    job.state = 'Validating';
  }
  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;
  job.save();

  const stats = getOrCreateProtocol();
  if (!hadPrevious) {
    stats.totalValidatorVotes += 1;
  }
  touchProtocol(stats, event);
  stats.save();
}

function phase6DomainId(idValue: ethereum.Value): string {
  return idValue.toBytes().toHexString();
}

function getOrCreatePhase6Global(event: ethereum.Event): Phase6GlobalConfig {
  let global = Phase6GlobalConfig.load(PHASE6_GLOBAL_ID);
  if (global == null) {
    global = new Phase6GlobalConfig(PHASE6_GLOBAL_ID);
    global.l2SyncCadence = 0;
    global.manifestURI = '';
    global.updatedAtBlock = event.block.number;
    global.updatedAtTimestamp = event.block.timestamp;
    global.treasuryBufferBps = 0;
    global.circuitBreakerBps = 0;
    global.anomalyGracePeriod = 0;
    global.autoPauseEnabled = false;
    global.oversightCouncil = Address.zero();
    global.telemetryManifestHash = null;
    global.telemetryMetricsDigest = null;
    global.telemetryResilienceFloorBps = 0;
    global.telemetryAutomationFloorBps = 0;
    global.telemetryOversightWeightBps = 0;
    global.meshCoordinator = Address.zero();
    global.dataLake = Address.zero();
    global.identityBridge = Address.zero();
    global.infrastructureTopologyURI = '';
    global.infrastructureAutopilotCadence = 0;
    global.enforceDecentralizedInfra = false;
  }
  return global as Phase6GlobalConfig;
}

function upsertPhase6Domain(id: string, event: ethereum.Event): Phase6Domain {
  let domain = Phase6Domain.load(id);
  if (domain == null) {
    domain = new Phase6Domain(id);
    domain.registeredAtBlock = event.block.number;
    domain.registeredAtTimestamp = event.block.timestamp;
  }
  domain.updatedAtBlock = event.block.number;
  domain.updatedAtTimestamp = event.block.timestamp;
  return domain as Phase6Domain;
}

function registryDomainId(domainId: Bytes): string {
  return domainId.toHexString();
}

function registrySkillId(domainId: Bytes, skillId: Bytes): string {
  return domainId.toHexString() + ':' + skillId.toHexString();
}

function registryAgentEntityId(domainId: Bytes, agent: Address): string {
  return domainId.toHexString() + ':' + agent.toHexString();
}

function isZeroBytes(value: Bytes): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value[i] != 0) {
      return false;
    }
  }
  return true;
}

function getOrCreatePhase6Registry(event: ethereum.Event): Phase6Registry {
  let registry = Phase6Registry.load(PHASE6_REGISTRY_ID);
  if (registry == null) {
    registry = new Phase6Registry(PHASE6_REGISTRY_ID);
    registry.contract = event.address;
    registry.controller = Address.zero();
    registry.manifestHash = null;
    registry.updatedAtBlock = event.block.number;
    registry.updatedAtTimestamp = event.block.timestamp;
  } else {
    registry.contract = event.address;
    registry.updatedAtBlock = event.block.number;
    registry.updatedAtTimestamp = event.block.timestamp;
  }
  return registry as Phase6Registry;
}

function getOrCreatePhase6RegistryDomain(
  domainKey: Bytes,
  event: ethereum.Event,
): Phase6RegistryDomain {
  const id = registryDomainId(domainKey);
  let domain = Phase6RegistryDomain.load(id);
  if (domain == null) {
    const registry = getOrCreatePhase6Registry(event);
    registry.save();
    domain = new Phase6RegistryDomain(id);
    domain.registry = registry.id;
    domain.slug = id;
    domain.name = id;
    domain.metadataURI = '';
    domain.domainId = domainKey;
    domain.manifestHash = Bytes.fromHexString(
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ) as Bytes;
    domain.active = true;
    domain.credentialRequires = false;
    domain.credentialActive = false;
    domain.credentialAttestor = null;
    domain.credentialSchema = null;
    domain.credentialURI = null;
    domain.registeredAtBlock = event.block.number;
    domain.registeredAtTimestamp = event.block.timestamp;
  }
  domain.updatedAtBlock = event.block.number;
  domain.updatedAtTimestamp = event.block.timestamp;
  return domain as Phase6RegistryDomain;
}

function getOrCreatePhase6RegistryAgent(
  domain: Phase6RegistryDomain,
  agentAddress: Address,
  event: ethereum.Event,
): Phase6RegistryAgent {
  const id = registryAgentEntityId(domain.domainId, agentAddress);
  let agent = Phase6RegistryAgent.load(id);
  if (agent == null) {
    agent = new Phase6RegistryAgent(id);
    agent.domain = domain.id;
    agent.agent = agentAddress;
    agent.didURI = '';
    agent.manifestHash = Bytes.fromHexString(
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ) as Bytes;
    agent.credentialHash = null;
    agent.submitter = event.transaction.from;
    agent.approved = false;
    agent.active = true;
    agent.skillIds = [];
    agent.registeredAtBlock = event.block.number;
    agent.registeredAtTimestamp = event.block.timestamp;
  }
  agent.updatedAtBlock = event.block.number;
  agent.updatedAtTimestamp = event.block.timestamp;
  return agent as Phase6RegistryAgent;
}

function refreshRegistryAgentFromContract(
  contract: Phase6DomainRegistry,
  domainKey: Bytes,
  agentAddress: Address,
  agent: Phase6RegistryAgent,
): void {
  const profileResult = contract.try_getAgentProfile(agentAddress, domainKey);
  if (profileResult.reverted) {
    return;
  }
  const profile = profileResult.value.value0;
  const skills = profileResult.value.value1;
  agent.didURI = profile.didURI;
  agent.manifestHash = profile.manifestHash;
  agent.credentialHash = isZeroBytes(profile.credentialHash) ? null : profile.credentialHash;
  agent.submitter = profile.submitter;
  agent.approved = profile.approved;
  agent.active = profile.active;
  const normalizedSkills = new Array<Bytes>();
  for (let i = 0; i < skills.length; i++) {
    normalizedSkills.push(skills[i]);
  }
  agent.skillIds = normalizedSkills;
}

export function handlePhase6DomainRegistered(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = new Phase6Domain(id);
  domain.slug = params[1].value.toString();
  domain.name = params[2].value.toString();
  domain.metadataURI = params[3].value.toString();
  domain.subgraphEndpoint = params[7].value.toString();
  domain.validationModule = params[4].value.toAddress();
  domain.dataOracle = params[5].value.toAddress();
  domain.l2Gateway = params[6].value.toAddress();
  domain.executionRouter = params[8].value.toAddress();
  domain.heartbeatSeconds = params[9].value.toBigInt().toI32();
  domain.active = params[10].value.toBoolean();
  domain.manifestURI = params[3].value.toString();
  domain.agentOps = Address.zero();
  domain.dataPipeline = Address.zero();
  domain.credentialVerifier = Address.zero();
  domain.fallbackOperator = Address.zero();
  domain.controlPlaneURI = '';
  domain.autopilotCadenceSeconds = 0;
  domain.autopilotEnabled = false;
  domain.registeredAtBlock = event.block.number;
  domain.registeredAtTimestamp = event.block.timestamp;
  domain.updatedAtBlock = event.block.number;
  domain.updatedAtTimestamp = event.block.timestamp;
  domain.maxActiveJobs = 0;
  domain.maxQueueDepth = 0;
  domain.minStake = ZERO;
  domain.treasuryShareBps = 0;
  domain.circuitBreakerBps = 0;
  domain.requiresHumanValidation = false;
  domain.telemetryResilienceBps = 0;
  domain.telemetryAutomationBps = 0;
  domain.telemetryComplianceBps = 0;
  domain.settlementLatencySeconds = 0;
  domain.usesL2Settlement = false;
  domain.sentinelOracle = null;
  domain.settlementAsset = null;
  domain.telemetryMetricsDigest = null;
  domain.telemetryManifestHash = null;
  domain.save();
}

export function handlePhase6DomainUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = upsertPhase6Domain(id, event);
  domain.slug = params[1].value.toString();
  domain.name = params[2].value.toString();
  domain.metadataURI = params[3].value.toString();
  domain.validationModule = params[4].value.toAddress();
  domain.dataOracle = params[5].value.toAddress();
  domain.l2Gateway = params[6].value.toAddress();
  domain.subgraphEndpoint = params[7].value.toString();
  domain.executionRouter = params[8].value.toAddress();
  domain.heartbeatSeconds = params[9].value.toBigInt().toI32();
  domain.active = params[10].value.toBoolean();
  domain.manifestURI = params[3].value.toString();
  domain.save();
}

export function handlePhase6DomainInfrastructureUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = upsertPhase6Domain(id, event);
  domain.agentOps = params[1].value.toAddress();
  domain.dataPipeline = params[2].value.toAddress();
  domain.credentialVerifier = params[3].value.toAddress();
  domain.fallbackOperator = params[4].value.toAddress();
  domain.controlPlaneURI = params[5].value.toString();
  domain.autopilotCadenceSeconds = params[6].value.toBigInt().toI32();
  domain.autopilotEnabled = params[7].value.toBoolean();
  domain.save();
}

export function handlePhase6DomainStatusChanged(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = upsertPhase6Domain(id, event);
  domain.active = params[1].value.toBoolean();
  domain.save();
}

export function handlePhase6DomainOperationsUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = upsertPhase6Domain(id, event);
  domain.maxActiveJobs = params[1].value.toBigInt().toI32();
  domain.maxQueueDepth = params[2].value.toBigInt().toI32();
  domain.minStake = params[3].value.toBigInt();
  domain.treasuryShareBps = params[4].value.toI32();
  domain.circuitBreakerBps = params[5].value.toI32();
  domain.requiresHumanValidation = params[6].value.toBoolean();
  domain.save();
}

export function handlePhase6DomainTelemetryUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const id = phase6DomainId(params[0].value);
  const domain = upsertPhase6Domain(id, event);
  domain.telemetryResilienceBps = params[1].value.toI32();
  domain.telemetryAutomationBps = params[2].value.toI32();
  domain.telemetryComplianceBps = params[3].value.toI32();
  domain.settlementLatencySeconds = params[4].value.toBigInt().toI32();
  domain.usesL2Settlement = params[5].value.toBoolean();
  domain.sentinelOracle = params[6].value.toAddress();
  domain.settlementAsset = params[7].value.toAddress();
  domain.telemetryMetricsDigest = params[8].value.toBytes();
  domain.telemetryManifestHash = params[9].value.toBytes();
  domain.save();
}

export function handlePhase6GlobalConfigUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.iotOracleRouter = params[0].value.toAddress();
  global.defaultL2Gateway = params[1].value.toAddress();
  global.didRegistry = params[2].value.toAddress();
  global.treasuryBridge = params[3].value.toAddress();
  global.l2SyncCadence = params[4].value.toBigInt().toI32();
  global.manifestURI = params[5].value.toString();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6GlobalTelemetryUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.telemetryManifestHash = params[0].value.toBytes();
  global.telemetryMetricsDigest = params[1].value.toBytes();
  global.telemetryResilienceFloorBps = params[2].value.toI32();
  global.telemetryAutomationFloorBps = params[3].value.toI32();
  global.telemetryOversightWeightBps = params[4].value.toI32();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6GlobalInfrastructureUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.meshCoordinator = params[0].value.toAddress();
  global.dataLake = params[1].value.toAddress();
  global.identityBridge = params[2].value.toAddress();
  global.infrastructureTopologyURI = params[3].value.toString();
  global.infrastructureAutopilotCadence = params[4].value.toBigInt().toI32();
  global.enforceDecentralizedInfra = params[5].value.toBoolean();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6GlobalGuardsUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.treasuryBufferBps = params[0].value.toI32();
  global.circuitBreakerBps = params[1].value.toI32();
  global.anomalyGracePeriod = params[2].value.toI32();
  global.autoPauseEnabled = params[3].value.toBoolean();
  global.oversightCouncil = params[4].value.toAddress();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6SystemPauseUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.systemPause = params[0].value.toAddress();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6EscalationBridgeUpdated(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  global.escalationBridge = params[0].value.toAddress();
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6EscalationForwarded(event: ethereum.Event): void {
  const params = event.parameters;
  const global = getOrCreatePhase6Global(event);
  const target = params[0].value.toAddress();
  global.lastEscalationTarget = target;
  global.lastEscalationData = params[1].value.toBytes();
  global.lastEscalationResponse = params[2].value.toBytes();
  if (global.systemPause != null && Address.fromBytes(global.systemPause as Bytes).equals(target)) {
    global.lastEscalationKind = 'SystemPause';
  } else if (global.escalationBridge != null && Address.fromBytes(global.escalationBridge as Bytes).equals(target)) {
    global.lastEscalationKind = 'EscalationBridge';
  } else {
    global.lastEscalationKind = 'Unknown';
  }
  global.lastEscalationAtBlock = event.block.number;
  global.lastEscalationAtTimestamp = event.block.timestamp;
  global.updatedAtBlock = event.block.number;
  global.updatedAtTimestamp = event.block.timestamp;
  global.save();
}

export function handlePhase6RegistryDomainRegistered(event: RegistryDomainRegistered): void {
  const registry = getOrCreatePhase6Registry(event);
  registry.save();

  const domain = getOrCreatePhase6RegistryDomain(event.params.id, event);
  domain.slug = event.params.slug.toLowerCase();
  domain.name = event.params.name;
  domain.metadataURI = event.params.metadataURI;
  domain.domainId = event.params.id;
  domain.manifestHash = event.params.manifestHash;
  domain.active = true;
  domain.save();
}

export function handlePhase6RegistryDomainUpdated(event: RegistryDomainUpdated): void {
  const registry = getOrCreatePhase6Registry(event);
  registry.save();

  const domain = getOrCreatePhase6RegistryDomain(event.params.id, event);
  domain.slug = event.params.slug.toLowerCase();
  domain.name = event.params.name;
  domain.metadataURI = event.params.metadataURI;
  domain.manifestHash = event.params.manifestHash;
  domain.active = event.params.active;
  domain.save();
}

export function handlePhase6RegistryDomainStatusChanged(event: RegistryDomainStatusChanged): void {
  const domain = getOrCreatePhase6RegistryDomain(event.params.id, event);
  domain.active = event.params.active;
  domain.save();
}

export function handlePhase6RegistryCredentialRuleUpdated(event: RegistryCredentialRuleUpdated): void {
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.credentialRequires = event.params.requiresCredential;
  domain.credentialActive = event.params.active;
  domain.credentialAttestor = event.params.attestor;
  domain.credentialSchema = event.params.schemaId;
  domain.credentialURI = event.params.uri;
  domain.save();
}

export function handlePhase6RegistrySkillRegistered(event: RegistrySkillRegistered): void {
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const id = registrySkillId(event.params.domainId, event.params.skillId);
  let skill = Phase6RegistrySkill.load(id);
  if (skill == null) {
    skill = new Phase6RegistrySkill(id);
    skill.domain = domain.id;
    skill.skillId = event.params.skillId;
    skill.registeredAtBlock = event.block.number;
    skill.registeredAtTimestamp = event.block.timestamp;
  }
  skill.key = event.params.key;
  skill.label = event.params.label;
  skill.metadataURI = event.params.metadataURI;
  skill.requiresCredential = event.params.requiresCredential;
  skill.active = true;
  skill.updatedAtBlock = event.block.number;
  skill.updatedAtTimestamp = event.block.timestamp;
  skill.save();
}

export function handlePhase6RegistrySkillUpdated(event: RegistrySkillUpdated): void {
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const id = registrySkillId(event.params.domainId, event.params.skillId);
  let skill = Phase6RegistrySkill.load(id);
  if (skill == null) {
    skill = new Phase6RegistrySkill(id);
    skill.domain = domain.id;
    skill.skillId = event.params.skillId;
    skill.registeredAtBlock = event.block.number;
    skill.registeredAtTimestamp = event.block.timestamp;
  }
  skill.key = event.params.key;
  skill.label = event.params.label;
  skill.metadataURI = event.params.metadataURI;
  skill.requiresCredential = event.params.requiresCredential;
  skill.active = event.params.active;
  skill.updatedAtBlock = event.block.number;
  skill.updatedAtTimestamp = event.block.timestamp;
  skill.save();
}

export function handlePhase6RegistryAgentProfileRegistered(
  event: RegistryAgentProfileRegistered,
): void {
  const contract = Phase6DomainRegistry.bind(event.address);
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const agent = getOrCreatePhase6RegistryAgent(domain, event.params.agent, event);
  agent.didURI = event.params.didURI;
  agent.manifestHash = event.params.manifestHash;
  agent.submitter = event.transaction.from;
  agent.approved = false;
  agent.active = true;
  agent.skillIds = [];
  refreshRegistryAgentFromContract(contract, event.params.domainId, event.params.agent, agent);
  agent.save();
}

export function handlePhase6RegistryAgentProfileUpdated(event: RegistryAgentProfileUpdated): void {
  const contract = Phase6DomainRegistry.bind(event.address);
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const agent = getOrCreatePhase6RegistryAgent(domain, event.params.agent, event);
  agent.didURI = event.params.didURI;
  agent.manifestHash = event.params.manifestHash;
  refreshRegistryAgentFromContract(contract, event.params.domainId, event.params.agent, agent);
  agent.save();
}

export function handlePhase6RegistryAgentProfileApproval(event: RegistryAgentProfileApproval): void {
  const contract = Phase6DomainRegistry.bind(event.address);
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const agent = getOrCreatePhase6RegistryAgent(domain, event.params.agent, event);
  agent.approved = event.params.approved;
  refreshRegistryAgentFromContract(contract, event.params.domainId, event.params.agent, agent);
  agent.save();
}

export function handlePhase6RegistryAgentProfileStatus(event: RegistryAgentProfileStatus): void {
  const contract = Phase6DomainRegistry.bind(event.address);
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const agent = getOrCreatePhase6RegistryAgent(domain, event.params.agent, event);
  agent.active = event.params.active;
  refreshRegistryAgentFromContract(contract, event.params.domainId, event.params.agent, agent);
  agent.save();
}

export function handlePhase6RegistryAgentSkillsSnapshot(event: RegistryAgentSkillsSnapshot): void {
  const domain = getOrCreatePhase6RegistryDomain(event.params.domainId, event);
  domain.save();

  const agent = getOrCreatePhase6RegistryAgent(domain, event.params.agent, event);
  const normalized = new Array<Bytes>();
  const skillIds = event.params.skillIds;
  for (let i = 0; i < skillIds.length; i++) {
    normalized.push(skillIds[i]);
  }
  agent.skillIds = normalized;
  agent.save();
}
