import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint';
import { PlanetaryOrchestrator } from '../src/orchestrator';
import { runAcceptanceSuite } from '../src/acceptance';
import { loadMissionPlan } from '../src/config-loader';
import {
  FabricConfig,
  JobBlueprint,
  JobDefinition,
  NodeDefinition,
  OwnerCommandSchedule,
  ShardConfig,
} from '../src/types';
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
    {
      id: 'earth.node',
      region: 'earth',
      capacity: 10,
      specialties: ['general'],
      heartbeatIntervalSec: 10,
      maxConcurrency: 5,
      endpoint: 'https://earth-node.test/api',
      deployment: {
        orchestration: 'kubernetes',
        runtime: 'node-lts',
        image: 'registry.test/earth-node:1.0.0',
        version: '1.0.0',
        entrypoint: '/srv/start.sh',
        resources: { cpuCores: 8, memoryGb: 32, storageGb: 120 },
      },
      availabilityZones: ['earth-a'],
      pricing: { amount: 0.00045, currency: 'USDC', unit: 'job' },
      tags: ['general'],
      compliance: ['ISO-27001'],
    },
    {
      id: 'mars.node',
      region: 'mars',
      capacity: 10,
      specialties: ['general'],
      heartbeatIntervalSec: 10,
      maxConcurrency: 5,
      endpoint: 'https://mars-node.test/api',
      deployment: {
        orchestration: 'nomad',
        runtime: 'rust',
        image: 'registry.test/mars-node:2.0.0',
        version: '2.0.0',
        entrypoint: '/srv/run.sh',
        resources: { cpuCores: 10, memoryGb: 40, storageGb: 160 },
      },
      availabilityZones: ['mars-a'],
      pricing: { amount: 0.00052, currency: 'USDC', unit: 'job' },
      tags: ['mars'],
      compliance: ['Mars-Colony-Safety'],
    },
    {
      id: 'luna.node',
      region: 'luna',
      capacity: 10,
      specialties: ['general'],
      heartbeatIntervalSec: 10,
      maxConcurrency: 5,
      endpoint: 'https://luna-node.test/api',
      deployment: {
        orchestration: 'kubernetes',
        runtime: 'python',
        image: 'registry.test/luna-node:1.1.0',
        version: '1.1.0',
        entrypoint: '/srv/launch.sh',
        resources: { cpuCores: 6, memoryGb: 24, storageGb: 80 },
      },
      availabilityZones: ['luna-a'],
      pricing: { amount: 0.0003, currency: 'USDC', unit: 'job' },
      tags: ['luna'],
      compliance: ['Lunar-Safety-Standard'],
    },
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

