import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_REROUTE_BUDGET,
  NODE_TOPOLOGY,
  OWNER_COMMAND_CATALOG,
  SHARDS,
} from './config';
import {
  buildCheckpointSnapshot,
  CheckpointStore,
  embedNodesIntoCheckpoint,
} from './checkpoint';
import { EventStream } from './eventStream';
import { JobRegistry } from './jobRegistry';
import { NodeMarketplace } from './nodeMarketplace';
import { RegionalRouter } from './regionalRouter';
import type {
  FabricEvent,
  OwnerCommandExecution,
  ReportSummary,
  RunConfiguration,
  ShardId,
} from './types';
import type {
  NodeRuntimeState,
  RuntimeMetrics,
  ShardRuntimeState,
} from './types';

interface OwnerCommandContext {
  readonly execute: (name: string, payload?: Record<string, unknown>) => void;
  readonly log: OwnerCommandExecution[];
}

export class PlanetaryOrchestrator {
  private readonly jobRegistry: JobRegistry;
  private readonly marketplace: NodeMarketplace;
  private readonly routers: Map<ShardId, RegionalRouter> = new Map();
  private readonly checkpointStore: CheckpointStore;
  private readonly eventStream: EventStream;
  private readonly events: FabricEvent[] = [];
  private readonly ownerCommandLog: OwnerCommandExecution[] = [];
  private readonly tickBaseline: number;
  private paused = false;

  constructor(private readonly config: RunConfiguration) {
    this.eventStream = new EventStream(
      config.eventsPath ??
        join(
          'demo',
          'Planetary-Orchestrator-Fabric-v0',
          'reports',
          config.label,
          'events.ndjson'
        )
    );
    this.jobRegistry = new JobRegistry((event) => this.recordEvent(event));
    this.marketplace = new NodeMarketplace(
      NODE_TOPOLOGY,
      (event) => this.recordEvent(event),
      {
        tick: this.jobRegistry.getMetrics().tick,
      }
    );
    this.checkpointStore = new CheckpointStore({
      path:
        config.checkpointPath ??
        join(
          'demo',
          'Planetary-Orchestrator-Fabric-v0',
          'storage',
          `${config.label}.checkpoint.json`
        ),
    });
    SHARDS.forEach((shardId) => {
      const shardState = this.jobRegistry.getShardState(shardId);
      shardState.rerouteBudget = DEFAULT_REROUTE_BUDGET[shardId];
      this.routers.set(
        shardId,
        new RegionalRouter(
          {
            shard: shardState,
            overflowThreshold: config.ciMode ? 120 : 80,
          },
          (job, shard) => this.marketplace.allocate(job, shard),
          (jobId, destination, origin) =>
            this.jobRegistry.requeueJob(
              jobId,
              destination,
              this.currentTick(),
              origin
            ),
          (event) => this.recordEvent(event)
        )
      );
    });
    if (config.resumeFromCheckpoint) {
      this.restoreFromCheckpoint();
    }
    this.tickBaseline = this.jobRegistry.getMetrics().tick;
  }

  public currentTick(): number {
    return this.jobRegistry.getMetrics().tick;
  }

  public relativeTick(): number {
    return this.currentTick() - this.tickBaseline;
  }

  private recordEvent(event: FabricEvent): void {
    this.events.push(event);
    this.eventStream.write(event);
  }

  public seedInitialJobs(): void {
    this.jobRegistry.seedJobs(this.config.jobsHighLoad, 0, this.currentTick());
  }

  public async run(
    maxTicks?: number,
    onTick?: (params: {
      tick: number;
      orchestrator: PlanetaryOrchestrator;
    }) => void | Promise<void>
  ): Promise<void> {
    const targetTicks = maxTicks ?? Number.POSITIVE_INFINITY;
    while (!this.isComplete() && this.currentTick() < targetTicks) {
      if (!this.paused) {
        this.dispatchAssignments();
        this.progressAssignments();
        this.simulateHeartbeats();
      }
      if (onTick) {
        await onTick({ tick: this.currentTick(), orchestrator: this });
      }
      this.marketplace.updateBoosts();
      this.jobRegistry.advanceTick();
      await this.persistCheckpointIfNeeded();
    }
    await this.persistCheckpointIfNeeded(true);
    this.eventStream.close();
  }

