import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAlphaNodeConfig } from '../src/config';
import { AlphaPlanner, JobOpportunity } from '../src/ai/planner';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

async function makePlanner(): Promise<AlphaPlanner> {
  const config = await loadAlphaNodeConfig(fixturePath);
  return new AlphaPlanner(config);
}

test('planner favours higher alpha opportunities', async () => {
  const planner = await makePlanner();
  const jobs: JobOpportunity[] = [
    { jobId: 'a', reward: 10, difficulty: 0.3, risk: 0.4, tags: ['capital-markets'] },
    { jobId: 'b', reward: 18, difficulty: 0.6, risk: 0.2, tags: ['biotech'] }
  ];
  const result = planner.plan(jobs);
  assert.equal(result.selectedJobId, 'b');
  assert(result.alphaScore > 0);
  assert(result.worldModelConfidence >= 0 && result.worldModelConfidence <= 1);
  assert(result.horizonSequence.length > 0);
});

test('planner curriculum escalates after success', async () => {
  const planner = await makePlanner();
  const base = planner.plan([]).curriculumDifficulty;
  planner.recordOutcome('test', true, 100, 0.6);
  const next = planner.plan([]).curriculumDifficulty;
  assert(next >= base);
});

test('world model tracks sequence value and confidence', async () => {
  const planner = await makePlanner();
  const opportunities: JobOpportunity[] = [
    { jobId: 'alpha', reward: 20, difficulty: 0.4, risk: 0.2, tags: ['capital-markets'] },
    { jobId: 'beta', reward: 12, difficulty: 0.2, risk: 0.1, tags: ['manufacturing'] },
    { jobId: 'gamma', reward: 30, difficulty: 0.8, risk: 0.5, tags: ['biotech'] }
  ];
  const summary = planner.plan(opportunities);
  assert(summary.horizonValue > 0);
  assert(summary.forecasts.length === opportunities.length);
  const confidence = summary.worldModelConfidence;
  assert(confidence >= 0 && confidence <= 1);
});
