import { loadConfig, hashConfig } from './config.js';
import { CheckpointStore } from './checkpoint.js';
import { DeterministicRng } from './random.js';
import {
  FabricMetrics,
  FabricRuntimeConfig,
  FabricStateSnapshot,
  JobRecord,
  JobRequest,
  NodeState,
  OwnerControlDelta,
  ReportBundle,
  ShardId,
  ShardState,
  SimulationOptions,
  SimulationResult,
} from './types.js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SEED = 'planetary-fabric';

export class PlanetaryFabricOrchestrator {
  readonly config: FabricRuntimeConfig;
  readonly checkpointStore: CheckpointStore;
  readonly rng: DeterministicRng;

  private tick = 0;
  private readonly jobs = new Map<string, JobRecord>();
  private readonly shards = new Map<ShardId, ShardState>();
  private readonly nodes = new Map<string, NodeState>();
  private readonly shardCapabilities = new Map<ShardId, Set<string>>();
  private disableRandomFailures = false;
  private metrics: FabricMetrics = {
    queued: 0,
    assigned: 0,
    inFlight: 0,
    completed: 0,
    failed: 0,
    reassigned: 0,
    spillovers: 0,
    checkpoints: 0,
    ownerInterventions: 0,
  };
  private ownerLog: OwnerControlDelta[] = [];
  private configHash: string;

  constructor(configPath: string, seed = DEFAULT_SEED) {
    this.config = { ...loadConfig(configPath), rngSeed: seed };
    this.configHash = hashConfig(this.config);
    this.checkpointStore = new CheckpointStore(
      path.resolve(this.config.checkpoint.directory),
      this.config.checkpoint.retain,
    );
    this.rng = new DeterministicRng(seed);
    this.bootstrap();
  }

  private bootstrap(): void {
    for (const shard of this.config.shards) {
      this.shards.set(shard.id, {
        id: shard.id,
        label: shard.label,
        queue: [],
        activeAssignments: [],
        completed: 0,
        failed: 0,
        overflowed: 0,
        lastCheckpointTick: 0,
        spilloverTargets: shard.spilloverTargets,
        spilloverThreshold: shard.spilloverThreshold,
        maxQueueDepth: shard.maxQueueDepth,
      });
    }
    for (const node of this.config.nodes) {
      this.nodes.set(node.id, {
        ...node,
        status: 'online',
        activeJobs: [],
        completedJobs: 0,
        failedJobs: 0,
        lastHeartbeatTick: 0,
        totalRuntimeTicks: 0,
      });
    }
    this.refreshShardCapabilities();
    const latestCheckpoint = this.checkpointStore.latest();
    if (latestCheckpoint) {
      this.restore(latestCheckpoint);
    }
  }

  queueJob(request: JobRequest): JobRecord {
    const template = this.config.jobTemplates[request.template];
    if (!template) {
      throw new Error(`Unknown job template ${request.template}`);
    }
    const jobId = `JOB-${String(this.jobs.size + 1).padStart(6, '0')}`;
    const job: JobRecord = {
      id: jobId,
      shard: request.shard,
      status: 'queued',
      requiredCapabilities: template.capabilities,
      createdTick: this.tick,
      expectedDuration: template.durationTicks,
      attempts: 0,
      metadata: request.metadata,
      payout: template.payout,
      validatorQuorum: template.validatorQuorum,
      spilloverHistory: [],
    };
    this.jobs.set(jobId, job);
    const shard = this.getShard(job.shard);
    shard.queue.push(jobId);
    this.metrics.queued += 1;
    return job;
  }

  queueJobs(requests: JobRequest[]): JobRecord[] {
    return requests.map((request) => this.queueJob(request));
  }

  advanceTick(): void {
    this.tick += 1;
    this.heartbeatNodes();
    this.completeWork();
    this.assignWork();
    this.rebalanceIfNeeded();
    if (this.tick % this.config.checkpoint.intervalTicks === 0) {
      this.persistCheckpoint();
    }
  }

  runUntilSettled(maxTicks = 10_000): void {
    let tickBudget = maxTicks;
    while (tickBudget-- > 0 && this.hasWorkRemaining()) {
      this.advanceTick();
    }
    if (this.hasWorkRemaining()) {
      throw new Error(`runUntilSettled exceeded maxTicks=${maxTicks}`);
    }
  }

