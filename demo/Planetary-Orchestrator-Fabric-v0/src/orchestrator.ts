import { CheckpointManager } from './checkpoint';
import {
  AssignmentResult,
  CheckpointData,
  DeterministicReplayFrame,
  FabricConfig,
  FabricEvent,
  FabricHealthReport,
  FabricMetrics,
  JobDefinition,
  JobState,
  NodeDefinition,
  NodeHealthReport,
  NodeState,
  RegistryEvent,
  RouterHealthReport,
  ShardConfig,
  ShardId,
  ShardState,
} from './types';
import {
  InMemoryFabricLogger,
  RouterTickActions,
  ShardRouterService,
  SpilloverRequest,
} from './router';

interface AssignmentContext {
  tick: number;
}

function cloneJob(job: JobState): JobState {
  return {
    ...job,
    spilloverHistory: [...job.spilloverHistory],
  };
}

function cloneRegistryEvent(event: RegistryEvent): RegistryEvent {
  switch (event.type) {
    case 'job.created':
      return { type: event.type, shard: event.shard, job: cloneJob(event.job) };
    case 'job.requeued':
      return { type: event.type, shard: event.shard, origin: event.origin, job: cloneJob(event.job) };
    case 'job.spillover':
      return { type: event.type, shard: event.shard, from: event.from, job: cloneJob(event.job) };
    case 'job.assigned':
      return { type: event.type, shard: event.shard, nodeId: event.nodeId, job: cloneJob(event.job) };
    case 'job.completed':
      return { type: event.type, shard: event.shard, job: cloneJob(event.job) };
    case 'job.failed':
      return { type: event.type, shard: event.shard, reason: event.reason, job: cloneJob(event.job) };
    case 'node.heartbeat':
      return { type: event.type, shard: event.shard, nodeId: event.nodeId };
    case 'node.offline':
      return { type: event.type, shard: event.shard, nodeId: event.nodeId, reason: event.reason };
    case 'job.cancelled':
      return { type: event.type, shard: event.shard, jobId: event.jobId };
    default:
      return event;
  }
}

export class PlanetaryOrchestrator {
  private readonly shards: Map<ShardId, ShardState> = new Map();
  private readonly nodes: Map<string, NodeState> = new Map();
  private readonly routers: Map<ShardId, ShardRouterService> = new Map();
  private readonly events: FabricEvent[] = [];
  private readonly logger = new InMemoryFabricLogger();

  private tick = 0;
  private metrics: FabricMetrics = PlanetaryOrchestrator.createInitialMetrics();
  private deterministicLog: DeterministicReplayFrame[] = [];
  private pendingRegistryFrame: RegistryEvent[] = [];
  private currentRegistryFrame: RegistryEvent[] = [];
  private processingTick = false;

  constructor(
    private readonly config: FabricConfig,
    private readonly checkpointManager: CheckpointManager
  ) {
    this.initializeState();
  }

  private static createInitialMetrics(): FabricMetrics {
    return {
      tick: 0,
      jobsSubmitted: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      spillovers: 0,
      reassignedAfterFailure: 0,
      outageHandled: false,
    };
  }

