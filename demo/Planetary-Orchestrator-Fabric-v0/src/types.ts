export type ShardId = string;

export interface ShardConfig {
  id: ShardId;
  displayName: string;
  latencyBudgetMs: number;
  spilloverTargets: ShardId[];
  maxQueue: number;
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
}

export interface CheckpointData {
  tick: number;
  shards: Record<ShardId, {
    queue: JobState[];
    inFlight: JobState[];
    completed: JobState[];
    failed: JobState[];
    spilloverCount: number;
  }>;
  nodes: Record<string, {
    state: NodeState['active'];
    runningJobs: JobState[];
    lastHeartbeatTick: number;
  }>;
  metrics: FabricMetrics;
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
}

export interface SimulationArtifacts {
  summaryPath: string;
  eventsPath: string;
  dashboardPath: string;
  ownerScriptPath: string;
}

export interface FabricEvent {
  tick: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}
