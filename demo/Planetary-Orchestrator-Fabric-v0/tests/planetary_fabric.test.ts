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

async function buildOrchestrator(): Promise<{ orchestrator: PlanetaryOrchestrator; checkpointPath: string }>
{
  const dir = await mkdtemp(join(tmpdir(), 'fabric-'));
  const checkpointPath = join(dir, 'checkpoint.json');
  const config: FabricConfig = {
    ...testConfig,
    checkpoint: { ...testConfig.checkpoint, path: checkpointPath },
    reporting: { ...testConfig.reporting },
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
  await rm(checkpointPath, { force: true, recursive: true });
}

async function run(): Promise<void> {
  await testBalancing();
  await testOutageRecovery();
  await testCheckpointResume();
  console.log('Planetary orchestrator fabric tests passed.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Planetary orchestrator fabric tests failed:', error);
  process.exit(1);
});
