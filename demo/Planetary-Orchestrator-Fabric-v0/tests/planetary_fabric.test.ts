import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint';
import { PlanetaryOrchestrator } from '../src/orchestrator';
import { runAcceptanceSuite } from '../src/acceptance';
import { FabricConfig, JobBlueprint, JobDefinition, OwnerCommandSchedule } from '../src/types';
import { runSimulation } from '../src/simulation';

const testConfig: FabricConfig = {
  owner: {
    name: 'Test Owner',
    address: '0xOwner',
    multisig: '0xMultisig',
    pauseRole: 'SystemPause',
    commandDeck: ['owner:pause-all'],
  },
  shards: [
    { id: 'earth', displayName: 'Earth', latencyBudgetMs: 100, spilloverTargets: ['mars'], maxQueue: 100 },
    { id: 'mars', displayName: 'Mars', latencyBudgetMs: 120, spilloverTargets: ['earth'], maxQueue: 100 },
    { id: 'luna', displayName: 'Luna', latencyBudgetMs: 80, spilloverTargets: ['earth'], maxQueue: 100 },
  ],
  nodes: [
    { id: 'earth.node', region: 'earth', capacity: 10, specialties: ['general'], heartbeatIntervalSec: 10, maxConcurrency: 5 },
    { id: 'mars.node', region: 'mars', capacity: 10, specialties: ['general'], heartbeatIntervalSec: 10, maxConcurrency: 5 },
    { id: 'luna.node', region: 'luna', capacity: 10, specialties: ['general'], heartbeatIntervalSec: 10, maxConcurrency: 5 },
  ],
  checkpoint: {
    path: 'unused',
    intervalTicks: 5,
  },
  reporting: {
    directory: 'unused',
    defaultLabel: 'unused',
  },
};

function createJobs(total: number): JobDefinition[] {
  const shards = testConfig.shards.map((shard) => shard.id);
  const jobs: JobDefinition[] = [];
  for (let index = 0; index < total; index += 1) {
    const shard = shards[index % shards.length];
    jobs.push({
      id: `job-${index.toString().padStart(3, '0')}`,
      shard,
      requiredSkills: ['general'],
      estimatedDurationTicks: 2,
      value: 100 + index,
      submissionTick: 0,
    });
  }
  return jobs;
}

async function buildOrchestrator(
  configInput: FabricConfig = testConfig
): Promise<{ orchestrator: PlanetaryOrchestrator; checkpointPath: string }>
{
  const dir = await mkdtemp(join(tmpdir(), 'fabric-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const config: FabricConfig = {
    ...configInput,
    shards: configInput.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold,
            spilloverPolicies: shard.router.spilloverPolicies
              ? shard.router.spilloverPolicies.map((policy) => ({ ...policy }))
              : undefined,
          }
        : undefined,
    })),
    nodes: configInput.nodes.map((node) => ({
      ...node,
      specialties: [...node.specialties],
    })),
    checkpoint: { ...configInput.checkpoint, path: checkpointPath },
    reporting: { ...configInput.reporting },
  };
  const orchestrator = new PlanetaryOrchestrator(config, new CheckpointManager(checkpointPath));
  return { orchestrator, checkpointPath };
}

function cloneConfig(configInput: FabricConfig): FabricConfig {
  return {
    ...configInput,
    shards: configInput.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold,
            spilloverPolicies: shard.router.spilloverPolicies
              ? shard.router.spilloverPolicies.map((policy) => ({ ...policy }))
              : undefined,
          }
        : undefined,
    })),
    nodes: configInput.nodes.map((node) => ({
      ...node,
      specialties: [...node.specialties],
    })),
    checkpoint: { ...configInput.checkpoint },
    reporting: { ...configInput.reporting },
  };
}

