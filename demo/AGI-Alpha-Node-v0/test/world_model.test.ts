import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAlphaNodeConfig } from '../src/config';
import { AlphaWorldModel } from '../src/ai/worldModel';
import type { JobOpportunity } from '../src/ai/planner';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

async function createWorldModel(): Promise<AlphaWorldModel> {
  const config = await loadAlphaNodeConfig(fixturePath);
  return new AlphaWorldModel(config);
}

test('world model forecast responds to job attributes', async () => {
  const worldModel = await createWorldModel();
  const baseJob: JobOpportunity = {
    jobId: 'alpha',
    reward: 15,
    difficulty: 0.4,
    risk: 0.2,
    tags: ['capital-markets'],
  };
  const conservative = worldModel.forecast(baseJob);
  const risky = worldModel.forecast({ ...baseJob, jobId: 'beta', risk: 0.8 });
  assert(conservative.successProbability > risky.successProbability);
  assert(conservative.riskAdjustedValue > risky.riskAdjustedValue);
});

test('world model evaluate returns horizon sequence', async () => {
  const worldModel = await createWorldModel();
  const opportunities: JobOpportunity[] = [
    { jobId: 'alpha', reward: 22, difficulty: 0.5, risk: 0.25, tags: ['capital-markets'] },
    { jobId: 'beta', reward: 18, difficulty: 0.35, risk: 0.1, tags: ['manufacturing'] },
    { jobId: 'gamma', reward: 30, difficulty: 0.7, risk: 0.45, tags: ['biotech'] },
  ];
  const result = worldModel.evaluate(opportunities, 4);
  assert(result.sequence.jobIds.length > 0);
  assert(result.sequence.cumulativeValue > 0);
  assert(result.bestForecast);
});
