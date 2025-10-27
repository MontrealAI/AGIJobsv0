import {
  AssignmentResult,
  FabricEvent,
  JobState,
  NodeState,
  RegistryEvent,
  RouterHealthReport,
  ShardConfig,
  ShardId,
  ShardState,
  SpilloverPolicy,
} from './types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface FabricLogEntry {
  tick: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FabricLogger {
  setTick(tick: number): void;
  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void;
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  entries(): FabricLogEntry[];
  clear(): void;
}

export class InMemoryFabricLogger implements FabricLogger {
  private readonly logEntries: FabricLogEntry[] = [];
  private readonly maxEntries: number;
  private currentTick = 0;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  setTick(tick: number): void {
    this.currentTick = tick;
  }

  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const entry: FabricLogEntry = { tick: this.currentTick, level, message, metadata };
    this.logEntries.push(entry);
    if (this.logEntries.length > this.maxEntries) {
      this.logEntries.shift();
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  entries(): FabricLogEntry[] {
    return [...this.logEntries];
  }

  clear(): void {
    this.logEntries.length = 0;
  }
}

export interface RouterContext {
  tick: number;
}

export interface SpilloverRequest {
  job: JobState;
  target: ShardId;
  origin: ShardId;
  reason: string;
}

export interface RouterTickActions {
  assignments: AssignmentResult[];
  spillovers: SpilloverRequest[];
  failures: { job: JobState; reason: string }[];
  events: FabricEvent[];
}

function matchesPolicy(job: JobState, policy: SpilloverPolicy): boolean {
  if (!policy.requiredSkills || policy.requiredSkills.length === 0) {
    return true;
  }
  return policy.requiredSkills.every((skill) => job.requiredSkills.includes(skill));
}

export class ShardRouterService {
  private policies: SpilloverPolicy[];
  private queueAlertThreshold: number;
  private lastSpilloverTick?: number;
  private paused = false;
  private lastPauseEventTick?: number;

  constructor(
    private readonly shard: ShardState,
    private readonly config: ShardConfig,
    private readonly getShardNodes: () => NodeState[],
    private readonly logger: InMemoryFabricLogger
  ) {
    this.policies = this.sortPolicies(config.router?.spilloverPolicies ?? []);
    this.queueAlertThreshold = config.router?.queueAlertThreshold ?? Math.ceil(config.maxQueue * 0.75);
  }

  setPaused(paused: boolean): void {
    if (!paused) {
      this.lastPauseEventTick = undefined;
    }
    this.paused = paused;
  }

  updateQueueAlertThreshold(threshold: number): void {
    this.queueAlertThreshold = threshold;
    if (!this.config.router) {
      this.config.router = { queueAlertThreshold: threshold };
    } else {
      this.config.router.queueAlertThreshold = threshold;
    }
  }

  updateSpilloverPolicies(policies: SpilloverPolicy[]): void {
    this.policies = this.sortPolicies(policies);
    if (!this.config.router) {
      this.config.router = { spilloverPolicies: this.policies.map((policy) => ({ ...policy })) };
    } else {
      this.config.router.spilloverPolicies = this.policies.map((policy) => ({ ...policy }));
    }
  }

  updateSpilloverTargets(targets: ShardId[]): void {
    this.config.spilloverTargets = [...targets];
  }

  private sortPolicies(policies: SpilloverPolicy[]): SpilloverPolicy[] {
    return [...policies].sort((a, b) => {
      const thresholdDelta = a.threshold - b.threshold;
      if (thresholdDelta !== 0) {
        return thresholdDelta;
      }
      const weightA = a.weight ?? 0;
      const weightB = b.weight ?? 0;
      return weightB - weightA;
    });
  }

  queueJob(job: JobState, reason: 'new' | 'spillover' | 'requeue'): void {
    job.status = reason === 'spillover' ? 'spillover' : 'queued';
    job.assignedNodeId = undefined;
    this.shard.queue.push(job);
    this.logger.debug('Job queued', {
      shard: this.config.id,
      jobId: job.id,
      reason,
      queueDepth: this.shard.queue.length,
    });
  }

