import { CommitmentRecord, ValidatorIdentity } from './types';
import { validatorConfig } from './config';

export interface SlashingEvent {
  validator: ValidatorIdentity;
  penalty: bigint;
  reason: string;
  timestamp: number;
}

export class StakeManager {
  private events: SlashingEvent[] = [];

  slash(record: CommitmentRecord, reason: string): SlashingEvent {
    const penalty = (record.validator.stake * BigInt(validatorConfig.slashPenaltyBps)) / 10000n;
    record.validator.stake -= penalty;
    record.validator.misbehaviourCount += 1;
    const event: SlashingEvent = {
      validator: record.validator,
      penalty,
      reason,
      timestamp: Date.now(),
    };
    this.events.push(event);
    return event;
  }

  getEvents(): SlashingEvent[] {
    return [...this.events];
  }
}