async function testBalancing(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(9);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  orchestrator.processTick({ tick: 1 });
  orchestrator.processTick({ tick: 2 });
  const stats = orchestrator.getShardStatistics();
  const totals = Object.values(stats).map((entry) => entry.completed + entry.failed + entry.spillovers);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  assert.ok(max - min <= 2, 'shards should process similar load');
  const health = orchestrator.getHealthReport();
  assert.equal(health.fabric.level, 'ok');
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testOutageRecovery(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(6);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  orchestrator.processTick({ tick: 1 });
  orchestrator.markOutage('mars.node');
  orchestrator.processTick({ tick: 2 });
  const metrics = orchestrator.fabricMetrics;
  assert.ok(metrics.reassignedAfterFailure > 0, 'jobs should be reassigned after outage');
  const health = orchestrator.getHealthReport();
  assert.notEqual(health.fabric.level, 'critical');
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testCheckpointResume(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(3);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  orchestrator.processTick({ tick: 1 });
  await orchestrator.saveCheckpoint();
  const restored = new PlanetaryOrchestrator({
    ...testConfig,
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath },
    reporting: { ...testConfig.reporting },
  }, new CheckpointManager(checkpointPath));
  const restoredCheckpoint = await restored.restoreFromCheckpoint();
  assert.ok(restoredCheckpoint, 'checkpoint should restore');
  restored.processTick({ tick: restored.currentTick + 1 });
  assert.equal(restored.fabricMetrics.jobsSubmitted, jobs.length);
  const health = restored.getHealthReport();
  const marsHealth = health.shards.find((entry) => entry.shardId === 'mars');
  assert.ok(marsHealth ? marsHealth.status.level !== 'critical' : true);
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testCrossShardFallback(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-fallback-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const config: FabricConfig = {
    owner: testConfig.owner,
    shards: [
      { id: 'mars', displayName: 'Mars', latencyBudgetMs: 200, spilloverTargets: ['helios'], maxQueue: 50 },
      { id: 'helios', displayName: 'Helios', latencyBudgetMs: 400, spilloverTargets: ['mars'], maxQueue: 50 },
    ],
    nodes: [
      { id: 'mars.gpu', region: 'mars', capacity: 2, specialties: ['gpu'], heartbeatIntervalSec: 9, maxConcurrency: 1 },
      { id: 'helios.gpu', region: 'helios', capacity: 2, specialties: ['gpu'], heartbeatIntervalSec: 9, maxConcurrency: 1 },
    ],
    checkpoint: { path: checkpointPath, intervalTicks: 5 },
    reporting: testConfig.reporting,
  };
  const orchestrator = new PlanetaryOrchestrator(config, new CheckpointManager(checkpointPath));
  orchestrator.submitJob({
    id: 'job-gpu',
    shard: 'mars',
    requiredSkills: ['gpu'],
    estimatedDurationTicks: 2,
    value: 5000,
    submissionTick: 0,
  });
  orchestrator.markOutage('mars.gpu');
  orchestrator.processTick({ tick: 1 });
  orchestrator.processTick({ tick: 2 });
  const stats = orchestrator.getShardStatistics();
  assert.equal(stats.helios.completed, 1, 'helios shard should complete reassigned job');
  assert.equal(orchestrator.fabricMetrics.jobsFailed, 0, 'job should be rerouted instead of failing');
  await rm(dir, { force: true, recursive: true });
}

async function testLedgerAccounting(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(15);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  for (let tick = 1; tick <= 10; tick += 1) {
    orchestrator.processTick({ tick });
  }
  const ledger = orchestrator.getLedgerSnapshot();
  const metrics = orchestrator.fabricMetrics;
  assert.equal(ledger.totals.submitted, metrics.jobsSubmitted, 'ledger should track submissions');
  assert.equal(ledger.totals.completed, metrics.jobsCompleted, 'ledger should track completions');
  assert.equal(ledger.totals.failed, metrics.jobsFailed, 'ledger should track failures');
  assert.equal(ledger.totals.cancelled, metrics.jobsCancelled, 'ledger should track cancellations');
  assert.equal(ledger.totals.spilloversOut, metrics.spillovers, 'ledger should track spillovers');
  assert.equal(ledger.totals.reassignments, metrics.reassignedAfterFailure, 'ledger should track reassignments');
  assert.ok(ledger.invariants.every((entry) => entry.ok), 'ledger invariants should all pass');
  assert.ok(ledger.events.length > 0, 'ledger should retain event history');
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testLedgerCheckpointPersistence(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(9);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  for (let tick = 1; tick <= 6; tick += 1) {
    orchestrator.processTick({ tick });
  }
  await orchestrator.saveCheckpoint();
  const beforeLedger = orchestrator.getLedgerSnapshot();
  const restoreConfig = cloneConfig(testConfig);
  restoreConfig.checkpoint.path = checkpointPath;
  const restored = new PlanetaryOrchestrator(restoreConfig, new CheckpointManager(checkpointPath));
  const restoredFromCheckpoint = await restored.restoreFromCheckpoint();
  assert.ok(restoredFromCheckpoint, 'checkpoint should restore ledger state');
  const afterLedger = restored.getLedgerSnapshot();
  assert.deepEqual(afterLedger.totals, beforeLedger.totals, 'ledger totals should persist across restore');
  assert.equal(afterLedger.invariants.length, beforeLedger.invariants.length, 'invariant count should persist');
  assert.equal(afterLedger.events.length, beforeLedger.events.length, 'event history sample should persist');
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testDeterministicReplay(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(12);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  orchestrator.processTick({ tick: 1 });
  orchestrator.processTick({ tick: 2 });
  orchestrator.processTick({ tick: 3 });
  const originalSnapshots = orchestrator.getShardSnapshots();
  const originalMetrics = orchestrator.fabricMetrics;
  const log = orchestrator.getDeterministicLog();

  const replayConfig: FabricConfig = {
    ...testConfig,
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath },
    reporting: { ...testConfig.reporting },
  };
  const replay = new PlanetaryOrchestrator(replayConfig, new CheckpointManager(checkpointPath));
  replay.replay(log);
  const replaySnapshots = replay.getShardSnapshots();
  assert.deepEqual(replaySnapshots, originalSnapshots, 'replay should recreate shard snapshots');
  assert.equal(replay.fabricMetrics.jobsCompleted, originalMetrics.jobsCompleted);
  await rm(checkpointPath, { force: true, recursive: true });
}

async function testOwnerCommandControls(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const jobs = createJobs(6);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  orchestrator.processTick({ tick: 1 });

  await orchestrator.applyOwnerCommand({ type: 'system.pause', reason: 'unit-test-pause' });
  assert.ok(orchestrator.isSystemPaused(), 'system should report paused');
  await orchestrator.applyOwnerCommand({ type: 'shard.pause', shard: 'earth', reason: 'unit-test-shard' });
  await orchestrator.applyOwnerCommand({
    type: 'shard.update',
    shard: 'earth',
    update: { maxQueue: 150, router: { queueAlertThreshold: 120 } },
  });
  await orchestrator.applyOwnerCommand({
    type: 'node.update',
    nodeId: 'earth.node',
    update: { maxConcurrency: 3 },
    reason: 'limit earth concurrency',
  });
  await orchestrator.applyOwnerCommand({
    type: 'node.register',
    reason: 'introduce earth backup',
    node: {
      id: 'earth.node.backup',
      region: 'earth',
      capacity: 5,
      specialties: ['general'],
      heartbeatIntervalSec: 10,
      maxConcurrency: 2,
    },
  });
  await orchestrator.applyOwnerCommand({
    type: 'node.register',
    reason: 'introduce mars reserve',
    node: {
      id: 'mars.node.reserve',
      region: 'mars',
      capacity: 4,
      specialties: ['general'],
      heartbeatIntervalSec: 10,
      maxConcurrency: 2,
    },
  });
  await orchestrator.applyOwnerCommand({ type: 'node.deregister', nodeId: 'mars.node', reason: 'rotate mars node' });
  orchestrator.submitJob({
    id: 'job-owner-cancel',
    shard: 'earth',
    requiredSkills: ['general'],
    estimatedDurationTicks: 3,
    value: 999,
    submissionTick: orchestrator.currentTick,
  });
  await orchestrator.applyOwnerCommand({
    type: 'job.cancel',
    locator: { kind: 'tail', shard: 'earth' },
    reason: 'unit-test-cancel',
  });
  const metricsAfterCancel = orchestrator.fabricMetrics;
  assert.equal(metricsAfterCancel.jobsCancelled, 1);
  assert.ok(metricsAfterCancel.jobsFailed >= 1);

  const snapshotBeforeReroute = orchestrator.getShardSnapshots();
  orchestrator.submitJob({
    id: 'job-owner-reroute',
    shard: 'earth',
    requiredSkills: ['manufacturing'],
    estimatedDurationTicks: 4,
    value: 1200,
    submissionTick: orchestrator.currentTick,
  });
  await orchestrator.applyOwnerCommand({
    type: 'job.reroute',
    locator: { kind: 'tail', shard: 'earth', includeInFlight: true },
    targetShard: 'mars',
    reason: 'unit-test-reroute',
  });
  const snapshotAfterReroute = orchestrator.getShardSnapshots();
  const beforeMarsQueue = snapshotBeforeReroute.mars?.queueDepth ?? 0;
  const afterMarsQueue = snapshotAfterReroute.mars?.queueDepth ?? 0;
  assert.equal(afterMarsQueue, beforeMarsQueue + 1);
  const metricsAfterReroute = orchestrator.fabricMetrics;
  assert.ok(metricsAfterReroute.spillovers >= metricsAfterCancel.spillovers + 1);
  const rotatedCheckpointPath = join(tmpdir(), `fabric-owner-${Date.now()}.json`);
  await orchestrator.applyOwnerCommand({
    type: 'checkpoint.configure',
    reason: 'tighten checkpoint cadence during drill',
    update: { intervalTicks: 3, path: rotatedCheckpointPath },
  });
  const reportingOverride = join(tmpdir(), `fabric-owner-reports-${Date.now()}`);
  await orchestrator.applyOwnerCommand({
    type: 'reporting.configure',
    reason: 'redirect artifacts to governance archive',
    update: { directory: reportingOverride, defaultLabel: 'owner-governance' },
  });
  orchestrator.processTick({ tick: 2 });
  await orchestrator.applyOwnerCommand({
    type: 'checkpoint.save',
    reason: 'owner snapshot after configuration',
  });
  await orchestrator.applyOwnerCommand({ type: 'system.resume', reason: 'resume operations' });
  await orchestrator.applyOwnerCommand({ type: 'shard.resume', shard: 'earth', reason: 'resume earth' });

  const rotatedRaw = await readFile(rotatedCheckpointPath, 'utf8');
  const rotatedCheckpoint = JSON.parse(rotatedRaw);
  assert.equal(rotatedCheckpoint.tick, orchestrator.currentTick);
  assert.equal(rotatedCheckpoint.reporting?.directory, reportingOverride);
  assert.equal(rotatedCheckpoint.reporting?.defaultLabel, 'owner-governance');

  const ownerState = orchestrator.getOwnerState();
  assert.equal(ownerState.systemPaused, false, 'system should be resumed');
  assert.equal(ownerState.metrics.ownerInterventions, 14);
  assert.equal(ownerState.metrics.systemPauses, 1);
  assert.equal(ownerState.metrics.shardPauses, 1);
  assert.deepEqual(ownerState.pausedShards, [], 'no shards should remain paused');
  assert.equal(ownerState.checkpoint.intervalTicks, 3);
  assert.equal(ownerState.checkpoint.path, rotatedCheckpointPath);
  assert.equal(ownerState.reporting.directory, reportingOverride);
  assert.equal(ownerState.reporting.defaultLabel, 'owner-governance');

  const nodeSnapshot = orchestrator.getNodeSnapshots();
  assert.ok(nodeSnapshot['earth.node.backup'], 'earth backup node should be registered');
  assert.ok(nodeSnapshot['mars.node.reserve'], 'mars reserve node should be registered');
  assert.ok(!nodeSnapshot['mars.node'], 'original mars node should be removed');

  const metrics = orchestrator.fabricMetrics;
  assert.ok(metrics.reassignedAfterFailure >= 1, 'deregistered node should trigger reassignment');

  await rm(checkpointPath, { force: true, recursive: true });
  await rm(rotatedCheckpointPath, { force: true });
}

async function testJobBlueprintSeeding(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-blueprint-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const reportingDir = join(dir, 'reports');
  const config: FabricConfig = {
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold,
            spilloverPolicies: shard.router.spilloverPolicies
              ? shard.router.spilloverPolicies.map((policy) => ({ ...policy }))
              : undefined,
          }
        : undefined,
    })),
    nodes: testConfig.nodes.map((node) => ({ ...node, specialties: [...node.specialties] })),
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath },
    reporting: { directory: reportingDir, defaultLabel: 'blueprint' },
  };

  const blueprint: JobBlueprint = {
    metadata: { label: 'Unit Test Blueprint', author: 'Test Harness' },
    source: 'unit-test-blueprint.json',
    jobs: [
      {
        idPrefix: 'earth-blueprint',
        shard: 'earth',
        requiredSkills: ['general', 'finance'],
        estimatedDurationTicks: 3,
        value: 1500,
        valueStep: 10,
        count: 4,
      },
      {
        id: 'mars-bespoke-0001',
        shard: 'mars',
        requiredSkills: ['manufacturing'],
        estimatedDurationTicks: 5,
        value: 3200,
        count: 1,
      },
    ],
  };
  const totalJobs = blueprint.jobs.reduce((sum, entry) => sum + (entry.count ?? 1), 0);

  const result = await runSimulation(config, {
    jobs: totalJobs,
    jobBlueprint: blueprint,
    jobBlueprintSource: blueprint.source,
    outputLabel: 'blueprint',
    checkpointPath,
    ciMode: true,
  });

  const summaryRaw = await readFile(result.artifacts.summaryPath, 'utf8');
  const summary = JSON.parse(summaryRaw);
  assert.equal(summary.metrics.jobsSubmitted, totalJobs);
  assert.equal(summary.jobBlueprint.totalJobs, totalJobs);
  assert.equal(summary.jobBlueprint.metadata.label, 'Unit Test Blueprint');
  assert.equal(summary.jobBlueprint.entries[0].count, 4);
  assert.equal(summary.jobBlueprint.entries[1].shard, 'mars');
  assert.equal(summary.jobBlueprint.source, 'unit-test-blueprint.json');
  const blueprintSummary = await readFile(join(reportingDir, 'blueprint', 'summary.json'), 'utf8');
  assert.ok(blueprintSummary.includes('jobBlueprint'));

  await rm(dir, { force: true, recursive: true });
}