  acceptSpillover(job: JobState, from: ShardId, tick: number): FabricEvent {
    this.queueJob(job, 'spillover');
    this.lastSpilloverTick = tick;
    return {
      tick,
      type: 'job.spillover.accepted',
      message: `Job ${job.id} accepted by shard ${this.config.id} from ${from}`,
      data: { shard: this.config.id, from, jobId: job.id },
    };
  }

  cancelJob(jobId: string, tick: number): FabricEvent | undefined {
    const queueIndex = this.shard.queue.findIndex((job) => job.id === jobId);
    if (queueIndex >= 0) {
      const [job] = this.shard.queue.splice(queueIndex, 1);
      return {
        tick,
        type: 'job.cancelled',
        message: `Job ${job.id} cancelled in shard ${this.config.id}`,
        data: { shard: this.config.id, jobId: job.id },
      };
    }
    if (this.shard.inFlight.has(jobId)) {
      const job = this.shard.inFlight.get(jobId)!;
      this.shard.inFlight.delete(jobId);
      const node = job.assignedNodeId
        ? this.getShardNodes().find((entry) => entry.definition.id === job.assignedNodeId)
        : undefined;
      node?.runningJobs.delete(jobId);
      return {
        tick,
        type: 'job.cancelled',
        message: `Job ${job.id} cancelled while in flight in shard ${this.config.id}`,
        data: { shard: this.config.id, jobId: job.id },
      };
    }
    return undefined;
  }

  requeueJob(job: JobState, tick: number, reason: string): FabricEvent {
    job.status = 'queued';
    job.assignedNodeId = undefined;
    job.failureReason = undefined;
    job.failedTick = undefined;
    job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
    this.shard.queue.unshift(job);
    this.logger.info('Job requeued', {
      shard: this.config.id,
      jobId: job.id,
      reason,
      queueDepth: this.shard.queue.length,
    });
    return {
      tick,
      type: 'job.requeued',
      message: `Job ${job.id} re-queued in shard ${this.config.id}`,
      data: { shard: this.config.id, jobId: job.id, reason },
    };
  }

  failJob(job: JobState, tick: number, reason: string): FabricEvent {
    job.status = 'failed';
    job.assignedNodeId = undefined;
    job.failedTick = tick;
    job.failureReason = reason;
    this.shard.failed.set(job.id, job);
    this.logger.warn('Job failed', {
      shard: this.config.id,
      jobId: job.id,
      reason,
    });
    return {
      tick,
      type: 'job.failed',
      message: `Job ${job.id} failed in shard ${this.config.id}`,
      data: { shard: this.config.id, jobId: job.id, reason },
    };
  }

