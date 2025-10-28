import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { CheckpointManager } from './checkpoint';
import { PlanetaryOrchestrator } from './orchestrator';
import {
  FabricConfig,
  FabricMetrics,
  JobDefinition,
  NodeDefinition,
  OwnerCommandSchedule,
  SimulationArtifacts,
  SimulationOptions,
  RunMetadata,
} from './types';

const DEFAULT_OUTAGE_TICK = 120;

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

export async function runSimulation(
  config: FabricConfig,
  options: SimulationOptions
): Promise<SimulationResult> {
  const label = options.outputLabel ?? config.reporting.defaultLabel;
  const reportDir = join(config.reporting.directory, label);
  const preserveReports = Boolean(options.resume && options.preserveReportDirOnResume !== false);
  if (!preserveReports) {
    await fs.rm(reportDir, { recursive: true, force: true });
  }
  await fs.mkdir(reportDir, { recursive: true });

  const checkpointPath = options.checkpointPath ?? config.checkpoint.path;
  const checkpointManager = new CheckpointManager(checkpointPath);
  const orchestrator = new PlanetaryOrchestrator(config, checkpointManager);

  const checkpointRestored = options.resume ? await orchestrator.restoreFromCheckpoint() : false;
  const startTick = orchestrator.currentTick;
  const stopAfterTicks = options.stopAfterTicks;
  if (stopAfterTicks !== undefined) {
    if (!Number.isFinite(stopAfterTicks) || stopAfterTicks <= 0) {
      throw new Error('stop-after-ticks must be a positive number');
    }
  }

  const scheduledCommands = [...(options.ownerCommands ?? [])].sort((a, b) => a.tick - b.tick);
  const executedCommands: OwnerCommandSchedule[] = [];
  const skippedDueToCheckpoint: OwnerCommandSchedule[] = [];
  let commandIndex = 0;
  const stopAtTick = stopAfterTicks !== undefined ? startTick + Math.ceil(stopAfterTicks) : undefined;
  let stoppedEarly = false;
  let stopTick: number | undefined;
  let stopReason: string | undefined;

  if (checkpointRestored) {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= startTick) {
      skippedDueToCheckpoint.push(cloneSchedule(scheduledCommands[commandIndex]));
      commandIndex += 1;
    }
  } else {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= startTick) {
      const schedule = scheduledCommands[commandIndex];
      await orchestrator.applyOwnerCommand(schedule.command);
      executedCommands.push(cloneSchedule(schedule));
      commandIndex += 1;
    }
  }

  const applyCommandsForTick = async (tick: number): Promise<void> => {
    while (commandIndex < scheduledCommands.length && scheduledCommands[commandIndex].tick <= tick) {
      const schedule = scheduledCommands[commandIndex];
      await orchestrator.applyOwnerCommand(schedule.command);
      executedCommands.push(cloneSchedule(schedule));
      commandIndex += 1;
    }
  };

  if (options.ciMode) {
    process.stdout.write(
      `[ci-start] jobs=${options.jobs} restored=${checkpointRestored} tick=${startTick} stopAfter=${stopAfterTicks ?? 'none'}\n`
    );
  }

  if (!checkpointRestored) {
    await seedJobs(orchestrator, config, options.jobs);
  }

  const eventsStream = createWriteStream(join(reportDir, 'events.ndjson'), {
    encoding: 'utf8',
    flags: preserveReports ? 'a' : 'w',
  });
  const flushEvents = (): void => {
    const events = orchestrator.fabricEvents;
    for (const event of events) {
      eventsStream.write(`${JSON.stringify(event)}\n`);
    }
  };

  flushEvents();

  const outageTick = options.outageTick ?? DEFAULT_OUTAGE_TICK;
  const outageNodeId = options.simulateOutage;

  const maxTicks = Math.max(Math.ceil(options.jobs * 0.35), 200) + orchestrator.currentTick;

  for (let tick = orchestrator.currentTick + 1; tick <= maxTicks; tick += 1) {
    await applyCommandsForTick(tick);
    orchestrator.processTick({ tick });

    if (outageNodeId && tick === outageTick) {
      orchestrator.markOutage(outageNodeId);
    }

    flushEvents();

    if (tick % config.checkpoint.intervalTicks === 0) {
      await orchestrator.saveCheckpoint();
      flushEvents();
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
  flushEvents();
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
    eventsStream.write(`${JSON.stringify(stopEvent)}\n`);
  }
  await new Promise<void>((resolve, reject) => {
    eventsStream.end((error: NodeJS.ErrnoException | null | undefined) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

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

  const artifacts = await writeArtifacts(
    reportDir,
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

  await writeShardTelemetry(reportDir, shardSnapshots, shardStats);

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
      rerouteMarsHotspot: {
        type: 'job.reroute',
        reason: 'Redirect precision workload to Helios GPU array',
        jobId: 'job-09000',
        targetShard: 'helios',
      },
      cancelEarthBacklogItem: {
        type: 'job.cancel',
        reason: 'De-duplicate resolved Earth logistics request',
        jobId: 'job-09001',
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
        tick: 280,
        note: 'Reroute an urgent Mars manufacturing job to Helios GPUs',
        command: {
          type: 'job.reroute',
          jobId: 'job-09000',
          targetShard: 'helios',
          reason: 'Owner escalated to Helios precision array',
        },
      },
      {
        tick: 285,
        note: 'Cancel an obsolete Earth logistics ticket after reroute',
        command: {
          type: 'job.cancel',
          jobId: 'job-09001',
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
    buildDashboardHtml(summaryPath, ownerScriptPath, executedCommandsPath),
    'utf8'
  );

  return {
    summaryPath,
    eventsPath: join(reportDir, 'events.ndjson'),
    dashboardPath,
    ownerScriptPath,
    ownerCommandsPath: executedCommandsPath,
  };
}

function buildDashboardHtml(summaryPath: string, ownerScriptPath: string, executedCommandsPath: string): string {
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
    .mermaid { background: #fff; color: #000; border-radius: 12px; padding: 16px; }
    .note { margin-top: 8px; color: rgba(255,255,255,0.65); }
    footer { padding: 24px; text-align: center; font-size: 0.85rem; color: rgba(255,255,255,0.6); }
  </style>
  <script type="module">
    const executedLogPath = ${JSON.stringify(executedCommandsPath)};
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
      document.getElementById('owner-status').innerHTML =
        '<div class="metric"><strong>System Paused</strong><br />' + (ownerState.systemPaused ? 'Yes' : 'No') + '</div>' +
        '<div class="metric"><strong>Paused Shards</strong><br />' + pausedShards + '</div>' +
        '<div class="metric"><strong>Checkpoint Path</strong><br /><code>' + checkpointPath + '</code></div>' +
        '<div class="metric"><strong>Checkpoint Interval</strong><br />' + checkpointInterval + ' ticks</div>';
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
