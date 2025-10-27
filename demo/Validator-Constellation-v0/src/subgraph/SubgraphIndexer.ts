import { EventBus, EventPayload, EventTopic } from "./EventBus";

export interface IndexedEvent extends EventPayload {
  blockNumber: number;
}

export class SubgraphIndexer {
  private readonly timeline: IndexedEvent[] = [];
  private blockNumber = 0;

  constructor(private readonly bus: EventBus) {
    this.bus.subscribe((event) => this.capture(event));
  }

  private capture(event: EventPayload): void {
    const indexed: IndexedEvent = { ...event, blockNumber: ++this.blockNumber };
    this.timeline.push(indexed);
  }

  query(topic: EventTopic): IndexedEvent[] {
    return this.timeline.filter((event) => event.topic === topic);
  }

  latest(): IndexedEvent | undefined {
    return this.timeline.at(-1);
  }
}
