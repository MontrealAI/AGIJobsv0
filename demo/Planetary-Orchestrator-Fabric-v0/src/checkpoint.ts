import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  CheckpointSnapshot,
  NodeRuntimeState,
  OwnerCommandExecution,
  RuntimeMetrics,
  SerializedJob,
  ShardId,
  ShardRuntimeState,
} from './types';

export interface CheckpointStoreOptions {
  readonly path: string;
}

export class CheckpointStore {
  public readonly path: string;

  constructor(private readonly options: CheckpointStoreOptions) {
    this.path = options.path;
  }

  public async save(snapshot: CheckpointSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(snapshot), 'utf8');
  }

  public load(): CheckpointSnapshot | undefined {
    try {
      const raw = readFileSync(this.path, 'utf8');
      const parsed = JSON.parse(raw) as CheckpointSnapshot;
      return parsed;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}

export function buildCheckpointSnapshot(params: {
  readonly tick: number;
  readonly jobs: SerializedJob[];
  readonly jobsSeedCount: number;
  readonly shardState: Map<ShardId, ShardRuntimeState>;
  readonly metrics: RuntimeMetrics;
  readonly ownerCommandLog: ReadonlyArray<OwnerCommandExecution>;
  readonly paused: boolean;
}): CheckpointSnapshot {
  const shardQueues: Record<ShardId, string[]> = {
    earth: [],
    mars: [],
    luna: [],
    helios: [],
    edge: [],
  };
  const shards: Record<ShardId, ShardRuntimeState> = {
    earth: params.shardState.get('earth')!,
    mars: params.shardState.get('mars')!,
    luna: params.shardState.get('luna')!,
    helios: params.shardState.get('helios')!,
    edge: params.shardState.get('edge')!,
  };

  (Object.keys(shards) as ShardId[]).forEach((id) => {
    const shard = params.shardState.get(id);
    if (!shard) {
      return;
    }
    shardQueues[id] = [...shard.queue];
    shards[id] = {
      ...shard,
      backlogHistory: shard.backlogHistory.slice(-32),
      queue: [...shard.queue],
    };
  });

  return {
    tick: params.tick,
    jobs: params.jobs.map((job) => [...job] as SerializedJob),
    jobsSeedCount: params.jobsSeedCount,
    shardQueues,
    shards,
    nodes: {},
    metrics: { ...params.metrics },
    ownerCommandLog: params.ownerCommandLog.map((command) => ({
      command: command.command,
      tick: command.tick,
      payload: command.payload ? { ...command.payload } : undefined,
    })),
    paused: params.paused,
  } as CheckpointSnapshot;
}

export function buildNodeSnapshot(
  nodes: Map<string, NodeRuntimeState>
): Record<string, NodeRuntimeState> {
  const snapshot: Record<string, NodeRuntimeState> = {};
  nodes.forEach((node, id) => {
    snapshot[id] = {
      ...node,
      assignments: node.assignments.map((assignment) => ({ ...assignment })),
    };
  });
  return snapshot;
}

export function embedNodesIntoCheckpoint(
  snapshot: CheckpointSnapshot,
  nodes: Map<string, NodeRuntimeState>
): CheckpointSnapshot {
  const nodeSnapshot: Record<string, NodeRuntimeState> = {};
  nodes.forEach((node, id) => {
    nodeSnapshot[id] = {
      ...node,
      assignments: node.assignments.map((assignment) => ({ ...assignment })),
    };
  });
  return {
    ...snapshot,
    nodes: nodeSnapshot,
  };
}