function cloneNodeDefinitionForTest(node: NodeDefinition): NodeDefinition {
  return {
    ...node,
    specialties: [...node.specialties],
    availabilityZones: node.availabilityZones ? [...node.availabilityZones] : undefined,
    tags: node.tags ? [...node.tags] : undefined,
    compliance: node.compliance ? [...node.compliance] : undefined,
    deployment: node.deployment
      ? {
          ...node.deployment,
          resources: node.deployment.resources ? { ...node.deployment.resources } : undefined,
        }
      : undefined,
    pricing: node.pricing ? { ...node.pricing } : undefined,
  };
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
    nodes: configInput.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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
    nodes: configInput.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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

async function testCheckpointRestoresDynamicTopology(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const dynamicShard: ShardConfig = {
    id: 'edge-dynamic',
    displayName: 'Dynamic Edge Surge',
    latencyBudgetMs: 160,
    spilloverTargets: ['earth'],
    maxQueue: 80,
  };
  await orchestrator.applyOwnerCommand({ type: 'shard.register', shard: dynamicShard, reason: 'dynamic-edge-spinup' });
  await orchestrator.applyOwnerCommand({
    type: 'node.register',
    reason: 'dynamic-edge-node',
    node: {
      id: 'edge.node-dynamic',
      region: dynamicShard.id,
      capacity: 4,
      specialties: ['general'],
      heartbeatIntervalSec: 8,
      maxConcurrency: 2,
    },
  });
  orchestrator.submitJob({
    id: 'edge-dynamic-job-001',
    shard: dynamicShard.id,
    requiredSkills: ['general'],
    estimatedDurationTicks: 5,
    value: 500,
    submissionTick: 0,
  });
  orchestrator.processTick({ tick: 1 });
  await orchestrator.saveCheckpoint();

  const restoredConfig = cloneConfig(testConfig);
  restoredConfig.checkpoint.path = checkpointPath;
  const restored = new PlanetaryOrchestrator(restoredConfig, new CheckpointManager(checkpointPath));
  const restoredFromCheckpoint = await restored.restoreFromCheckpoint();
  assert.ok(restoredFromCheckpoint, 'restored orchestrator should detect checkpoint');

  const shardSnapshots = restored.getShardSnapshots();
  const dynamicSnapshot = shardSnapshots[dynamicShard.id];
  assert.ok(dynamicSnapshot, 'dynamic shard should be restored from checkpoint');
  assert.ok(
    (dynamicSnapshot.queueDepth ?? 0) + (dynamicSnapshot.inFlight ?? 0) >= 1,
    'dynamic shard should retain queued or in-flight work'
  );
  const nodeSnapshots = restored.getNodeSnapshots();
  assert.ok(nodeSnapshots['edge.node-dynamic'], 'dynamic node should be restored from checkpoint');

  await restored.applyOwnerCommand({
    type: 'node.deregister',
    nodeId: 'edge.node-dynamic',
    reason: 'retire-dynamic-node',
  });
  await restored.applyOwnerCommand({
    type: 'shard.deregister',
    shard: dynamicShard.id,
    reason: 'retire-dynamic-shard',
    redistribution: { mode: 'spillover', targetShard: 'earth' },
  });
  const postSnapshots = restored.getShardSnapshots();
  assert.equal(postSnapshots[dynamicShard.id], undefined, 'dynamic shard should be removable after restore');
  const postNodeSnapshots = restored.getNodeSnapshots();
  assert.equal(postNodeSnapshots['edge.node-dynamic'], undefined, 'dynamic node should be removable after restore');

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
  assert.equal(
    ledger.totals.valueSubmitted,
    metrics.valueSubmitted,
    'ledger should track submitted economic value'
  );
  assert.equal(
    ledger.totals.valueCompleted,
    metrics.valueCompleted,
    'ledger should track completed economic value'
  );
  assert.equal(
    ledger.totals.valueFailed,
    metrics.valueFailed,
    'ledger should track failed economic value'
  );
  assert.equal(
    ledger.totals.valueCancelled,
    metrics.valueCancelled,
    'ledger should track cancelled economic value'
  );
  assert.equal(
    ledger.totals.valueSpilloversOut,
    metrics.valueSpillovers,
    'ledger should track spillover economic value'
  );
  assert.equal(
    ledger.totals.valueReassignments,
    metrics.valueReassigned,
    'ledger should track reassigned economic value'
  );
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
      endpoint: 'https://earth-backup.test/api',
      deployment: {
        orchestration: 'kubernetes',
        runtime: 'node-lts',
        image: 'registry.test/earth-backup:1.0.0',
        version: '1.0.0',
        entrypoint: '/srv/start-backup.sh',
        resources: { cpuCores: 4, memoryGb: 16, storageGb: 64 },
      },
      availabilityZones: ['earth-b'],
      pricing: { amount: 0.00035, currency: 'USDC', unit: 'job' },
      tags: ['backup'],
      compliance: ['ISO-27001'],
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
      endpoint: 'https://mars-reserve.test/api',
      deployment: {
        orchestration: 'nomad',
        runtime: 'rust',
        image: 'registry.test/mars-reserve:1.0.0',
        version: '1.0.0',
        entrypoint: '/srv/launch-reserve.sh',
        resources: { cpuCores: 6, memoryGb: 24, storageGb: 96 },
      },
      availabilityZones: ['mars-b'],
      pricing: { amount: 0.0004, currency: 'USDC', unit: 'job' },
      tags: ['reserve'],
      compliance: ['Mars-Colony-Safety'],
    },
  });
  await orchestrator.applyOwnerCommand({
    type: 'node.update',
    nodeId: 'earth.node',
    reason: 'upgrade earth container runtime',
    update: {
      endpoint: 'https://earth-node-upgraded.test/api',
      deployment: {
        image: 'registry.test/earth-node:1.1.0',
        version: '1.1.0',
        runtime: 'node-lts',
      },
      pricing: { amount: 0.0005 },
      tags: ['general', 'finance'],
      compliance: ['ISO-27001', 'SOC2-Type-II'],
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
  assert.equal(ownerState.metrics.ownerInterventions, 15);
  assert.equal(ownerState.metrics.systemPauses, 1);
  assert.equal(ownerState.metrics.shardPauses, 1);
  assert.deepEqual(ownerState.pausedShards, [], 'no shards should remain paused');
  assert.equal(ownerState.checkpoint.intervalTicks, 3);
  assert.equal(ownerState.checkpoint.path, rotatedCheckpointPath);
  assert.equal(ownerState.reporting.directory, reportingOverride);
  assert.equal(ownerState.reporting.defaultLabel, 'owner-governance');

  const nodeSnapshot = orchestrator.getNodeSnapshots();
  const earthNodeSnapshot = nodeSnapshot['earth.node'];
  assert.ok(earthNodeSnapshot, 'earth node should be present after updates');
  assert.equal(earthNodeSnapshot.endpoint, 'https://earth-node-upgraded.test/api');
  assert.equal(earthNodeSnapshot.deployment?.image, 'registry.test/earth-node:1.1.0');
  assert.equal(earthNodeSnapshot.deployment?.runtime, 'node-lts');
  assert.equal(earthNodeSnapshot.pricing?.amount, 0.0005);
  assert.deepEqual(earthNodeSnapshot.compliance, ['ISO-27001', 'SOC2-Type-II']);
  assert.deepEqual(earthNodeSnapshot.tags, ['general', 'finance']);

  const earthBackupSnapshot = nodeSnapshot['earth.node.backup'];
  assert.ok(earthBackupSnapshot, 'earth backup node should be registered');
  assert.equal(earthBackupSnapshot.deployment?.orchestration, 'kubernetes');
  assert.equal(earthBackupSnapshot.pricing?.amount, 0.00035);

  const marsReserveSnapshot = nodeSnapshot['mars.node.reserve'];
  assert.ok(marsReserveSnapshot, 'mars reserve node should be registered');
  assert.equal(marsReserveSnapshot.deployment?.runtime, 'rust');
  assert.equal(marsReserveSnapshot.pricing?.amount, 0.0004);
  assert.ok(!nodeSnapshot['mars.node'], 'original mars node should be removed');

  const metrics = orchestrator.fabricMetrics;
  assert.ok(metrics.reassignedAfterFailure >= 1, 'deregistered node should trigger reassignment');

  await rm(checkpointPath, { force: true, recursive: true });
  await rm(rotatedCheckpointPath, { force: true });
}

async function testShardRegistrationLifecycle(): Promise<void> {
  const { orchestrator, checkpointPath } = await buildOrchestrator();
  const expansionShard: ShardConfig = {
    id: 'edge',
    displayName: 'Edge Outpost',
    latencyBudgetMs: 200,
    spilloverTargets: ['earth'],
    maxQueue: 120,
  };
  await orchestrator.applyOwnerCommand({ type: 'shard.register', shard: expansionShard, reason: 'expand-edge' });
  const healthAfterRegister = orchestrator.getHealthReport();
  assert.ok(healthAfterRegister.shards.some((entry) => entry.shardId === 'edge'));
  await orchestrator.applyOwnerCommand({
    type: 'node.register',
    reason: 'edge bootstrap node',
    node: {
      id: 'edge.node-alpha',
      region: 'edge',
      capacity: 3,
      specialties: ['general'],
      heartbeatIntervalSec: 6,
      maxConcurrency: 2,
    },
  });
  orchestrator.submitJob({
    id: 'edge-job-001',
    shard: 'edge',
    requiredSkills: ['general'],
    estimatedDurationTicks: 4,
    value: 240,
    submissionTick: 0,
  });
  orchestrator.processTick({ tick: 1 });
  const edgeSnapshot = orchestrator.getShardSnapshots()['edge'];
  assert.ok(edgeSnapshot && edgeSnapshot.inFlight + edgeSnapshot.queueDepth >= 1);
  await orchestrator.applyOwnerCommand({
    type: 'shard.deregister',
    shard: 'edge',
    reason: 'consolidate-to-earth',
    redistribution: { mode: 'spillover', targetShard: 'earth' },
  });
  const postDeregisterSnapshots = orchestrator.getShardSnapshots();
  assert.equal(postDeregisterSnapshots.edge, undefined);
  const earthSnapshot = postDeregisterSnapshots.earth;
  assert.ok(earthSnapshot.queueDepth + earthSnapshot.inFlight >= 1);
  orchestrator.processTick({ tick: 2 });
  assert.ok(orchestrator.fabricMetrics.spillovers > 0);

  const transientShard: ShardConfig = {
    id: 'transient',
    displayName: 'Transient Staging',
    latencyBudgetMs: 180,
    spilloverTargets: ['earth'],
    maxQueue: 40,
  };
  await orchestrator.applyOwnerCommand({ type: 'shard.register', shard: transientShard, reason: 'staging-window' });
  orchestrator.submitJob({
    id: 'transient-job-001',
    shard: 'transient',
    requiredSkills: ['general'],
    estimatedDurationTicks: 2,
    value: 90,
    submissionTick: 0,
  });
  await orchestrator.applyOwnerCommand({
    type: 'shard.deregister',
    shard: 'transient',
    reason: 'retire-staging',
    redistribution: { mode: 'cancel', cancelReason: 'owner-retired-shard' },
  });
  assert.equal(orchestrator.getShardSnapshots().transient, undefined);
  assert.ok(orchestrator.fabricMetrics.jobsCancelled >= 1);
  await rm(checkpointPath, { force: true, recursive: true });
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
    nodes: testConfig.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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
  assert.equal(summary.chronicle.path, './mission-chronicle.md');
  assert.ok(summary.chronicle.dropRate >= 0);
  assert.ok(summary.chronicle.failureRate >= 0);
  assert.equal(summary.chronicle.submittedValue, summary.metrics.valueSubmitted);
  assert.equal(summary.chronicle.completedValue, summary.metrics.valueCompleted);
  assert.ok(summary.chronicle.valueDropRate >= 0);
  assert.ok(summary.chronicle.valueFailureRate >= 0);
  assert.ok(summary.metrics.valueSubmitted >= summary.metrics.valueCompleted);
  assert.ok(summary.metrics.valueSubmitted >= summary.metrics.valueFailed);
  const blueprintSummary = await readFile(join(reportingDir, 'blueprint', 'summary.json'), 'utf8');
  assert.ok(blueprintSummary.includes('jobBlueprint'));
  const chroniclePath = join(reportingDir, 'blueprint', 'mission-chronicle.md');
  const chronicleContent = await readFile(chroniclePath, 'utf8');
  assert.ok(chronicleContent.includes('Mission Chronicle'));
  assert.ok(chronicleContent.includes('Reliability digest'));
  assert.ok(chronicleContent.includes('Value drop rate'));
  assert.ok(chronicleContent.includes('Value failure rate'));
  assert.ok(chronicleContent.includes('Value submitted'));

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
    nodes: testConfig.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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
  const summaryEarthNode = summary.nodes['earth.node'];
  assert.ok(summaryEarthNode, 'summary should include earth.node snapshot');
  assert.equal(summaryEarthNode.endpoint, 'https://earth-node.test/api');
  assert.equal(summaryEarthNode.deployment.image, 'registry.test/earth-node:1.0.0');
  assert.equal(summaryEarthNode.pricing.amount, 0.00045);
  assert.deepEqual(summaryEarthNode.compliance, ['ISO-27001']);
  assert.equal(summary.chronicle.path, './mission-chronicle.md');
  assert.ok(summary.chronicle.dropRate >= 0);
  assert.ok(summary.chronicle.failureRate >= 0);
  const eventsStats = await stat(result.artifacts.eventsPath);
  assert.ok(eventsStats.size > 0, 'events file should exist in retargeted directory');
  const topologyPath = join(retargetedReportingDir, 'owner-elevated', 'mission-topology.mmd');
  const topologyStats = await stat(topologyPath);
  assert.ok(topologyStats.size > 0, 'topology mermaid should be generated');
  const topologyHtmlPath = join(retargetedReportingDir, 'owner-elevated', 'mission-topology.html');
  await stat(topologyHtmlPath);
  const topologyDefinition = await readFile(topologyPath, 'utf8');
  assert.ok(topologyDefinition.includes('flowchart'), 'topology definition should contain mermaid syntax');
  assert.equal(summary.topology.mermaidPath, './mission-topology.mmd');
  assert.equal(summary.topology.htmlPath, './mission-topology.html');
  assert.equal(result.artifacts.missionGraphPath, topologyPath);
  assert.equal(result.artifacts.missionGraphHtmlPath, topologyHtmlPath);
  assert.ok(result.artifacts.missionChroniclePath.endsWith('mission-chronicle.md'));
  const chronicleStats = await stat(result.artifacts.missionChroniclePath);
  assert.ok(chronicleStats.size > 0, 'chronicle markdown should be generated');
  const chronicleContent = await readFile(result.artifacts.missionChroniclePath, 'utf8');
  assert.ok(chronicleContent.includes('Mission Chronicle'));
  assert.ok(chronicleContent.includes('Owner Command Timeline'));

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
    nodes: testConfig.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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
  assert.equal(summary.chronicle.path, './mission-chronicle.md');
  assert.ok(summary.chronicle.dropRate >= 0);
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
    nodes: testConfig.nodes.map((node) => cloneNodeDefinitionForTest(node)),
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
    jobsHighLoad: 120,
    outageNodeId: 'mars.node',
    restartStopAfterTicks: 10,
  });
  console.log('Acceptance harness report:', {
    highLoadDropRate: report.highLoad.dropRate,
    restartDropRate: report.restart.stageTwoDropRate,
    highLoadAssertions: report.highLoad.assertions,
    restartAssertions: report.restart.assertions,
  });
  assert.ok(report.overallPass, 'acceptance suite should satisfy strict thresholds');
  assert.ok(report.highLoad.dropRate <= 0.02, 'high-load drop rate must stay below 2%');
  assert.ok(report.highLoad.failureRate <= 0.01, 'high-load failure rate must stay below 1%');
  assert.ok(
    report.highLoad.assertions.some((assertion) => assertion.id === 'spillover-activity' && assertion.passed),
    'spillover activity must be observed during acceptance'
  );
  assert.ok(
    report.highLoad.assertions.some((assertion) => assertion.id === 'failover-reassignment' && assertion.passed),
    'node outage should trigger task reassignment'
  );
  assert.equal(report.highLoad.label, 'unit-acceptance-high-load');
  assert.ok(report.restart.stageOneRun.stoppedEarly, 'stage one should halt early');
  assert.ok(
    report.restart.assertions.some((assertion) => assertion.id === 'stage-one-stopped' && assertion.passed),
    'stage one must indicate stop directive'
  );
  assert.ok(
    report.restart.assertions.some((assertion) => assertion.id === 'stage-one-outstanding' && assertion.passed),
    'outstanding work should persist into restart scenario'
  );
  assert.equal(report.restart.stageTwoRun.stoppedEarly, false, 'stage two should complete');
  assert.ok(
    report.restart.assertions.some((assertion) => assertion.id === 'stage-two-resumed' && assertion.passed),
    'stage two must report checkpoint restoration'
  );
  await rm(dir, { force: true, recursive: true });
}