  simulateHighLoad(
    jobsPerShard: number,
    shards: ShardId[],
    options: SimulationOptions = {},
  ): SimulationResult {
    if (options.pruneCheckpoints ?? true) {
      this.checkpointStore.clear();
    }
    this.reset();
    this.disableRandomFailures = options.disableBackgroundFailures ?? false;
    const jobTemplateStrategy = options.jobTemplateStrategy ?? this.buildDefaultTemplateStrategy();
    const requests: JobRequest[] = [];
    let counter = 0;
    for (const shardId of shards) {
      for (let i = 0; i < jobsPerShard; i += 1) {
        const template = jobTemplateStrategy(counter, shardId);
        requests.push({
          shard: shardId,
          template,
          metadata: {
            sponsor: `Sponsor-${shardId}-${i}`,
            description: `Work package ${i} for ${shardId}`,
          },
        });
        counter += 1;
      }
    }
    this.queueJobs(requests);
    const failureTick = options.simulateNodeFailureAtTick ?? Math.floor((jobsPerShard * shards.length) / 10);
    const failureShard = options.nodeFailureShard ?? shards[0];
    const checkpointEvery = options.checkpointEvery ?? this.config.checkpoint.intervalTicks;

    let resumed = false;
    let nodeRecoveries = 0;
    let ownerActions = 0;
    const checkpoints: FabricStateSnapshot[] = [];

    const persistCheckpoint = () => {
      const snapshot = this.snapshot();
      checkpoints.push(snapshot);
      this.checkpointStore.persist(snapshot);
      this.metrics.checkpoints += 1;
    };

    const maxTicks = options.maxTicks ?? 250_000;

    while (this.hasWorkRemaining()) {
      if (this.tick >= maxTicks) {
        throw new Error(`Simulation exceeded maxTicks=${maxTicks}`);
      }
      this.tick += 1;
      if (!resumed && this.tick === failureTick) {
        nodeRecoveries += this.simulateNodeFailure(failureShard);
        // Simulate orchestrator crash/restart
        const snapshot = this.snapshot();
        checkpoints.push(snapshot);
        this.checkpointStore.persist(snapshot);
        resumed = true;
        this.restore(snapshot);
        this.metrics.checkpoints += 1;
      }
      if (this.tick % checkpointEvery === 0) {
        persistCheckpoint();
      }
      this.heartbeatNodes();
      this.completeWork();
      this.assignWork();
      this.rebalanceIfNeeded(options.spilloverBalanceTarget);
    }

    const jobsCompleted = [...this.jobs.values()].filter((job) => job.status === 'completed').length;
    const jobsFailed = [...this.jobs.values()].filter((job) => job.status === 'failed').length;
    const failedAssignmentRate = jobsFailed / (jobsCompleted + jobsFailed || 1);
    const perShardQueues = [...this.shards.values()].map((shard) => shard.queue.length);
    const maxShardSkew = Math.max(...perShardQueues) - Math.min(...perShardQueues);

    const outputDirectory =
      options.writeReports === false ? '' : this.writeReports(checkpoints, failedAssignmentRate);

    const summary: SimulationResult = {
      jobsSubmitted: requests.length,
      jobsCompleted,
      jobsFailed,
      failedAssignmentRate,
      spillovers: this.metrics.spillovers,
      checkpoints: this.metrics.checkpoints,
      resumedFromCheckpoint: resumed,
      maxShardSkew,
      durationTicks: this.tick,
      nodeRecoveries,
      ownerActions,
      outputDirectory,
    };

    this.disableRandomFailures = false;
    return summary;
  }

  snapshot(): FabricStateSnapshot {
    const jobs = Object.fromEntries([...this.jobs.entries()]);
    const shards = Object.fromEntries([...this.shards.entries()]);
    const nodes = Object.fromEntries([...this.nodes.entries()]);
    return {
      tick: this.tick,
      jobs,
      shards,
      nodes,
      metrics: { ...this.metrics },
      configHash: this.configHash,
    };
  }

  ownerAdjust(parameter: string, value: unknown, actor = this.config.owner.address): void {
    const segments = parameter.split('.');
    let cursor: any = this.config;
    for (let i = 0; i < segments.length - 1; i += 1) {
      cursor = cursor[segments[i]];
      if (cursor === undefined) {
        throw new Error(`Unknown owner parameter ${parameter}`);
      }
    }
    const finalKey = segments.at(-1)!;
    const previous = cursor[finalKey];
    cursor[finalKey] = value;
    this.ownerLog.push({ parameter, previous, next: value, tick: this.tick, actor });
    this.metrics.ownerInterventions += 1;
  }

