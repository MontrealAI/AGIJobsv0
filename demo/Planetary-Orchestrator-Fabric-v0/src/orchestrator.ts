import { CheckpointManager } from './checkpoint';
import {
  AssignmentResult,
  CheckpointData,
  FabricConfig,
  FabricEvent,
  FabricMetrics,
  JobDefinition,
  JobState,
  NodeDefinition,
  NodeState,
  ShardConfig,
  ShardId,
  ShardState,
} from './types';

interface AssignmentContext {
  tick: number;
}

export class PlanetaryOrchestrator {
  private readonly shards: Map<ShardId, ShardState> = new Map();
  private readonly nodes: Map<string, NodeState> = new Map();
  private tick = 0;
  private metrics: FabricMetrics = {
    tick: 0,
    jobsSubmitted: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    spillovers: 0,
    reassignedAfterFailure: 0,
    outageHandled: false,
  };
  private readonly events: FabricEvent[] = [];

  constructor(
    private readonly config: FabricConfig,
    private readonly checkpointManager: CheckpointManager
  ) {
    for (const shard of config.shards) {
      this.shards.set(shard.id, this.createShardState(shard));
    }
    for (const node of config.nodes) {
      this.nodes.set(node.id, this.createNodeState(node));
    }
  }

  get currentTick(): number {
    return this.tick;
  }

  get fabricMetrics(): FabricMetrics {
    return { ...this.metrics, tick: this.tick };
  }

  get fabricEvents(): FabricEvent[] {
    return this.events.splice(0, this.events.length);
  }

  submitJob(definition: JobDefinition): void {
    const shard = this.shards.get(definition.shard);
    if (!shard) {
      throw new Error(`Unknown shard ${definition.shard}`);
    }
    const job: JobState = {
      ...definition,
      status: 'queued',
      spilloverHistory: [],
      remainingTicks: definition.estimatedDurationTicks,
    };
    shard.queue.push(job);
    this.metrics.jobsSubmitted += 1;
    this.events.push({
      tick: this.tick,
      type: 'job.submitted',
      message: `Job ${job.id} queued in shard ${shard.config.id}`,
      data: { shard: shard.config.id, jobId: job.id },
    });
  }

  async saveCheckpoint(): Promise<void> {
    const payload = this.createCheckpointPayload();
    await this.checkpointManager.save(payload);
    this.events.push({
      tick: this.tick,
      type: 'checkpoint.saved',
      message: 'Checkpoint persisted',
      data: { tick: this.tick },
    });
  }

  async restoreFromCheckpoint(): Promise<boolean> {
    const payload = await this.checkpointManager.load();
    if (!payload) {
      return false;
    }
    this.tick = payload.tick;
    this.metrics = payload.metrics;

    this.shards.clear();
    for (const shardConfig of this.config.shards) {
      const shardPayload = payload.shards[shardConfig.id];
      const shardState = this.createShardState(shardConfig);
      if (shardPayload) {
        shardState.queue = shardPayload.queue.map((job) => ({ ...job }));
        shardState.inFlight = new Map(shardPayload.inFlight.map((job) => [job.id, { ...job }]));
        shardState.completed = new Map(shardPayload.completed.map((job) => [job.id, { ...job }]));
        shardState.failed = new Map(shardPayload.failed.map((job) => [job.id, { ...job }]));
        shardState.spilloverCount = shardPayload.spilloverCount;
      }
      this.shards.set(shardConfig.id, shardState);
    }

    this.nodes.clear();
    for (const node of this.config.nodes) {
      const nodePayload = payload.nodes[node.id];
      const nodeState = this.createNodeState(node);
      if (nodePayload) {
        nodeState.active = nodePayload.state;
        nodeState.lastHeartbeatTick = nodePayload.lastHeartbeatTick;
        nodeState.runningJobs = new Map(
          nodePayload.runningJobs.map((job) => [job.id, { ...job }])
        );
      }
      this.nodes.set(node.id, nodeState);
    }

    this.events.push({
      tick: this.tick,
      type: 'checkpoint.restored',
      message: 'Checkpoint restored successfully',
      data: { tick: this.tick },
    });
    return true;
  }

  processTick(context: AssignmentContext): AssignmentResult[] {
    this.tick = context.tick;
    const assignments: AssignmentResult[] = [];

    this.detectStaleNodes();

    for (const shard of this.shards.values()) {
      assignments.push(...this.assignJobs(shard));
    }

    this.updateRunningJobs();

    return assignments;
  }

