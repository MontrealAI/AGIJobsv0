import type { FabricConfig } from './config.js';

export type ShardId = string;

export type JobStatus =
  | 'queued'
  | 'assigned'
  | 'in-flight'
  | 'completed'
  | 'failed'
  | 'rolled-back';

export interface JobRequest {
  template: string;
  shard: ShardId;
  metadata: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  shard: ShardId;
  status: JobStatus;
  assignedNode?: string;
  requiredCapabilities: string[];
  createdTick: number;
  startedTick?: number;
  expectedDuration: number;
  attempts: number;
  metadata: Record<string, unknown>;
  payout: string;
  validatorQuorum: number;
  spilloverHistory: ShardId[];
}

export interface NodeConfig {
  id: string;
  shard: ShardId;
  capabilities: string[];
  maxConcurrency: number;
  reliability: number;
}

export interface NodeState extends NodeConfig {
  status: 'online' | 'offline';
  activeJobs: string[];
  completedJobs: number;
  failedJobs: number;
  lastHeartbeatTick: number;
  totalRuntimeTicks: number;
}

export interface ShardState {
  id: ShardId;
  label: string;
  queue: string[];
  activeAssignments: string[];
  completed: number;
  failed: number;
  overflowed: number;
  lastCheckpointTick: number;
  spilloverTargets: ShardId[];
  spilloverThreshold: number;
  maxQueueDepth: number;
}

export interface FabricStateSnapshot {
  tick: number;
  jobs: Record<string, JobRecord>;
  shards: Record<ShardId, ShardState>;
  nodes: Record<string, NodeState>;
  metrics: FabricMetrics;
  configHash: string;
}

export interface FabricMetrics {
  queued: number;
  assigned: number;
  inFlight: number;
  completed: number;
  failed: number;
  reassigned: number;
  spillovers: number;
  checkpoints: number;
  ownerInterventions: number;
}

export interface SimulationResult {
  jobsSubmitted: number;
  jobsCompleted: number;
  jobsFailed: number;
  failedAssignmentRate: number;
  spillovers: number;
  checkpoints: number;
  resumedFromCheckpoint: boolean;
  maxShardSkew: number;
  durationTicks: number;
  nodeRecoveries: number;
  ownerActions: number;
  outputDirectory: string;
}

export interface OwnerControlDelta {
  parameter: string;
  previous: unknown;
  next: unknown;
  tick: number;
  actor: string;
}

export interface SimulationOptions {
  checkpointEvery?: number;
  simulateNodeFailureAtTick?: number;
  nodeFailureShard?: ShardId;
  checkpointDirectory?: string;
  maxTicks?: number;
  spilloverBalanceTarget?: number;
  jobTemplateStrategy?: (jobId: number, shardId: ShardId) => string;
  disableBackgroundFailures?: boolean;
  pruneCheckpoints?: boolean;
  writeReports?: boolean;
}

export interface ReportBundle {
  summary: SimulationResult;
  ownerLog: OwnerControlDelta[];
  checkpoints: FabricStateSnapshot[];
  mermaid: string;
}

export type FabricRuntimeConfig = FabricConfig & {
  rngSeed?: string;
};
