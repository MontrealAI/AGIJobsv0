import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint';
import { PlanetaryOrchestrator } from '../src/orchestrator';
import { FabricConfig, JobDefinition } from '../src/types';

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
    checkpoint: { ...configInput.checkpoint, path: checkpointPath },
    reporting: { ...configInput.reporting },
  };
  const orchestrator = new PlanetaryOrchestrator(config, new CheckpointManager(checkpointPath));
  return { orchestrator, checkpointPath };
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
  await testDeterministicReplay();
  await testLoadHarness();
  console.log('Planetary orchestrator fabric tests passed.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Planetary orchestrator fabric tests failed:', error);
  process.exit(1);
});
