import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

export interface FailureProfile {
  failAfterAssignments: number;
  recoveryJobs: number;
}

export interface NodeConfig {
  id: string;
  shard: string;
  capacity: number;
  specialties: string[];
  meanThroughput: number;
  failureProfile: FailureProfile;
}

export interface ShardConfig {
  id: string;
  label: string;
  latencyBudgetMs: number;
  targetQueue: number;
  overflowThreshold: number;
  spilloverPeers: string[];
}

export interface OwnerControlsConfig {
  pauseAll: boolean;
  maxShardLagMs: number;
  allowCrossShardOverflow: boolean;
  unstoppableScoreFloor: number;
  maxSpilloverPerCycle: number;
  maxCheckpointIntervalJobs: number;
}

export interface FabricOwnerConfig {
  address: string;
  controllerMultisig: string;
  controls: OwnerControlsConfig;
}

export interface FabricConfig {
  version: string;
  description: string;
  owner: FabricOwnerConfig;
  jobDistribution: Record<string, number>;
  shards: ShardConfig[];
  nodes: NodeConfig[];
  checkpoint: {
    path: string;
    intervalJobs: number;
    retention: number;
  };
  routing: {
    maxSpilloverBatch: number;
    heartbeatIntervalMs: number;
    maxMissedHeartbeats: number;
    globalRebalanceWindow: number;
  };
}

export interface JobState {
  id: string;
  preferredShard: string;
  assignedShard: string;
  attempts: number;
  createdAt: number;
  lastTriedAt: number;
}

interface ShardRuntimeState {
  config: ShardConfig;
  queueEstimate: number;
  avgDuration: number;
  completed: number;
  failedAssignments: number;
  spillovers: number;
  crossRegionIntake: number;
  maxQueueDepth: number;
  routerLagMs: number;
  totalLatency: number;
  jobsProcessed: number;
}

interface NodeRuntimeState {
  config: NodeConfig;
  assignments: number;
  failedAssignments: number;
  availableAt: number;
  cooldownRemaining: number;
  online: boolean;
  lastHeartbeat: number;
  sinceRecoveryAssignments: number;
}

export interface FabricRuntimeState {
  version: number;
  clock: number;
  generatedJobs: number;
  completedJobs: number;
  failedJobs: number;
  reassignments: number;
  spillovers: number;
  crossShardTransfers: number;
  unstoppableScore: number;
  totalLatency: number;
  nextJobId: number;
  shards: Record<string, ShardRuntimeState>;
  nodes: Record<string, NodeRuntimeState>;
  pendingJobs: JobState[];
  rngState: number;
}

export interface FabricCheckpoint {
  version: number;
  configHash: string;
  state: FabricRuntimeState;
  createdAt: string;
}

export interface FabricRunResult {
  configHash: string;
  totalJobsRequested: number;
  completedJobs: number;
  failedJobs: number;
  reassignments: number;
  spillovers: number;
  crossShardTransfers: number;
  unstoppableScore: number;
  averageLatencyMs: number;
  shardSummaries: Array<{
    id: string;
    completed: number;
    failureRate: number;
    spillovers: number;
    crossRegionIntake: number;
    maxQueueDepth: number;
    routerLagMs: number;
    averageLatencyMs: number;
  }>;
  nodeSummaries: Array<{
    id: string;
    shard: string;
    online: boolean;
    assignments: number;
    failures: number;
    availabilityMs: number;
    capacity: number;
    meanThroughput: number;
  }>;
  checkpointPath: string;
  checkpointCreated: string;
  ownerControls: OwnerControlsConfig;
}

class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed) || seed <= 0) {
      seed = 123456789;
    }
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  public next(): number {
    // Park-Miller minimal standard LCG
    const a = 16807;
    const m = 2147483647;
    this.state = (this.state * a) % m;
    return this.state / m;
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) {
      return 0;
    }
    return Math.floor(this.next() * maxExclusive);
  }

  public getState(): number {
    return this.state;
  }
}

function computeConfigHash(config: FabricConfig): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(config));
  return hash.digest("hex");
}

function ensureDir(path: string) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
}