  getState(): ReportBundle {
    return {
      summary: {
        jobsSubmitted: this.metrics.queued,
        jobsCompleted: this.metrics.completed,
        jobsFailed: this.metrics.failed,
        failedAssignmentRate: this.metrics.failed / Math.max(1, this.metrics.completed + this.metrics.failed),
        spillovers: this.metrics.spillovers,
        checkpoints: this.metrics.checkpoints,
        resumedFromCheckpoint: false,
        maxShardSkew: 0,
        durationTicks: this.tick,
        nodeRecoveries: 0,
        ownerActions: this.metrics.ownerInterventions,
        outputDirectory: '',
      },
      ownerLog: this.ownerLog,
      checkpoints: [this.snapshot()],
      mermaid: this.renderMermaid(),
    };
  }

  private renderMermaid(): string {
    const shardLines = [...this.shards.values()]
      .map((shard) => `  ${shard.id.toUpperCase()}[${shard.label}]:::shard`)
      .join('\n');
    const routerLines = [...this.nodes.values()]
      .map((node) => `  ${node.id}[[${node.id}\n${node.capabilities.join(', ')}]]:::node --> ${node.shard.toUpperCase()}`)
      .join('\n');
    const spilloverLines = [...this.shards.values()]
      .flatMap((shard) =>
        shard.spilloverTargets.map((target) => `  ${shard.id.toUpperCase()} -- spillover --> ${target.toUpperCase()}`),
      )
      .join('\n');
    return `flowchart TD\n${shardLines}\n${routerLines}\n${spilloverLines}`;
  }