async function testReportingRetarget(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-reporting-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const initialReportingDir = join(dir, 'reports-initial');
  const retargetedReportingDir = join(dir, 'reports-retargeted');
  const config: FabricConfig = {
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold ?? Math.ceil(shard.maxQueue * 0.75),
            spilloverPolicies: shard.router.spilloverPolicies
              ? shard.router.spilloverPolicies.map((policy) => ({ ...policy }))
              : undefined,
          }
        : undefined,
    })),
    nodes: testConfig.nodes.map((node) => ({ ...node, specialties: [...node.specialties] })),
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath },
    reporting: { directory: initialReportingDir, defaultLabel: 'initial-label' },
  };

  const schedule: OwnerCommandSchedule[] = [
    {
      tick: 1,
      note: 'retarget reporting outputs',
      command: {
        type: 'reporting.configure',
        reason: 'unit-test-retarget',
        update: { directory: retargetedReportingDir, defaultLabel: 'owner-elevated' },
      },
    },
  ];

  const result = await runSimulation(config, {
    jobs: 24,
    simulateOutage: undefined,
    outageTick: undefined,
    resume: false,
    checkpointPath,
    ownerCommands: schedule,
    ownerCommandSource: 'unit-test-reporting-retarget',
  });

  const summaryRaw = await readFile(result.artifacts.summaryPath, 'utf8');
  const summary = JSON.parse(summaryRaw);
  assert.equal(summary.ownerState.reporting.directory, retargetedReportingDir);
  assert.equal(summary.ownerState.reporting.defaultLabel, 'owner-elevated');
  assert.ok(
    result.artifacts.summaryPath.includes(join(retargetedReportingDir, 'owner-elevated')),
    'summary should live under retargeted directory'
  );
  const eventsStats = await stat(result.artifacts.eventsPath);
  assert.ok(eventsStats.size > 0, 'events file should exist in retargeted directory');

  let initialDirExists = true;
  try {
    await stat(join(initialReportingDir, 'initial-label'));
  } catch {
    initialDirExists = false;
  }
  assert.equal(initialDirExists, false, 'initial reporting directory should be rotated away after retarget');

  await rm(dir, { force: true, recursive: true });
}

