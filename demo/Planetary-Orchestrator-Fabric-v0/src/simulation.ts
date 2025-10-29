import { promises as fs } from 'fs';
import { createWriteStream, WriteStream } from 'fs';
import { once } from 'events';
import { dirname, join } from 'path';
import { CheckpointManager } from './checkpoint';
import { PlanetaryOrchestrator } from './orchestrator';
import {
  FabricConfig,
  FabricEvent,
  FabricMetrics,
  JobDefinition,
  LedgerSnapshot,
  NodeDefinition,
  OwnerCommandSchedule,
  SimulationArtifacts,
  SimulationOptions,
  RunMetadata,
} from './types';
import { countJobsInBlueprint, expandJobBlueprint } from './job-blueprint';

const MIN_OUTAGE_TICK = 5;
const MAX_OUTAGE_TICK = 80;

function coercePositiveInteger(value: number): number {
  return Math.max(1, Math.floor(value));
}

export interface SimulationResult {
  metrics: FabricMetrics;
  artifacts: SimulationArtifacts;
  checkpointRestored: boolean;
  executedOwnerCommands: OwnerCommandSchedule[];
  skippedOwnerCommands: OwnerCommandSchedule[];
  pendingOwnerCommands: OwnerCommandSchedule[];
  run: RunMetadata;
}

function cloneSchedule(schedule: OwnerCommandSchedule): OwnerCommandSchedule {
  return JSON.parse(JSON.stringify(schedule)) as OwnerCommandSchedule;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function computeOutageTick(plannedJobs: number, explicit?: number): number {
  if (explicit !== undefined) {
    return coercePositiveInteger(explicit);
  }
  const derived = Math.floor(plannedJobs / 400);
  return Math.min(MAX_OUTAGE_TICK, Math.max(MIN_OUTAGE_TICK, derived));
}

function computeTickBudgets(
  plannedJobs: number,
  startTick: number,
  stopAfterTicks: number | undefined
): { initialLimit: number; hardLimit: number; extensionWindow: number } {
  const baseWindow = Math.max(Math.ceil(plannedJobs * 0.4), 200);
  if (stopAfterTicks !== undefined) {
    const stopTick = startTick + coercePositiveInteger(stopAfterTicks);
    return { initialLimit: stopTick, hardLimit: stopTick, extensionWindow: baseWindow };
  }
  const hardLimit = startTick + Math.max(baseWindow * 4, Math.ceil(plannedJobs * 1.5), 2000);
  return { initialLimit: startTick + baseWindow, hardLimit, extensionWindow: baseWindow };
}

type OwnerStateSnapshot = ReturnType<PlanetaryOrchestrator['getOwnerState']>;

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');
const PERCENT_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

function formatInteger(value: number): string {
  return INTEGER_FORMATTER.format(Math.round(value));
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return PERCENT_FORMATTER.format(0);
  }
  return PERCENT_FORMATTER.format(Math.max(0, value));
}

function summariseOwnerCommand(command: OwnerCommandSchedule['command']): string {
  switch (command.type) {
    case 'system.pause':
      return 'Pause planetary fabric';
    case 'system.resume':
      return 'Resume planetary fabric';
    case 'shard.pause':
      return `Pause shard ${command.shard}`;
    case 'shard.resume':
      return `Resume shard ${command.shard}`;
    case 'shard.update': {
      const updates: string[] = [];
      if (command.update.displayName) {
        updates.push(`display name → ${command.update.displayName}`);
      }
      if (command.update.latencyBudgetMs !== undefined) {
        updates.push(`latency budget → ${command.update.latencyBudgetMs}ms`);
      }
      if (command.update.maxQueue !== undefined) {
        updates.push(`max queue → ${command.update.maxQueue}`);
      }
      if (command.update.spilloverTargets) {
        updates.push(`spillover targets → ${command.update.spilloverTargets.join(', ')}`);
      }
      if (command.update.router?.queueAlertThreshold !== undefined) {
        updates.push(`queue alert → ${command.update.router.queueAlertThreshold}`);
      }
      if (command.update.router?.spilloverPolicies) {
        updates.push('spillover policies tuned');
      }
      const summary = updates.length > 0 ? ` (${updates.join('; ')})` : '';
      return `Update shard ${command.shard}${summary}`;
    }
    case 'node.update': {
      const updates: string[] = [];
      if (command.update.capacity !== undefined) {
        updates.push(`capacity → ${command.update.capacity}`);
      }
      if (command.update.maxConcurrency !== undefined) {
        updates.push(`max concurrency → ${command.update.maxConcurrency}`);
      }
      if (command.update.specialties) {
        updates.push(`specialties → ${command.update.specialties.join(', ')}`);
      }
      if (command.update.heartbeatIntervalSec !== undefined) {
        updates.push(`heartbeat → ${command.update.heartbeatIntervalSec}s`);
      }
      if (command.update.region) {
        updates.push(`region → ${command.update.region}`);
      }
      const summary = updates.length > 0 ? ` (${updates.join('; ')})` : '';
      return `Update node ${command.nodeId}${summary}`;
    }
    case 'node.register':
      return `Register node ${command.node.id} in ${command.node.region}`;
    case 'node.deregister':
      return `Deregister node ${command.nodeId}`;
    case 'job.cancel':
      return command.jobId ? `Cancel job ${command.jobId}` : 'Cancel targeted job';
    case 'job.reroute': {
      const identifier = command.jobId ? command.jobId : 'targeted job';
      return `Reroute ${identifier} to shard ${command.targetShard}`;
    }
    case 'checkpoint.save':
      return 'Save checkpoint snapshot';
    case 'checkpoint.configure': {
      const updates: string[] = [];
      if (command.update.intervalTicks !== undefined) {
        updates.push(`interval → ${command.update.intervalTicks} ticks`);
      }
      if (command.update.path) {
        updates.push(`path → ${command.update.path}`);
      }
      const summary = updates.length > 0 ? ` (${updates.join('; ')})` : '';
      return `Configure checkpoint${summary}`;
    }
    case 'reporting.configure': {
      const updates: string[] = [];
      if (command.update.directory) {
        updates.push(`directory → ${command.update.directory}`);
      }
      if (command.update.defaultLabel) {
        updates.push(`label → ${command.update.defaultLabel}`);
      }
      const summary = updates.length > 0 ? ` (${updates.join('; ')})` : '';
      return `Configure reporting${summary}`;
    }
    default: {
      const fallback = command as { type: string };
      return fallback.type ?? 'unknown.command';
    }
  }
}


