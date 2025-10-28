import {
  FabricEvent,
  LedgerCheckpoint,
  LedgerEventEntry,
  LedgerNodeTotals,
  LedgerSnapshot,
  LedgerSnapshotContext,
  LedgerShardTotals,
  RegistryEvent,
  ShardId,
} from './types';

interface SpilloverKey {
  from: ShardId;
  to: ShardId;
}

function spilloverKeyToString(key: SpilloverKey): string {
  return `${key.from}__${key.to}`;
}

function parseSpilloverKey(serialised: string): SpilloverKey {
  const [from, to] = serialised.split('__');
  return { from, to };
}

function cloneShardTotals(totals: LedgerShardTotals): LedgerShardTotals {
  return { ...totals };
}

function cloneNodeTotals(totals: LedgerNodeTotals): LedgerNodeTotals {
  return { ...totals };
}

export class PlanetaryLedger {
  private readonly shardTotals: Map<ShardId, LedgerShardTotals> = new Map();
  private readonly nodeTotals: Map<string, LedgerNodeTotals> = new Map();
  private readonly spillovers: Map<string, number> = new Map();
  private readonly events: LedgerEventEntry[] = [];
  private readonly maxEvents: number;
  private totalEvents = 0;
  private ownerEvents = 0;
  private firstTick?: number;
  private lastTick?: number;

  constructor(maxEvents = 2048) {
    this.maxEvents = maxEvents;
  }

  reset(): void {
    this.shardTotals.clear();
    this.nodeTotals.clear();
    this.spillovers.clear();
    this.events.length = 0;
    this.totalEvents = 0;
    this.ownerEvents = 0;
    this.firstTick = undefined;
    this.lastTick = undefined;
  }

  restore(checkpoint: LedgerCheckpoint | undefined): void {
    this.reset();
    if (!checkpoint) {
      return;
    }
    for (const [shardId, totals] of Object.entries(checkpoint.shards)) {
      this.shardTotals.set(shardId, cloneShardTotals(totals));
    }
    for (const [nodeId, totals] of Object.entries(checkpoint.nodes)) {
      this.nodeTotals.set(nodeId, cloneNodeTotals(totals));
    }
    for (const [key, count] of Object.entries(checkpoint.flows)) {
      this.spillovers.set(key, count);
    }
    this.events.push(...checkpoint.events.map((entry) => ({ ...entry })));
    this.totalEvents = checkpoint.totalEvents ?? this.events.length;
    this.ownerEvents = checkpoint.ownerEvents ?? 0;
    this.firstTick = checkpoint.firstTick;
    this.lastTick = checkpoint.lastTick;
  }

  serialize(): LedgerCheckpoint {
    const shards: Record<ShardId, LedgerShardTotals> = {};
    for (const [shardId, totals] of this.shardTotals.entries()) {
      shards[shardId] = cloneShardTotals(totals);
    }
    const nodes: Record<string, LedgerNodeTotals> = {};
    for (const [nodeId, totals] of this.nodeTotals.entries()) {
      nodes[nodeId] = cloneNodeTotals(totals);
    }
    const flows: Record<string, number> = {};
    for (const [key, count] of this.spillovers.entries()) {
      flows[key] = count;
    }
    return {
      shards,
      nodes,
      flows,
      events: this.events.map((entry) => ({ ...entry })),
      totalEvents: this.totalEvents,
      ownerEvents: this.ownerEvents,
      firstTick: this.firstTick,
      lastTick: this.lastTick,
    };
  }