  processTick(context: RouterContext): RouterTickActions {
    const actions: RouterTickActions = { assignments: [], spillovers: [], failures: [], events: [] };
    const nodes = this.getShardNodes();

    if (this.paused) {
      if (this.lastPauseEventTick !== context.tick) {
        actions.events.push({
          tick: context.tick,
          type: 'shard.paused.tick',
          message: `Shard ${this.config.id} is paused; no assignments executed`,
          data: { shard: this.config.id },
        });
        this.lastPauseEventTick = context.tick;
      }
      return actions;
    }

    for (const node of nodes) {
      if (!node.active) {
        continue;
      }
      node.lastHeartbeatTick = context.tick;
      const availableSlots = Math.min(node.definition.maxConcurrency, node.definition.capacity) - node.runningJobs.size;
      if (availableSlots <= 0) {
        continue;
      }
      let slotsRemaining = availableSlots;
      let rotations = 0;
      while (slotsRemaining > 0 && this.shard.queue.length > 0) {
        const job = this.shard.queue[0];
        if (!job) {
          break;
        }
        if (!this.canNodeAcceptJob(node, job)) {
          if (!this.hasEligibleNode(job)) {
            this.shard.queue.shift();
            const target = this.selectSpilloverTarget(job);
            if (target) {
              job.shard = target;
              job.spilloverHistory.push(target);
              job.status = 'spillover';
              this.lastSpilloverTick = context.tick;
              actions.spillovers.push({ job, target, origin: this.config.id, reason: 'no-eligible-nodes' });
              actions.events.push({
                tick: context.tick,
                type: 'job.spillover.pending',
                message: `Job ${job.id} routed from ${this.config.id} to ${target}`,
                data: { from: this.config.id, to: target, jobId: job.id },
              });
            } else {
              job.status = 'queued';
              job.failureReason = undefined;
              job.assignedNodeId = undefined;
              this.shard.queue.push(job);
              actions.events.push({
                tick: context.tick,
                type: 'job.deferred',
                message: `Job ${job.id} deferred in shard ${this.config.id}`,
                data: { shard: this.config.id, jobId: job.id },
              });
            }
            rotations = 0;
            continue;
          }
          this.rotateQueue();
          rotations += 1;
          if (rotations >= this.shard.queue.length) {
            break;
          }
          continue;
        }
        this.shard.queue.shift();
        job.status = 'assigned';
        job.assignedNodeId = node.definition.id;
        job.startedTick = context.tick;
        job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
        node.runningJobs.set(job.id, job);
        this.shard.inFlight.set(job.id, job);
        actions.assignments.push({ shardId: this.config.id, nodeId: node.definition.id, jobId: job.id });
        actions.events.push({
          tick: context.tick,
          type: 'job.assigned',
          message: `Job ${job.id} assigned to ${node.definition.id}`,
          data: { shard: this.config.id, nodeId: node.definition.id, jobId: job.id },
        });
        slotsRemaining -= 1;
        rotations = 0;
      }
    }

    this.reconcileQueue(actions, context.tick);
    this.enforceSpilloverPolicies(actions, context.tick);
    this.performOverflowSpillover(actions, context.tick);

    return actions;
  }

  private canNodeAcceptJob(node: NodeState, job: JobState): boolean {
    return job.requiredSkills.every((skill) =>
      node.definition.specialties.includes(skill) || node.definition.specialties.includes('general')
    );
  }

  private hasEligibleNode(job: JobState): boolean {
    return this.getShardNodes().some((node) => node.active && this.canNodeAcceptJob(node, job));
  }

  private rotateQueue(): void {
    const first = this.shard.queue.shift();
    if (first) {
      this.shard.queue.push(first);
    }
  }

  private reconcileQueue(actions: RouterTickActions, tick: number): void {
    if (this.shard.queue.length === 0) {
      return;
    }
    const retained: JobState[] = [];
    while (this.shard.queue.length > 0) {
      const job = this.shard.queue.shift()!;
      if (this.hasEligibleNode(job)) {
        retained.push(job);
        continue;
      }
      const target = this.selectSpilloverTarget(job);
      if (target) {
        job.shard = target;
        job.spilloverHistory.push(target);
        job.status = 'spillover';
        this.lastSpilloverTick = tick;
        actions.spillovers.push({ job, target, origin: this.config.id, reason: 'no-eligible-nodes' });
        actions.events.push({
          tick,
          type: 'job.spillover.pending',
          message: `Job ${job.id} rerouted from ${this.config.id} to ${target}`,
          data: { from: this.config.id, to: target, jobId: job.id },
        });
        continue;
      }
      retained.push(job);
      actions.events.push({
        tick,
        type: 'job.deferred',
        message: `Job ${job.id} retained in shard ${this.config.id}`,
        data: { shard: this.config.id, jobId: job.id },
      });
    }
    this.shard.queue.push(...retained);
  }

