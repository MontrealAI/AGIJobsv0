export type EventTopic =
  | "ValidatorRegistered"
  | "ValidatorCommitted"
  | "ValidatorRevealed"
  | "ValidatorSlashed"
  | "BatchProofSubmitted"
  | "DomainPaused"
  | "DomainResumed"
  | "SentinelAlert";

export interface EventPayload {
  readonly topic: EventTopic;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

export type EventListener = (event: EventPayload) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();
  private readonly events: EventPayload[] = [];

  emit(topic: EventTopic, data: Record<string, unknown>): EventPayload {
    const event = { topic, data, timestamp: Date.now() } satisfies EventPayload;
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  all(topic?: EventTopic): EventPayload[] {
    return topic ? this.events.filter((event) => event.topic === topic) : [...this.events];
  }
}
