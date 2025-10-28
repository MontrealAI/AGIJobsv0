export type EventType =
  | "StakeDeposited"
  | "ValidatorRegistered"
  | "ValidatorSlashed"
  | "CommitSubmitted"
  | "VoteRevealed"
  | "RoundFinalized"
  | "ZkBatchFinalized"
  | "SentinelAlert"
  | "DomainPaused"
  | "DomainResumed";

export interface EventRecord<T = unknown> {
  readonly type: EventType;
  readonly timestamp: number;
  readonly payload: T;
}

export class EventIndexer {
  private readonly events: EventRecord[] = [];

  recordEvent<T>(type: EventType, payload: T) {
    const record: EventRecord<T> = {
      type,
      timestamp: Date.now(),
      payload,
    };
    this.events.push(record);
  }

  getEvents(filterType?: EventType): EventRecord[] {
    if (!filterType) {
      return [...this.events];
    }
    return this.events.filter((event) => event.type === filterType);
  }

  toJSON() {
    return this.events.map((event) => ({
      type: event.type,
      timestamp: event.timestamp,
      payload: event.payload,
    }));
  }
}
