import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  JobCreated,
  JobFinalized,
} from "../generated/JobRegistry/JobRegistry";
import {
  StakeDeposited,
  StakeSlashed,
} from "../generated/StakeManager/StakeManager";
import {
  ValidationRevealed,
} from "../generated/ValidationModule/ValidationModule";
import {
  Job,
  ProtocolStats,
  Stake,
  StakeAggregate,
  Validator,
  ValidatorVote,
} from "../generated/schema";

const ZERO = BigInt.zero();
const PROTOCOL_ID = "agi-jobs";

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
    return "Agent";
  }
  if (role == 1) {
    return "Validator";
  }
  if (role == 2) {
    return "Platform";
  }
  return "Unknown";
}

function stakeId(address: Address, role: string): string {
  return address.toHexString() + ":" + role;
}

function getOrCreateStakeAggregate(
  role: string,
): StakeAggregate {
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
  if (job == null) {
    job = new Job(jobId);
    job.jobId = event.params.jobId;
    job.employer = event.params.employer;
    job.reward = event.params.reward;
    job.stake = event.params.stake;
    job.fee = event.params.fee;
    job.escrowed = event.params.reward.plus(event.params.stake);
    job.state = "Created";
    job.validatorQuorum = 0;
    job.approvals = 0;
    job.rejections = 0;
    job.uri = event.params.uri;
    job.specHash = event.params.specHash;
    job.createdAtBlock = event.block.number;
    job.createdAtTimestamp = event.block.timestamp;
  }

  if (!event.params.agent.equals(Address.zero())) {
    job.assignedTo = event.params.agent;
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
  job.state = "Finalized";
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
    job.state = "Unknown";
    job.validatorQuorum = 0;
    job.approvals = 0;
    job.rejections = 0;
    job.createdAtBlock = event.block.number;
    job.createdAtTimestamp = event.block.timestamp;
    job.updatedAtBlock = event.block.number;
    job.updatedAtTimestamp = event.block.timestamp;
  }

  job.validatorQuorum += 1;
  if (event.params.approve) {
    job.approvals += 1;
  } else {
    job.rejections += 1;
  }
  job.updatedAtBlock = event.block.number;
  job.updatedAtTimestamp = event.block.timestamp;
  job.save();

  const validatorId = event.params.validator.toHexString();
  let validator = Validator.load(validatorId);
  if (validator == null) {
    validator = new Validator(validatorId);
    validator.address = event.params.validator;
    validator.totalVotes = 0;
    validator.totalApprovals = 0;
    validator.totalRejections = 0;
  }
  validator.totalVotes += 1;
  if (event.params.approve) {
    validator.totalApprovals += 1;
  } else {
    validator.totalRejections += 1;
  }
  validator.lastVotedAtBlock = event.block.number;
  validator.lastVotedAtTimestamp = event.block.timestamp;

  const stake = Stake.load(stakeId(event.params.validator, "Validator"));
  if (stake != null) {
    validator.stake = stake.id;
  }
  validator.save();

  const voteId =
    event.transaction.hash.toHexString() + ":" + event.logIndex.toString();
  const vote = new ValidatorVote(voteId);
  vote.job = job.id;
  vote.validator = validator.id;
  vote.approved = event.params.approve;
  vote.burnTxHash = event.params.burnTxHash;
  vote.revealedAtBlock = event.block.number;
  vote.revealedAtTimestamp = event.block.timestamp;
  vote.save();

  const stats = getOrCreateProtocol();
  stats.totalValidatorVotes += 1;
  touchProtocol(stats, event);
  stats.save();
}