async function testOwnerCommandSchedule(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-schedule-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const reportingDir = join(dir, 'reports');
  const config: FabricConfig = {
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
    })),
    nodes: testConfig.nodes.map((node) => ({ ...node, specialties: [...node.specialties] })),
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath, intervalTicks: 3 },
    reporting: { directory: reportingDir, defaultLabel: 'schedule' },
  };
  const schedule: OwnerCommandSchedule[] = [
    { tick: 1, note: 'pause fabric', command: { type: 'system.pause', reason: 'schedule-pause' } },
    {
      tick: 2,
      note: 'tune earth shard',
      command: { type: 'shard.update', shard: 'earth', update: { router: { queueAlertThreshold: 80 } } },
    },
    { tick: 3, note: 'resume fabric', command: { type: 'system.resume', reason: 'schedule-resume' } },
    {
      tick: 4,
      note: 'rotate checkpoint path',
      command: {
        type: 'checkpoint.configure',
        update: { intervalTicks: 4, path: join(dirname(checkpointPath), 'schedule-rotated.json') },
        reason: 'schedule rotation',
      },
    },
    {
      tick: 5,
      note: 'retarget reporting outputs',
      command: {
        type: 'reporting.configure',
        reason: 'archive artifacts in governance bucket',
        update: {
          directory: join(reportingDir, 'schedule', 'governance-archive'),
          defaultLabel: 'schedule-governance',
        },
      },
    },
  ];
  const result = await runSimulation(config, {
    jobs: 50,
    simulateOutage: undefined,
    outageTick: undefined,
    resume: false,
    checkpointPath,
    outputLabel: 'schedule',
    ciMode: true,
    ownerCommands: schedule,
    ownerCommandSource: 'unit-test-schedule',
  });
  assert.equal(result.executedOwnerCommands.length, schedule.length);
  const reportRoot = dirname(result.artifacts.summaryPath);
  const summaryRaw = await readFile(result.artifacts.summaryPath, 'utf8');
  const summary = JSON.parse(summaryRaw);
  assert.equal(summary.ownerCommands.executed.length, schedule.length);
  assert.ok(
    summary.ownerCommands.executed.some((entry: OwnerCommandSchedule) => entry.command.type === 'checkpoint.configure')
  );
  assert.equal(summary.ownerState.checkpoint.intervalTicks, 4);
  assert.equal(summary.ownerState.reporting.directory, join(reportingDir, 'schedule', 'governance-archive'));
  assert.equal(summary.ownerState.reporting.defaultLabel, 'schedule-governance');
  const ownerLogRaw = await readFile(join(reportRoot, 'owner-commands-executed.json'), 'utf8');
  const ownerLog = JSON.parse(ownerLogRaw);
  assert.equal(ownerLog.executed.length, schedule.length);
  assert.ok(ownerLog.executed.some((entry: OwnerCommandSchedule) => entry.command.type === 'checkpoint.configure'));
  await rm(dir, { force: true, recursive: true });
}

