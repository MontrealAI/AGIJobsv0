import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';

import {
  JobCreated,
  JobFinalized,
  JobDomainTagged,
  JobDomainCleared,
} from '../generated/JobRegistry/JobRegistry';
import {
  StakeDeposited,
  StakeSlashed,
} from '../generated/StakeManager/StakeManager';
import { ValidationRevealed } from '../generated/ValidationModule/ValidationModule';
import {
  DomainRegistered,
  DomainMetadataUpdated,
  DomainRuntimeUpdated,
  DomainCapsUpdated,
  DomainStatusUpdated,
  DomainPaused,
  DomainResumed,
  SlugReassigned,
  Paused as RegistryPaused,
  Unpaused as RegistryUnpaused,
} from '../generated/DomainRegistry/DomainRegistry';
import {
  Job,
  ProtocolStats,
  Stake,
  StakeAggregate,
  Validator,
  ValidatorVote,
  Domain,
  DomainMetric,
  DomainRegistryState,
} from '../generated/schema';

const ZERO = BigInt.zero();
const PROTOCOL_ID = 'agi-jobs';
const DOMAIN_REGISTRY_STATE_ID = 'domain-registry';
const ZERO_ADDRESS = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);
const ZERO_BYTES = Bytes.fromHexString('0x00') as Bytes;

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

function getOrCreateDomain(id: string, event: ethereum.Event): Domain {
  let domain = Domain.load(id);
  if (domain == null) {
    domain = new Domain(id);
    domain.slug = '';
    domain.name = '';
    domain.metadataURI = null;
    domain.credentialSchema = ZERO_BYTES;
    domain.l2Network = ZERO_BYTES;
    domain.dispatcher = ZERO_ADDRESS;
    domain.oracle = ZERO_ADDRESS;
    domain.bridge = ZERO_ADDRESS;
    domain.l2Gateway = ZERO_ADDRESS;
    domain.minStake = ZERO;
    domain.resilienceFloor = 0;
    domain.maxConcurrentJobs = 0;
    domain.requiresHumanReview = false;
    domain.active = true;
    domain.paused = false;
    domain.createdAtBlock = event.block.number;
    domain.createdAtTimestamp = event.block.timestamp;
  }
  domain.updatedAtBlock = event.block.number;
  domain.updatedAtTimestamp = event.block.timestamp;
  return domain;
}

function getOrCreateDomainMetric(
  id: string,
  event: ethereum.Event
): DomainMetric {
  let metric = DomainMetric.load(id);
  let created = false;
  if (metric == null) {
    metric = new DomainMetric(id);
    metric.domain = id;
    metric.totalJobs = 0;
    metric.activeJobs = 0;
    metric.resilienceFloor = 0;
    metric.requiresHumanReview = false;
    created = true;
  }
  metric.updatedAtBlock = event.block.number;
  metric.updatedAtTimestamp = event.block.timestamp;
  if (created) {
    const domain = Domain.load(id);
    if (domain != null) {
      domain.metric = metric.id;
      domain.save();
    }
  }
  return metric;
}

function getRegistryState(event: ethereum.Event): DomainRegistryState {
  let state = DomainRegistryState.load(DOMAIN_REGISTRY_STATE_ID);
  if (state == null) {
    state = new DomainRegistryState(DOMAIN_REGISTRY_STATE_ID);
    state.paused = false;
    state.updatedAtBlock = event.block.number;
    state.updatedAtTimestamp = event.block.timestamp;
  }
  return state as DomainRegistryState;
}

function syncMetricFlags(metric: DomainMetric, domain: Domain): void {
  metric.resilienceFloor = domain.resilienceFloor;
  metric.requiresHumanReview = domain.requiresHumanReview;
}

function decrementActive(metric: DomainMetric): void {
  if (metric.activeJobs > 0) {
    metric.activeJobs -= 1;
  }
}

