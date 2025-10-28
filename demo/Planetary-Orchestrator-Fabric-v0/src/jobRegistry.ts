import { DEFAULT_JOB_CATEGORIES, SHARDS } from './config';
import type {
  FabricEvent,
  JobPayload,
  JobRecord,
  RuntimeMetrics,
  SerializedJob,
  ShardId,
  ShardRuntimeState,
} from './types';

export interface JobRegistryOptions {
  readonly initialTick?: number;
  readonly randomSeed?: number;
}

export class JobRegistry {
  private readonly shards: Map<ShardId, ShardRuntimeState> = new Map();

  private readonly jobs: Map<string, JobRecord> = new Map();

  private readonly metrics: RuntimeMetrics;

  private seedCounter = 0;

  constructor(
    private readonly eventSink: (event: FabricEvent) => void,
    options: JobRegistryOptions = {}
  ) {
    SHARDS.forEach((id) => {
      this.shards.set(id, {
        id,
        queue: [],
        completed: 0,
        failed: 0,
        spilloversOut: 0,
        spilloversIn: 0,
        rerouteBudget: 0,
        paused: false,
        backlogHistory: [],
      });
    });

    this.metrics = {
      tick: options.initialTick ?? 0,
      jobsSubmitted: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      totalLatency: 0,
      reassignments: 0,
      spillovers: 0,
    };
  }

  public getMetrics(): RuntimeMetrics {
    return this.metrics;
  }

  public getSeedCount(): number {
    return this.seedCounter;
  }

  public getShardState(id: ShardId): ShardRuntimeState {
    const shard = this.shards.get(id);
    if (!shard) {
      throw new Error(`Unknown shard ${id}`);
    }
    return shard;
  }