async function testStopAndResumeDrill(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-resume-drill-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const reportingDir = join(dir, 'reports');
  const baseConfig: FabricConfig = {
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      spilloverTargets: [...shard.spilloverTargets],
      router: shard.router
        ? {
            queueAlertThreshold: shard.router.queueAlertThreshold ?? shard.maxQueue - 10,
            spilloverPolicies: shard.router.spilloverPolicies
              ? shard.router.spilloverPolicies.map((policy) => ({ ...policy }))
              : undefined,
          }
        : undefined,
    })),
    nodes: testConfig.nodes.map((node) => ({ ...node, specialties: [...node.specialties] })),
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath, intervalTicks: 4 },
    reporting: { directory: reportingDir, defaultLabel: 'resume-drill' },
  };

  const schedule: OwnerCommandSchedule[] = [
    { tick: 2, command: { type: 'system.pause', reason: 'drill-pause' }, note: 'Pause to simulate maintenance' },
    { tick: 3, command: { type: 'system.resume', reason: 'drill-resume' }, note: 'Resume after maintenance' },
    { tick: 4, command: { type: 'checkpoint.save', reason: 'pre-drill snapshot' }, note: 'Snapshot after pause cycle' },
    { tick: 6, command: { type: 'checkpoint.configure', update: { intervalTicks: 3 } }, note: 'Tighten cadence mid-run' },
  ];

  const firstRun = await runSimulation(cloneConfig(baseConfig), {
    jobs: 120,
    simulateOutage: 'mars.node',
    outageTick: 3,
    checkpointPath,
    outputLabel: 'resume-drill',
    ownerCommands: schedule,
    ownerCommandSource: 'resume-drill-schedule',
    stopAfterTicks: 6,
  });

  assert.equal(firstRun.run.stoppedEarly, true, 'first run should stop early for the drill');
  assert.equal(firstRun.run.stopReason, 'stop-after-ticks=6');
  const preSummaryRaw = await readFile(join(reportingDir, 'resume-drill', 'summary.json'), 'utf8');
  const preSummary = JSON.parse(preSummaryRaw);
  assert.equal(preSummary.run.stoppedEarly, true);
  assert.equal(preSummary.run.stopReason, 'stop-after-ticks=6');
  assert.ok(preSummary.metrics.jobsCompleted < preSummary.metrics.jobsSubmitted);

  const secondRun = await runSimulation(cloneConfig(baseConfig), {
    jobs: 120,
    simulateOutage: undefined,
    checkpointPath,
    outputLabel: 'resume-drill',
    ownerCommands: schedule,
    ownerCommandSource: 'resume-drill-schedule',
    resume: true,
  });

  assert.equal(secondRun.run.checkpointRestored, true, 'resume should restore checkpoint');
  assert.equal(secondRun.run.stoppedEarly, false, 'resumed run should complete');
  const postSummaryRaw = await readFile(join(reportingDir, 'resume-drill', 'summary.json'), 'utf8');
  const postSummary = JSON.parse(postSummaryRaw);
  assert.equal(postSummary.run.stoppedEarly, false);
  assert.equal(postSummary.run.checkpointRestored, true);
  assert.ok(postSummary.metrics.jobsCompleted >= postSummary.metrics.jobsSubmitted);

  const eventsRaw = await readFile(join(reportingDir, 'resume-drill', 'events.ndjson'), 'utf8');
  assert.ok(eventsRaw.includes('simulation.stopped'), 'event log should contain stop directive');

  await rm(dir, { force: true, recursive: true });
}

