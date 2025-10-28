import { Bytes } from '@graphprotocol/graph-ts';
import {
  ValidatorRegistered as ValidatorRegisteredEvent,
  ValidatorSlashed as ValidatorSlashedEvent,
  JobFinalized as JobFinalizedEvent,
  DomainPaused as DomainPausedEvent,
  DomainResumed as DomainResumedEvent,
  SentinelAlert as SentinelAlertEvent,
  ZKProofSubmitted as ZKProofSubmittedEvent,
} from '../generated/ValidatorConstellationDemo/ValidatorConstellationDemo';
import { ValidatorRegistered, ValidatorSlashed, JobFinalized, DomainPause, SentinelAlert, ZKProofSubmitted } from '../generated/schema';

export function handleValidatorRegistered(event: ValidatorRegisteredEvent): void {
  const entity = new ValidatorRegistered(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.validator = event.params.validator;
  entity.ensName = event.params.ensName;
  entity.stake = event.params.stake;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleValidatorSlashed(event: ValidatorSlashedEvent): void {
  const entity = new ValidatorSlashed(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.validator = event.params.validator;
  entity.ensName = event.params.ensName;
  entity.penalty = event.params.penalty;
  entity.reason = event.params.reason;
  entity.jobId = event.params.jobId;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleJobFinalized(event: JobFinalizedEvent): void {
  const entity = new JobFinalized(event.params.jobId + '-' + event.block.number.toString());
  entity.jobId = event.params.jobId;
  entity.outcome = event.params.outcome;
  entity.approvals = event.params.approvals.toI32();
  entity.rejections = event.params.rejections.toI32();
  entity.committee = changetype<Array<Bytes>>(event.params.committee);
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleDomainPaused(event: DomainPausedEvent): void {
  const entity = new DomainPause(event.params.domain + '-' + event.block.number.toString());
  entity.domain = event.params.domain;
  entity.paused = true;
  entity.reason = event.params.reason;
  entity.initiatedBy = event.params.by;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleDomainResumed(event: DomainResumedEvent): void {
  const entity = new DomainPause(event.params.domain + '-' + event.block.number.toString());
  entity.domain = event.params.domain;
  entity.paused = false;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleSentinelAlert(event: SentinelAlertEvent): void {
  const entity = new SentinelAlert(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.domain = event.params.domain;
  entity.reason = event.params.reason;
  entity.severity = event.params.severity;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleZKProofSubmitted(event: ZKProofSubmittedEvent): void {
  const entity = new ZKProofSubmitted(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.jobRoot = event.params.jobRoot;
  entity.jobIds = event.params.jobIds;
  entity.submittedBy = event.params.submittedBy;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}
