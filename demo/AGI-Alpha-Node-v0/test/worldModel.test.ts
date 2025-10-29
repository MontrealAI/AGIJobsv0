import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAlphaNodeConfig } from '../src/config';
import { AlphaWorldModel } from '../src/ai/worldModel';
import { JobOpportunity } from '../src/ai/planner';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

async function makeProjection(): Promise<ReturnType<AlphaWorldModel['project']>> {
  const config = await loadAlphaNodeConfig(fixturePath);
  const model = new AlphaWorldModel(config);
  const opportunities: JobOpportunity[] = [
    { jobId: 'a', reward: 12, difficulty: 0.4, risk: 0.2, tags: ['capital'] },
    { jobId: 'b', reward: 9, difficulty: 0.3, risk: 0.1, tags: ['biotech'] },
    { jobId: 'c', reward: 18, difficulty: 0.7, risk: 0.45, tags: ['manufacturing'] },
  ];
  return model.project(opportunities, 'c');
}

test('world model produces deterministic projection', async () => {
  const projection = await makeProjection();
  assert(Math.abs(projection.expectedReturn - 27.7025218575) < 1e-6);
  assert(Math.abs(projection.downsideRisk - 0.04296875) < 1e-9);
  assert(Math.abs(projection.valueAtRisk - 5.352818457600001) < 1e-6);
  assert.equal(projection.simulations, 256);
  assert.equal(projection.horizon, 5);
  assert(projection.bestPath);
  assert(projection.worstPath);
  assert.equal(projection.bestPath?.steps.length, 5);
  assert.equal(projection.worstPath?.steps.length, 5);
});

test('world model responds to opportunity set changes', async () => {
  const config = await loadAlphaNodeConfig(fixturePath);
  const model = new AlphaWorldModel(config);
  const baseProjection = await makeProjection();
  const saferJobs: JobOpportunity[] = [
    { jobId: 'safe-a', reward: 8, difficulty: 0.2, risk: 0.05, tags: ['capital'] },
    { jobId: 'safe-b', reward: 10, difficulty: 0.25, risk: 0.08, tags: ['biotech'] },
  ];
  const saferProjection = model.project(saferJobs, 'safe-a');
  assert.equal(saferProjection.downsideRisk, 0);
  assert(saferProjection.volatility < baseProjection.volatility);
});