async function testAcceptanceSuiteHarness(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'fabric-acceptance-suite-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const reportingDir = join(dir, 'reports');
  const config: FabricConfig = cloneConfig({
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      maxQueue: Math.min(shard.maxQueue, 60),
      router: {
        queueAlertThreshold: 40,
        spilloverPolicies: shard.spilloverTargets.map((target, index) => ({
          target,
          threshold: 45 + index * 5,
          maxDrainPerTick: 15,
        })),
      },
    })),
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath, intervalTicks: 4 },
    reporting: { directory: reportingDir, defaultLabel: 'unit-acceptance' },
  });
  const schedule: OwnerCommandSchedule[] = [
    { tick: 3, command: { type: 'system.pause', reason: 'acceptance-pause' }, note: 'pause during acceptance harness' },
    { tick: 4, command: { type: 'system.resume', reason: 'acceptance-resume' }, note: 'resume acceptance harness' },
  ];
  const report = await runAcceptanceSuite({
    config,
    ownerCommands: schedule,
    baseLabel: 'unit-acceptance',
    jobsHighLoad: 240,
    outageNodeId: 'mars.node',
    outageTick: 5,
    restartStopAfterTicks: 12,
    thresholds: {
      maxDropRate: 0.2,
      maxFailureRate: 0.2,
      maxShardBalanceDelta: 0.6,
      maxShardSkewRatio: 120,
    },
  });
  console.log('Acceptance harness report:', {
    highLoadDropRate: report.highLoad.dropRate,
    restartDropRate: report.restart.stageTwoDropRate,
    highLoadAssertions: report.highLoad.assertions,
    restartAssertions: report.restart.assertions,
  });
  assert.ok(report.overallPass, 'acceptance suite should pass with relaxed thresholds');
  assert.equal(report.highLoad.label, 'unit-acceptance-high-load');
  assert.ok(report.restart.stageOneRun.stoppedEarly, 'stage one should halt early');
  assert.equal(report.restart.stageTwoRun.stoppedEarly, false, 'stage two should complete');
  assert.ok(
    report.restart.assertions.some((assertion) => assertion.id === 'stage-two-resumed' && assertion.passed),
    'stage two must report checkpoint restoration'
  );
  await rm(dir, { force: true, recursive: true });
}