function atomicWriteJson(path: string, data: unknown) {
  const tmpPath = `${path}.tmp-${Date.now()}`;
  ensureDir(path);
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmpPath, path);
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function normalizeDistribution(distribution: Record<string, number>): Record<string, number> {
  const entries = Object.entries(distribution);
  const total = entries.reduce((acc, [, value]) => acc + value, 0);
  if (total === 0) {
    throw new Error("Job distribution cannot sum to zero");
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

export interface FabricExecutionOptions {
  totalJobs: number;
  checkpointPath?: string;
  checkpointInterval?: number;
  simulateKillAfterJobs?: number;
  resume?: boolean;
  deterministicSeed?: number;
  baseTimestamp?: number;
}

export class PlanetaryOrchestratorFabric {
  private readonly config: FabricConfig;
  private readonly configHash: string;
  private readonly rng: DeterministicRandom;
  private readonly distribution: Record<string, number>;
  private state: FabricRuntimeState;

  constructor(config: FabricConfig, options: { seed?: number; checkpoint?: FabricCheckpoint } = {}) {
    this.config = config;
    this.configHash = computeConfigHash(config);
    this.distribution = normalizeDistribution(config.jobDistribution);

    if (options.checkpoint && options.checkpoint.configHash !== this.configHash) {
      throw new Error("Checkpoint config hash mismatch");
    }

    const baseSeed = options.checkpoint?.state?.rngState ?? options.seed ?? 987654321;
    this.rng = new DeterministicRandom(baseSeed);

    const shards = Object.fromEntries(
      config.shards.map((shard) => [
        shard.id,
        {
          config: shard,
          queueEstimate: options.checkpoint?.state?.shards?.[shard.id]?.queueEstimate ?? 0,
          avgDuration: options.checkpoint?.state?.shards?.[shard.id]?.avgDuration ?? 0,
          completed: options.checkpoint?.state?.shards?.[shard.id]?.completed ?? 0,
          failedAssignments: options.checkpoint?.state?.shards?.[shard.id]?.failedAssignments ?? 0,
          spillovers: options.checkpoint?.state?.shards?.[shard.id]?.spillovers ?? 0,
          crossRegionIntake: options.checkpoint?.state?.shards?.[shard.id]?.crossRegionIntake ?? 0,
          maxQueueDepth: options.checkpoint?.state?.shards?.[shard.id]?.maxQueueDepth ?? 0,
          routerLagMs: options.checkpoint?.state?.shards?.[shard.id]?.routerLagMs ?? 0,
          totalLatency: options.checkpoint?.state?.shards?.[shard.id]?.totalLatency ?? 0,
          jobsProcessed: options.checkpoint?.state?.shards?.[shard.id]?.jobsProcessed ?? 0,
        } satisfies ShardRuntimeState
      ])
    );

    const nodes = Object.fromEntries(
      config.nodes.map((node) => [
        node.id,
        {
          config: node,
          assignments: options.checkpoint?.state?.nodes?.[node.id]?.assignments ?? 0,
          failedAssignments: options.checkpoint?.state?.nodes?.[node.id]?.failedAssignments ?? 0,
          availableAt: options.checkpoint?.state?.nodes?.[node.id]?.availableAt ?? 0,
          cooldownRemaining: options.checkpoint?.state?.nodes?.[node.id]?.cooldownRemaining ?? 0,
          online: options.checkpoint?.state?.nodes?.[node.id]?.online ?? true,
          lastHeartbeat: options.checkpoint?.state?.nodes?.[node.id]?.lastHeartbeat ?? 0,
          sinceRecoveryAssignments:
            options.checkpoint?.state?.nodes?.[node.id]?.sinceRecoveryAssignments ?? 0,
        } satisfies NodeRuntimeState
      ])
    );

    const pendingJobs = options.checkpoint?.state?.pendingJobs ?? [];

    this.state = {
      version: 1,
      clock: options.checkpoint?.state?.clock ?? 0,
      generatedJobs: options.checkpoint?.state?.generatedJobs ?? pendingJobs.length,
      completedJobs: options.checkpoint?.state?.completedJobs ?? 0,
      failedJobs: options.checkpoint?.state?.failedJobs ?? 0,
      reassignments: options.checkpoint?.state?.reassignments ?? 0,
      spillovers: options.checkpoint?.state?.spillovers ?? 0,
      crossShardTransfers: options.checkpoint?.state?.crossShardTransfers ?? 0,
      unstoppableScore: options.checkpoint?.state?.unstoppableScore ?? config.owner.controls.unstoppableScoreFloor,
      totalLatency: options.checkpoint?.state?.totalLatency ?? 0,
      nextJobId: options.checkpoint?.state?.nextJobId ?? (pendingJobs.length > 0 ? pendingJobs.length + 1 : 1),
      shards,
      nodes,
      pendingJobs,
      rngState: this.rng.getState(),
    } satisfies FabricRuntimeState;
  }

  public getConfigHash(): string {
    return this.configHash;
  }

  public run(options: FabricExecutionOptions): FabricRunResult {
    if (this.config.owner.controls.pauseAll) {
      throw new Error("Owner has paused the orchestrator – resume required before running.");
    }

    const totalJobs = options.totalJobs;
    const checkpointPath = resolve(options.checkpointPath ?? this.config.checkpoint.path);
    const checkpointInterval = Math.min(
      options.checkpointInterval ?? this.config.checkpoint.intervalJobs,
      this.config.owner.controls.maxCheckpointIntervalJobs
    );
    const simulateKillAfterJobs = options.simulateKillAfterJobs;

    const baseTimestamp = options.baseTimestamp ?? Date.now();
    let jobsSinceLastCheckpoint = 0;
    let checkpointCreatedAt = options.resume ? new Date().toISOString() : "";

    const pendingQueue: JobState[] = this.state.pendingJobs.slice();
    const shardIndex = new Map<string, number>();

    for (const shard of this.config.shards) {
      shardIndex.set(shard.id, 0);
    }

    const totalJobTarget = options.resume ? Math.max(totalJobs, this.state.generatedJobs) : totalJobs;

    while ((this.state.generatedJobs < totalJobTarget || pendingQueue.length > 0) && this.state.completedJobs < totalJobs) {
      if (simulateKillAfterJobs && this.state.generatedJobs >= simulateKillAfterJobs) {
        const checkpoint = this.createCheckpoint(checkpointPath, baseTimestamp, pendingQueue);
        checkpointCreatedAt = checkpoint.createdAt;
        return this.buildResult(totalJobs, checkpointPath, checkpointCreatedAt);
      }

      if (this.state.generatedJobs < totalJobs) {
        const job = this.createJob(baseTimestamp);
        pendingQueue.push(job);
        this.state.generatedJobs += 1;
        jobsSinceLastCheckpoint += 1;
      }

      this.advanceCooldowns();
      const job = pendingQueue.shift();
      if (!job) {
        continue;
      }

      const shardState = this.state.shards[job.assignedShard];
      if (!shardState) {
        throw new Error(`Unknown shard: ${job.assignedShard}`);
      }

      const node = this.pickNode(shardState.config.id);
      if (!node) {
        // attempt spillover if allowed
        const spilloverShard = this.findSpillover(job.assignedShard);
        if (spilloverShard) {
          const redirected = { ...job, assignedShard: spilloverShard.config.id };
          this.state.shards[job.assignedShard].spillovers += 1;
          this.state.spillovers += 1;
          this.state.crossShardTransfers += 1;
          pendingQueue.push(redirected);
          continue;
        }
        // no node available, requeue after bumping queue estimate
        shardState.queueEstimate += 1;
        shardState.maxQueueDepth = Math.max(shardState.maxQueueDepth, Math.round(shardState.queueEstimate));
        pendingQueue.push(job);
        continue;
      }

      const outcome = this.processJob(job, node, shardState);
      if (outcome.requeued && outcome.job) {
        pendingQueue.push(outcome.job);
        shardState.queueEstimate += 1;
      } else {
        const jobLatency = outcome.latency;
        shardState.queueEstimate = Math.max(0, shardState.queueEstimate - 1 + jobLatency / 100);
        shardState.maxQueueDepth = Math.max(shardState.maxQueueDepth, Math.round(shardState.queueEstimate));
        shardState.totalLatency += jobLatency;
        shardState.jobsProcessed += 1;
        shardState.routerLagMs = Math.max(0, node.availableAt - this.state.clock);

        this.state.totalLatency += jobLatency;
        this.state.completedJobs += 1;
      }

      if (jobsSinceLastCheckpoint >= checkpointInterval) {
        const checkpoint = this.createCheckpoint(checkpointPath, baseTimestamp, pendingQueue);
        checkpointCreatedAt = checkpoint.createdAt;
        jobsSinceLastCheckpoint = 0;
      }
    }

    const checkpoint = this.createCheckpoint(checkpointPath, baseTimestamp, pendingQueue);
    checkpointCreatedAt = checkpoint.createdAt;
    return this.buildResult(totalJobs, checkpointPath, checkpointCreatedAt);
  }

  private createJob(baseTimestamp: number): JobState {
    const shards = Object.keys(this.distribution);
    const rnd = this.rng.next();
    let cumulative = 0;
    let shard = shards[0];
    for (const [key, weight] of Object.entries(this.distribution)) {
      cumulative += weight;
      if (rnd <= cumulative) {
        shard = key;
        break;
      }
    }

    const job: JobState = {
      id: `job-${this.state.nextJobId}`,
      preferredShard: shard,
      assignedShard: this.resolveShardForJob(shard),
      attempts: 0,
      createdAt: baseTimestamp + this.state.nextJobId,
      lastTriedAt: baseTimestamp + this.state.nextJobId,
    };
    this.state.nextJobId += 1;
    this.state.rngState = this.rng.getState();
    return job;
  }

  private resolveShardForJob(preferred: string): string {
    const shard = this.state.shards[preferred];
    if (!shard) {
      throw new Error(`Shard ${preferred} not found`);
    }

    if (!this.config.owner.controls.allowCrossShardOverflow) {
      return preferred;
    }

    if (shard.queueEstimate < shard.config.overflowThreshold) {
      return preferred;
    }

    const candidates = this.config.shards
      .filter((candidate) => candidate.id !== shard.config.id)
      .map((candidate) => this.state.shards[candidate.id])
      .filter((candidateState) => candidateState.queueEstimate < candidateState.config.targetQueue);

    if (candidates.length === 0) {
      return preferred;
    }

    candidates.sort((a, b) => a.queueEstimate - b.queueEstimate);
    const chosen = candidates[0];
    shard.spillovers += 1;
    this.state.spillovers += 1;
    chosen.crossRegionIntake += 1;
    return chosen.config.id;
  }

  private pickNode(shardId: string): NodeRuntimeState | undefined {
    const candidates = Object.values(this.state.nodes).filter(
      (node) => node.config.shard === shardId && node.online
    );
    if (candidates.length === 0) {
      return undefined;
    }
    candidates.sort((a, b) => a.availableAt - b.availableAt);
    return candidates[0];
  }

  private processJob(
    job: JobState,
    node: NodeRuntimeState,
    shard: ShardRuntimeState
  ): { latency: number; requeued: boolean; job?: JobState } {
    node.assignments += 1;
    job.attempts += 1;
    node.sinceRecoveryAssignments += 1;

    if (
      node.config.failureProfile.failAfterAssignments > 0 &&
      node.sinceRecoveryAssignments >= node.config.failureProfile.failAfterAssignments
    ) {
      node.failedAssignments += 1;
      shard.failedAssignments += 1;
      this.state.reassignments += 1;
      node.online = false;
      node.cooldownRemaining = node.config.failureProfile.recoveryJobs;
      node.sinceRecoveryAssignments = 0;
      const requeuedJob = this.requeueAfterFailure(job, shard);
      return { latency: 0, requeued: true, job: requeuedJob };
    }

    const baseDuration = 40 + this.rng.next() * 60;
    const throughputFactor = node.config.meanThroughput / 300;
    const capacityFactor = Math.max(1, node.config.capacity / 10);
    const latency = baseDuration / throughputFactor / capacityFactor * 10;

    const startTime = Math.max(node.availableAt, this.state.clock);
    const completionTime = startTime + latency;
    this.state.clock = Math.max(this.state.clock, completionTime);
    node.availableAt = completionTime;
    node.lastHeartbeat = completionTime;

    shard.completed += 1;
    return { latency, requeued: false };
  }

  private requeueAfterFailure(job: JobState, shard: ShardRuntimeState): JobState {
    shard.queueEstimate += 2;
    shard.maxQueueDepth = Math.max(shard.maxQueueDepth, Math.round(shard.queueEstimate));
    job.lastTriedAt = this.state.clock;
    return job;
  }

  private advanceCooldowns() {
    for (const node of Object.values(this.state.nodes)) {
      if (!node.online && node.cooldownRemaining > 0) {
        node.cooldownRemaining -= 1;
        if (node.cooldownRemaining <= 0) {
          node.online = true;
          node.availableAt = this.state.clock;
          node.lastHeartbeat = this.state.clock;
          node.sinceRecoveryAssignments = 0;
        }
      }

      if (node.online) {
        const maxLag = this.config.routing.heartbeatIntervalMs * this.config.routing.maxMissedHeartbeats;
        if (this.state.clock - node.lastHeartbeat > maxLag) {
          node.online = false;
          node.cooldownRemaining = Math.ceil(maxLag / this.config.routing.heartbeatIntervalMs);
          node.sinceRecoveryAssignments = 0;
        }
      }
    }
  }

  private findSpillover(shardId: string): ShardRuntimeState | undefined {
    if (!this.config.owner.controls.allowCrossShardOverflow) {
      return undefined;
    }
    const shardConfig = this.config.shards.find((shard) => shard.id === shardId);
    if (!shardConfig) {
      return undefined;
    }
    const peers = shardConfig.spilloverPeers
      .map((peerId) => this.state.shards[peerId])
      .filter(Boolean) as ShardRuntimeState[];
    if (peers.length === 0) {
      return undefined;
    }
    peers.sort((a, b) => a.queueEstimate - b.queueEstimate);
    const best = peers[0];
    if (best.queueEstimate > best.config.overflowThreshold) {
      return undefined;
    }
    best.crossRegionIntake += 1;
    return best;
  }

  private createCheckpoint(path: string, baseTimestamp: number, pendingQueue: JobState[] = []): FabricCheckpoint {
    const checkpoint: FabricCheckpoint = {
      version: 1,
      configHash: this.configHash,
      createdAt: new Date(baseTimestamp + this.state.completedJobs).toISOString(),
      state: {
        ...this.state,
        pendingJobs: [...pendingQueue],
        rngState: this.rng.getState(),
      },
    };
    atomicWriteJson(path, checkpoint);
    return checkpoint;
  }

  
  private buildResult(totalJobs: number, checkpointPath: string, checkpointCreatedAt: string): FabricRunResult {
    const shardSummaries = Object.values(this.state.shards).map((shard) => ({
      id: shard.config.id,
      completed: shard.completed,
      failureRate: shard.jobsProcessed === 0 ? 0 : shard.failedAssignments / shard.jobsProcessed,
      spillovers: shard.spillovers,
      crossRegionIntake: shard.crossRegionIntake,
      maxQueueDepth: shard.maxQueueDepth,
      routerLagMs: shard.routerLagMs,
      averageLatencyMs: shard.jobsProcessed === 0 ? 0 : shard.totalLatency / shard.jobsProcessed,
    }));

    const nodeSummaries = Object.values(this.state.nodes).map((node) => ({
      id: node.config.id,
      shard: node.config.shard,
      online: node.online,
      assignments: node.assignments,
      failures: node.failedAssignments,
      availabilityMs: node.availableAt,
      capacity: node.config.capacity,
      meanThroughput: node.config.meanThroughput,
    }));

    const successRate = totalJobs === 0 ? 1 : (this.state.completedJobs - this.state.failedJobs) / totalJobs;
    const unstoppable = Math.min(1, Math.max(successRate, this.config.owner.controls.unstoppableScoreFloor));
    this.state.unstoppableScore = unstoppable;

    return {
      configHash: this.configHash,
      totalJobsRequested: totalJobs,
      completedJobs: this.state.completedJobs,
      failedJobs: this.state.failedJobs,
      reassignments: this.state.reassignments,
      spillovers: this.state.spillovers,
      unstoppableScore: unstoppable,
      averageLatencyMs: this.state.completedJobs === 0 ? 0 : this.state.totalLatency / this.state.completedJobs,
      shardSummaries,
      nodeSummaries,
      crossShardTransfers: this.state.crossShardTransfers,
      checkpointPath,
      checkpointCreated: checkpointCreatedAt,
      ownerControls: this.config.owner.controls,
    };
  }

  public static loadConfig(path: string): FabricConfig {
    const raw = readJsonFile<FabricConfig>(path);
    return raw;
  }

  public static loadCheckpoint(path: string): FabricCheckpoint {
    return readJsonFile<FabricCheckpoint>(path);
  }
}

export function runFabricScenario(
  configPath: string,
  options: FabricExecutionOptions & { outputPath?: string; uiDataPath?: string }
): FabricRunResult {
  const config = PlanetaryOrchestratorFabric.loadConfig(configPath);
  const checkpoint = options.resume && options.checkpointPath && existsSync(options.checkpointPath)
    ? PlanetaryOrchestratorFabric.loadCheckpoint(options.checkpointPath)
    : undefined;

  const orchestrator = new PlanetaryOrchestratorFabric(config, { seed: options.deterministicSeed, checkpoint });
  const result = orchestrator.run(options);

  const payload = {
    timestamp: new Date().toISOString(),
    configPath,
    report: result,
  };

  if (options.outputPath) {
    atomicWriteJson(options.outputPath, payload);
  }

  if (options.uiDataPath) {
    atomicWriteJson(options.uiDataPath, payload);
  }

  return result;
}