  private writeReports(checkpoints: FabricStateSnapshot[], failedAssignmentRate: number): string {
    const directory = path.resolve('demo/Planetary-Orchestrator-Fabric-v0/reports/latest');
    fs.mkdirSync(directory, { recursive: true });
    const bundle: ReportBundle = {
      summary: {
        jobsSubmitted: this.metrics.queued,
        jobsCompleted: this.metrics.completed,
        jobsFailed: this.metrics.failed,
        failedAssignmentRate,
        spillovers: this.metrics.spillovers,
        checkpoints: this.metrics.checkpoints,
        resumedFromCheckpoint: true,
        maxShardSkew: 0,
        durationTicks: this.tick,
        nodeRecoveries: checkpoints.length,
        ownerActions: this.metrics.ownerInterventions,
        outputDirectory: directory,
      },
      ownerLog: this.ownerLog,
      checkpoints,
      mermaid: this.renderMermaid(),
    };
    fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(bundle.summary, null, 2));
    fs.writeFileSync(path.join(directory, 'owner-log.json'), JSON.stringify(this.ownerLog, null, 2));
    fs.writeFileSync(path.join(directory, 'mermaid.mmd'), bundle.mermaid);
    fs.writeFileSync(path.join(directory, 'checkpoints.json'), JSON.stringify(checkpoints, null, 2));
    return directory;
  }

  private restore(snapshot: FabricStateSnapshot): void {
    this.jobs.clear();
    this.shards.clear();
    this.nodes.clear();
    for (const [id, job] of Object.entries(snapshot.jobs)) {
      this.jobs.set(id, job);
    }
    for (const [id, shard] of Object.entries(snapshot.shards)) {
      this.shards.set(id, shard);
    }
    for (const [id, node] of Object.entries(snapshot.nodes)) {
      this.nodes.set(id, node);
    }
    this.metrics = { ...snapshot.metrics };
    this.tick = snapshot.tick;
    this.refreshShardCapabilities();
  }

  private reset(): void {
    this.jobs.clear();
    this.metrics = {
      queued: 0,
      assigned: 0,
      inFlight: 0,
      completed: 0,
      failed: 0,
      reassigned: 0,
      spillovers: 0,
      checkpoints: 0,
      ownerInterventions: 0,
    };
    this.ownerLog = [];
    this.tick = 0;
    for (const shard of this.config.shards) {
      this.shards.set(shard.id, {
        id: shard.id,
        label: shard.label,
        queue: [],
        activeAssignments: [],
        completed: 0,
        failed: 0,
        overflowed: 0,
        lastCheckpointTick: 0,
        spilloverTargets: shard.spilloverTargets,
        spilloverThreshold: shard.spilloverThreshold,
        maxQueueDepth: shard.maxQueueDepth,
      });
    }
    for (const node of this.config.nodes) {
      this.nodes.set(node.id, {
        ...node,
        status: 'online',
        activeJobs: [],
        completedJobs: 0,
        failedJobs: 0,
        lastHeartbeatTick: 0,
        totalRuntimeTicks: 0,
      });
    }
    this.refreshShardCapabilities();
  }

  private getShard(id: ShardId): ShardState {
    const shard = this.shards.get(id);
    if (!shard) {
      throw new Error(`Unknown shard ${id}`);
    }
    return shard;
  }

  private hasWorkRemaining(): boolean {
    return [...this.jobs.values()].some((job) => job.status !== 'completed' && job.status !== 'failed');
  }

  private heartbeatNodes(): void {
    for (const node of this.nodes.values()) {
      if (node.status === 'offline') {
        if (
          this.disableRandomFailures ||
          this.tick - node.lastHeartbeatTick >= this.config.routers.heartbeatGraceTicks
        ) {
          node.status = 'online';
        }
        continue;
      }
      if (this.disableRandomFailures) {
        node.lastHeartbeatTick = this.tick;
        continue;
      }
      const heartbeatChance = this.rng.next();
      if (heartbeatChance > node.reliability) {
        node.status = 'offline';
        node.lastHeartbeatTick = this.tick;
        node.failedJobs += node.activeJobs.length;
        this.metrics.reassigned += node.activeJobs.length;
        for (const jobId of node.activeJobs) {
          const job = this.jobs.get(jobId);
          if (!job) continue;
          job.status = 'queued';
          job.assignedNode = undefined;
          job.spilloverHistory.push(job.shard);
          const shard = this.getShard(job.shard);
          shard.queue.unshift(jobId);
        }
        node.activeJobs = [];
      } else {
        node.lastHeartbeatTick = this.tick;
      }
    }
  }

  private assignWork(): void {
    for (const shard of this.shards.values()) {
      const eligibleNodes = [...this.nodes.values()].filter(
        (node) => node.shard === shard.id && node.status === 'online',
      );
      if (!eligibleNodes.length) {
        continue;
      }
      let queueIndex = 0;
      while (queueIndex < shard.queue.length) {
        const jobId = shard.queue[queueIndex];
        const job = this.jobs.get(jobId);
        if (!job || job.status !== 'queued') {
          queueIndex += 1;
          continue;
        }
        const node = this.pickNodeForJob(eligibleNodes, job);
        if (!node) {
          queueIndex += 1;
          continue;
        }
        shard.queue.splice(queueIndex, 1);
        job.status = 'in-flight';
        job.assignedNode = node.id;
        job.attempts += 1;
        job.startedTick = this.tick;
        shard.activeAssignments.push(jobId);
        node.activeJobs.push(jobId);
        node.totalRuntimeTicks += job.expectedDuration;
        this.metrics.assigned += 1;
        this.metrics.inFlight += 1;
      }
    }
  }

  private pickNodeForJob(nodes: NodeState[], job: JobRecord): NodeState | undefined {
    const capableNodes = nodes.filter((node) =>
      job.requiredCapabilities.every((capability) => node.capabilities.includes(capability)),
    );
    const availableNodes = capableNodes.filter(
      (node) => node.activeJobs.length < Math.min(node.maxConcurrency, this.config.routers.maxConcurrentAssignmentsPerNode),
    );
    if (!availableNodes.length) {
      return undefined;
    }
    availableNodes.sort((a, b) => a.activeJobs.length - b.activeJobs.length);
    return availableNodes[0];
  }

  private completeWork(): void {
    for (const node of this.nodes.values()) {
      if (node.status === 'offline') {
        continue;
      }
      const completedJobs: string[] = [];
      for (const jobId of node.activeJobs) {
        const job = this.jobs.get(jobId);
        if (!job || job.status !== 'in-flight') {
          continue;
        }
        const elapsed = this.tick - (job.startedTick ?? this.tick);
        if (elapsed >= job.expectedDuration) {
          job.status = 'completed';
          completedJobs.push(jobId);
          this.metrics.completed += 1;
          this.metrics.inFlight = Math.max(0, this.metrics.inFlight - 1);
          const shard = this.getShard(job.shard);
          shard.activeAssignments = shard.activeAssignments.filter((id) => id !== jobId);
          shard.completed += 1;
        }
      }
      if (completedJobs.length) {
        node.completedJobs += completedJobs.length;
        node.activeJobs = node.activeJobs.filter((jobId) => !completedJobs.includes(jobId));
      }
    }
  }

  private rebalanceIfNeeded(spilloverBalanceTarget?: number): void {
    const queues = [...this.shards.values()].map((shard) => ({ id: shard.id, size: shard.queue.length }));
    const average = queues.reduce((sum, shard) => sum + shard.size, 0) / Math.max(1, queues.length);
    for (const shard of this.shards.values()) {
      const ratio = average === 0 ? 0 : shard.queue.length / average;
      const threshold = spilloverBalanceTarget ?? shard.spilloverThreshold;
      if (ratio > 1 + threshold && shard.queue.length > 0) {
        const spillCount = Math.min(shard.queue.length, this.config.routers.spilloverBatch);
        for (let i = 0; i < spillCount; i += 1) {
          const jobId = shard.queue.shift();
          if (!jobId) break;
          const job = this.jobs.get(jobId);
          if (!job) continue;
          const targetShardId = this.pickSpilloverTarget(shard, job);
          if (!targetShardId) {
            shard.queue.unshift(jobId);
            break;
          }
          job.spilloverHistory.push(targetShardId);
          job.shard = targetShardId;
          this.getShard(targetShardId).queue.push(jobId);
          this.metrics.spillovers += 1;
          shard.overflowed += 1;
        }
      }
    }
  }

  private pickSpilloverTarget(shard: ShardState, job: JobRecord): ShardId | undefined {
    const targets = shard.spilloverTargets
      .map((id) => this.getShard(id))
      .sort((a, b) => a.queue.length - b.queue.length);
    for (const target of targets) {
      if (this.canShardAcceptJob(target.id, job)) {
        return target.id;
      }
    }
    return undefined;
  }

  private canShardAcceptJob(shardId: ShardId, job: JobRecord): boolean {
    const capabilities = this.shardCapabilities.get(shardId);
    if (!capabilities) {
      return false;
    }
    return job.requiredCapabilities.every((capability) => capabilities.has(capability));
  }

  private simulateNodeFailure(shardId: ShardId): number {
    let recoveries = 0;
    for (const node of this.nodes.values()) {
      if (node.shard !== shardId) continue;
      node.status = 'offline';
      if (node.activeJobs.length) {
        this.metrics.reassigned += node.activeJobs.length;
      }
      for (const jobId of node.activeJobs) {
        const job = this.jobs.get(jobId);
        if (!job) continue;
        job.status = 'queued';
        job.assignedNode = undefined;
        this.getShard(job.shard).queue.unshift(jobId);
      }
      node.activeJobs = [];
      // After failure we bring node back online to simulate restart
      node.status = 'online';
      recoveries += 1;
    }
    return recoveries;
  }

  private persistCheckpoint(): void {
    const snapshot = this.snapshot();
    this.checkpointStore.persist(snapshot);
    this.metrics.checkpoints += 1;
  }

  private refreshShardCapabilities(): void {
    this.shardCapabilities.clear();
    for (const shard of this.config.shards) {
      this.shardCapabilities.set(shard.id, new Set());
    }
    for (const node of this.nodes.values()) {
      const capabilities = this.shardCapabilities.get(node.shard);
      if (!capabilities) continue;
      for (const capability of node.capabilities) {
        capabilities.add(capability);
      }
    }
  }

  private buildDefaultTemplateStrategy(): (index: number, shardId: ShardId) => string {
    const templateEntries = Object.entries(this.config.jobTemplates);
    const cache = new Map<ShardId, string[]>();
    for (const shard of this.config.shards) {
      const capabilities = this.shardCapabilities.get(shard.id) ?? new Set<string>();
      const compatible = templateEntries
        .filter(([, template]) => template.capabilities.every((cap) => capabilities.has(cap)))
        .map(([name]) => name);
      cache.set(shard.id, compatible.length ? compatible : templateEntries.map(([name]) => name));
    }
    return (index: number, shardId: ShardId) => {
      const templates = cache.get(shardId) ?? templateEntries.map(([name]) => name);
      if (!templates.length) {
        throw new Error('No job templates configured');
      }
      return templates[index % templates.length];
    };
  }
}