async function testAcceptanceSuiteMissionPlan(): Promise<void> {
  const planPath = join(dirname(__filename), '..', 'config', 'mission-plan.example.json');
  const tempDir = await mkdtemp(join(tmpdir(), 'fabric-plan-acceptance-'));
  const checkpointPath = join(tempDir, 'checkpoint.json');
  const reportingDir = join(tempDir, 'reports');

  const plan = await loadMissionPlan(planPath);
  const config = cloneConfig(plan.config);
  config.checkpoint.path = checkpointPath;
  config.reporting = { ...config.reporting, directory: reportingDir };

  const missionPlanDescriptor = plan
    ? {
        source: plan.source,
        label: plan.metadata?.label,
        description: plan.metadata?.description,
        author: plan.metadata?.author,
        version: plan.metadata?.version,
        tags: plan.metadata?.tags,
        run: plan.run,
        configSource: plan.configSource,
        ownerCommandsSource: plan.ownerCommandsSource,
        jobBlueprintSource: plan.jobBlueprintSource,
      }
    : undefined;

  const trimmedBlueprint = plan.jobBlueprint
    ? {
        metadata: plan.jobBlueprint.metadata,
        source: plan.jobBlueprint.source,
        jobs: plan.jobBlueprint.jobs.slice(0, 3).map((entry, index) => ({
          ...entry,
          estimatedDurationTicks: entry.estimatedDurationTicks ?? (index + 2),
          value: entry.value ?? 1500 + index * 100,
          count: Math.min(entry.count ?? 1, 2),
        })),
      }
    : undefined;

  const trimmedJobsTotal = trimmedBlueprint
    ? trimmedBlueprint.jobs.reduce((sum, entry) => sum + (entry.count ?? 1), 0)
    : undefined;

  const report = await runAcceptanceSuite({
    config,
    ownerCommands: plan.ownerCommands,
    baseLabel: 'mission-plan-acceptance',
    jobsHighLoad: trimmedJobsTotal ? Math.max(trimmedJobsTotal * 2, 30) : 60,
    outageNodeId: plan.run?.simulateOutage,
    outageTick: plan.run?.outageTick,
    restartStopAfterTicks: Math.min(plan.run?.stopAfterTicks ?? 180, 40),
    jobBlueprint: trimmedBlueprint,
    jobBlueprintSource: trimmedBlueprint?.source,
    missionPlan: missionPlanDescriptor,
  });

  assert.ok(report.missionPlan, 'mission plan metadata should be recorded in acceptance report');
  assert.equal(report.missionPlan?.label, plan.metadata?.label);
  assert.equal(report.missionPlan?.source, plan.source);
  assert.equal(report.missionPlan?.jobBlueprintSource, plan.jobBlueprintSource);
  if (plan.run?.outputLabel) {
    assert.equal(report.missionPlan?.run?.outputLabel, plan.run.outputLabel);
  }

  assert.equal(report.highLoad.label, 'mission-plan-acceptance-high-load');
  assert.equal(report.restart.label, 'mission-plan-acceptance-restart');
  assert.ok(report.highLoad.assertions.length >= 1, 'high-load scenario should emit assertions');
  assert.ok(report.restart.assertions.length >= 1, 'restart scenario should emit assertions');

  const stageOneSummaryStat = await stat(report.restart.stageOneSummaryPath);
  const stageTwoSummaryStat = await stat(report.restart.stageTwoSummaryPath);
  assert.ok(stageOneSummaryStat.isFile(), 'stage one summary from mission plan run should exist');
  assert.ok(stageTwoSummaryStat.isFile(), 'stage two summary from mission plan run should exist');

  await rm(tempDir, { force: true, recursive: true });
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

  const maxTicks = 2_400;
  let pendingJobs = totalJobs;
  let completedWithinBudget = false;
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    orchestrator.processTick({ tick });
    if (tick === 5) {
      orchestrator.markOutage('earth.node');
    }
    const snapshot = orchestrator.getLedgerSnapshot();
    pendingJobs = snapshot.pendingJobs;
    if (pendingJobs === 0) {
      completedWithinBudget = true;
      break;
    }
  }

  const metrics = orchestrator.fabricMetrics;
  assert.equal(metrics.jobsSubmitted, totalJobs);
  assert.ok(completedWithinBudget, `fabric should empty backlog within ${maxTicks} ticks (pending ${pendingJobs})`);
  assert.equal(metrics.jobsCompleted, totalJobs, 'all jobs should complete under load');
  console.log('Load harness metrics snapshot:', metrics);
  assert.ok(metrics.jobsFailed / totalJobs < 0.01, 'failure rate should stay below 1%');
  assert.ok(metrics.reassignedAfterFailure > 0, 'load harness should trigger failover');
  const stats = orchestrator.getShardStatistics();
  const totals = Object.values(stats).map((entry) => entry.completed + entry.failed + entry.spillovers);
  console.log('Shard totals snapshot:', totals);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const skewRatio = max / Math.max(min, 1);
  assert.ok(skewRatio <= 120, `shard load skew should remain within 120x (observed ${skewRatio.toFixed(2)})`);
  const earthDefinition = loadConfig.nodes.find((node) => node.id === 'earth.node');
  if (!earthDefinition) {
    throw new Error('earth.node definition missing in load harness config');
  }
  await orchestrator.applyOwnerCommand({ type: 'node.deregister', nodeId: 'earth.node', reason: 'load-harness-reset' });
  await orchestrator.applyOwnerCommand({
    type: 'node.register',
    node: cloneNodeDefinitionForTest(earthDefinition),
    reason: 'load-harness-restore',
  });
  const health = orchestrator.getHealthReport();
  assert.equal(health.fabric.level, 'ok', 'fabric should report healthy status after node restoration');
  console.log('Load test summary:', { metrics, fabric: health.fabric });
  await rm(checkpointPath, { force: true, recursive: true });
}

async function run(): Promise<void> {
  await testBalancing();
  await testOutageRecovery();
  await testCheckpointResume();
  await testCheckpointRestoresDynamicTopology();
  await testCrossShardFallback();
  await testLedgerAccounting();
  await testLedgerCheckpointPersistence();
  await testDeterministicReplay();
  await testOwnerCommandControls();
  await testShardRegistrationLifecycle();
  await testJobBlueprintSeeding();
  await testReportingRetarget();
  await testOwnerCommandSchedule();
  await testStopAndResumeDrill();
  await testAcceptanceSuiteHarness();
  await testAcceptanceSuiteMissionPlan();
  await testLoadHarness();
  console.log('Planetary orchestrator fabric tests passed.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Planetary orchestrator fabric tests failed:', error);
  process.exit(1);
});