  public simulateOutage(nodeId: string): void {
    const node = this.marketplace.getNode(nodeId);
    if (!node) {
      return;
    }
    node.status = 'offline';
    node.assignments.forEach((assignment) => {
      this.jobRegistry.requeueJob(
        assignment.jobId,
        node.descriptor.region,
        this.currentTick(),
        node.descriptor.region
      );
    });
    node.assignments = [];
  }

  private dispatchAssignments(): void {
    SHARDS.forEach((shardId) => {
      const shardState = this.jobRegistry.getShardState(shardId);
      if (shardState.paused) {
        return;
      }
      const queueSnapshot = [...shardState.queue];
      for (const jobId of queueSnapshot) {
        const job = this.jobRegistry.getJob(jobId);
        if (!job || job.status !== 'pending') {
          continue;
        }
        const router = this.routers.get(shardId);
        if (!router) {
          continue;
        }
        const node = router.route(job, this.currentTick());
        if (!node) {
          continue;
        }
        this.marketplace.assign(node, job);
        this.jobRegistry.assignJob(
          job.id,
          node.descriptor.id,
          this.currentTick()
        );
      }
    });
  }

  private progressAssignments(): void {
    this.marketplace.listNodes().forEach((node) => {
      if (node.status !== 'active' && node.status !== 'recovering') {
        return;
      }
      const throughput =
        this.marketplace.getEffectiveCapacity(node) +
        node.descriptor.performance;
      node.assignments.forEach((assignment) => {
        assignment.workRemaining -= throughput;
        const job = this.jobRegistry.getJob(assignment.jobId);
        if (!job) {
          return;
        }
        job.workRemaining = Math.max(0, assignment.workRemaining);
        job.progress = 1 - job.workRemaining / job.workRequired;
        assignment.progress = job.progress;
        if (assignment.workRemaining <= 0) {
          this.jobRegistry.completeJob(assignment.jobId, this.currentTick());
          this.marketplace.complete(node.descriptor.id, assignment.jobId);
        }
      });
      node.assignments = node.assignments.filter(
        (assignment) => assignment.workRemaining > 0
      );
    });

    const lostAssignments = this.marketplace.simulateReliability(
      this.currentTick()
    );
    lostAssignments.forEach(({ jobIds }) => {
      jobIds.forEach((jobId) => {
        const job = this.jobRegistry.getJob(jobId);
        if (job) {
          this.jobRegistry.interruptJob(
            jobId,
            this.currentTick(),
            'node-offline'
          );
        }
      });
    });
  }

  private simulateHeartbeats(): void {
    this.marketplace.listNodes().forEach((node) => {
      this.marketplace.heartbeat(node.descriptor.id, this.currentTick());
    });
  }

  public isComplete(): boolean {
    const metrics = this.jobRegistry.getMetrics();
    return (
      metrics.jobsCompleted + metrics.jobsFailed >= metrics.jobsSubmitted &&
      metrics.jobsSubmitted > 0
    );
  }

  private async persistCheckpointIfNeeded(force = false): Promise<void> {
    if (!force && this.currentTick() % 25 !== 0) {
      return;
    }
    const shardMap = new Map<ShardId, ShardRuntimeState>(
      SHARDS.map(
        (shard) =>
          [shard, this.jobRegistry.getShardState(shard)] as [
            ShardId,
            ShardRuntimeState
          ]
      )
    );
    const snapshot = buildCheckpointSnapshot({
      tick: this.currentTick(),
      jobs: this.jobRegistry.exportSerializedJobs(),
      jobsSeedCount: this.jobRegistry.getSeedCount(),
      shardState: shardMap,
      metrics: this.jobRegistry.getMetrics(),
      ownerCommandLog: this.ownerCommandLog,
      paused: this.paused,
    });
    const embedded = embedNodesIntoCheckpoint(
      snapshot,
      new Map(
        this.marketplace.listNodes().map((node) => [node.descriptor.id, node])
      )
    );
    await this.checkpointStore.save(embedded);
  }