  public getJob(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  public getShardQueues(): Record<ShardId, string[]> {
    const queues: Record<ShardId, string[]> = {
      earth: [],
      mars: [],
      luna: [],
      helios: [],
      edge: [],
    };
    this.shards.forEach((shard, id) => {
      queues[id] = [...shard.queue];
    });
    return queues;
  }

  public listJobs(): JobRecord[] {
    return [...this.jobs.values()];
  }

  public upsertShardState(state: ShardRuntimeState): void {
    this.shards.set(state.id, state);
  }

  public submitJob(
    payload: JobPayload,
    shard: ShardId,
    tick: number,
    spilloverFrom?: ShardId
  ): JobRecord {
    const index = this.seedCounter;
    const jobId = this.generateJobId(index, shard);
    const job = this.registerJob({
      id: jobId,
      shard,
      payload,
      submittedAt: tick,
      retries: 0,
      spilloverFrom: spilloverFrom ?? null,
    });
    this.seedCounter = Math.max(this.seedCounter, index + 1);
    return job;
  }

  public seedJobs(
    totalCount: number,
    startIndex = this.seedCounter,
    tick = this.metrics.tick
  ): void {
    for (let offset = 0; offset < totalCount; offset += 1) {
      const index = startIndex + offset;
      const shard = SHARDS[index % SHARDS.length];
      const category =
        DEFAULT_JOB_CATEGORIES[index % DEFAULT_JOB_CATEGORIES.length];
      const jobId = this.generateJobId(index, shard);
      if (this.jobs.has(jobId)) {
        continue;
      }
      const payload = this.buildSeedPayload(index, shard, category);
      this.registerJob({
        id: jobId,
        shard,
        payload,
        submittedAt: tick,
        retries: 0,
        spilloverFrom: null,
      });
    }
    const nextCounter = startIndex + totalCount;
    if (nextCounter > this.seedCounter) {
      this.seedCounter = nextCounter;
    }
  }

  public exportSerializedJobs(): SerializedJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.status !== 'completed')
      .sort((a, b) => {
        if (a.submittedAt !== b.submittedAt) {
          return a.submittedAt - b.submittedAt;
        }
        return a.id.localeCompare(b.id);
      })
      .map(
        (job) =>
          [
            job.id,
            job.shard,
            job.submittedAt,
            job.payload.title,
            job.payload.category,
            job.payload.energyBudget,
            job.retries,
            job.spilloverFrom ?? null,
          ] satisfies SerializedJob
      );
  }

  private estimateWorkload(payload: JobPayload): number {
    const base = payload.energyBudget;
    const categoryWeight = DEFAULT_JOB_CATEGORIES.indexOf(payload.category) + 1;
    return base * categoryWeight;
  }

  private generateJobId(index: number, shard: ShardId): string {
    return `mission-${shard}-${index.toString().padStart(6, '0')}`;
  }

  private computeEnergyBudget(
    index: number,
    category: JobPayload['category'],
    shard: ShardId
  ): number {
    const shardWeight = SHARDS.indexOf(shard) + 1;
    const categoryWeight = DEFAULT_JOB_CATEGORIES.indexOf(category) + 1;
    const envelope = (index + shardWeight * 3 + categoryWeight * 5) % 7;
    return 6 + envelope; // Deterministic band within [6, 12]
  }

  private buildSeedPayload(
    index: number,
    shard: ShardId,
    category: JobPayload['category']
  ): JobPayload {
    const energyBudget = this.computeEnergyBudget(index, category, shard);
    return {
      title: `Mission-${shard.toUpperCase()}-${index
        .toString()
        .padStart(6, '0')}`,
      category,
      energyBudget,
      instructions: `Execute ${category} duties for shard ${shard.toUpperCase()} (seed ${index}). Maintain deterministic orchestration guarantees.`,
      metadata: {
        seedIndex: index,
        shard,
        deterministic: true,
        governance: 'owner-signed',
      },
    } satisfies JobPayload;
  }

  private registerJob(params: {
    readonly id: string;
    readonly shard: ShardId;
    readonly payload: JobPayload;
    readonly submittedAt: number;
    readonly retries?: number;
    readonly spilloverFrom: ShardId | null;
  }): JobRecord {
    if (this.jobs.has(params.id)) {
      return this.jobs.get(params.id)!;
    }
    const workRequired = this.estimateWorkload(params.payload);
    const job: JobRecord = {
      id: params.id,
      shard: params.shard,
      submittedAt: params.submittedAt,
      payload: params.payload,
      status: 'pending',
      assignedNodeId: undefined,
      progress: 0,
      workRequired,
      workRemaining: workRequired,
      completedAt: undefined,
      retries: params.retries ?? 0,
      spilloverFrom: params.spilloverFrom ?? undefined,
    };
    this.jobs.set(job.id, job);
    const shardState = this.getShardState(job.shard);
    if (!shardState.queue.includes(job.id)) {
      shardState.queue.push(job.id);
      shardState.backlogHistory.push(shardState.queue.length);
    }
    this.eventSink({
      type: 'job:submitted',
      tick: params.submittedAt,
      details: {
        jobId: job.id,
        shard: job.shard,
        category: job.payload.category,
        spilloverFrom: job.spilloverFrom,
      },
    });
    this.metrics.jobsSubmitted += 1;
    return job;
  }

  public assignJob(jobId: string, nodeId: string, tick: number): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Cannot assign missing job ${jobId}`);
    }
    if (job.status === 'completed') {
      return;
    }
    job.status = 'assigned';
    job.assignedNodeId = nodeId;
    this.metrics.reassignments += job.retries > 0 ? 1 : 0;
    this.eventSink({
      type: 'job:assigned',
      tick,
      details: { jobId, nodeId, shard: job.shard, retries: job.retries },
    });
  }

  public completeJob(jobId: string, tick: number): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Cannot complete missing job ${jobId}`);
    }
    job.status = 'completed';
    job.completedAt = tick;
    job.progress = 1;
    job.workRemaining = 0;
    this.metrics.jobsCompleted += 1;
    this.metrics.totalLatency += tick - job.submittedAt;
    const shardState = this.getShardState(job.shard);
    shardState.completed += 1;
    shardState.queue = shardState.queue.filter((id) => id !== jobId);
    shardState.backlogHistory.push(shardState.queue.length);
    this.eventSink({
      type: 'job:completed',
      tick,
      details: { jobId, shard: job.shard, latency: tick - job.submittedAt },
    });
  }

  public failJob(jobId: string, tick: number, reason: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Cannot fail missing job ${jobId}`);
    }
    job.status = 'failed';
    job.progress = 0;
    job.workRemaining = job.workRequired;
    job.retries += 1;
    job.assignedNodeId = undefined;
    this.metrics.jobsFailed += 1;
    const shardState = this.getShardState(job.shard);
    shardState.failed += 1;
    shardState.queue = shardState.queue.filter((id) => id !== jobId);
    shardState.backlogHistory.push(shardState.queue.length);
    this.eventSink({
      type: 'job:failed',
      tick,
      details: { jobId, shard: job.shard, reason },
    });
  }

  public interruptJob(jobId: string, tick: number, reason: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Cannot interrupt missing job ${jobId}`);
    }
    job.status = 'pending';
    job.progress = 0;
    job.workRemaining = job.workRequired;
    job.retries += 1;
    job.assignedNodeId = undefined;
    this.metrics.reassignments += 1;
    const shardState = this.getShardState(job.shard);
    if (!shardState.queue.includes(jobId)) {
      shardState.queue.unshift(jobId);
    }
    shardState.backlogHistory.push(shardState.queue.length);
    this.eventSink({
      type: 'job:interrupted',
      tick,
      details: { jobId, shard: job.shard, reason, retries: job.retries },
    });
  }

  public requeueJob(
    jobId: string,
    targetShard: ShardId,
    tick: number,
    originShard?: ShardId
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Cannot requeue missing job ${jobId}`);
    }
    job.status = 'pending';
    job.assignedNodeId = undefined;
    job.spilloverFrom = originShard ?? job.spilloverFrom ?? job.shard;
    job.shard = targetShard;
    const shardState = this.getShardState(targetShard);
    shardState.queue.push(job.id);
    shardState.backlogHistory.push(shardState.queue.length);
    this.metrics.spillovers +=
      originShard && originShard !== targetShard ? 1 : 0;
    if (originShard && originShard !== targetShard) {
      const originState = this.getShardState(originShard);
      originState.spilloversOut += 1;
      shardState.spilloversIn += 1;
      this.eventSink({
        type: 'shard:spillover',
        tick,
        details: { jobId, origin: originShard, destination: targetShard },
      });
    }
  }

  public advanceTick(): void {
    this.metrics.tick += 1;
    this.shards.forEach((shard) => {
      shard.backlogHistory.push(shard.queue.length);
    });
  }

  public adoptSnapshot(snapshot: {
    readonly jobsSeedCount: number;
    readonly jobs: SerializedJob[];
    readonly shardQueues: Record<ShardId, string[]>;
    readonly metrics: RuntimeMetrics;
    readonly shards: Record<ShardId, ShardRuntimeState>;
  }): void {
    this.jobs.clear();
    this.shards.clear();
    this.seedCounter = snapshot.jobsSeedCount;
    snapshot.jobs.forEach((entry) => {
      const [
        jobId,
        shard,
        submittedAt,
        title,
        category,
        energyBudget,
        retries,
        spillover,
      ] = entry;
      const payload: JobPayload = {
        title,
        category,
        energyBudget,
        instructions: `Resume ${category} operations for ${shard.toUpperCase()}.`,
      };
      const workRequired = this.estimateWorkload(payload);
      const restored: JobRecord = {
        id: jobId,
        shard,
        submittedAt,
        payload,
        status: 'pending',
        assignedNodeId: undefined,
        progress: 0,
        workRequired,
        workRemaining: workRequired,
        completedAt: undefined,
        retries,
        spilloverFrom: spillover ?? undefined,
      };
      this.jobs.set(jobId, restored);
    });
    Object.entries(snapshot.shards).forEach(([id, shard]) => {
      this.shards.set(id as ShardId, {
        ...shard,
        queue: [...snapshot.shardQueues[id as ShardId]],
        backlogHistory: [...shard.backlogHistory],
      });
    });
    this.metrics.tick = snapshot.metrics.tick;
    this.metrics.jobsSubmitted = snapshot.metrics.jobsSubmitted;
    this.metrics.jobsCompleted = snapshot.metrics.jobsCompleted;
    this.metrics.jobsFailed = snapshot.metrics.jobsFailed;
    this.metrics.totalLatency = snapshot.metrics.totalLatency;
    this.metrics.reassignments = snapshot.metrics.reassignments;
    this.metrics.spillovers = snapshot.metrics.spillovers;
  }
}