  private enforceSpilloverPolicies(actions: RouterTickActions, tick: number): void {
    if (this.policies.length === 0) {
      return;
    }
    for (const policy of this.policies) {
      if (this.shard.queue.length <= policy.threshold) {
        continue;
      }
      let drained = 0;
      const maxDrain = policy.maxDrainPerTick ?? 1;
      for (let index = this.shard.queue.length - 1; index >= 0 && drained < maxDrain; index -= 1) {
        const job = this.shard.queue[index];
        if (!matchesPolicy(job, policy)) {
          continue;
        }
        this.shard.queue.splice(index, 1);
        job.shard = policy.target;
        job.spilloverHistory.push(policy.target);
        job.status = 'spillover';
        this.lastSpilloverTick = tick;
        drained += 1;
        actions.spillovers.push({ job, target: policy.target, origin: this.config.id, reason: 'policy-threshold' });
        actions.events.push({
          tick,
          type: 'job.spillover.policy',
          message: `Job ${job.id} spilled from ${this.config.id} to ${policy.target} via policy`,
          data: { from: this.config.id, to: policy.target, jobId: job.id, policy },
        });
      }
    }
  }

  private performOverflowSpillover(actions: RouterTickActions, tick: number): void {
    while (this.shard.queue.length > this.config.maxQueue) {
      const job = this.shard.queue.pop();
      if (!job) {
        break;
      }
      const target = this.selectSpilloverTarget(job) ?? this.config.spilloverTargets[0];
      if (target) {
        job.shard = target;
        job.spilloverHistory.push(target);
        job.status = 'spillover';
        this.lastSpilloverTick = tick;
        actions.spillovers.push({ job, target, origin: this.config.id, reason: 'queue-overflow' });
        actions.events.push({
          tick,
          type: 'job.spillover.pending',
          message: `Job ${job.id} overflow-routed from ${this.config.id} to ${target}`,
          data: { from: this.config.id, to: target, jobId: job.id },
        });
        continue;
      }
      actions.failures.push({ job, reason: 'spillover-no-target' });
      actions.events.push(this.failJob(job, tick, 'spillover-no-target'));
    }
  }

  private selectSpilloverTarget(job: JobState): ShardId | undefined {
    for (const policy of this.policies) {
      if (this.shard.queue.length <= policy.threshold) {
        continue;
      }
      if (!matchesPolicy(job, policy)) {
        continue;
      }
      return policy.target;
    }
    for (const target of this.config.spilloverTargets) {
      if (job.spilloverHistory.includes(target)) {
        continue;
      }
      return target;
    }
    return undefined;
  }

  getHealthReport(currentTick: number): RouterHealthReport {
    const statusLevel = this.computeStatus();
    const message = this.healthMessage(statusLevel, currentTick);
    return {
      shardId: this.config.id,
      queueDepth: this.shard.queue.length,
      inFlight: this.shard.inFlight.size,
      completed: this.shard.completed.size,
      failed: this.shard.failed.size,
      status: { level: statusLevel, message },
      lastSpilloverTick: this.lastSpilloverTick,
      paused: this.paused,
      queueAlertThreshold: this.queueAlertThreshold,
    };
  }

  private computeStatus(): 'ok' | 'degraded' | 'critical' {
    if (this.paused) {
      return 'degraded';
    }
    if (this.shard.queue.length > this.config.maxQueue) {
      return 'critical';
    }
    if (this.shard.queue.length > this.queueAlertThreshold || this.shard.failed.size > 0) {
      return 'degraded';
    }
    return 'ok';
  }

  private healthMessage(level: 'ok' | 'degraded' | 'critical', currentTick: number): string {
    if (this.paused) {
      return `Shard ${this.config.id} paused at tick ${currentTick}`;
    }
    if (level === 'ok') {
      return 'Shard operating within normal parameters';
    }
    if (level === 'degraded') {
      return `Shard experiencing backlog (queue=${this.shard.queue.length}) at tick ${currentTick}`;
    }
    return `Shard queue exceeded maximum capacity (queue=${this.shard.queue.length}) at tick ${currentTick}`;
  }
}

export function reduceRegistryEvents(events: RegistryEvent[], shardId: ShardId): RegistryEvent[] {
  return events.filter((event) => event.shard === shardId);
}