function jobIsActive(job: Job): boolean {
  return job.state != 'Finalized';
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

function removeJobFromDomain(
  job: Job,
  domainId: string | null,
  event: ethereum.Event,
  adjustTotal: boolean
): void {
  if (domainId == null) {
    return;
  }

  const metric = getOrCreateDomainMetric(domainId as string, event);
  if (adjustTotal && metric.totalJobs > 0) {
    metric.totalJobs -= 1;
  }

  if (jobIsActive(job)) {
    decrementActive(metric);
  }

  metric.save();
}

function addJobToDomain(
  job: Job,
  domain: Domain,
  event: ethereum.Event,
  isNewAssignment: boolean
): void {
  const metric = getOrCreateDomainMetric(domain.id, event);
  if (isNewAssignment) {
    metric.totalJobs += 1;
    if (jobIsActive(job)) {
      metric.activeJobs += 1;
    }
  }

  syncMetricFlags(metric, domain);
  metric.save();
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

  if (job.domain) {
    const metric = getOrCreateDomainMetric(job.domain as string, event);
    decrementActive(metric);
    metric.updatedAtBlock = event.block.number;
    metric.updatedAtTimestamp = event.block.timestamp;
    metric.save();
  }

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

export function handleJobDomainTagged(event: JobDomainTagged): void {
  const jobId = event.params.jobId.toString();
  let job = Job.load(jobId);
  if (job == null) {
    job = new Job(jobId);
    job.jobId = event.params.jobId;
    job.employer = Address.zero();
    job.createdAtBlock = event.block.number;
    job.createdAtTimestamp = event.block.timestamp;
    job.updatedAtBlock = event.block.number;
    job.updatedAtTimestamp = event.block.timestamp;
    job.reward = ZERO;
    job.stake = ZERO;
    job.fee = ZERO;
    job.escrowed = ZERO;
    job.state = 'Unknown';
    job.validatorQuorum = 0;
    job.approvals = 0;
    job.rejections = 0;
  }

  const previousDomain = job.domain;
  const newDomainId = event.params.domainId.toString();
  const isSameDomain = previousDomain == newDomainId;

  if (!isSameDomain) {
    removeJobFromDomain(job, previousDomain, event, true);
  }

  const domain = getOrCreateDomain(newDomainId, event);
  domain.metadataURI = event.params.metadataURI;
  domain.credentialSchema = event.params.credentialSchema;
  domain.dispatcher = event.params.dispatcher;
  domain.oracle = event.params.oracle;
  domain.bridge = event.params.bridge;
  domain.l2Gateway = event.params.l2Gateway;
  domain.minStake = event.params.minStake;
  domain.maxConcurrentJobs = event.params.maxConcurrentJobs.toI32();
  domain.requiresHumanReview = event.params.requiresHumanReview;
  domain.save();

  addJobToDomain(job, domain, event, !isSameDomain);

  job.domain = domain.id;
  job.domainKey = event.params.domainKey;
  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;
  job.save();
}

export function handleJobDomainCleared(event: JobDomainCleared): void {
  const jobId = event.params.jobId.toString();
  const job = Job.load(jobId);
  if (job == null) {
    return;
  }

  const previousDomain = job.domain;
  removeJobFromDomain(job, previousDomain, event, true);

  job.domain = null;
  job.domainKey = null;
  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;
  job.save();
}

export function handleDomainRegistered(event: DomainRegistered): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.name = event.params.name;
  domain.slug = event.params.slug;
  domain.save();

  const metric = getOrCreateDomainMetric(domain.id, event);
  syncMetricFlags(metric, domain);
  metric.save();
}

export function handleDomainMetadataUpdated(
  event: DomainMetadataUpdated
): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.name = event.params.name;
  domain.metadataURI = event.params.metadataURI;
  domain.credentialSchema = event.params.credentialSchema;
  domain.save();

  const metric = getOrCreateDomainMetric(domain.id, event);
  syncMetricFlags(metric, domain);
  metric.save();
}

export function handleDomainRuntimeUpdated(event: DomainRuntimeUpdated): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.dispatcher = event.params.dispatcher;
  domain.oracle = event.params.oracle;
  domain.bridge = event.params.bridge;
  domain.l2Gateway = event.params.l2Gateway;
  domain.l2Network = event.params.l2Network;
  domain.save();
}

export function handleDomainCapsUpdated(event: DomainCapsUpdated): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.minStake = event.params.minStake;
  domain.resilienceFloor = event.params.resilienceFloor.toI32();
  domain.maxConcurrentJobs = event.params.maxConcurrentJobs.toI32();
  domain.requiresHumanReview = event.params.requiresHumanReview;
  domain.save();

  const metric = getOrCreateDomainMetric(domain.id, event);
  syncMetricFlags(metric, domain);
  metric.save();
}

export function handleDomainStatusUpdated(event: DomainStatusUpdated): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.active = event.params.active;
  domain.save();
}

export function handleDomainPaused(event: DomainPaused): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.paused = true;
  domain.save();
}

export function handleDomainResumed(event: DomainResumed): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.paused = false;
  domain.save();
}

export function handleSlugReassigned(event: SlugReassigned): void {
  const domainId = event.params.domainId.toString();
  const domain = getOrCreateDomain(domainId, event);
  domain.slug = event.params.slug;
  domain.save();
}

export function handleRegistryPaused(event: RegistryPaused): void {
  const state = getRegistryState(event);
  state.paused = true;
  state.updatedAtBlock = event.block.number;
  state.updatedAtTimestamp = event.block.timestamp;
  state.save();
}

export function handleRegistryUnpaused(event: RegistryUnpaused): void {
  const state = getRegistryState(event);
  state.paused = false;
  state.updatedAtBlock = event.block.number;
  state.updatedAtTimestamp = event.block.timestamp;
  state.save();
}