  private restoreFromCheckpoint(): void {
    const snapshot = this.checkpointStore.load();
    if (!snapshot) {
      return;
    }
    this.jobRegistry.adoptSnapshot({
      jobsSeedCount: snapshot.jobsSeedCount,
      jobs: snapshot.jobs,
      shardQueues: snapshot.shardQueues,
      metrics: snapshot.metrics as RuntimeMetrics,
      shards: snapshot.shards as Record<ShardId, ShardRuntimeState>,
    });
    this.jobRegistry.seedJobs(0, snapshot.jobsSeedCount, snapshot.metrics.tick);
    this.marketplace.adoptSnapshot(
      snapshot.nodes as Record<string, NodeRuntimeState>
    );
    this.paused = snapshot.paused;
    this.ownerCommandLog.push(...snapshot.ownerCommandLog);
  }

  public ownerCommands(): OwnerCommandContext {
    return {
      execute: (name, payload) => this.executeOwnerCommand(name, payload),
      log: this.ownerCommandLog,
    };
  }

  private executeOwnerCommand(
    name: string,
    payload?: Record<string, unknown>
  ): void {
    switch (name) {
      case 'pauseFabric':
        this.paused = true;
        this.recordEvent({
          type: 'orchestrator:pause',
          tick: this.currentTick(),
          details: { payload },
        });
        break;
      case 'resumeFabric':
        this.paused = false;
        this.recordEvent({
          type: 'orchestrator:resume',
          tick: this.currentTick(),
          details: { payload },
        });
        break;
      case 'rerouteShardTo': {
        const origin = payload?.origin as ShardId;
        const destination = payload?.destination as ShardId;
        const percentage = Number(payload?.percentage ?? 0);
        if (!origin || !destination || origin === destination) {
          throw new Error('Invalid reroute command payload.');
        }
        const shardState = this.jobRegistry.getShardState(origin);
        const rerouteCount = Math.ceil(shardState.queue.length * percentage);
        for (let i = 0; i < rerouteCount; i += 1) {
          const jobId = shardState.queue[i];
          if (jobId) {
            this.jobRegistry.requeueJob(
              jobId,
              destination,
              this.currentTick(),
              origin
            );
            const node = this.marketplace.allocate(
              this.jobRegistry.getJob(jobId)!,
              destination
            );
            if (node) {
              this.marketplace.spilloverHandled(node.descriptor.id);
            }
          }
        }
        break;
      }
      case 'boostNodeCapacity': {
        const nodeId = String(payload?.nodeId ?? '');
        const multiplier = Number(payload?.multiplier ?? 1);
        const duration = Number(payload?.duration ?? 10);
        if (!nodeId || Number.isNaN(multiplier) || Number.isNaN(duration)) {
          throw new Error('Invalid boost payload.');
        }
        this.marketplace.applyBoost(nodeId, multiplier, duration);
        break;
      }
      case 'updateShardBudget': {
        const shard = payload?.shard as ShardId;
        const budget = Number(payload?.budget);
        if (!shard || Number.isNaN(budget)) {
          throw new Error('Invalid budget payload.');
        }
        const shardState = this.jobRegistry.getShardState(shard);
        shardState.rerouteBudget = budget;
        break;
      }
      default:
        throw new Error(`Unknown owner command ${name}`);
    }
    const command: OwnerCommandExecution = {
      command: name,
      payload,
      tick: this.currentTick(),
    };
    this.ownerCommandLog.push(command);
    this.recordEvent({
      type: 'owner:command',
      tick: this.currentTick(),
      details: { command: name, payload },
    });
  }

