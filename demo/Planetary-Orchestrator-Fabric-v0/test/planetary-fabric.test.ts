import assert from 'node:assert/strict';
import path from 'node:path';
import { PlanetaryFabricOrchestrator } from '../src/orchestrator.js';
import { loadConfig } from '../src/config.js';

const CONFIG_PATH = path.resolve('demo/Planetary-Orchestrator-Fabric-v0/config/fabric.config.json');

const orchestrator = new PlanetaryFabricOrchestrator(CONFIG_PATH, 'ci-verification');
const config = loadConfig(CONFIG_PATH);
const shards = config.shards.map((shard) => shard.id);

const result = orchestrator.simulateHighLoad(5, shards, {
  simulateNodeFailureAtTick: 3,
  checkpointEvery: 100,
  disableBackgroundFailures: true,
  writeReports: false,
  maxTicks: 500,
});

assert.equal(result.jobsSubmitted, 5 * shards.length, 'Submitted jobs mismatch');
assert.ok(result.jobsFailed / Math.max(1, result.jobsSubmitted) < 0.02, 'Failure rate exceeds 2%');
assert.ok(result.resumedFromCheckpoint, 'Simulation did not resume from checkpoint');
assert.ok(result.checkpoints >= 1, 'No checkpoints were recorded');
assert.ok(result.maxShardSkew < 20, `Shard skew too high: ${result.maxShardSkew}`);

console.log('Planetary fabric high-load simulation passed.', result);
