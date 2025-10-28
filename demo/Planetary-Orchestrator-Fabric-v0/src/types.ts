export type ShardId = string;

export interface SpilloverPolicy {
  target: ShardId;
  threshold: number;
  maxDrainPerTick?: number;
  requiredSkills?: string[];
  weight?: number;
}

export interface RouterConfig {
  queueAlertThreshold?: number;
  spilloverPolicies?: SpilloverPolicy[];
}

export interface ShardConfig {
  id: ShardId;
  displayName: string;
  latencyBudgetMs: number;
  spilloverTargets: ShardId[];
  maxQueue: number;
  router?: RouterConfig;
}

export interface NodeDefinition {
  id: string;
  region: ShardId;
  capacity: number;
  specialties: string[];
  heartbeatIntervalSec: number;
  maxConcurrency: number;
}

export interface JobDefinition {
  id: string;
  shard: ShardId;
  requiredSkills: string[];
  estimatedDurationTicks: number;
  value: number;
  submissionTick: number;
}

export type JobStatus =
  | "queued"
  | "assigned"
  | "completed"
  | "failed"
  | "spillover";

export interface JobState extends JobDefinition {
  status: JobStatus;
  assignedNodeId?: string;
  startedTick?: number;
  completedTick?: number;
  failedTick?: number;
  remainingTicks?: number;
  spilloverHistory: ShardId[];
  failureReason?: string;
}

export interface NodeState {
  definition: NodeDefinition;
  active: boolean;
  runningJobs: Map<string, JobState>;
  lastHeartbeatTick: number;
}

export interface ShardState {
  config: ShardConfig;
  queue: JobState[];
  inFlight: Map<string, JobState>;
  completed: Map<string, JobState>;
  failed: Map<string, JobState>;
  spilloverCount: number;
  paused: boolean;
}

export interface FabricConfig {
  owner: {
    name: string;
    address: string;
    multisig: string;
    pauseRole: string;
    commandDeck: string[];
  };
  shards: ShardConfig[];
  nodes: NodeDefinition[];
  checkpoint: {
    path: string;
    intervalTicks: number;
  };
  reporting: {
    directory: string;
    defaultLabel: string;
  };
}

export interface SimulationOptions {
  jobs: number;
  simulateOutage?: string;
  outageTick?: number;
  resume?: boolean;
  checkpointPath?: string;
  outputLabel?: string;
  ciMode?: boolean;
  ownerCommands?: OwnerCommandSchedule[];
  ownerCommandSource?: string;
  stopAfterTicks?: number;
  preserveReportDirOnResume?: boolean;
}

export interface CheckpointData {
  tick: number;
  systemPaused: boolean;
  pausedShards: ShardId[];
  shards: Record<ShardId, {
    queue: JobState[];
    inFlight: JobState[];
    completed: JobState[];
    failed: JobState[];
    spilloverCount: number;
    paused: boolean;
    config: ShardConfig;
  }>;
  nodes: Record<string, {
    state: NodeState['active'];
    runningJobs: JobState[];
    lastHeartbeatTick: number;
    definition: NodeDefinition;
  }>;
  metrics: FabricMetrics;
  events: FabricEvent[];
  deterministicLog: DeterministicReplayFrame[];
}

export interface AssignmentResult {
  shardId: ShardId;
  nodeId: string;
  jobId: string;
}

export interface FabricMetrics {
  tick: number;
  jobsSubmitted: number;
  jobsCompleted: number;
  jobsFailed: number;
  spillovers: number;
  reassignedAfterFailure: number;
  outageHandled: boolean;
  ownerInterventions: number;
  systemPauses: number;
  shardPauses: number;
}

export type RegistryEvent =
  | { type: 'job.created'; shard: ShardId; job: JobState }
  | { type: 'job.cancelled'; shard: ShardId; jobId: string }
  | { type: 'job.requeued'; shard: ShardId; job: JobState; origin: string }
  | { type: 'job.spillover'; shard: ShardId; job: JobState; from: ShardId }
  | { type: 'job.assigned'; shard: ShardId; job: JobState; nodeId: string }
  | { type: 'job.completed'; shard: ShardId; job: JobState }
  | { type: 'job.failed'; shard: ShardId; job: JobState; reason: string }
  | { type: 'node.heartbeat'; shard: ShardId; nodeId: string }
  | { type: 'node.offline'; shard: ShardId; nodeId: string; reason: string };

export interface HealthStatus {
  level: 'ok' | 'degraded' | 'critical';
  message: string;
}

export interface RouterHealthReport {
  shardId: ShardId;
  queueDepth: number;
  inFlight: number;
  completed: number;
  failed: number;
  status: HealthStatus;
  lastSpilloverTick?: number;
  paused: boolean;
  queueAlertThreshold: number;
}

export interface NodeHealthReport {
  nodeId: string;
  shardId: ShardId;
  active: boolean;
  runningJobs: number;
  lastHeartbeatTick: number;
  status: HealthStatus;
}

export interface FabricHealthReport {
  tick: number;
  fabric: HealthStatus;
  systemPaused: boolean;
  shards: RouterHealthReport[];
  nodes: NodeHealthReport[];
  metrics: FabricMetrics;
}

export interface DeterministicReplayFrame {
  tick: number;
  events: RegistryEvent[];
}

export interface SimulationArtifacts {
  summaryPath: string;
  eventsPath: string;
  dashboardPath: string;
  ownerScriptPath: string;
  ownerCommandsPath: string;
}

export interface RunMetadata {
  checkpointRestored: boolean;
  stoppedEarly: boolean;
  stopTick?: number;
  stopReason?: string;
}

export interface FabricEvent {
  tick: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export type OwnerCommand =
  | { type: 'system.pause'; reason?: string }
  | { type: 'system.resume'; reason?: string }
  | { type: 'shard.pause'; shard: ShardId; reason?: string }
  | { type: 'shard.resume'; shard: ShardId; reason?: string }
  | {
      type: 'shard.update';
      shard: ShardId;
      update: {
        displayName?: string;
        latencyBudgetMs?: number;
        maxQueue?: number;
        spilloverTargets?: ShardId[];
        router?: {
          queueAlertThreshold?: number;
          spilloverPolicies?: SpilloverPolicy[];
        };
      };
    }
  | {
      type: 'node.update';
      nodeId: string;
      update: {
        capacity?: number;
        maxConcurrency?: number;
        specialties?: string[];
        heartbeatIntervalSec?: number;
        region?: ShardId;
      };
      reason?: string;
    }
  | { type: 'node.register'; node: NodeDefinition; reason?: string }
  | { type: 'node.deregister'; nodeId: string; reason?: string }
  | { type: 'checkpoint.save'; reason?: string }
  | {
      type: 'checkpoint.configure';
      update: { intervalTicks?: number; path?: string };
      reason?: string;
    };

export interface OwnerCommandSchedule {
  tick: number;
  command: OwnerCommand;
  note?: string;
}