  public generateSummary(reportDir: string): ReportSummary {
    const metrics = this.jobRegistry.getMetrics();
    const nodes = this.marketplace.listNodes();
    const shards: Record<ShardId, ShardRuntimeState> = {
      earth: this.jobRegistry.getShardState('earth'),
      mars: this.jobRegistry.getShardState('mars'),
      luna: this.jobRegistry.getShardState('luna'),
      helios: this.jobRegistry.getShardState('helios'),
      edge: this.jobRegistry.getShardState('edge'),
    };

    const summary: ReportSummary = {
      runLabel: this.config.label,
      metrics: {
        tick: metrics.tick,
        jobsSubmitted: metrics.jobsSubmitted,
        jobsCompleted: metrics.jobsCompleted,
        jobsFailed: metrics.jobsFailed,
        dropRate:
          metrics.jobsSubmitted === 0
            ? 0
            : (metrics.jobsSubmitted - metrics.jobsCompleted) /
              metrics.jobsSubmitted,
        averageLatency:
          metrics.jobsCompleted === 0
            ? 0
            : metrics.totalLatency / metrics.jobsCompleted,
        reassignments: metrics.reassignments,
        spillovers: metrics.spillovers,
      },
      shards: Object.fromEntries(
        SHARDS.map((shardId) => {
          const shard = shards[shardId];
          return [
            shardId,
            {
              queueDepth: shard.queue.length,
              backlogHistory: shard.backlogHistory.slice(-32),
              jobsCompleted: shard.completed,
              jobsFailed: shard.failed,
              spilloversOut: shard.spilloversOut,
              spilloversIn: shard.spilloversIn,
              rerouteBudget: shard.rerouteBudget,
              paused: shard.paused,
            },
          ];
        })
      ) as ReportSummary['shards'],
      nodes: Object.fromEntries(
        nodes.map((node) => [
          node.descriptor.id,
          {
            status: node.status,
            assignments: node.assignments.length,
            totalCompleted: node.totalCompleted,
            totalFailed: node.totalFailed,
            downtimeTicks: node.downtimeTicks,
            spilloversHandled: node.spilloversHandled,
          },
        ])
      ),
      ownerCommands: {
        executed: [...this.ownerCommandLog],
        catalog: OWNER_COMMAND_CATALOG.map((command) => ({
          name: command.name,
          description: command.description,
          parameters: command.parameters,
        })),
      },
      checkpoint: {
        path: this.checkpointStore.path,
        tick: metrics.tick,
        jobsSeedCount: this.jobRegistry.getSeedCount(),
      },
    };

    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      join(reportDir, 'summary.json'),
      JSON.stringify(summary, null, 2),
      'utf8'
    );
    writeFileSync(
      join(reportDir, 'owner-commands-executed.json'),
      JSON.stringify({ executed: this.ownerCommandLog }, null, 2)
    );
    writeFileSync(
      join(reportDir, 'owner-script.json'),
      JSON.stringify(
        {
          pauseAll: {
            command: 'pauseFabric',
            payload: { reason: 'Owner maintenance window' },
          },
          rerouteMarsToHelios: {
            command: 'rerouteShardTo',
            payload: {
              origin: 'mars',
              destination: 'helios',
              percentage: 0.35,
            },
          },
          boostHeliosArray: {
            command: 'boostNodeCapacity',
            payload: {
              nodeId: 'helios.gpu-array',
              multiplier: 1.6,
              duration: 64,
            },
          },
          directOwnerCommands: {
            pauseFabric: {
              command: 'pauseFabric',
              payload: { reason: 'Circuit-breaker triggered by owner' },
            },
            resumeFabric: {
              command: 'resumeFabric',
              payload: {},
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    return summary;
  }
}