  recordRegistryEvent(event: RegistryEvent, tick: number): void {
    switch (event.type) {
      case 'job.created':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.submitted += 1;
        });
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          jobId: event.job.id,
        });
        break;
      case 'job.requeued':
        if (event.job.assignedNodeId) {
          this.bumpNodeTotals(event.job.assignedNodeId, event.shard, (totals) => {
            totals.reassignments += 1;
          });
        }
        this.bumpShardTotals(event.shard, (totals) => {
          totals.reassignments += 1;
        });
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          originShard: event.origin,
          jobId: event.job.id,
        });
        break;
      case 'job.spillover':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.spilloversIn += 1;
        });
        this.bumpShardTotals(event.from, (totals) => {
          totals.spilloversOut += 1;
        });
        this.bumpSpillover({ from: event.from, to: event.shard });
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          originShard: event.from,
          jobId: event.job.id,
        });
        break;
      case 'job.assigned':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.assigned += 1;
        });
        this.bumpNodeTotals(event.nodeId, event.shard, (totals) => {
          totals.assignments += 1;
        });
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          nodeId: event.nodeId,
          jobId: event.job.id,
        });
        break;
      case 'job.completed':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.completed += 1;
        });
        if (event.job.assignedNodeId) {
          this.bumpNodeTotals(event.job.assignedNodeId, event.shard, (totals) => {
            totals.completions += 1;
          });
        }
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          nodeId: event.job.assignedNodeId,
          jobId: event.job.id,
        });
        break;
      case 'job.failed':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.failed += 1;
        });
        if (event.job.assignedNodeId) {
          this.bumpNodeTotals(event.job.assignedNodeId, event.shard, (totals) => {
            totals.failures += 1;
          });
        }
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          nodeId: event.job.assignedNodeId,
          jobId: event.job.id,
          reason: event.reason,
        });
        break;
      case 'job.cancelled':
        this.bumpShardTotals(event.shard, (totals) => {
          totals.cancelled += 1;
        });
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          jobId: event.jobId,
          reason: event.reason,
        });
        break;
      case 'node.heartbeat':
      case 'node.offline':
        this.pushEvent({
          tick,
          type: event.type,
          shard: event.shard,
          nodeId: event.nodeId,
          reason: 'reason' in event ? event.reason : undefined,
        });
        break;
    }
  }

  recordFabricEvent(event: FabricEvent): void {
    if (event.type.startsWith('job.')) {
      return;
    }
    if (event.type.startsWith('owner.')) {
      this.ownerEvents += 1;
    }
    this.pushEvent({
      tick: event.tick,
      type: event.type,
      reason: typeof event.data?.reason === 'string' ? (event.data?.reason as string) : undefined,
    });
  }

  snapshot(context: LedgerSnapshotContext): LedgerSnapshot {
    const shards: Record<ShardId, LedgerShardTotals> = {};
    for (const [shardId, totals] of this.shardTotals.entries()) {
      shards[shardId] = cloneShardTotals(totals);
    }
    const nodes: Record<string, LedgerNodeTotals> = {};
    for (const [nodeId, totals] of this.nodeTotals.entries()) {
      nodes[nodeId] = cloneNodeTotals(totals);
    }
    const flows = Array.from(this.spillovers.entries()).map(([key, count]) => ({
      ...parseSpilloverKey(key),
      count,
    }));

    const totals = Object.values(shards).reduce(
      (acc, entry) => {
        acc.submitted += entry.submitted;
        acc.assigned += entry.assigned;
        acc.completed += entry.completed;
        acc.failed += entry.failed;
        acc.cancelled += entry.cancelled;
        acc.spilloversOut += entry.spilloversOut;
        acc.spilloversIn += entry.spilloversIn;
        acc.reassignments += entry.reassignments;
        return acc;
      },
      {
        submitted: 0,
        assigned: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        spilloversOut: 0,
        spilloversIn: 0,
        reassignments: 0,
      }
    );

    const invariants = this.computeInvariants(totals, context);

    return {
      tick: context.tick,
      totals,
      shards,
      nodes,
      flows,
      events: this.events.map((entry) => ({ ...entry })),
      totalEvents: this.totalEvents,
      ownerEvents: this.ownerEvents,
      firstTick: this.firstTick,
      lastTick: this.lastTick,
      queueDepthByShard: context.queueDepthByShard,
      pendingJobs: context.pendingJobs,
      runningJobs: context.runningJobs,
      systemPaused: context.systemPaused,
      pausedShards: [...context.pausedShards],
      invariants,
    };
  }

  private computeInvariants(
    totals: {
      submitted: number;
      assigned: number;
      completed: number;
      failed: number;
      cancelled: number;
      spilloversOut: number;
      spilloversIn: number;
      reassignments: number;
    },
    context: LedgerSnapshotContext
  ): { id: string; ok: boolean; message: string }[] {
    const invariants: { id: string; ok: boolean; message: string }[] = [];

    const submittedMatches = totals.submitted === context.metrics.jobsSubmitted;
    invariants.push({
      id: 'ledger.jobsSubmitted',
      ok: submittedMatches,
      message: submittedMatches
        ? 'Ledger submissions align with orchestrator metrics.'
        : `Ledger submissions (${totals.submitted}) differ from orchestrator metrics (${context.metrics.jobsSubmitted}).`,
    });

    const completedMatches = totals.completed === context.metrics.jobsCompleted;
    invariants.push({
      id: 'ledger.jobsCompleted',
      ok: completedMatches,
      message: completedMatches
        ? 'Ledger completions align with orchestrator metrics.'
        : `Ledger completions (${totals.completed}) differ from orchestrator metrics (${context.metrics.jobsCompleted}).`,
    });

    const failedMatches = totals.failed === context.metrics.jobsFailed;
    invariants.push({
      id: 'ledger.jobsFailed',
      ok: failedMatches,
      message: failedMatches
        ? 'Ledger failures align with orchestrator metrics.'
        : `Ledger failures (${totals.failed}) differ from orchestrator metrics (${context.metrics.jobsFailed}).`,
    });

    const cancelledMatches = totals.cancelled === context.metrics.jobsCancelled;
    invariants.push({
      id: 'ledger.jobsCancelled',
      ok: cancelledMatches,
      message: cancelledMatches
        ? 'Ledger cancellations align with orchestrator metrics.'
        : `Ledger cancellations (${totals.cancelled}) differ from orchestrator metrics (${context.metrics.jobsCancelled}).`,
    });

    const spilloverMatches = totals.spilloversOut === context.metrics.spillovers;
    invariants.push({
      id: 'ledger.spillovers',
      ok: spilloverMatches,
      message: spilloverMatches
        ? 'Ledger spillovers align with orchestrator metrics.'
        : `Ledger spillovers (${totals.spilloversOut}) differ from orchestrator metrics (${context.metrics.spillovers}).`,
    });

    const reassignmentMatches = totals.reassignments === context.metrics.reassignedAfterFailure;
    invariants.push({
      id: 'ledger.reassignments',
      ok: reassignmentMatches,
      message: reassignmentMatches
        ? 'Ledger reassignments align with orchestrator metrics.'
        : `Ledger reassignments (${totals.reassignments}) differ from orchestrator metrics (${context.metrics.reassignedAfterFailure}).`,
    });

    const accountedFor =
      totals.completed + totals.failed + totals.cancelled + context.pendingJobs === totals.submitted;
    invariants.push({
      id: 'ledger.pendingAccounting',
      ok: accountedFor,
      message: accountedFor
        ? 'Completed + failed + cancelled + pending equals submitted.'
        : `Accounting mismatch: submitted=${totals.submitted}, completed=${totals.completed}, failed=${totals.failed}, cancelled=${totals.cancelled}, pending=${context.pendingJobs}.`,
    });

    return invariants;
  }

  private bumpShardTotals(
    shard: ShardId,
    mutate: (totals: LedgerShardTotals) => void
  ): void {
    const totals = this.shardTotals.get(shard) ?? {
      submitted: 0,
      assigned: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      spilloversIn: 0,
      spilloversOut: 0,
      reassignments: 0,
    };
    mutate(totals);
    this.shardTotals.set(shard, totals);
  }

  private bumpNodeTotals(
    nodeId: string,
    shard: ShardId,
    mutate: (totals: LedgerNodeTotals) => void
  ): void {
    const totals = this.nodeTotals.get(nodeId) ?? {
      shard,
      assignments: 0,
      completions: 0,
      failures: 0,
      reassignments: 0,
    };
    mutate(totals);
    this.nodeTotals.set(nodeId, totals);
  }

  private bumpSpillover(key: SpilloverKey): void {
    const current = this.spillovers.get(spilloverKeyToString(key)) ?? 0;
    this.spillovers.set(spilloverKeyToString(key), current + 1);
  }

  private pushEvent(entry: LedgerEventEntry): void {
    this.totalEvents += 1;
    this.lastTick = entry.tick;
    if (this.firstTick === undefined) {
      this.firstTick = entry.tick;
    }
    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }
}