function buildMissionChronicleMarkdown(args: {
  config: FabricConfig;
  options: SimulationOptions;
  metrics: FabricMetrics;
  ownerState: ReturnType<PlanetaryOrchestrator['getOwnerState']>;
  ledger: LedgerSnapshot;
  shardSnapshots: Record<string, { queueDepth: number; inFlight: number; completed: number }>;
  shardStats: Record<string, { completed: number; failed: number; spillovers: number }>;
  nodeSnapshots: Record<string, { active: boolean; runningJobs: number }>;
  executedCommands: OwnerCommandSchedule[];
  skippedCommands: OwnerCommandSchedule[];
  pendingCommands: OwnerCommandSchedule[];
  run: RunMetadata;
  missionGraphRelativePath: string;
  ownerScriptRelativePath: string;
  summaryRelativePath: string;
}): string {
  const {
    config,
    options,
    metrics,
    ownerState,
    ledger,
    shardSnapshots,
    shardStats,
    nodeSnapshots,
    executedCommands,
    skippedCommands,
    pendingCommands,
    run,
    missionGraphRelativePath,
    ownerScriptRelativePath,
    summaryRelativePath,
  } = args;

  const label = options.outputLabel ?? config.reporting.defaultLabel;
  const dropCount = Math.max(0, metrics.jobsSubmitted - metrics.jobsCompleted);
  const dropRate = metrics.jobsSubmitted === 0 ? 0 : dropCount / metrics.jobsSubmitted;
  const failureRate = metrics.jobsSubmitted === 0 ? 0 : metrics.jobsFailed / metrics.jobsSubmitted;
  const spilloverRate = metrics.jobsSubmitted === 0 ? 0 : metrics.spillovers / metrics.jobsSubmitted;
  const valueDrop = Math.max(0, metrics.valueSubmitted - metrics.valueCompleted - metrics.valueCancelled);
  const valueDropRate = metrics.valueSubmitted === 0 ? 0 : valueDrop / metrics.valueSubmitted;
  const valueFailureRate = metrics.valueSubmitted === 0 ? 0 : metrics.valueFailed / metrics.valueSubmitted;
  const resilienceSignals = [
    run.checkpointRestored
      ? '✅ Orchestrator resumed from checkpoint with zero data loss.'
      : '⚠️ Run executed without checkpoint restoration.',
    run.stoppedEarly
      ? `⚠️ Run halted early at tick ${formatInteger(run.stopTick ?? metrics.tick)} (${run.stopReason ?? 'stop directive'})`
      : '✅ Run completed without an enforced stop.',
    ownerState.systemPaused
      ? '⚠️ System currently paused by owner command.'
      : '✅ Fabric is live and stewarded by owner safeguards.',
  ];

  const shardRows = Object.entries(shardSnapshots).map(([shardId, snapshot]) => {
    const configEntry = config.shards.find((entry) => entry.id === shardId);
    const displayName = configEntry?.displayName ?? shardId;
    const stats = shardStats[shardId] ?? { completed: 0, failed: 0, spillovers: 0 };
    return `| ${displayName} (${shardId}) | ${formatInteger(snapshot.queueDepth)} | ${formatInteger(snapshot.inFlight)} | ${formatInteger(snapshot.completed)} | ${formatInteger(stats.failed)} | ${formatInteger(stats.spillovers)} |`;
  });

  const nodeRows = Object.entries(nodeSnapshots).map(([nodeId, snapshot]) => {
    const definition = config.nodes.find((entry) => entry.id === nodeId);
    const region = definition?.region ?? 'n/a';
    const capacity = definition?.capacity ?? 0;
    const concurrency = definition?.maxConcurrency ?? 0;
    const status = snapshot.active ? '✅ Active' : '⚠️ Offline';
    return `| ${nodeId} | ${region} | ${formatInteger(capacity)} | ${formatInteger(concurrency)} | ${status} | ${formatInteger(snapshot.runningJobs)} |`;
  });

  const invariantLines = ledger.invariants.map((entry) =>
    `${entry.ok ? '✅' : '❌'} ${entry.message}`
  );
  const flowRows = ledger.flows.map((flow) => `| ${flow.from} → ${flow.to} | ${formatInteger(flow.count)} |`);

  const executedLines = executedCommands.slice(0, 12).map((entry) => {
    const description = summariseOwnerCommand(entry.command);
    const note = entry.note ? ` — ${entry.note}` : '';
    return `- Tick ${formatInteger(entry.tick)}: ${description}${note}`;
  });
  if (executedCommands.length > executedLines.length) {
    executedLines.push(`- … ${executedCommands.length - executedLines.length} additional command(s) executed.`);
  }

  const skippedLines = skippedCommands.map((entry) => {
    const description = summariseOwnerCommand(entry.command);
    const note = entry.note ? ` — ${entry.note}` : '';
    return `- Tick ${formatInteger(entry.tick)}: ${description}${note}`;
  });

  const pendingLines = pendingCommands.map((entry) => {
    const description = summariseOwnerCommand(entry.command);
    const note = entry.note ? ` — ${entry.note}` : '';
    return `- Tick ${formatInteger(entry.tick)}: ${description}${note}`;
  });

  const lines: string[] = [];
  lines.push('# Planetary Orchestrator Fabric – Mission Chronicle');
  lines.push('');
  lines.push(`**Label:** ${label}  |  **Owner:** ${config.owner.name}  |  **Global Multisig:** ${config.owner.multisig}`);
  lines.push('');
  lines.push(
    'AGI Jobs v0 (v2) executed this planetary mission so that a non-technical owner could wield a superintelligent, sharded orchestration fabric without touching source code. '
      + 'This chronicle is the operator-grade briefing capturing throughput, spillover dynamics, and governance actions in a single, human-readable ledger.'
  );
  lines.push('');
  lines.push('## Run Overview');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Final tick | ${formatInteger(metrics.tick)} |`);
  lines.push(`| Jobs submitted | ${formatInteger(metrics.jobsSubmitted)} |`);
  lines.push(`| Jobs completed | ${formatInteger(metrics.jobsCompleted)} |`);
  lines.push(`| Jobs failed | ${formatInteger(metrics.jobsFailed)} |`);
  lines.push(`| Jobs cancelled | ${formatInteger(metrics.jobsCancelled)} |`);
  lines.push(`| Spillovers orchestrated | ${formatInteger(metrics.spillovers)} |`);
  lines.push(`| Reassignments after failures | ${formatInteger(metrics.reassignedAfterFailure)} |`);
  lines.push(`| Owner interventions recorded | ${formatInteger(ownerState.metrics.ownerInterventions)} |`);
  lines.push(`| Value submitted | ${formatInteger(metrics.valueSubmitted)} |`);
  lines.push(`| Value completed | ${formatInteger(metrics.valueCompleted)} |`);
  lines.push(`| Value failed | ${formatInteger(metrics.valueFailed)} |`);
  lines.push(`| Value cancelled | ${formatInteger(metrics.valueCancelled)} |`);
  lines.push(`| Value spilled across shards | ${formatInteger(metrics.valueSpillovers)} |`);
  lines.push(`| Value reassigned after failures | ${formatInteger(metrics.valueReassigned)} |`);
  lines.push('');
  lines.push('## Reliability Signals');
  lines.push('');
  lines.push(`- Drop rate: **${formatPercent(dropRate)}** (${formatInteger(dropCount)} job(s) outstanding)`);
  lines.push(`- Failure rate: **${formatPercent(failureRate)}**`);
  lines.push(`- Spillover intensity: **${formatPercent(spilloverRate)}** of total work redirected across shards`);
  lines.push(`- Owner pause toggles: ${formatInteger(ownerState.metrics.systemPauses)} system / ${formatInteger(ownerState.metrics.shardPauses)} shard`);
  lines.push(`- Value drop rate: **${formatPercent(valueDropRate)}** (${formatInteger(valueDrop)} value units outstanding)`);
  lines.push(`- Value failure rate: **${formatPercent(valueFailureRate)}**`);
  lines.push(`- Value reassigned: ${formatInteger(metrics.valueReassigned)} economic units rerouted after outages`);
  lines.push('');
  resilienceSignals.forEach((signal) => lines.push(`- ${signal}`));
  lines.push('');
  lines.push('## Shard Throughput & Backlog');
  lines.push('');
  if (shardRows.length > 0) {
    lines.push('| Shard | Queue Depth | In Flight | Completed | Failed | Spillovers Out |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    lines.push(...shardRows);
  } else {
    lines.push('No shard telemetry captured.');
  }
  lines.push('');
  lines.push('## Node Marketplace Pulse');
  lines.push('');
  if (nodeRows.length > 0) {
    lines.push('| Node | Region | Capacity | Max Concurrency | Status | Running Jobs |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    lines.push(...nodeRows);
  } else {
    lines.push('No nodes registered in this run.');
  }
  lines.push('');
  lines.push('## Ledger Guarantees');
  lines.push('');
  lines.push(`- Total ledger events sampled: ${formatInteger(ledger.totalEvents)}`);
  lines.push(`- Owner command events sampled: ${formatInteger(ledger.ownerEvents)}`);
  const queueDigest = Object.entries(ledger.queueDepthByShard)
    .map(([id, queue]) => `${id}: ${formatInteger(queue.queue)} queued / ${formatInteger(queue.inFlight)} in-flight`)
    .join('; ');
  if (queueDigest) {
    lines.push(`- Queue depth snapshot: ${queueDigest}`);
  }
  lines.push('');
  if (invariantLines.length > 0) {
    lines.push('### Ledger Invariants');
    invariantLines.forEach((entry) => lines.push(entry));
    lines.push('');
  }
  if (flowRows.length > 0) {
    lines.push('### Inter-Shard Spillover Flows');
    lines.push('| Route | Jobs |');
    lines.push('| --- | --- |');
    lines.push(...flowRows);
    lines.push('');
  }
  lines.push('## Owner Command Timeline');
  lines.push('');
  if (executedLines.length > 0) {
    lines.push(...executedLines);
  } else {
    lines.push('- No owner commands were executed during this run.');
  }
  lines.push('');
  if (skippedLines.length > 0) {
    lines.push('### Commands Skipped Pre-Resume');
    lines.push(...skippedLines);
    lines.push('');
  }
  if (pendingLines.length > 0) {
    lines.push('### Pending Commands Still Scheduled');
    lines.push(...pendingLines);
    lines.push('');
  }
  lines.push('## Governance & Checkpoint Control');
  lines.push('');
  lines.push(`- Checkpoint path: ${'`'}${ownerState.checkpoint.path}${'`'} (interval ${formatInteger(ownerState.checkpoint.intervalTicks)} tick(s))`);
  lines.push(`- Reporting directory: ${'`'}${ownerState.reporting.directory}${'`'} (default label ${'`'}${ownerState.reporting.defaultLabel}${'`'})`);
  lines.push(
    ownerState.pausedShards.length > 0
      ? `- Paused shards: ${ownerState.pausedShards.join(', ')}`
      : '- All shards currently active.'
  );
  lines.push('');
  lines.push('## Artifact Index for Mission Directors');
  lines.push('');
  lines.push('- Mission summary JSON: `' + summaryRelativePath + '`');
  lines.push('- Owner command payloads: `' + ownerScriptRelativePath + '`');
  lines.push('- Planetary topology mermaid: `' + missionGraphRelativePath + '`');
  lines.push('- Interactive dashboard: `./dashboard.html`');
  lines.push('- Ledger snapshot: `./ledger.json`');
  lines.push('');
  lines.push('## Empowerment Highlights');
  lines.push('');
  lines.push('- **Non-technical mastery:** Every command above is replayable directly from the generated owner scripts, ensuring executives can reproduce the superintelligent behaviour without touching code.');
  lines.push('- **Spillover governance:** Regional spillovers and failover assignments are logged for audit, proving that Kardashev-grade throughput stayed deterministic and balanced.');
  lines.push('- **Instant restart readiness:** The checkpoint configuration and ledger invariants document exactly how the orchestrator resumes after a kill-switch drill, guaranteeing business continuity.');
  lines.push('');
  lines.push('This chronicle demonstrates that AGI Jobs v0 (v2) empowers mission owners to direct a planetary workforce with the precision, transparency, and command authority expected from a post-capital superintelligence.');
  lines.push('');
  lines.push(
    `**Reliability digest:** Drop rate ${formatPercent(dropRate)} · Failure rate ${formatPercent(failureRate)} · Value drop ${formatPercent(valueDropRate)} · Value failure ${formatPercent(valueFailureRate)} · Spillover rate ${formatPercent(spilloverRate)}.`
  );
  lines.push('');

  return lines.join('\n');
}

class ReportOutputManager {
  private eventsStream?: WriteStream;
  private eventsFilePath!: string;
  private currentBaseDir: string;
  private currentLabel: string;
  private readonly preserveReports: boolean;
  private readonly explicitLabel: boolean;

  private constructor(
    baseDirectory: string,
    label: string,
    preserveReports: boolean,
    explicitLabel: boolean
  ) {
    this.currentBaseDir = baseDirectory;
    this.currentLabel = label;
    this.preserveReports = preserveReports;
    this.explicitLabel = explicitLabel;
  }

  static async create(config: FabricConfig, options: SimulationOptions): Promise<ReportOutputManager> {
    const label = options.outputLabel ?? config.reporting.defaultLabel;
    const preserve = Boolean(options.resume && options.preserveReportDirOnResume !== false);
    const manager = new ReportOutputManager(config.reporting.directory, label, preserve, options.outputLabel !== undefined);
    await manager.retarget(config.reporting.directory, label, { initial: true });
    return manager;
  }

  get reportDir(): string {
    return join(this.currentBaseDir, this.currentLabel);
  }

  get eventsPath(): string {
    return this.eventsFilePath;
  }

  get label(): string {
    return this.currentLabel;
  }

  async appendEvents(events: FabricEvent[]): Promise<void> {
    if (!this.eventsStream || events.length === 0) {
      return;
    }
    for (const event of events) {
      const ok = this.eventsStream.write(`${JSON.stringify(event)}\n`);
      if (!ok) {
        await once(this.eventsStream, 'drain');
      }
    }
  }

  async finalize(): Promise<void> {
    await this.closeEventsStream();
  }

  async syncTo(reporting: FabricConfig['reporting']): Promise<void> {
    const targetBase = reporting.directory;
    const targetLabel = this.explicitLabel ? this.currentLabel : reporting.defaultLabel;
    if (targetBase === this.currentBaseDir && targetLabel === this.currentLabel) {
      return;
    }
    await this.retarget(targetBase, targetLabel);
  }

  private async retarget(
    baseDir: string,
    label: string,
    options: { initial?: boolean } = {}
  ): Promise<void> {
    const { initial = false } = options;
    const targetLabel = this.explicitLabel ? this.currentLabel : label;
    const newDir = join(baseDir, targetLabel);
    const oldDir = this.reportDir;

    if (!initial && newDir === oldDir && targetLabel === this.currentLabel && baseDir === this.currentBaseDir) {
      return;
    }

    if (!initial) {
      await this.closeEventsStream();
    }

    if (initial) {
      if (!this.preserveReports) {
        await fs.rm(newDir, { recursive: true, force: true });
      }
      await fs.mkdir(newDir, { recursive: true });
    } else {
      const oldExists = await pathExists(oldDir);
      const newParent = dirname(newDir);
      await fs.mkdir(newParent, { recursive: true });
      if (!this.preserveReports && (await pathExists(newDir))) {
        await fs.rm(newDir, { recursive: true, force: true });
      }
      if (oldExists && newDir !== oldDir) {
        const oldParent = dirname(oldDir);
        const tempDir = await fs.mkdtemp(join(oldParent, '.report-rotate-'));
        await fs.rename(oldDir, tempDir);
        await fs.mkdir(newParent, { recursive: true });
        await fs.rename(tempDir, newDir);
      } else {
        const newExists = await pathExists(newDir);
        if (!newExists) {
          await fs.mkdir(newDir, { recursive: true });
        }
      }
    }

    this.currentBaseDir = baseDir;
    if (!this.explicitLabel) {
      this.currentLabel = label;
    }
    this.eventsFilePath = join(newDir, 'events.ndjson');
    const initialWrite = initial && !this.preserveReports;
    const flags = initialWrite ? 'w' : 'a';
    this.eventsStream = createWriteStream(this.eventsFilePath, { encoding: 'utf8', flags });
  }

  private async closeEventsStream(): Promise<void> {
    if (!this.eventsStream) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.eventsStream!.end((error: NodeJS.ErrnoException | null | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.eventsStream = undefined;
  }
}

export async function runSimulation(
  config: FabricConfig,
  options: SimulationOptions
): Promise<SimulationResult> {
  const checkpointPath = options.checkpointPath ?? config.checkpoint.path;
  const checkpointManager = new CheckpointManager(checkpointPath);
  const orchestrator = new PlanetaryOrchestrator(config, checkpointManager);
  const reportManager = await ReportOutputManager.create(config, options);
  const checkpointRestored = options.resume ? await orchestrator.restoreFromCheckpoint() : false;
  const startTick = orchestrator.currentTick;
  const stopAfterTicks = options.stopAfterTicks;
  if (stopAfterTicks !== undefined) {
    if (!Number.isFinite(stopAfterTicks) || stopAfterTicks <= 0) {
      throw new Error('stop-after-ticks must be a positive number');
    }
  }

  const jobBlueprintCount = countJobsInBlueprint(options.jobBlueprint);
  const plannedJobs = jobBlueprintCount > 0 ? jobBlueprintCount : options.jobs;
  if (plannedJobs <= 0) {
    throw new Error('Simulation requires at least one job. Provide --jobs or a non-empty blueprint.');
  }

  const flushEvents = async (): Promise<void> => {
    const events = orchestrator.fabricEvents;
    if (events.length > 0) {
      await reportManager.appendEvents(events);
    }
  };

  if (checkpointRestored) {
    await flushEvents();
  }
  await reportManager.syncTo(orchestrator.getOwnerState().reporting);

  const scheduledCommands = [...(options.ownerCommands ?? [])].sort((a, b) => a.tick - b.tick);
  const executedCommands: OwnerCommandSchedule[] = [];
  const skippedDueToCheckpoint: OwnerCommandSchedule[] = [];
  let commandIndex = 0;
  const stopAtTick = stopAfterTicks !== undefined ? startTick + Math.ceil(stopAfterTicks) : undefined;
  let stoppedEarly = false;
  let stopTick: number | undefined;
  let stopReason: string | undefined;

  const executeCommand = async (schedule: OwnerCommandSchedule): Promise<void> => {
    await orchestrator.applyOwnerCommand(schedule.command);
    executedCommands.push(cloneSchedule(schedule));
    await flushEvents();
    if (schedule.command.type === 'reporting.configure') {
      await reportManager.syncTo(orchestrator.getOwnerState().reporting);
    }
  };

  if (checkpointRestored) {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= startTick) {
      skippedDueToCheckpoint.push(cloneSchedule(scheduledCommands[commandIndex]));
      commandIndex += 1;
    }
  } else {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= startTick) {
      const schedule = scheduledCommands[commandIndex];
      await executeCommand(schedule);
      commandIndex += 1;
    }
  }

  const applyCommandsForTick = async (tick: number): Promise<void> => {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= tick) {
      const schedule = scheduledCommands[commandIndex];
      await executeCommand(schedule);
      commandIndex += 1;
    }
  };

  if (options.ciMode) {
    process.stdout.write(
      `[ci-start] jobs=${options.jobs} restored=${checkpointRestored} tick=${startTick} stopAfter=${stopAfterTicks ?? 'none'}\n`
    );
  }

  if (!checkpointRestored) {
    await seedJobs(orchestrator, config, options, plannedJobs);
  }
  await flushEvents();

  const outageTick = computeOutageTick(plannedJobs, options.outageTick);
  const outageNodeId = options.simulateOutage;

  const { initialLimit, hardLimit, extensionWindow } = computeTickBudgets(
    plannedJobs,
    orchestrator.currentTick,
    stopAfterTicks
  );
  let tickBudgetLimit = initialLimit;
  let tick = orchestrator.currentTick;

  while (tick < tickBudgetLimit && tick < hardLimit) {
    const nextTick = tick + 1;
    await applyCommandsForTick(nextTick);
    orchestrator.processTick({ tick: nextTick });
    await flushEvents();

    if (outageNodeId && nextTick === outageTick) {
      orchestrator.markOutage(outageNodeId);
      await flushEvents();
    }

    if (nextTick % config.checkpoint.intervalTicks === 0) {
      await orchestrator.saveCheckpoint();
      await flushEvents();
    }

    if (options.ciMode && (nextTick === startTick + 1 || nextTick % 200 === 0)) {
      const snapshot = orchestrator.getShardSnapshots();
      const totalQueued = Object.values(snapshot).reduce(
        (sum, entry) => sum + entry.queueDepth + entry.inFlight,
        0
      );
      process.stdout.write(
        `[ci-progress] tick=${nextTick} queued=${totalQueued} completed=${Object.values(snapshot).reduce((sum, entry) => sum + entry.completed, 0)}\n`
      );
    }

    const jobsSettled = allJobsSettled(orchestrator);
    if (stopAtTick !== undefined && nextTick >= stopAtTick) {
      stopTick = nextTick;
      if (!jobsSettled) {
        stoppedEarly = true;
        stopReason = `stop-after-ticks=${Math.ceil(stopAfterTicks ?? 0)}`;
      } else if (!stopReason) {
        stopReason = 'completed';
      }
      tick = nextTick;
      break;
    }

    if (jobsSettled) {
      stopTick = nextTick;
      stopReason = stopReason ?? 'completed';
      tick = nextTick;
      break;
    }

    tick = nextTick;
    if (stopAtTick === undefined && tick >= tickBudgetLimit && tickBudgetLimit < hardLimit) {
      tickBudgetLimit = Math.min(tickBudgetLimit + extensionWindow, hardLimit);
    }
  }

  if (!stopTick) {
    stopTick = orchestrator.currentTick;
    if (!allJobsSettled(orchestrator)) {
      stoppedEarly = true;
      stopReason = stopReason ?? 'exhausted-tick-budget';
    } else if (!stopReason) {
      stopReason = 'completed';
    }
  }

  await orchestrator.saveCheckpoint();
  await flushEvents();
  if (stoppedEarly) {
    const outstanding = orchestrator.getShardSnapshots();
    const outstandingSummary: Record<string, { queue: number; inFlight: number }> = {};
    for (const [shardId, snapshot] of Object.entries(outstanding)) {
      outstandingSummary[shardId] = { queue: snapshot.queueDepth, inFlight: snapshot.inFlight };
    }
    const stopEvent = {
      tick: orchestrator.currentTick,
      type: 'simulation.stopped',
      message: 'Simulation halted due to stop-after-ticks directive',
      data: {
        stopTick: orchestrator.currentTick,
        directive: stopAfterTicks,
        outstanding: outstandingSummary,
      },
    };
    await reportManager.appendEvents([stopEvent]);
  }
  await reportManager.finalize();

  const metrics = orchestrator.fabricMetrics;

  if (options.ciMode) {
    process.stdout.write(
      `[ci-complete] tick=${orchestrator.currentTick} submitted=${metrics.jobsSubmitted} completed=${metrics.jobsCompleted} spillovers=${metrics.spillovers} stoppedEarly=${stoppedEarly}\n`
    );
  }

  const finalStopTick = stopTick ?? orchestrator.currentTick;
  const finalReason = stopReason ?? (allJobsSettled(orchestrator) ? 'completed' : undefined);
  const runMetadata: RunMetadata = {
    checkpointRestored,
    stoppedEarly,
    stopTick: finalStopTick,
    stopReason: finalReason,
  };

  const pendingCommands = scheduledCommands.slice(commandIndex).map(cloneSchedule);

  const reportDir = reportManager.reportDir;
  const artifacts = await writeArtifacts(
    reportDir,
    reportManager.eventsPath,
    config,
    orchestrator,
    options,
    executedCommands,
    skippedDueToCheckpoint,
    pendingCommands,
    runMetadata
  );

  return {
    metrics,
    artifacts,
    checkpointRestored,
    executedOwnerCommands: executedCommands,
    skippedOwnerCommands: skippedDueToCheckpoint,
    pendingOwnerCommands: pendingCommands,
    run: runMetadata,
  };
}

async function seedJobs(
  orchestrator: PlanetaryOrchestrator,
  config: FabricConfig,
  options: SimulationOptions,
  plannedJobs: number
): Promise<void> {
  if (options.jobBlueprint) {
    const expanded = expandJobBlueprint(options.jobBlueprint, config);
    if (expanded.length === 0) {
      throw new Error('Job blueprint must contain at least one job entry.');
    }
    if (expanded.length !== plannedJobs) {
      throw new Error(
        `Blueprint expanded job count (${expanded.length}) does not match planned job count (${plannedJobs}).`
      );
    }
    for (const job of expanded) {
      orchestrator.submitJob({ ...job, submissionTick: job.submissionTick ?? orchestrator.currentTick });
    }
    return;
  }
  const shards = config.shards;
  const skillMatrix: Record<string, string[]> = {};
  const nodesByShard: Record<string, NodeDefinition[]> = {};
  for (const node of config.nodes) {
    const list = skillMatrix[node.region] ?? [];
    skillMatrix[node.region] = Array.from(new Set([...list, ...node.specialties]));
    const nodeList = nodesByShard[node.region] ?? [];
    nodeList.push(node);
    nodesByShard[node.region] = nodeList;
  }
  for (let index = 0; index < plannedJobs; index += 1) {
    const shard = shards[index % shards.length];
    const skills = pickNodeCompatibleSkills(nodesByShard[shard.id], index) ?? pickSkills(skillMatrix[shard.id], index);
    const duration = 1 + (index % 5);
    const job: JobDefinition = {
      id: `job-${index.toString().padStart(5, '0')}`,
      shard: shard.id,
      requiredSkills: skills,
      estimatedDurationTicks: duration,
      value: 1000 + index * 3,
      submissionTick: orchestrator.currentTick,
    };
    orchestrator.submitJob(job);
  }
}

function pickSkills(skills: string[] = [], seed: number): string[] {
  if (skills.length === 0) {
    return ['general'];
  }
  const required: string[] = [];
  const count = 1 + (seed % Math.min(skills.length, 2));
  for (let i = 0; i < count; i += 1) {
    const index = (seed + i) % skills.length;
    required.push(skills[index]);
  }
  return Array.from(new Set(required));
}

function pickNodeCompatibleSkills(nodes: NodeDefinition[] | undefined, seed: number): string[] | undefined {
  if (!nodes || nodes.length === 0) {
    return undefined;
  }
  const node = nodes[seed % nodes.length];
  const specialties = node.specialties;
  if (!specialties || specialties.length === 0) {
    return undefined;
  }
  const required: string[] = [];
  const count = Math.min(2, specialties.length);
  const base = Math.floor(seed / nodes.length);
  for (let i = 0; i < count; i += 1) {
    const index = (base + i) % specialties.length;
    required.push(specialties[index]);
  }
  return Array.from(new Set(required));
}

function allJobsSettled(orchestrator: PlanetaryOrchestrator): boolean {
  const shardSnapshots = orchestrator.getShardSnapshots();
  return Object.values(shardSnapshots).every((snapshot) => snapshot.queueDepth === 0 && snapshot.inFlight === 0);
}

async function writeArtifacts(
  reportDir: string,
  eventsPath: string,
  config: FabricConfig,
  orchestrator: PlanetaryOrchestrator,
  options: SimulationOptions,
  executedCommands: OwnerCommandSchedule[],
  skippedCommands: OwnerCommandSchedule[],
  pendingCommands: OwnerCommandSchedule[],
  runMetadata: RunMetadata
): Promise<SimulationArtifacts> {
  const metrics = orchestrator.fabricMetrics;
  const shardSnapshots = orchestrator.getShardSnapshots();
  const shardStats = orchestrator.getShardStatistics();
  const nodeSnapshots = orchestrator.getNodeSnapshots();
  const ownerState = orchestrator.getOwnerState();
  const checkpointConfig = orchestrator.getCheckpointConfig();
  const jobBlueprintCount = countJobsInBlueprint(options.jobBlueprint);
  const rotatedCheckpointPath = checkpointConfig.path.endsWith('.json')
    ? `${checkpointConfig.path.slice(0, -5)}.owner.json`
    : `${checkpointConfig.path}.owner.json`;
  const ledgerSnapshot = orchestrator.getLedgerSnapshot();
  const dropCount = Math.max(0, metrics.jobsSubmitted - metrics.jobsCompleted);
  const dropRate = metrics.jobsSubmitted === 0 ? 0 : dropCount / metrics.jobsSubmitted;
  const failureRate = metrics.jobsSubmitted === 0 ? 0 : metrics.jobsFailed / metrics.jobsSubmitted;
  const valueDrop = Math.max(0, metrics.valueSubmitted - metrics.valueCompleted - metrics.valueCancelled);
  const valueDropRate = metrics.valueSubmitted === 0 ? 0 : valueDrop / metrics.valueSubmitted;
  const valueFailureRate = metrics.valueSubmitted === 0 ? 0 : metrics.valueFailed / metrics.valueSubmitted;

  await writeShardTelemetry(reportDir, shardSnapshots, shardStats);

  const ledgerPath = join(reportDir, 'ledger.json');
  await fs.writeFile(ledgerPath, JSON.stringify(ledgerSnapshot, null, 2), 'utf8');

  const missionGraph = buildMissionTopologyMermaid(
    config,
    shardSnapshots,
    shardStats,
    nodeSnapshots,
    ledgerSnapshot,
    ownerState
  );
  const missionGraphPath = join(reportDir, 'mission-topology.mmd');
  await fs.writeFile(missionGraphPath, missionGraph, 'utf8');
  const missionGraphHtmlPath = join(reportDir, 'mission-topology.html');
  await fs.writeFile(
    missionGraphHtmlPath,
    buildMermaidHtmlPage('Planetary Orchestrator Fabric – Topology', missionGraph),
    'utf8'
  );
  const missionChroniclePath = join(reportDir, 'mission-chronicle.md');
  await fs.writeFile(
    missionChroniclePath,
    buildMissionChronicleMarkdown({
      config,
      options,
      metrics,
      ownerState,
      ledger: ledgerSnapshot,
      shardSnapshots,
      shardStats,
      nodeSnapshots,
      executedCommands,
      skippedCommands,
      pendingCommands,
      run: runMetadata,
      missionGraphRelativePath: './mission-topology.mmd',
      ownerScriptRelativePath: './owner-script.json',
      summaryRelativePath: './summary.json',
    }),
    'utf8'
  );

  const summaryOptions = {
    jobs: options.jobs,
    simulateOutage: options.simulateOutage,
    outageTick: options.outageTick,
    resume: options.resume,
    checkpointPath: options.checkpointPath,
    outputLabel: options.outputLabel,
    ciMode: options.ciMode,
    ownerCommandSource: options.ownerCommandSource,
    stopAfterTicks: options.stopAfterTicks,
    preserveReportDirOnResume: options.preserveReportDirOnResume,
    jobBlueprintSource: options.jobBlueprintSource ?? options.jobBlueprint?.source,
    jobBlueprintTotal: jobBlueprintCount > 0 ? jobBlueprintCount : undefined,
  };

  const jobBlueprintSummary = options.jobBlueprint
    ? {
        metadata: options.jobBlueprint.metadata,
        source: summaryOptions.jobBlueprintSource,
        totalJobs: jobBlueprintCount,
        entries: options.jobBlueprint.jobs.map((entry) => ({
          shard: entry.shard,
          count: entry.count ?? 1,
          requiredSkills: entry.requiredSkills,
          estimatedDurationTicks: entry.estimatedDurationTicks,
          value: entry.value,
          valueStep: entry.valueStep,
          submissionTick: entry.submissionTick,
          note: entry.note,
        })),
      }
    : undefined;

  const summary = {
    owner: config.owner,
    metrics,
    shards: shardSnapshots,
    shardStatistics: shardStats,
    nodes: nodeSnapshots,
    checkpoint: checkpointConfig,
    checkpointPath: checkpointConfig.path,
    options: summaryOptions,
    run: runMetadata,
    ownerState,
    ownerCommands: {
      source: options.ownerCommandSource,
      scheduled: options.ownerCommands ? options.ownerCommands.map((entry) => cloneSchedule(entry)) : [],
      executed: executedCommands,
      skippedBeforeResume: skippedCommands,
      pending: pendingCommands,
    },
    jobBlueprint: jobBlueprintSummary,
    topology: {
      mermaidPath: './mission-topology.mmd',
      htmlPath: './mission-topology.html',
    },
    chronicle: {
      path: './mission-chronicle.md',
      dropRate,
      failureRate,
      valueDropRate,
      valueFailureRate,
      submittedValue: metrics.valueSubmitted,
      completedValue: metrics.valueCompleted,
    },
    ledger: {
      totals: ledgerSnapshot.totals,
      shards: ledgerSnapshot.shards,
      nodes: ledgerSnapshot.nodes,
      flows: ledgerSnapshot.flows,
      invariants: ledgerSnapshot.invariants,
      totalEvents: ledgerSnapshot.totalEvents ?? ledgerSnapshot.events.length,
      ownerEvents: ledgerSnapshot.ownerEvents ?? 0,
      firstTick: ledgerSnapshot.firstTick,
      lastTick: ledgerSnapshot.lastTick,
      sampleSize: ledgerSnapshot.events.length,
      path: './ledger.json',
    },
  };
  const summaryPath = join(reportDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  const executedCommandsPath = join(reportDir, 'owner-commands-executed.json');
  await fs.writeFile(
    executedCommandsPath,
    JSON.stringify({ executed: executedCommands, skipped: skippedCommands, pending: pendingCommands }, null, 2),
    'utf8'
  );

  const ownerScript = {
    pauseAll: {
      command: 'owner:system-pause',
      reason: 'Demo pause to rehearse planetary failover',
      contract: config.owner.pauseRole,
    },
    resumeAll: {
      command: 'owner:system-resume',
      reason: 'Resume global orchestration after drill',
    },
    rerouteMarsToHelios: {
      command: 'owner:reroute-shard',
      source: 'mars',
      target: 'helios',
      justification: 'Mars backlog exceeded 90% capacity',
    },
    adjustLatency: {
      command: 'owner:set-latency-budget',
      shard: 'earth',
      latencyMs: 150,
    },
    directOwnerCommands: {
      pauseFabric: {
        type: 'system.pause',
        reason: 'Helios GPU thermal recalibration',
      },
      resumeFabric: {
        type: 'system.resume',
        reason: 'Calibration complete',
      },
      tuneEarthShard: {
        type: 'shard.update',
        shard: 'earth',
        update: {
          maxQueue: 6400,
          router: { queueAlertThreshold: 3600 },
        },
      },
      registerHeliosBackup: {
        type: 'node.register',
        reason: 'Spin up backup GPU helion',
        node: {
          id: 'helios.solaris-backup',
          region: 'helios',
          capacity: 20,
          specialties: ['gpu', 'astronomy'],
          heartbeatIntervalSec: 9,
          maxConcurrency: 12,
        },
      },
      deregisterEarthEdge: {
        type: 'node.deregister',
        nodeId: 'earth.edge-europa',
        reason: 'Transition node to maintenance rotation',
      },
      snapshotFabric: {
        type: 'checkpoint.save',
        reason: 'Archive state before governance vote',
      },
      tightenCheckpointInterval: {
        type: 'checkpoint.configure',
        reason: 'Increase checkpoint cadence during solar storm',
        update: { intervalTicks: Math.max(1, Math.floor(checkpointConfig.intervalTicks / 2)) },
      },
      retargetCheckpointStore: {
        type: 'checkpoint.configure',
        reason: 'Rotate checkpoint storage bucket',
        update: { path: rotatedCheckpointPath },
      },
      retargetReporting: {
        type: 'reporting.configure',
        reason: 'Stream artifacts to governance-grade storage',
        update: {
          directory: `${config.reporting.directory}/owner-retargeted`,
          defaultLabel: `${(options.outputLabel ?? config.reporting.defaultLabel) || 'latest'}-owner`,
        },
      },
      rerouteMarsHotspot: {
        type: 'job.reroute',
        reason: 'Redirect precision workload to Helios GPU array',
        locator: { kind: 'tail', shard: 'mars', offset: 8, includeInFlight: true },
        targetShard: 'helios',
      },
      cancelEarthBacklogItem: {
        type: 'job.cancel',
        reason: 'De-duplicate resolved Earth logistics request',
        locator: { kind: 'tail', shard: 'earth', offset: 4, includeInFlight: true },
      },
    },
    commandScheduleTemplate: [
      {
        tick: 120,
        note: 'Run a full-fabric pause drill during Helios calibration',
        command: { type: 'system.pause', reason: 'Helios GPU thermal recalibration' },
      },
      {
        tick: 150,
        note: 'Resume once calibration completes',
        command: { type: 'system.resume', reason: 'Calibration complete' },
      },
      {
        tick: 155,
        note: 'Boost Earth queue capacity for surge demand',
        command: { type: 'shard.update', shard: 'earth', update: { maxQueue: 6400, router: { queueAlertThreshold: 3600 } } },
      },
      {
        tick: 180,
        note: 'Add Helios backup GPU node for redundancy',
        command: {
          type: 'node.register',
          reason: 'Introduce backup GPU helion',
          node: {
            id: 'helios.solaris-backup',
            region: 'helios',
            capacity: 20,
            specialties: ['gpu', 'astronomy'],
            heartbeatIntervalSec: 9,
            maxConcurrency: 12,
          },
        },
      },
      {
        tick: 220,
        note: 'Force checkpoint snapshot after governance actions',
        command: { type: 'checkpoint.save', reason: 'Archive post-update state' },
      },
      {
        tick: 260,
        note: 'Tighten checkpoint interval during critical window',
        command: {
          type: 'checkpoint.configure',
          update: { intervalTicks: Math.max(2, Math.floor(checkpointConfig.intervalTicks / 2)), path: rotatedCheckpointPath },
          reason: 'Increase redundancy ahead of interplanetary transfer',
        },
      },
      {
        tick: 270,
        note: 'Retarget reporting outputs to archival store',
        command: {
          type: 'reporting.configure',
          update: {
            directory: `${config.reporting.directory}/owner-retargeted`,
            defaultLabel: `${(options.outputLabel ?? config.reporting.defaultLabel) || 'latest'}-owner`,
          },
          reason: 'Ensure governance artifacts land in dedicated bucket',
        },
      },
      {
        tick: 280,
        note: 'Reroute an urgent Mars manufacturing job to Helios GPUs',
        command: {
          type: 'job.reroute',
          locator: { kind: 'tail', shard: 'mars', offset: 8, includeInFlight: true },
          targetShard: 'helios',
          reason: 'Owner escalated to Helios precision array',
        },
      },
      {
        tick: 285,
        note: 'Cancel an obsolete Earth logistics ticket after reroute',
        command: {
          type: 'job.cancel',
          locator: { kind: 'tail', shard: 'earth', offset: 4, includeInFlight: true },
          reason: 'Owner resolved via manual intervention',
        },
      },
    ],
  };
  const ownerScriptPath = join(reportDir, 'owner-script.json');
  await fs.writeFile(ownerScriptPath, JSON.stringify(ownerScript, null, 2), 'utf8');

  const dashboardPath = join(reportDir, 'dashboard.html');
  await fs.writeFile(
    dashboardPath,
    buildDashboardHtml(
      summaryPath,
      ownerScriptPath,
      executedCommandsPath,
      ledgerPath,
      './mission-topology.mmd'
    ),
    'utf8'
  );

  return {
    summaryPath,
    eventsPath,
    dashboardPath,
    ownerScriptPath,
    ownerCommandsPath: executedCommandsPath,
    ledgerPath,
    missionGraphPath,
    missionGraphHtmlPath,
    missionChroniclePath,
  };
}

function buildDashboardHtml(
  summaryPath: string,
  ownerScriptPath: string,
  executedCommandsPath: string,
  ledgerPath: string,
  missionGraphPath: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Planetary Orchestrator Fabric Mission Control</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 0; background: #050714; color: #f5f7ff; }
    header { padding: 32px; background: linear-gradient(90deg, #0d1b4c, #102a76); box-shadow: 0 4px 24px rgba(0,0,0,0.45); }
    h1 { margin: 0; font-size: 2.5rem; }
    .container { padding: 32px; display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    section { background: rgba(13, 27, 76, 0.78); border-radius: 16px; padding: 24px; box-shadow: inset 0 0 0 1px rgba(123, 157, 255, 0.2); }
    pre { white-space: pre-wrap; word-wrap: break-word; background: rgba(5, 7, 20, 0.85); padding: 16px; border-radius: 12px; }
    .metrics { display: grid; gap: 12px; }
    .metric { background: rgba(6, 12, 48, 0.9); padding: 16px; border-radius: 12px; }
    .metric.ok { border-left: 4px solid #1dd1a1; }
    .metric.warn { border-left: 4px solid #f6b93b; }
    .metric.critical { border-left: 4px solid #ff6b6b; }
    .mermaid { background: #fff; color: #000; border-radius: 12px; padding: 16px; }
    .note { margin-top: 8px; color: rgba(255,255,255,0.65); }
    footer { padding: 24px; text-align: center; font-size: 0.85rem; color: rgba(255,255,255,0.6); }
    .grid-two { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  </style>
  <script type="module">
    const executedLogPath = ${JSON.stringify(executedCommandsPath)};
    const ledgerAssetPath = ${JSON.stringify(ledgerPath)};
    const missionGraphAssetPath = ${JSON.stringify(missionGraphPath)};
    function renderMermaid() {
      if (window.mermaid && typeof window.mermaid.init === 'function') {
        window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
      }
    }
    async function loadMissionTopology() {
      const container = document.getElementById('mission-topology');
      const missionPathEl = document.getElementById('mission-topology-path');
      missionPathEl.textContent = missionGraphAssetPath;
      try {
        const response = await fetch(missionGraphAssetPath);
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' ' + response.statusText);
        }
        const definition = (await response.text()).trim();
        container.textContent = definition.length > 0
          ? definition
          : 'flowchart LR\n  empty((No topology data available))';
      } catch (error) {
        container.textContent = 'flowchart LR\n  failure((Topology unavailable))';
        missionPathEl.textContent = missionGraphAssetPath + ' — ' + error;
      }
    }
    async function loadData() {
      const summaryResp = await fetch('./summary.json');
      const summary = await summaryResp.json();
      document.getElementById('owner').textContent = summary.owner.name;
      const metrics = summary.metrics;
      const ownerMetrics = summary.ownerState?.metrics ?? {
        ownerInterventions: 0,
        systemPauses: 0,
        shardPauses: 0,
      };
      const missionMetricEntries = [
        { label: 'Tick', value: metrics.tick },
        { label: 'Jobs Submitted', value: metrics.jobsSubmitted },
        { label: 'Jobs Completed', value: metrics.jobsCompleted },
        { label: 'Jobs Failed', value: metrics.jobsFailed },
        { label: 'Jobs Cancelled', value: metrics.jobsCancelled },
        { label: 'Spillovers', value: metrics.spillovers },
        { label: 'Reassignments', value: metrics.reassignedAfterFailure },
        { label: 'Value Submitted', value: metrics.valueSubmitted },
        { label: 'Value Completed', value: metrics.valueCompleted },
        { label: 'Value Failed', value: metrics.valueFailed },
        { label: 'Value Cancelled', value: metrics.valueCancelled },
        { label: 'Value Spillovers', value: metrics.valueSpillovers },
        { label: 'Value Reassigned', value: metrics.valueReassigned },
        { label: 'Owner Interventions', value: ownerMetrics.ownerInterventions },
        { label: 'System Pauses', value: ownerMetrics.systemPauses },
        { label: 'Shard Pauses', value: ownerMetrics.shardPauses },
      ];
      document.getElementById('metrics').innerHTML = missionMetricEntries
        .map(
          (entry) =>
            '<div class="metric"><strong>' +
            entry.label +
            '</strong><br />' +
            (entry.value ?? 0).toLocaleString() +
            '</div>'
        )
        .join('');
      const blueprint = summary.jobBlueprint;
      if (blueprint) {
        const metadata = blueprint.metadata ?? {};
        const metaBlocks = [
          '<div class="metric"><strong>Total Jobs</strong><br />' + blueprint.totalJobs.toLocaleString() + '</div>',
        ];
        if (metadata.label) {
          metaBlocks.push('<div class="metric"><strong>Label</strong><br />' + metadata.label + '</div>');
        }
        if (metadata.description) {
          metaBlocks.push(
            '<div class="metric"><strong>Description</strong><br />' + metadata.description + '</div>'
          );
        }
        if (metadata.author) {
          metaBlocks.push('<div class="metric"><strong>Author</strong><br />' + metadata.author + '</div>');
        }
        if (metadata.version) {
          metaBlocks.push('<div class="metric"><strong>Version</strong><br />' + metadata.version + '</div>');
        }
        if (blueprint.source) {
          metaBlocks.push('<div class="metric"><strong>Source</strong><br /><code>' + blueprint.source + '</code></div>');
        }
        document.getElementById('blueprint-meta').innerHTML = metaBlocks.join('');
        document.getElementById('blueprint-entries').textContent = JSON.stringify(blueprint.entries, null, 2);
      } else {
        document.getElementById('blueprint-meta').innerHTML =
          '<div class="metric warn">No job blueprint loaded. Procedural generator seeded workload.</div>';
        document.getElementById('blueprint-entries').textContent =
          JSON.stringify({ note: 'Blueprint not provided', generatedJobs: metrics.jobsSubmitted }, null, 2);
      }
      document.getElementById('options').textContent = JSON.stringify(summary.options, null, 2);
      const ownerState = summary.ownerState ?? {
        systemPaused: false,
        pausedShards: [],
        checkpoint: summary.checkpoint ?? { path: summary.checkpointPath ?? 'unknown', intervalTicks: 0 },
        metrics: ownerMetrics,
        reporting: summary.ownerState?.reporting ?? {
          directory: 'demo/Planetary-Orchestrator-Fabric-v0/reports',
          defaultLabel: 'latest',
        },
      };
      document.getElementById('owner-state').textContent = JSON.stringify(ownerState, null, 2);
      const pausedShards = Array.isArray(ownerState.pausedShards) && ownerState.pausedShards.length > 0
        ? ownerState.pausedShards.join(', ')
        : 'None';
      const checkpointState = ownerState.checkpoint ?? summary.checkpoint ?? {};
      const checkpointPath = typeof checkpointState.path === 'string'
        ? checkpointState.path
        : summary.checkpointPath ?? 'Unknown';
      const checkpointInterval = typeof checkpointState.intervalTicks === 'number'
        ? checkpointState.intervalTicks
        : summary.checkpoint?.intervalTicks ?? 'Unknown';
      const reportingState = ownerState.reporting ?? { directory: undefined, defaultLabel: undefined };
      const reportingDirectory = typeof reportingState.directory === 'string'
        ? reportingState.directory
        : 'demo/Planetary-Orchestrator-Fabric-v0/reports';
      const reportingLabel = typeof reportingState.defaultLabel === 'string'
        ? reportingState.defaultLabel
        : 'latest';
      document.getElementById('owner-status').innerHTML =
        '<div class="metric"><strong>System Paused</strong><br />' + (ownerState.systemPaused ? 'Yes' : 'No') + '</div>' +
        '<div class="metric"><strong>Paused Shards</strong><br />' + pausedShards + '</div>' +
        '<div class="metric"><strong>Checkpoint Path</strong><br /><code>' + checkpointPath + '</code></div>' +
        '<div class="metric"><strong>Checkpoint Interval</strong><br />' + checkpointInterval + ' ticks</div>' +
        '<div class="metric"><strong>Reporting Directory</strong><br /><code>' + reportingDirectory + '</code></div>' +
        '<div class="metric"><strong>Default Label</strong><br />' + reportingLabel + '</div>';
      const ownerCommandsMeta = summary.ownerCommands ?? {};
      const scheduledCount = Array.isArray(ownerCommandsMeta.scheduled) ? ownerCommandsMeta.scheduled.length : 0;
      const executedCount = Array.isArray(ownerCommandsMeta.executed) ? ownerCommandsMeta.executed.length : 0;
      const pendingCount = Array.isArray(ownerCommandsMeta.pending) ? ownerCommandsMeta.pending.length : 0;
      const skippedCount = Array.isArray(ownerCommandsMeta.skippedBeforeResume)
        ? ownerCommandsMeta.skippedBeforeResume.length
        : 0;
      document.getElementById('owner-commands-summary').innerHTML =
        '<div class="metric"><strong>Scheduled</strong><br />' + scheduledCount.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Executed</strong><br />' + executedCount.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Pending</strong><br />' + pendingCount.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Skipped (resume)</strong><br />' + skippedCount.toLocaleString() + '</div>';
      document.getElementById('owner-commands-source').textContent = ownerCommandsMeta.source ?? 'Inline schedule';
      document.getElementById('owner-commands-path').textContent = executedLogPath;
      const ownerResp = await fetch('./owner-script.json');
      const ownerScripts = await ownerResp.json();
      document.getElementById('owner-script').textContent = JSON.stringify(ownerScripts, null, 2);
      const executedResp = await fetch('./owner-commands-executed.json');
      const executedPayload = await executedResp.json();
      document.getElementById('owner-commands').textContent = JSON.stringify(executedPayload, null, 2);
      await loadMissionTopology();
      try {
        const ledgerResp = await fetch('./ledger.json');
        if (!ledgerResp.ok) {
          throw new Error('ledger fetch failed');
        }
        const ledger = await ledgerResp.json();
        document.getElementById('ledger-path').textContent = ledgerAssetPath;
        const totals = ledger.totals ?? {};
        const ledgerMetricEntries = [
          { label: 'Jobs Submitted', value: totals.submitted },
          { label: 'Assignments', value: totals.assigned },
          { label: 'Completed', value: totals.completed },
          { label: 'Failed', value: totals.failed },
          { label: 'Cancelled', value: totals.cancelled },
          { label: 'Spillovers Out', value: totals.spilloversOut },
          { label: 'Spillovers In', value: totals.spilloversIn },
          { label: 'Reassignments', value: totals.reassignments },
          { label: 'Value Submitted', value: totals.valueSubmitted },
          { label: 'Value Completed', value: totals.valueCompleted },
          { label: 'Value Failed', value: totals.valueFailed },
          { label: 'Value Cancelled', value: totals.valueCancelled },
          { label: 'Value Spillovers Out', value: totals.valueSpilloversOut },
          { label: 'Value Spillovers In', value: totals.valueSpilloversIn },
          { label: 'Value Reassignments', value: totals.valueReassignments },
          { label: 'Pending Jobs', value: ledger.pendingJobs },
          { label: 'Running Jobs', value: ledger.runningJobs },
        ];
        document.getElementById('ledger-metrics').innerHTML = ledgerMetricEntries
          .map(
            (entry) =>
              '<div class="metric"><strong>' +
              entry.label +
              '</strong><br />' +
              (entry.value ?? 0).toLocaleString() +
              '</div>'
          )
          .join('');
        const invariantHtml = Array.isArray(ledger.invariants) && ledger.invariants.length > 0
          ? ledger.invariants
              .map((entry) => {
                const statusClass = entry.ok ? 'ok' : 'critical';
                const statusLabel = entry.ok ? 'Aligned' : 'Investigate';
                return (
                  '<div class="metric ' +
                  statusClass +
                  '"><strong>' +
                  entry.id +
                  '</strong><br />' +
                  statusLabel +
                  '<br />' +
                  entry.message +
                  '</div>'
                );
              })
              .join('')
          : '<div class="metric ok">Ledger invariants nominal.</div>';
        document.getElementById('ledger-invariants').innerHTML = invariantHtml;
        const flows = Array.isArray(ledger.flows) ? ledger.flows : [];
        const flowSummary = flows.length > 0 ? flows : [{ from: 'retained', to: 'retained', count: 0 }];
        document.getElementById('ledger-flows').textContent = JSON.stringify(flowSummary, null, 2);
        const flowDiagramLines = ['flowchart LR'];
        for (const flow of flowSummary) {
          flowDiagramLines.push(
            String(flow.from).replace(/[^a-zA-Z0-9]/g, '_') +
              ' -->|' +
              Number(flow.count).toLocaleString() +
              '| ' +
              String(flow.to).replace(/[^a-zA-Z0-9]/g, '_')
          );
        }
        document.getElementById('ledger-flow-mermaid').textContent = flowDiagramLines.join('\n');
        const events = Array.isArray(ledger.events) ? ledger.events : [];
        const eventSummary = {
          totalEvents: ledger.totalEvents ?? events.length,
          ownerEvents: ledger.ownerEvents ?? 0,
          sampleSize: events.length,
          sample: events.slice(-12),
        };
        document.getElementById('ledger-events').textContent = JSON.stringify(eventSummary, null, 2);
      } catch (error) {
        document.getElementById('ledger-metrics').innerHTML =
          '<div class="metric critical">Unable to load ledger telemetry: ' + error + '</div>';
        document.getElementById('ledger-invariants').innerHTML = '';
        document.getElementById('ledger-flows').textContent = '';
        document.getElementById('ledger-events').textContent = '';
      }
      renderMermaid();
    }
    loadData();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: false, theme: 'dark' });</script>
</head>
<body>
  <header>
    <h1>Planetary Orchestrator Fabric Mission Control</h1>
    <p>Empowering planetary operators to command sharded AGI fabrics with absolute owner authority.</p>
  </header>
  <div class="container">
    <section>
      <h2>Owner</h2>
      <p id="owner">Loading...</p>
      <div class="grid-two">
        <div class="mermaid">
          graph LR
            Owner[Owner Multisig] --> Ledger((Global Ledger))
            Ledger --> EarthShard
            Ledger --> LunaShard
            Ledger --> MarsShard
            Ledger --> HeliosShard
            EarthShard --> EarthAgents((Agents))
            LunaShard --> LunaAgents((Agents))
            MarsShard --> MarsAgents((Agents))
            HeliosShard --> HeliosAgents((Agents))
        </div>
        <div>
          <div id="owner-status" class="metrics"></div>
        </div>
      </div>
    </section>
    <section>
      <h2>Planetary Topology Atlas</h2>
      <div id="mission-topology" class="mermaid">flowchart LR\n  loading((Loading topology...))</div>
      <p class="note">Mermaid source: <code id="mission-topology-path"></code></p>
    </section>
    <section>
      <h2>Mission Metrics</h2>
      <div id="metrics" class="metrics"></div>
    </section>
    <section>
      <h2>Job Blueprint</h2>
      <div id="blueprint-meta" class="metrics"></div>
      <pre id="blueprint-entries">Loading...</pre>
    </section>
    <section>
      <h2>Owner Fabric State</h2>
      <pre id="owner-state">Loading...</pre>
    </section>
    <section>
      <h2>Run Options</h2>
      <pre id="options">Loading...</pre>
    </section>
    <section>
      <h2>Owner Command Payloads</h2>
      <pre id="owner-script">Loading...</pre>
    </section>
    <section>
      <h2>Owner Command Executions</h2>
      <div id="owner-commands-summary" class="metrics"></div>
      <p class="note">Schedule source: <span id="owner-commands-source">None</span></p>
      <p class="note">Execution log: <code id="owner-commands-path"></code></p>
      <pre id="owner-commands">Loading...</pre>
    </section>
    <section>
      <h2>Global Ledger Synopsis</h2>
      <div id="ledger-metrics" class="metrics"></div>
      <p class="note">Ledger artifact: <code id="ledger-path"></code></p>
      <div id="ledger-invariants" class="metrics"></div>
    </section>
    <section>
      <h2>Spillover Cartography</h2>
      <div id="ledger-flow-mermaid" class="mermaid">flowchart LR\n  placeholder -->|0| placeholder</div>
      <pre id="ledger-flows">Loading...</pre>
    </section>
    <section>
      <h2>Ledger Event Pulse</h2>
      <pre id="ledger-events">Loading...</pre>
    </section>
  </div>
  <footer>
    Planetary Orchestrator Fabric v0 — Generated by AGI Jobs v0 (v2)
  </footer>
</body>
</html>`;
}

