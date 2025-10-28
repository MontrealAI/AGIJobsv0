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
  NodeDefinition,
  OwnerCommandSchedule,
  SimulationArtifacts,
  SimulationOptions,
  RunMetadata,
} from './types';

const DEFAULT_OUTAGE_TICK = 120;
const AVERAGE_JOB_DURATION_TICKS = 3;

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

function estimateMaxTicks(config: FabricConfig, jobs: number, startTick: number): number {
  const totalJobs = Math.max(1, jobs);
  const totalWork = totalJobs * AVERAGE_JOB_DURATION_TICKS;
  const globalSlots = config.nodes.reduce((sum, node) => {
    const slots = Math.min(node.capacity, node.maxConcurrency);
    if (!Number.isFinite(slots) || slots <= 0) {
      return sum;
    }
    return sum + slots;
  }, 0);
  const estimatedTicks = globalSlots > 0 ? Math.ceil(totalWork / globalSlots) : totalWork;
  const headroom = Math.max(estimatedTicks * 3, Math.ceil(totalJobs * 0.4), 400);
  return startTick + headroom;
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

  const totalJobs = Math.max(1, options.jobs);

  if (!checkpointRestored) {
    await seedJobs(orchestrator, config, totalJobs);
  }
  await flushEvents();

  const outageTick = options.outageTick ?? DEFAULT_OUTAGE_TICK;
  const outageNodeId = options.simulateOutage;

  const maxTicks = estimateMaxTicks(config, totalJobs, startTick);

  for (let tick = orchestrator.currentTick + 1; tick <= maxTicks; tick += 1) {
    await applyCommandsForTick(tick);
    orchestrator.processTick({ tick });
    await flushEvents();

    if (outageNodeId && tick === outageTick) {
      orchestrator.markOutage(outageNodeId);
      await flushEvents();
    }

    if (tick % config.checkpoint.intervalTicks === 0) {
      await orchestrator.saveCheckpoint();
      await flushEvents();
    }

    if (options.ciMode && (tick === startTick + 1 || tick % 200 === 0)) {
      const snapshot = orchestrator.getShardSnapshots();
      const totalQueued = Object.values(snapshot).reduce(
        (sum, entry) => sum + entry.queueDepth + entry.inFlight,
        0
      );
      process.stdout.write(
        `[ci-progress] tick=${tick} queued=${totalQueued} completed=${Object.values(snapshot).reduce((sum, entry) => sum + entry.completed, 0)}\n`
      );
    }

    if (stopAtTick !== undefined && tick >= stopAtTick) {
      stopTick = tick;
      if (!allJobsSettled(orchestrator)) {
        stoppedEarly = true;
        stopReason = `stop-after-ticks=${Math.ceil(stopAfterTicks ?? 0)}`;
      } else if (!stopReason) {
        stopReason = 'completed';
      }
      break;
    }

    if (allJobsSettled(orchestrator)) {
      stopTick = tick;
      stopReason = stopReason ?? 'completed';
      break;
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
  jobs: number
): Promise<void> {
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
  for (let index = 0; index < jobs; index += 1) {
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
  const rotatedCheckpointPath = checkpointConfig.path.endsWith('.json')
    ? `${checkpointConfig.path.slice(0, -5)}.owner.json`
    : `${checkpointConfig.path}.owner.json`;
  const ledgerSnapshot = orchestrator.getLedgerSnapshot();

  await writeShardTelemetry(reportDir, shardSnapshots, shardStats);

  const ledgerPath = join(reportDir, 'ledger.json');
  await fs.writeFile(ledgerPath, JSON.stringify(ledgerSnapshot, null, 2), 'utf8');

  const summary = {
    owner: config.owner,
    metrics,
    shards: shardSnapshots,
    shardStatistics: shardStats,
    nodes: nodeSnapshots,
    checkpoint: checkpointConfig,
    checkpointPath: checkpointConfig.path,
    options,
    run: runMetadata,
    ownerState,
    ownerCommands: {
      source: options.ownerCommandSource,
      scheduled: options.ownerCommands ? options.ownerCommands.map((entry) => cloneSchedule(entry)) : [],
      executed: executedCommands,
      skippedBeforeResume: skippedCommands,
      pending: pendingCommands,
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
    buildDashboardHtml(summaryPath, ownerScriptPath, executedCommandsPath, ledgerPath),
    'utf8'
  );

  return {
    summaryPath,
    eventsPath,
    dashboardPath,
    ownerScriptPath,
    ownerCommandsPath: executedCommandsPath,
    ledgerPath,
  };
}

function buildDashboardHtml(
  summaryPath: string,
  ownerScriptPath: string,
  executedCommandsPath: string,
  ledgerPath: string
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
  </style>
  <script type="module">
    const executedLogPath = ${JSON.stringify(executedCommandsPath)};
    const ledgerAssetPath = ${JSON.stringify(ledgerPath)};
    function renderMermaid() {
      if (window.mermaid && typeof window.mermaid.init === 'function') {
        window.mermaid.init(undefined, document.querySelectorAll('.mermaid'));
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
      document.getElementById('metrics').innerHTML =
        '<div class="metric"><strong>Tick</strong><br />' + metrics.tick.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Jobs Submitted</strong><br />' + metrics.jobsSubmitted.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Jobs Completed</strong><br />' + metrics.jobsCompleted.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Jobs Failed</strong><br />' + metrics.jobsFailed.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Jobs Cancelled</strong><br />' + metrics.jobsCancelled.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Spillovers</strong><br />' + metrics.spillovers.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Reassignments</strong><br />' + metrics.reassignedAfterFailure.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Owner Interventions</strong><br />' + ownerMetrics.ownerInterventions.toLocaleString() + '</div>' +
        '<div class="metric"><strong>System Pauses</strong><br />' + ownerMetrics.systemPauses.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Shard Pauses</strong><br />' + ownerMetrics.shardPauses.toLocaleString() + '</div>';
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
      try {
        const ledgerResp = await fetch('./ledger.json');
        if (!ledgerResp.ok) {
          throw new Error('ledger fetch failed');
        }
        const ledger = await ledgerResp.json();
        document.getElementById('ledger-path').textContent = ledgerAssetPath;
        const totals = ledger.totals ?? {};
        document.getElementById('ledger-metrics').innerHTML =
          '<div class="metric"><strong>Jobs Submitted</strong><br />' + (totals.submitted ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Assignments</strong><br />' + (totals.assigned ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Completed</strong><br />' + (totals.completed ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Failed</strong><br />' + (totals.failed ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Cancelled</strong><br />' + (totals.cancelled ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Spillovers Out</strong><br />' + (totals.spilloversOut ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Spillovers In</strong><br />' + (totals.spilloversIn ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Reassignments</strong><br />' + (totals.reassignments ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Pending Jobs</strong><br />' + (ledger.pendingJobs ?? 0).toLocaleString() + '</div>' +
          '<div class="metric"><strong>Running Jobs</strong><br />' + (ledger.runningJobs ?? 0).toLocaleString() + '</div>';
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
        renderMermaid();
      } catch (error) {
        document.getElementById('ledger-metrics').innerHTML =
          '<div class="metric critical">Unable to load ledger telemetry: ' + error + '</div>';
        document.getElementById('ledger-invariants').innerHTML = '';
        document.getElementById('ledger-flows').textContent = '';
        document.getElementById('ledger-events').textContent = '';
      }
    }
    loadData();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
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
    </section>
    <section>
      <h2>Mission Metrics</h2>
      <div id="metrics" class="metrics"></div>
    </section>
    <section>
      <h2>Owner Fabric State</h2>
      <div id="owner-status" class="metrics"></div>
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
  statistics: Record<string, { completed: number; failed: number; spillovers: number }>
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
      };
      await fs.writeFile(join(reportDir, `${shardId}-telemetry.json`), JSON.stringify(payload, null, 2), 'utf8');
    })
  );
}
