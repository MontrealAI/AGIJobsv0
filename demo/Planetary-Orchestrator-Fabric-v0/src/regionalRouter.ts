import type {
  FabricEvent,
  JobRecord,
  NodeRuntimeState,
  ShardId,
  ShardRuntimeState,
} from './types';

export interface RegionalRouterOptions {
  readonly shard: ShardRuntimeState;
  readonly overflowThreshold: number;
}

export class RegionalRouter {
  constructor(
    private readonly options: RegionalRouterOptions,
    private readonly allocate: (
      job: JobRecord,
      shard: ShardId
    ) => NodeRuntimeState | undefined,
    private readonly requeue: (
      jobId: string,
      destination: ShardId,
      origin: ShardId
    ) => void,
    private readonly eventSink: (event: FabricEvent) => void
  ) {}

  public route(job: JobRecord, tick: number): NodeRuntimeState | undefined {
    const node = this.allocate(job, this.options.shard.id);
    if (node) {
      return node;
    }

    if (this.options.shard.queue.length < this.options.overflowThreshold) {
      return undefined;
    }

    if (this.options.shard.rerouteBudget <= 0) {
      return undefined;
    }

    const destinations: ShardId[] = [
      'earth',
      'mars',
      'luna',
      'helios',
      'edge',
    ].filter((shard) => shard !== this.options.shard.id);
    const destination =
      destinations[Math.floor(Math.random() * destinations.length)];
    this.requeue(job.id, destination, this.options.shard.id);
    this.options.shard.rerouteBudget = Math.max(
      0,
      this.options.shard.rerouteBudget - 0.05
    );
    this.eventSink({
      type: 'shard:spillover',
      tick,
      details: {
        jobId: job.id,
        origin: this.options.shard.id,
        destination,
        reason: 'router-overflow',
      },
    });
    return undefined;
  }
}