async function writeShardTelemetry(
  reportDir: string,
  snapshots: Record<string, { queueDepth: number; inFlight: number; completed: number }>,
  statistics: Record<string, { completed: number; failed: number; spillovers: number; valueCompleted: number; valueFailed: number; valueSpillovers: number }>
): Promise<void> {
  const entries = Object.entries(snapshots);
  await Promise.all(
    entries.map(async ([shardId, snapshot]) => {
      const stat = statistics[shardId];
      const payload = {
        shardId,
        queueDepth: snapshot.queueDepth,
        inFlight: snapshot.inFlight,
        completed: snapshot.completed,
        failed: stat?.failed ?? 0,
        spillovers: stat?.spillovers ?? 0,
        valueCompleted: stat?.valueCompleted ?? 0,
        valueFailed: stat?.valueFailed ?? 0,
        valueSpillovers: stat?.valueSpillovers ?? 0,
      };
      await fs.writeFile(join(reportDir, `${shardId}-telemetry.json`), JSON.stringify(payload, null, 2), 'utf8');
    })
  );
}

function sanitizeMermaidId(raw: string): string {
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, '_');
  if (normalized.length === 0) {
    return 'id_0';
  }
  return /^[a-zA-Z_]/.test(normalized) ? normalized : `id_${normalized}`;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`');
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return '0';
  }
  return NUMBER_FORMATTER.format(value);
}

function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) {
    return 'n/a';
  }
  const unique = Array.from(new Set(values.filter((entry) => entry && entry.trim().length > 0)));
  if (unique.length === 0) {
    return 'n/a';
  }
  if (unique.length <= 3) {
    return unique.join(', ');
  }
  return `${unique.slice(0, 3).join(', ')} +${unique.length - 3} more`;
}

function buildMissionTopologyMermaid(
  config: FabricConfig,
  shardSnapshots: Record<string, { queueDepth: number; inFlight: number; completed: number }>,
  shardStats: Record<string, { completed: number; failed: number; spillovers: number }>,
  nodeSnapshots: Record<string, { active: boolean; runningJobs: number }>,
  ledgerSnapshot: LedgerSnapshot,
  ownerState: OwnerStateSnapshot
): string {
  const lines: string[] = [];
  const newline = String.fromCharCode(10);
  const pausedShards = new Set(ownerState.pausedShards ?? []);
  const ownerMetrics = ownerState.metrics ?? {
    ownerInterventions: 0,
    systemPauses: 0,
    shardPauses: 0,
  };

  const nodesByShard: Record<string, NodeDefinition[]> = {};
  for (const node of config.nodes) {
    if (!nodesByShard[node.region]) {
      nodesByShard[node.region] = [];
    }
    nodesByShard[node.region].push(node);
  }

  lines.push('%% Autogenerated Planetary Orchestrator Fabric topology');
  lines.push('flowchart LR');
  lines.push('  classDef owner fill:#1d0f39,stroke:#b784ff,stroke-width:2px,color:#f5f7ff;');
  lines.push('  classDef orchestrator fill:#082249,stroke:#54c0ff,stroke-width:2px,color:#f5f7ff;');
  lines.push('  classDef orchestratorPaused fill:#3a2308,stroke:#f6b93b,stroke-width:2px,color:#fff;');
  lines.push('  classDef shard fill:#0d1b4c,stroke:#64a9ff,stroke-width:2px,color:#f5f7ff;');
  lines.push('  classDef shardPaused fill:#2f143a,stroke:#ff6bcb,stroke-width:2px,color:#fff;');
  lines.push('  classDef router fill:#0b1733,stroke:#64a9ff,stroke-dasharray: 4 2,color:#f5f7ff;');
  lines.push('  classDef nodeActive fill:#053b2a,stroke:#1dd1a1,stroke-width:2px,color:#f5f7ff;');
  lines.push('  classDef nodeDown fill:#3d0d0d,stroke:#ff6b6b,stroke-width:2px,color:#fff;');
  lines.push('  classDef ledger fill:#041230,stroke:#4b6aff,stroke-width:2px,color:#f5f7ff;');
  lines.push('  classDef invariantAlert fill:#31131f,stroke:#ff9ff3,stroke-width:2px,color:#fff;');

  const ownerId = 'owner_command';
  const ownerLabel = [
    'Owner Authority',
    `Paused: ${ownerState.systemPaused ? 'Yes' : 'No'}`,
    `Interventions: ${formatNumber(ownerMetrics.ownerInterventions)}`,
    `System Pauses: ${formatNumber(ownerMetrics.systemPauses)}`,
    `Shard Pauses: ${formatNumber(ownerMetrics.shardPauses)}`,
    ownerState.reporting?.directory ? `Reporting: ${ownerState.reporting.directory}` : undefined,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(newline);
  lines.push(`  ${ownerId}["${escapeMermaidLabel(ownerLabel)}"]`);
  lines.push(`  class ${ownerId} owner;`);

  const orchestratorId = 'planetary_orchestrator';
  const orchestratorLabel = [
    'Planetary Orchestrator',
    `Tick ${formatNumber(ledgerSnapshot.tick)}`,
    `Completed ${formatNumber(ledgerSnapshot.totals?.completed ?? 0)}`,
    `Reassignments ${formatNumber(ledgerSnapshot.totals?.reassignments ?? 0)}`,
  ].join(newline);
  lines.push(`  ${orchestratorId}["${escapeMermaidLabel(orchestratorLabel)}"]`);
  lines.push(`  class ${orchestratorId} ${ownerState.systemPaused ? 'orchestratorPaused' : 'orchestrator'};`);
  lines.push(`  ${ownerId} -->|Command Stream| ${orchestratorId};`);

  const ledgerId = 'global_ledger';
  const ledgerLabel = [
    'Global Ledger',
    `Pending ${formatNumber(ledgerSnapshot.pendingJobs)} | Running ${formatNumber(ledgerSnapshot.runningJobs)}`,
    `Owner Events ${formatNumber(ledgerSnapshot.ownerEvents)}`,
    `Events Logged ${formatNumber(ledgerSnapshot.totalEvents)}`,
  ].join(newline);
  lines.push(`  ${ledgerId}["${escapeMermaidLabel(ledgerLabel)}"]`);
  lines.push(`  class ${ledgerId} ledger;`);
  lines.push(`  ${orchestratorId} -->|State Sync| ${ledgerId};`);

  const failingInvariant = (ledgerSnapshot.invariants ?? []).find((entry) => !entry.ok);
  if (failingInvariant) {
    const invariantId = 'invariant_alert';
    const invariantLabel = ['Invariant Alert', failingInvariant.id, failingInvariant.message].join(newline);
    lines.push(`  ${invariantId}["${escapeMermaidLabel(invariantLabel)}"]`);
    lines.push(`  class ${invariantId} invariantAlert;`);
    lines.push(`  ${ledgerId} --> ${invariantId};`);
  }

  const spilloverEdges = new Set<string>();
  const ledgerFlowTotals = new Map<string, number>();

  for (const shard of config.shards) {
    const sanitizedShard = sanitizeMermaidId(shard.id);
    const clusterId = `cluster_${sanitizedShard}`;
    const hubId = `shard_${sanitizedShard}`;
    const routerId = `${hubId}_router`;
    const snapshot = shardSnapshots[shard.id] ?? { queueDepth: 0, inFlight: 0, completed: 0 };
    const stats = shardStats[shard.id] ?? { completed: 0, failed: 0, spillovers: 0 };
    const ledgerTotals = ledgerSnapshot.shards?.[shard.id];

    const shardLabel = [
      `${shard.displayName} (${shard.id.toUpperCase()})`,
      `Queue ${formatNumber(snapshot.queueDepth)} | In-flight ${formatNumber(snapshot.inFlight)}`,
      `Completed ${formatNumber(stats.completed)} | Failed ${formatNumber(stats.failed ?? 0)}`,
      `Spillovers ${formatNumber(stats.spillovers ?? 0)}`,
      ledgerTotals ? `Assigned ${formatNumber(ledgerTotals.assigned)}` : undefined,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(newline);

    const routerLabel = [
      `${shard.displayName} Router`,
      `Latency ${formatNumber(shard.latencyBudgetMs)} ms`,
      shard.router?.queueAlertThreshold !== undefined
        ? `Alert ${formatNumber(shard.router.queueAlertThreshold)}`
        : undefined,
      shard.router?.spilloverPolicies?.length
        ? `Spillover Policies ${shard.router.spilloverPolicies.length}`
        : undefined,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(newline);

    lines.push(`  subgraph ${clusterId}["${escapeMermaidLabel(shard.displayName + ' — Regional Fabric')}"]`);
    lines.push('    direction TB');
    lines.push(`    ${hubId}["${escapeMermaidLabel(shardLabel)}"]`);
    lines.push(`    ${routerId}{{${escapeMermaidLabel(routerLabel)}}}`);
    lines.push(`    ${hubId} --> ${routerId};`);

    const shardNodeDefinitions = nodesByShard[shard.id] ?? [];
    const nodeClassAssignments: { id: string; active: boolean }[] = [];
    if (shardNodeDefinitions.length === 0) {
      const placeholderId = `${hubId}_reserve`;
      const placeholderLabel = ['Reserve Capacity', 'Awaiting agents'].join(newline);
      lines.push(`    ${placeholderId}(["${escapeMermaidLabel(placeholderLabel)}"])`);
      lines.push(`    ${routerId} --> ${placeholderId};`);
    } else {
      for (const node of shardNodeDefinitions) {
        const nodeId = `node_${sanitizeMermaidId(node.id)}`;
        const snapshotState = nodeSnapshots[node.id] ?? { active: false, runningJobs: 0 };
        const ledgerNode = ledgerSnapshot.nodes?.[node.id];
        const nodeLabel = [
          node.id,
          snapshotState.active ? '🟢 Active' : '⚠️ Offline',
          `Concurrency ${formatNumber(node.maxConcurrency ?? node.capacity)} | Running ${formatNumber(snapshotState.runningJobs)}`,
          `Completed ${formatNumber(ledgerNode?.completions ?? 0)} | Reassign ${formatNumber(ledgerNode?.reassignments ?? 0)}`,
          `Skills: ${formatList(node.specialties)}`,
        ].join(newline);
        lines.push(`    ${nodeId}["${escapeMermaidLabel(nodeLabel)}"]`);
        lines.push(`    ${routerId} --> ${nodeId};`);
        nodeClassAssignments.push({ id: nodeId, active: snapshotState.active });
      }
    }

    lines.push('  end');
    lines.push(`  ${orchestratorId} -->|${formatNumber(shard.latencyBudgetMs)} ms SLA| ${hubId};`);
    lines.push(`  ${hubId} --> ${ledgerId};`);
    lines.push(`  class ${hubId} ${pausedShards.has(shard.id) ? 'shardPaused' : 'shard'};`);
    lines.push(`  class ${routerId} router;`);
    for (const assignment of nodeClassAssignments) {
      lines.push(`  class ${assignment.id} ${assignment.active ? 'nodeActive' : 'nodeDown'};`);
    }

    for (const target of shard.spilloverTargets ?? []) {
      if (!target || target === shard.id) {
        continue;
      }
      const targetId = `shard_${sanitizeMermaidId(target)}`;
      const edgeKey = `${hubId}->${targetId}`;
      if (!spilloverEdges.has(edgeKey)) {
        lines.push(`  ${hubId} -. spillover .-> ${targetId};`);
        spilloverEdges.add(edgeKey);
      }
    }
  }

  for (const flow of ledgerSnapshot.flows ?? []) {
    const fromId = flow.from ? `shard_${sanitizeMermaidId(flow.from)}` : undefined;
    const toId = flow.to ? `shard_${sanitizeMermaidId(flow.to)}` : undefined;
    if (!fromId || !toId || fromId === toId) {
      continue;
    }
    const key = `${fromId}|${toId}`;
    const runningTotal = ledgerFlowTotals.get(key) ?? 0;
    ledgerFlowTotals.set(key, runningTotal + (Number.isFinite(flow.count) ? flow.count : 0));
  }

  for (const [key, count] of ledgerFlowTotals.entries()) {
    const [fromId, toId] = key.split('|');
    lines.push(`  ${fromId} -->|${formatNumber(count)}| ${toId};`);
  }

  return lines.join(newline);
}


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMermaidHtmlPage(title: string, mermaidDefinition: string): string {
  const normalized = (mermaidDefinition ?? '').replace(/\r?\n/g, '\n').trim();
  const safeDefinition = normalized.length > 0 ? normalized : 'flowchart LR\n  empty((No topology data))';
  const mermaidJson = JSON.stringify(safeDefinition);
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 32px; background: #050714; color: #f5f7ff; }
    h1 { margin-top: 0; font-size: 2.25rem; }
    .container { max-width: 1200px; margin: 0 auto; display: grid; gap: 24px; }
    .mermaid { background: #fff; color: #000; border-radius: 16px; padding: 24px; box-shadow: 0 12px 48px rgba(0,0,0,0.4); }
    pre { background: rgba(5,7,20,0.85); padding: 16px; border-radius: 12px; color: #dfe6ff; overflow: auto; }
    footer { margin-top: 24px; font-size: 0.85rem; color: rgba(255,255,255,0.6); text-align: center; }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; background: rgba(86, 204, 242, 0.15); color: #56ccf2; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${safeTitle}</h1>
      <p class="badge">Rendered by AGI Jobs v0 (v2) Planetary Orchestrator Fabric</p>
    </header>
    <section>
      <div id="topology" class="mermaid">flowchart LR\n  loading((Loading topology...))</div>
    </section>
    <section>
      <details open>
        <summary>Raw Mermaid Definition</summary>
        <pre id="topology-source"></pre>
      </details>
    </section>
  </div>
  <footer>Planetary-scale governance dashboards orchestrated autonomously.</footer>
  <script type="module">
    const definition = ${mermaidJson};
    const container = document.getElementById('topology');
    const source = document.getElementById('topology-source');
    source.textContent = definition;
    container.textContent = definition;
    function render() {
      if (window.mermaid && typeof window.mermaid.init === 'function') {
        window.mermaid.init(undefined, [container]);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: false, theme: 'dark' });</script>
</body>
</html>`;
}