  private initializeState(): void {
    this.shards.clear();
    this.nodes.clear();
    this.routers.clear();
    this.tick = 0;
    this.metrics = PlanetaryOrchestrator.createInitialMetrics();
    this.events.length = 0;
    this.deterministicLog = [];
    this.pendingRegistryFrame = [];
    this.currentRegistryFrame = [];
    this.processingTick = false;
    for (const shard of this.config.shards) {
      const state = this.createShardState(shard);
      this.shards.set(shard.id, state);
    }
    for (const node of this.config.nodes) {
      this.nodes.set(node.id, this.createNodeState(node));
    }
    for (const shard of this.config.shards) {
      const shardState = this.shards.get(shard.id)!;
      const router = new ShardRouterService(shardState, shard, () => this.getNodesForShard(shard.id), this.logger);
      this.routers.set(shard.id, router);
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

  getDeterministicLog(): DeterministicReplayFrame[] {
    return this.deterministicLog.map((frame) => ({
      tick: frame.tick,
      events: frame.events.map((entry) => cloneRegistryEvent(entry)),
    }));
  }

  getHealthReport(): FabricHealthReport {
    const shardReports: RouterHealthReport[] = Array.from(this.routers.entries()).map(([shardId, router]) =>
      router.getHealthReport(this.tick)
    );
    const nodeReports: NodeHealthReport[] = Array.from(this.nodes.values()).map((node) => this.buildNodeHealth(node));
    const fabricStatus = this.computeFabricStatus(shardReports, nodeReports);
    return {
      tick: this.tick,
      fabric: fabricStatus,
      shards: shardReports,
      nodes: nodeReports,
      metrics: this.fabricMetrics,
    };
  }

  submitJob(definition: JobDefinition): void {
    this.logger.setTick(this.tick);
    const router = this.routers.get(definition.shard);
    if (!router) {
      throw new Error(`Unknown shard ${definition.shard}`);
    }
    const job: JobState = {
      ...definition,
      status: 'queued',
      spilloverHistory: [],
      remainingTicks: definition.estimatedDurationTicks,
    };
    router.queueJob(job, 'new');
    this.metrics.jobsSubmitted += 1;
    this.recordFabricEvent({
      tick: this.tick,
      type: 'job.submitted',
      message: `Job ${job.id} queued in shard ${definition.shard}`,
      data: { shard: definition.shard, jobId: job.id },
    });
    this.recordRegistryEvent({ type: 'job.created', shard: definition.shard, job: cloneJob(job) });
  }

  async saveCheckpoint(): Promise<void> {
    const payload = this.createCheckpointPayload();
    await this.checkpointManager.save(payload);
    this.recordFabricEvent({
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
    this.initializeState();
    this.tick = payload.tick;
    this.metrics = payload.metrics;

    for (const shardConfig of this.config.shards) {
      const shardState = this.shards.get(shardConfig.id)!;
      const shardPayload = payload.shards[shardConfig.id];
      if (!shardPayload) {
        continue;
      }
      shardState.queue = shardPayload.queue.map((job) => ({ ...job, spilloverHistory: [...job.spilloverHistory] }));
      shardState.inFlight = new Map(
        shardPayload.inFlight.map((job) => [job.id, { ...job, spilloverHistory: [...job.spilloverHistory] }])
      );
      shardState.completed = new Map(
        shardPayload.completed.map((job) => [job.id, { ...job, spilloverHistory: [...job.spilloverHistory] }])
      );
      shardState.failed = new Map(
        shardPayload.failed.map((job) => [job.id, { ...job, spilloverHistory: [...job.spilloverHistory] }])
      );
      shardState.spilloverCount = shardPayload.spilloverCount;
    }

    for (const node of this.config.nodes) {
      const nodeState = this.nodes.get(node.id)!;
      const nodePayload = payload.nodes[node.id];
      if (!nodePayload) {
        continue;
      }
      nodeState.active = nodePayload.state;
      nodeState.lastHeartbeatTick = nodePayload.lastHeartbeatTick;
      nodeState.runningJobs = new Map(
        nodePayload.runningJobs.map((job) => [job.id, { ...job, spilloverHistory: [...job.spilloverHistory] }])
      );
    }

    this.events.push(...payload.events);
    this.deterministicLog = payload.deterministicLog.map((frame) => ({
      tick: frame.tick,
      events: frame.events.map((event) => cloneRegistryEvent(event)),
    }));

    this.recordFabricEvent({
      tick: this.tick,
      type: 'checkpoint.restored',
      message: 'Checkpoint restored successfully',
      data: { tick: this.tick },
    });
    return true;
  }

  processTick(context: AssignmentContext): AssignmentResult[] {
    this.tick = context.tick;
    this.logger.setTick(this.tick);
    const assignments: AssignmentResult[] = [];

    this.currentRegistryFrame = [...this.pendingRegistryFrame];
    this.pendingRegistryFrame = [];
    this.processingTick = true;

    this.detectStaleNodes();

    for (const [shardId, router] of this.routers.entries()) {
      const actions = router.processTick({ tick: this.tick });
      assignments.push(...actions.assignments);
      this.handleRouterEvents(actions);
      this.handleAssignments(shardId, actions.assignments);
      this.handleSpillovers(actions.spillovers);
      this.handleFailures(shardId, actions.failures);
    }

    this.updateRunningJobs();

    this.processingTick = false;
    this.deterministicLog.push({
      tick: this.tick,
      events: this.currentRegistryFrame.map((event) => cloneRegistryEvent(event)),
    });
    this.currentRegistryFrame = [];

    return assignments;
  }

  markOutage(nodeId: string): void {
    this.logger.setTick(this.tick);
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown node ${nodeId}`);
    }
    if (!node.active) {
      return;
    }
    node.active = false;
    this.metrics.outageHandled = true;
    this.recordFabricEvent({
      tick: this.tick,
      type: 'node.outage',
      message: `Node ${nodeId} marked offline`,
      data: { nodeId },
    });
    this.recordRegistryEvent({
      type: 'node.offline',
      shard: node.definition.region,
      nodeId: node.definition.id,
      reason: 'manual-outage',
    });
    this.requeueJobsForNode(node, 'manual-outage');
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

  replay(frames: DeterministicReplayFrame[]): void {
    this.initializeState();
    const sorted = [...frames].sort((a, b) => a.tick - b.tick);
    for (const frame of sorted) {
      this.tick = frame.tick;
      this.logger.setTick(this.tick);
      this.currentRegistryFrame = [];
      this.processingTick = true;
      for (const event of frame.events) {
        this.applyRegistryEvent(event);
      }
      this.processingTick = false;
      this.deterministicLog.push({
        tick: frame.tick,
        events: frame.events.map((event) => cloneRegistryEvent(event)),
      });
      this.updateRunningJobs();
    }
  }

  private applyRegistryEvent(event: RegistryEvent): void {
    switch (event.type) {
      case 'job.created': {
        const router = this.routers.get(event.shard);
        if (!router) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        router.queueJob(cloneJob(event.job), 'new');
        this.metrics.jobsSubmitted += 1;
        break;
      }
      case 'job.requeued': {
        const router = this.routers.get(event.shard);
        if (!router) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        this.recordFabricEvent(router.requeueJob(cloneJob(event.job), this.tick, `replay-${event.origin}`));
        this.metrics.reassignedAfterFailure += 1;
        break;
      }
      case 'job.spillover': {
        const router = this.routers.get(event.shard);
        if (!router) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        this.recordFabricEvent(router.acceptSpillover(cloneJob(event.job), event.from, this.tick));
        const origin = this.shards.get(event.from);
        if (origin) {
          origin.spilloverCount += 1;
        }
        this.metrics.spillovers += 1;
        break;
      }
      case 'job.assigned': {
        const shard = this.shards.get(event.shard);
        if (!shard) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        const node = this.nodes.get(event.nodeId);
        if (!node) {
          throw new Error(`Unknown node ${event.nodeId}`);
        }
        const job = cloneJob(event.job);
        job.status = 'assigned';
        job.assignedNodeId = node.definition.id;
        job.startedTick = this.tick;
        job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
        const queueIndex = shard.queue.findIndex((entry) => entry.id === job.id);
        if (queueIndex >= 0) {
          shard.queue.splice(queueIndex, 1);
        }
        node.runningJobs.set(job.id, job);
        shard.inFlight.set(job.id, job);
        break;
      }
      case 'job.completed': {
        const shard = this.shards.get(event.shard);
        if (!shard) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        shard.inFlight.delete(event.job.id);
        shard.completed.set(event.job.id, cloneJob(event.job));
        if (event.job.assignedNodeId) {
          this.nodes.get(event.job.assignedNodeId)?.runningJobs.delete(event.job.id);
        }
        this.metrics.jobsCompleted += 1;
        break;
      }
      case 'job.failed': {
        const shard = this.shards.get(event.shard);
        if (!shard) {
          throw new Error(`Unknown shard ${event.shard}`);
        }
        shard.inFlight.delete(event.job.id);
        shard.failed.set(event.job.id, cloneJob(event.job));
        if (event.job.assignedNodeId) {
          this.nodes.get(event.job.assignedNodeId)?.runningJobs.delete(event.job.id);
        }
        this.metrics.jobsFailed += 1;
        break;
      }
      case 'job.cancelled': {
        const router = this.routers.get(event.shard);
        router?.cancelJob(event.jobId, this.tick);
        break;
      }
      case 'node.heartbeat': {
        const node = this.nodes.get(event.nodeId);
        if (node) {
          node.lastHeartbeatTick = this.tick;
        }
        break;
      }
      case 'node.offline': {
        const node = this.nodes.get(event.nodeId);
        if (node) {
          node.active = false;
        }
        this.metrics.outageHandled = true;
        break;
      }
    }
  }

  private handleRouterEvents(actions: RouterTickActions): void {
    for (const event of actions.events) {
      this.recordFabricEvent(event);
    }
  }

  private handleAssignments(shardId: ShardId, assignments: AssignmentResult[]): void {
    const shard = this.shards.get(shardId);
    if (!shard) {
      return;
    }
    for (const assignment of assignments) {
      const job = shard.inFlight.get(assignment.jobId);
      if (!job) {
        continue;
      }
      this.recordRegistryEvent({ type: 'job.assigned', shard: shardId, nodeId: assignment.nodeId, job: cloneJob(job) });
    }
  }

  private handleSpillovers(requests: SpilloverRequest[]): void {
    for (const request of requests) {
      const targetRouter = this.routers.get(request.target);
      const originRouter = this.routers.get(request.origin);
      if (!originRouter) {
        continue;
      }
      if (!targetRouter) {
        request.job.shard = request.origin;
        this.recordFabricEvent(originRouter.requeueJob(request.job, this.tick, 'spillover-target-missing'));
        this.recordRegistryEvent({
          type: 'job.requeued',
          shard: request.origin,
          origin: request.origin,
          job: cloneJob(request.job),
        });
        continue;
      }
      const event = targetRouter.acceptSpillover(request.job, request.origin, this.tick);
      this.recordFabricEvent(event);
      const originShard = this.shards.get(request.origin);
      if (originShard) {
        originShard.spilloverCount += 1;
      }
      this.metrics.spillovers += 1;
      this.recordRegistryEvent({
        type: 'job.spillover',
        shard: request.target,
        from: request.origin,
        job: cloneJob(request.job),
      });
    }
  }

  private handleFailures(shardId: ShardId, failures: { job: JobState; reason: string }[]): void {
    if (failures.length === 0) {
      return;
    }
    for (const entry of failures) {
      this.metrics.jobsFailed += 1;
      this.recordRegistryEvent({
        type: 'job.failed',
        shard: shardId,
        reason: entry.reason,
        job: cloneJob(entry.job),
      });
    }
  }

  private detectStaleNodes(): void {
    for (const node of this.nodes.values()) {
      if (!node.active) {
        continue;
      }
      const tolerance = Math.ceil(node.definition.heartbeatIntervalSec / 3);
      const delta = this.tick - node.lastHeartbeatTick;
      if (delta > tolerance && node.runningJobs.size > 0) {
        node.active = false;
        this.metrics.outageHandled = true;
        this.recordFabricEvent({
          tick: this.tick,
          type: 'node.heartbeat-timeout',
          message: `Node ${node.definition.id} missed heartbeat`,
          data: { nodeId: node.definition.id },
        });
        this.recordRegistryEvent({
          type: 'node.offline',
          shard: node.definition.region,
          nodeId: node.definition.id,
          reason: 'heartbeat-timeout',
        });
        this.requeueJobsForNode(node, 'heartbeat-timeout');
      } else {
        this.recordRegistryEvent({
          type: 'node.heartbeat',
          shard: node.definition.region,
          nodeId: node.definition.id,
        });
      }
    }
  }

  private requeueJobsForNode(node: NodeState, reason: string): void {
    for (const [jobId, job] of node.runningJobs.entries()) {
      const shardRouter = this.routers.get(job.shard) ?? this.routers.get(node.definition.region);
      if (!shardRouter) {
        continue;
      }
      job.status = 'queued';
      job.assignedNodeId = undefined;
      job.failureReason = undefined;
      job.startedTick = undefined;
      job.remainingTicks = Math.max(job.remainingTicks ?? job.estimatedDurationTicks, 1);
      this.recordFabricEvent(shardRouter.requeueJob(job, this.tick, reason));
      this.recordRegistryEvent({
        type: 'job.requeued',
        shard: job.shard,
        origin: node.definition.region,
        job: cloneJob(job),
      });
      const shard = this.shards.get(job.shard);
      shard?.inFlight.delete(jobId);
      node.runningJobs.delete(jobId);
      this.metrics.reassignedAfterFailure += 1;
    }
  }

  private updateRunningJobs(): void {
    for (const [shardId, shard] of this.shards.entries()) {
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
          this.recordFabricEvent({
            tick: this.tick,
            type: 'job.completed',
            message: `Job ${jobId} completed in shard ${shardId}`,
            data: { shard: shardId, jobId },
          });
          this.recordRegistryEvent({
            type: 'job.completed',
            shard: shardId,
            job: cloneJob(job),
          });
        }
      }
    }
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

  private getNodesForShard(shardId: ShardId): NodeState[] {
    return Array.from(this.nodes.values()).filter((node) => node.definition.region === shardId);
  }

  private buildNodeHealth(node: NodeState): NodeHealthReport {
    const tolerance = Math.ceil(node.definition.heartbeatIntervalSec / 3);
    const delta = this.tick - node.lastHeartbeatTick;
    if (!node.active && node.runningJobs.size > 0) {
      return {
        nodeId: node.definition.id,
        shardId: node.definition.region,
        active: node.active,
        runningJobs: node.runningJobs.size,
        lastHeartbeatTick: node.lastHeartbeatTick,
        status: { level: 'critical', message: 'Node offline with running jobs' },
      };
    }
    if (!node.active) {
      return {
        nodeId: node.definition.id,
        shardId: node.definition.region,
        active: node.active,
        runningJobs: node.runningJobs.size,
        lastHeartbeatTick: node.lastHeartbeatTick,
        status: { level: 'degraded', message: 'Node offline' },
      };
    }
    if (delta > tolerance) {
      return {
        nodeId: node.definition.id,
        shardId: node.definition.region,
        active: node.active,
        runningJobs: node.runningJobs.size,
        lastHeartbeatTick: node.lastHeartbeatTick,
        status: { level: 'degraded', message: `Heartbeat delayed by ${delta} ticks` },
      };
    }
    return {
      nodeId: node.definition.id,
      shardId: node.definition.region,
      active: node.active,
      runningJobs: node.runningJobs.size,
      lastHeartbeatTick: node.lastHeartbeatTick,
      status: { level: 'ok', message: 'Node healthy' },
    };
  }

  private computeFabricStatus(
    shards: RouterHealthReport[],
    nodes: NodeHealthReport[]
  ): FabricHealthReport['fabric'] {
    if (shards.some((entry) => entry.status.level === 'critical') || nodes.some((entry) => entry.status.level === 'critical')) {
      return { level: 'critical', message: 'Critical conditions detected across fabric' };
    }
    if (shards.some((entry) => entry.status.level === 'degraded') || nodes.some((entry) => entry.status.level === 'degraded')) {
      return { level: 'degraded', message: 'One or more components degraded' };
    }
    return { level: 'ok', message: 'Fabric healthy' };
  }

  private recordFabricEvent(event: FabricEvent): void {
    this.events.push(event);
  }

  private recordRegistryEvent(event: RegistryEvent): void {
    if (this.processingTick) {
      this.currentRegistryFrame.push(event);
    } else {
      this.pendingRegistryFrame.push(event);
    }
  }

  private createCheckpointPayload(): CheckpointData {
    const shards: CheckpointData['shards'] = {};
    for (const [shardId, shard] of this.shards.entries()) {
      shards[shardId] = {
        queue: shard.queue.map((job) => cloneJob(job)),
        inFlight: Array.from(shard.inFlight.values()).map((job) => cloneJob(job)),
        completed: Array.from(shard.completed.values()).map((job) => cloneJob(job)),
        failed: Array.from(shard.failed.values()).map((job) => cloneJob(job)),
        spilloverCount: shard.spilloverCount,
      };
    }
    const nodes: CheckpointData['nodes'] = {};
    for (const [nodeId, node] of this.nodes.entries()) {
      nodes[nodeId] = {
        state: node.active,
        runningJobs: Array.from(node.runningJobs.values()).map((job) => cloneJob(job)),
        lastHeartbeatTick: node.lastHeartbeatTick,
      };
    }
    return {
      tick: this.tick,
      shards,
      nodes,
      metrics: { ...this.metrics },
      events: [...this.events],
      deterministicLog: this.deterministicLog.map((frame) => ({
        tick: frame.tick,
        events: frame.events.map((event) => cloneRegistryEvent(event)),
      })),
    };
  }
}
