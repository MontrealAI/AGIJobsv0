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
  SimulationArtifacts,
  SimulationOptions,
} from './types';

const DEFAULT_OUTAGE_TICK = 120;

export interface SimulationResult {
  metrics: FabricMetrics;
  artifacts: SimulationArtifacts;
  checkpointRestored: boolean;
}

export async function runSimulation(
  config: FabricConfig,
  options: SimulationOptions
): Promise<SimulationResult> {
  const label = options.outputLabel ?? config.reporting.defaultLabel;
  const reportDir = join(config.reporting.directory, label);
  await fs.rm(reportDir, { recursive: true, force: true });
  await fs.mkdir(reportDir, { recursive: true });

  const checkpointPath = options.checkpointPath ?? config.checkpoint.path;
  const checkpointManager = new CheckpointManager(checkpointPath);
  const orchestrator = new PlanetaryOrchestrator(config, checkpointManager);

  const checkpointRestored = options.resume ? await orchestrator.restoreFromCheckpoint() : false;
  const startTick = orchestrator.currentTick;

  if (options.ciMode) {
    process.stdout.write(
      `[ci-start] jobs=${options.jobs} restored=${checkpointRestored} tick=${startTick}\n`
    );
  }

  if (!checkpointRestored) {
    await seedJobs(orchestrator, config, options.jobs);
  }

  const eventsStream = createWriteStream(join(reportDir, 'events.ndjson'), { encoding: 'utf8' });
  const outageTick = options.outageTick ?? DEFAULT_OUTAGE_TICK;
  const outageNodeId = options.simulateOutage;

  const maxTicks = Math.max(Math.ceil(options.jobs * 0.35), 200) + orchestrator.currentTick;

  for (let tick = orchestrator.currentTick + 1; tick <= maxTicks; tick += 1) {
    orchestrator.processTick({ tick });

    if (outageNodeId && tick === outageTick) {
      orchestrator.markOutage(outageNodeId);
    }

    const events = orchestrator.fabricEvents;
    for (const event of events) {
      eventsStream.write(`${JSON.stringify(event)}\n`);
    }

    if (tick % config.checkpoint.intervalTicks === 0) {
      await orchestrator.saveCheckpoint();
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

    if (allJobsSettled(orchestrator)) {
      break;
    }
  }

  await orchestrator.saveCheckpoint();
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
      `[ci-complete] tick=${orchestrator.currentTick} submitted=${metrics.jobsSubmitted} completed=${metrics.jobsCompleted} spillovers=${metrics.spillovers}\n`
    );
  }

  const artifacts = await writeArtifacts(reportDir, config, orchestrator, checkpointPath, options);

  return { metrics, artifacts, checkpointRestored };
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
  checkpointPath: string,
  options: SimulationOptions
): Promise<SimulationArtifacts> {
  const metrics = orchestrator.fabricMetrics;
  const shardSnapshots = orchestrator.getShardSnapshots();
  const shardStats = orchestrator.getShardStatistics();
  const nodeSnapshots = orchestrator.getNodeSnapshots();

  await writeShardTelemetry(reportDir, shardSnapshots, shardStats);

  const summary = {
    owner: config.owner,
    metrics,
    shards: shardSnapshots,
    shardStatistics: shardStats,
    nodes: nodeSnapshots,
    checkpoint: checkpointPath,
    options,
  };
  const summaryPath = join(reportDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  const ownerScript = {
    pauseAll: {
      command: 'owner:system-pause',
      reason: 'Demo pause to rehearse planetary failover',
      contract: config.owner.pauseRole,
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
  };
  const ownerScriptPath = join(reportDir, 'owner-script.json');
  await fs.writeFile(ownerScriptPath, JSON.stringify(ownerScript, null, 2), 'utf8');

  const dashboardPath = join(reportDir, 'dashboard.html');
  await fs.writeFile(dashboardPath, buildDashboardHtml(summaryPath, ownerScriptPath), 'utf8');

  return {
    summaryPath,
    eventsPath: join(reportDir, 'events.ndjson'),
    dashboardPath,
    ownerScriptPath,
  };
}

function buildDashboardHtml(summaryPath: string, ownerScriptPath: string): string {
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
    footer { padding: 24px; text-align: center; font-size: 0.85rem; color: rgba(255,255,255,0.6); }
  </style>
  <script type="module">
    async function loadData() {
      const summaryResp = await fetch('./summary.json');
      const summary = await summaryResp.json();
      document.getElementById('owner').textContent = summary.owner.name;
      const metrics = summary.metrics;
      document.getElementById('metrics').innerHTML =
        '<div class="metric"><strong>Tick</strong><br />' + metrics.tick + '</div>' +
        '<div class="metric"><strong>Jobs Submitted</strong><br />' + metrics.jobsSubmitted.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Jobs Completed</strong><br />' + metrics.jobsCompleted.toLocaleString() + '</div>' +
        '<div class="metric"><strong>Spillovers</strong><br />' + metrics.spillovers + '</div>' +
        '<div class="metric"><strong>Reassignments</strong><br />' + metrics.reassignedAfterFailure + '</div>';
      document.getElementById('options').textContent = JSON.stringify(summary.options, null, 2);
      const ownerResp = await fetch('./owner-script.json');
      const ownerScripts = await ownerResp.json();
      document.getElementById('owner-script').textContent = JSON.stringify(ownerScripts, null, 2);
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
      <h2>Run Options</h2>
      <pre id="options">Loading...</pre>
    </section>
    <section>
      <h2>Owner Command Payloads</h2>
      <pre id="owner-script">Loading...</pre>
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
