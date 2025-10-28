export type ShardId = 'earth' | 'mars' | 'luna' | 'helios' | 'edge';

export interface JobPayload {
  readonly title: string;
  readonly category:
    | 'research'
    | 'logistics'
    | 'governance'
    | 'infrastructure'
    | 'science';
  readonly energyBudget: number;
  readonly instructions: string;
  readonly metadata?: Record<string, unknown>;
}

export interface JobRecord {
  readonly id: string;
  readonly shard: ShardId;
  readonly submittedAt: number;
  readonly payload: JobPayload;
  status: 'pending' | 'assigned' | 'completed' | 'failed';
  assignedNodeId?: string;
  progress: number;
  workRemaining: number;
  workRequired: number;
  completedAt?: number;
  retries: number;
  spilloverFrom?: ShardId;
}

export interface NodeDescriptor {
  readonly id: string;
  readonly region: ShardId;
  readonly capacity: number;
  readonly performance: number;
  readonly reliability: number;
  readonly specialties: ReadonlyArray<JobPayload['category']>;
}

export interface ActiveAssignment {
  readonly jobId: string;
  progress: number;
  workRemaining: number;
}

export interface NodeRuntimeState {
  readonly descriptor: NodeDescriptor;
  status: 'active' | 'offline' | 'recovering';
  heartbeatTick: number;
  assignments: ActiveAssignment[];
  downtimeTicks: number;
  totalCompleted: number;
  totalFailed: number;
  spilloversHandled: number;
}

export interface ShardRuntimeState {
  readonly id: ShardId;
  queue: string[];
  completed: number;
  failed: number;
  spilloversOut: number;
  spilloversIn: number;
  rerouteBudget: number;
  paused: boolean;
  backlogHistory: number[];
}

export interface RuntimeMetrics {
  tick: number;
  jobsSubmitted: number;
  jobsCompleted: number;
  jobsFailed: number;
  totalLatency: number;
  reassignments: number;
  spillovers: number;
}

export interface OwnerCommandExecution {
  readonly command: string;
  readonly tick: number;
  readonly payload?: Record<string, unknown>;
}

export interface OwnerCommandCatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, string>;
}

export type SerializedJob = [
  id: string,
  shard: ShardId,
  submittedAt: number,
  title: string,
  category: JobPayload['category'],
  energyBudget: number,
  retries: number,
  spilloverFrom: ShardId | null
];

export interface CheckpointSnapshot {
  readonly tick: number;
  readonly jobs: SerializedJob[];
  readonly jobsSeedCount: number;
  readonly shardQueues: Record<ShardId, string[]>;
  readonly shards: Record<ShardId, ShardRuntimeState>;
  readonly nodes: Record<string, NodeRuntimeState>;
  readonly metrics: RuntimeMetrics;
  readonly ownerCommandLog: OwnerCommandExecution[];
  readonly paused: boolean;
}

export interface RunConfiguration {
  readonly label: string;
  readonly jobsHighLoad: number;
  readonly stopAfterTicks?: number;
  readonly outageNodeId?: string;
  readonly restartStopAfter?: number;
  readonly ciMode?: boolean;
  readonly checkpointPath?: string;
  readonly eventsPath?: string;
  readonly resumeFromCheckpoint?: boolean;
  readonly allowSpillover?: boolean;
  readonly ownerCommandScriptPath?: string;
  readonly ownerCommandExecutionPath?: string;
}

export interface ReportSummary {
  readonly runLabel: string;
  readonly metrics: {
    readonly tick: number;
    readonly jobsSubmitted: number;
    readonly jobsCompleted: number;
    readonly jobsFailed: number;
    readonly dropRate: number;
    readonly averageLatency: number;
    readonly reassignments: number;
    readonly spillovers: number;
  };
  readonly shards: Record<
    ShardId,
    {
      readonly queueDepth: number;
      readonly backlogHistory: number[];
      readonly jobsCompleted: number;
      readonly jobsFailed: number;
      readonly spilloversOut: number;
      readonly spilloversIn: number;
      readonly rerouteBudget: number;
      readonly paused: boolean;
    }
  >;
  readonly nodes: Record<
    string,
    {
      readonly status: NodeRuntimeState['status'];
      readonly assignments: number;
      readonly totalCompleted: number;
      readonly totalFailed: number;
      readonly downtimeTicks: number;
      readonly spilloversHandled: number;
    }
  >;
  readonly ownerCommands: {
    readonly executed: OwnerCommandExecution[];
    readonly catalog: OwnerCommandCatalogEntry[];
  };
  readonly checkpoint: {
    readonly path: string;
    readonly tick: number;
    readonly jobsSeedCount: number;
  };
}

export type EventType =
  | 'job:submitted'
  | 'job:assigned'
  | 'job:completed'
  | 'job:failed'
  | 'job:interrupted'
  | 'node:heartbeat'
  | 'node:offline'
  | 'node:recovered'
  | 'shard:spillover'
  | 'owner:command'
  | 'orchestrator:pause'
  | 'orchestrator:resume';

export interface FabricEvent {
  readonly type: EventType;
  readonly tick: number;
  readonly details: Record<string, unknown>;
}