  markOutage(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown node ${nodeId}`);
    }
    if (!node.active) {
      return;
    }
    node.active = false;
    this.metrics.outageHandled = true;
    this.events.push({
      tick: this.tick,
      type: 'node.outage',
      message: `Node ${nodeId} marked offline`,
      data: { nodeId },
    });
    this.requeueJobsForNode(node);
  }

  getShardSnapshots(): Record<ShardId, { queueDepth: number; inFlight: number; completed: number }> {
    const snapshot: Record<ShardId, { queueDepth: number; inFlight: number; completed: number }> = {};
    for (const [shardId, shard] of this.shards.entries()) {
      snapshot[shardId] = {
        queueDepth: shard.queue.length,
        inFlight: shard.inFlight.size,
        completed: shard.completed.size,
      };
    }
    return snapshot;
  }

  getNodeSnapshots(): Record<string, { active: boolean; runningJobs: number }> {
    const snapshot: Record<string, { active: boolean; runningJobs: number }> = {};
    for (const [nodeId, node] of this.nodes.entries()) {
      snapshot[nodeId] = {
        active: node.active,
        runningJobs: node.runningJobs.size,
      };
    }
    return snapshot;
  }

  getShardStatistics(): Record<ShardId, { completed: number; failed: number; spillovers: number }> {
    const stats: Record<ShardId, { completed: number; failed: number; spillovers: number }> = {};
    for (const [shardId, shard] of this.shards.entries()) {
      stats[shardId] = {
        completed: shard.completed.size,
        failed: shard.failed.size,
        spillovers: shard.spilloverCount,
      };
    }
    return stats;
  }

  private createShardState(config: ShardConfig): ShardState {
    return {
      config,
      queue: [],
      inFlight: new Map(),
      completed: new Map(),
      failed: new Map(),
      spilloverCount: 0,
    };
  }

  private createNodeState(definition: NodeDefinition): NodeState {
    return {
      definition,
      active: true,
      runningJobs: new Map(),
      lastHeartbeatTick: 0,
    };
  }

  private assignJobs(shard: ShardState): AssignmentResult[] {
    const results: AssignmentResult[] = [];
    const nodes = this.getActiveNodesForShard(shard.config.id);
    for (const node of nodes) {
      node.lastHeartbeatTick = this.tick;
      const availableSlots = Math.min(node.definition.maxConcurrency, node.definition.capacity) - node.runningJobs.size;
      if (availableSlots <= 0) {
        continue;
      }
      let slotsRemaining = availableSlots;
      let rotations = 0;
      while (slotsRemaining > 0 && shard.queue.length > 0) {
        const job = shard.queue[0];
        if (!job) {
          break;
        }
        if (!this.canNodeAcceptJob(node, job)) {
          if (!this.hasEligibleNode(shard.config.id, job)) {
            shard.queue.shift();
            if (!this.tryCrossShardPlacement(job, shard)) {
              this.failJob(job, shard, 'no-eligible-nodes');
            }
            rotations = 0;
            continue;
          }
          shard.queue.push(shard.queue.shift()!);
          rotations += 1;
          if (rotations >= shard.queue.length) {
            break;
          }
          continue;
        }
        rotations = 0;
        shard.queue.shift();
        job.status = 'assigned';
        job.assignedNodeId = node.definition.id;
        job.startedTick = this.tick;
        job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
        node.runningJobs.set(job.id, job);
        shard.inFlight.set(job.id, job);
        results.push({ shardId: shard.config.id, nodeId: node.definition.id, jobId: job.id });
        this.events.push({
          tick: this.tick,
          type: 'job.assigned',
          message: `Job ${job.id} assigned to ${node.definition.id}`,
          data: { shard: shard.config.id, nodeId: node.definition.id, jobId: job.id },
        });
        slotsRemaining -= 1;
      }
    }

    this.reconcileShardQueue(shard);

    if (shard.queue.length > shard.config.maxQueue) {
      this.performSpillover(shard);
    }

    return results;
  }

  private canNodeAcceptJob(node: NodeState, job: JobState): boolean {
    return job.requiredSkills.every((skill) =>
      node.definition.specialties.includes(skill) || node.definition.specialties.includes('general')
    );
  }

  private performSpillover(shard: ShardState): void {
    while (shard.queue.length > shard.config.maxQueue) {
      const job = shard.queue.pop();
      if (!job) {
        return;
      }
      if (this.tryCrossShardPlacement(job, shard)) {
        continue;
      }
      this.failJob(job, shard, 'spillover-no-target');
    }
  }

  private updateRunningJobs(): void {
    for (const shard of this.shards.values()) {
      for (const [jobId, job] of shard.inFlight.entries()) {
        if (job.remainingTicks === undefined) {
          job.remainingTicks = job.estimatedDurationTicks;
        }
        job.remainingTicks -= 1;
        if (job.remainingTicks <= 0) {
          job.status = 'completed';
          job.completedTick = this.tick;
          shard.completed.set(jobId, job);
          shard.inFlight.delete(jobId);
          const node = job.assignedNodeId ? this.nodes.get(job.assignedNodeId) : undefined;
          node?.runningJobs.delete(jobId);
          this.metrics.jobsCompleted += 1;
          this.events.push({
            tick: this.tick,
            type: 'job.completed',
            message: `Job ${jobId} completed in shard ${shard.config.id}`,
            data: { shard: shard.config.id, jobId },
          });
        }
      }
    }
  }

  private detectStaleNodes(): void {
    for (const node of this.nodes.values()) {
      if (!node.active) {
        continue;
      }
      const tolerance = Math.ceil(node.definition.heartbeatIntervalSec / 3);
      if (this.tick - node.lastHeartbeatTick > tolerance && node.runningJobs.size > 0) {
        node.active = false;
        this.events.push({
          tick: this.tick,
          type: 'node.heartbeat-timeout',
          message: `Node ${node.definition.id} missed heartbeat`,
          data: { nodeId: node.definition.id },
        });
        this.requeueJobsForNode(node);
      }
    }
  }

  private requeueJobsForNode(node: NodeState): void {
    for (const [jobId, job] of node.runningJobs.entries()) {
      const shard = this.shards.get(job.shard);
      if (!shard) {
        continue;
      }
      job.status = 'queued';
      job.assignedNodeId = undefined;
      job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
      shard.inFlight.delete(jobId);
      shard.queue.unshift(job);
      node.runningJobs.delete(jobId);
      this.metrics.reassignedAfterFailure += 1;
      this.events.push({
        tick: this.tick,
        type: 'job.requeued',
        message: `Job ${jobId} re-queued after node failure`,
        data: { nodeId: node.definition.id, shard: shard.config.id },
      });
    }
  }

  private getActiveNodesForShard(shardId: ShardId): NodeState[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.definition.region === shardId && node.active
    );
  }

  private reconcileShardQueue(shard: ShardState): void {
    if (shard.queue.length === 0) {
      return;
    }
    const retained: JobState[] = [];
    while (shard.queue.length > 0) {
      const job = shard.queue.shift()!;
      if (this.hasEligibleNode(shard.config.id, job)) {
        retained.push(job);
        continue;
      }
      if (!this.tryCrossShardPlacement(job, shard)) {
        this.failJob(job, shard, 'no-eligible-nodes');
      }
    }
    shard.queue.push(...retained);
  }

  private hasEligibleNode(shardId: ShardId, job: JobState): boolean {
    return this.getActiveNodesForShard(shardId).some((node) => this.canNodeAcceptJob(node, job));
  }

  private tryCrossShardPlacement(job: JobState, originShard: ShardState): boolean {
    const preferredTargets = originShard.config.spilloverTargets ?? [];
    const additionalTargets = Array.from(this.shards.keys()).filter(
      (id) => id !== originShard.config.id && !preferredTargets.includes(id)
    );
    const candidates = [...preferredTargets, ...additionalTargets];

    for (const targetId of candidates) {
      const targetShard = this.shards.get(targetId);
      if (!targetShard) {
        continue;
      }
      if (!this.hasEligibleNode(targetId, job)) {
        continue;
      }
      job.spilloverHistory.push(targetShard.config.id);
      job.shard = targetShard.config.id;
      job.status = 'spillover';
      job.assignedNodeId = undefined;
      job.failedTick = undefined;
      job.failureReason = undefined;
      targetShard.queue.push(job);
      originShard.spilloverCount += 1;
      this.metrics.spillovers += 1;
      this.events.push({
        tick: this.tick,
        type: 'job.spillover',
        message: `Job ${job.id} rerouted from ${originShard.config.id} to ${targetShard.config.id}`,
        data: { from: originShard.config.id, to: targetShard.config.id, jobId: job.id },
      });
      return true;
    }
    return false;
  }

  private failJob(job: JobState, shard: ShardState, reason: string): void {
    job.status = 'failed';
    job.assignedNodeId = undefined;
    job.failedTick = this.tick;
    job.failureReason = reason;
    shard.failed.set(job.id, job);
    this.metrics.jobsFailed += 1;
    this.events.push({
      tick: this.tick,
      type: 'job.failed',
      message: `Job ${job.id} failed in shard ${shard.config.id}`,
      data: { shard: shard.config.id, jobId: job.id, reason },
    });
  }

  private createCheckpointPayload(): CheckpointData {
    const shards: CheckpointData['shards'] = {};
    for (const [shardId, shard] of this.shards.entries()) {
      shards[shardId] = {
        queue: shard.queue.map((job) => ({ ...job })),
        inFlight: Array.from(shard.inFlight.values()).map((job) => ({ ...job })),
        completed: Array.from(shard.completed.values()).map((job) => ({ ...job })),
        failed: Array.from(shard.failed.values()).map((job) => ({ ...job })),
        spilloverCount: shard.spilloverCount,
      };
    }
    const nodes: CheckpointData['nodes'] = {};
    for (const [nodeId, node] of this.nodes.entries()) {
      nodes[nodeId] = {
        state: node.active,
        runningJobs: Array.from(node.runningJobs.values()).map((job) => ({ ...job })),
        lastHeartbeatTick: node.lastHeartbeatTick,
      };
    }
    return {
      tick: this.tick,
      shards,
      nodes,
      metrics: { ...this.metrics },
    };
  }
}