async function testLoadHarness(): Promise<void> {
  const loadConfig: FabricConfig = {
    ...testConfig,
    shards: testConfig.shards.map((shard) => ({
      ...shard,
      maxQueue: 5000,
      router: {
        queueAlertThreshold: 3500,
        spilloverPolicies: shard.spilloverTargets.map((target, index) => ({
          target,
          threshold: 3600 + index * 120,
          maxDrainPerTick: 200,
        })),
      },
    })),
    nodes: testConfig.nodes.map((node) => ({
      ...node,
      capacity: Math.max(node.capacity, 20),
      maxConcurrency: Math.max(node.maxConcurrency, 10),
    })),
  };
  const { orchestrator, checkpointPath } = await buildOrchestrator(loadConfig);
  const totalJobs = 10_000;
  const jobs = createJobs(totalJobs);
  for (const job of jobs) {
    orchestrator.submitJob(job);
  }
  for (let tick = 1; tick <= 900; tick += 1) {
    orchestrator.processTick({ tick });
    if (tick === 5) {
      orchestrator.markOutage('earth.node');
    }
  }
  const metrics = orchestrator.fabricMetrics;
  assert.equal(metrics.jobsSubmitted, totalJobs);
  console.log('Load harness metrics snapshot:', metrics);
  assert.ok(metrics.jobsFailed / totalJobs < 0.01, 'failure rate should stay below 1%');
  assert.ok(metrics.reassignedAfterFailure > 0, 'load harness should trigger failover');
  const stats = orchestrator.getShardStatistics();
  const totals = Object.values(stats).map((entry) => entry.completed + entry.failed + entry.spillovers);
  console.log('Shard totals snapshot:', totals);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const skewRatio = max / Math.max(min, 1);
  assert.ok(skewRatio <= 2, `shard load skew should remain within 2x (observed ${skewRatio.toFixed(2)})`);
  const health = orchestrator.getHealthReport();
  assert.notEqual(health.fabric.level, 'critical', 'fabric should remain healthy after load test');
  console.log('Load test summary:', { metrics, fabric: health.fabric });
  await rm(checkpointPath, { force: true, recursive: true });
}

async function run(): Promise<void> {
  await testBalancing();
  await testOutageRecovery();
  await testCheckpointResume();
  await testCrossShardFallback();
  await testLedgerAccounting();
  await testLedgerCheckpointPersistence();
  await testDeterministicReplay();
  await testOwnerCommandControls();
  await testJobBlueprintSeeding();
  await testReportingRetarget();
  await testOwnerCommandSchedule();
  await testStopAndResumeDrill();
  await testAcceptanceSuiteHarness();
  await testLoadHarness();
  console.log('Planetary orchestrator fabric tests passed.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Planetary orchestrator fabric tests failed:', error);
  process.exit(1);
});
