import {
  RoundStarted as RoundStartedEvent,
  RoundFinalised as RoundFinalisedEvent,
  ValidatorSlashed as ValidatorSlashedEvent,
  DomainPaused as DomainPausedEvent,
  DomainResumed as DomainResumedEvent,
  SentinelAlert as SentinelAlertEvent,
} from '../generated/ValidatorConstellationDemo/ValidatorConstellationDemo';
import { RoundStarted, RoundFinalised, ValidatorSlashed, DomainStatus, SentinelAlert } from '../generated/schema';

export function handleRoundStarted(event: RoundStartedEvent): void {
  const entity = new RoundStarted(event.transaction.hash.toHex());
  entity.roundId = event.params.roundId;
  entity.domainId = event.params.domainId;
  entity.jobsRoot = event.params.jobsRoot;
  entity.jobCount = event.params.jobCount;
  entity.entropy = event.params.entropy;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleRoundFinalised(event: RoundFinalisedEvent): void {
  const entity = new RoundFinalised(event.transaction.hash.toHex());
  entity.roundId = event.params.roundId;
  entity.finalOutcome = event.params.finalOutcome;
  entity.approvals = event.params.approvals;
  entity.rejections = event.params.rejections;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleValidatorSlashed(event: ValidatorSlashedEvent): void {
  const entity = new ValidatorSlashed(event.transaction.hash.toHex().concat('-').concat(event.logIndex.toString()));
  entity.validator = event.params.validator;
  entity.penalty = event.params.penalty;
  entity.reason = event.params.reason;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}

export function handleDomainPaused(event: DomainPausedEvent): void {
  let entity = DomainStatus.load(event.params.domainId.toHex());
  if (!entity) {
    entity = new DomainStatus(event.params.domainId.toHex());
  }
  entity.paused = true;
  entity.reason = event.params.reason;
  entity.pauseTimestamp = event.block.timestamp;
  entity.save();
}

export function handleDomainResumed(event: DomainResumedEvent): void {
  let entity = DomainStatus.load(event.params.domainId.toHex());
  if (!entity) {
    entity = new DomainStatus(event.params.domainId.toHex());
  }
  entity.paused = false;
  entity.reason = '';
  entity.pauseTimestamp = event.block.timestamp;
  entity.save();
}

export function handleSentinelAlert(event: SentinelAlertEvent): void {
  const entity = new SentinelAlert(event.transaction.hash.toHex());
  entity.domainId = event.params.domainId;
  entity.reason = event.params.reason;
  entity.severity = event.params.severity.toI32();
  entity.reporter = event.params.reporter;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.save();
}
