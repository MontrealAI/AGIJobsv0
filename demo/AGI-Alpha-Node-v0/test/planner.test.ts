import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAlphaNodeConfig } from '../src/config';
import { AlphaPlanner, JobOpportunity } from '../src/ai/planner';
import { fixturePath } from './test-utils';

async function makePlanner(): Promise<AlphaPlanner> {
  const config = await loadAlphaNodeConfig(fixturePath('mainnet.guide.json'));
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
});

test('planner curriculum escalates after success', async () => {
  const planner = await makePlanner();
  const base = planner.plan([]).curriculumDifficulty;
  planner.recordOutcome('test', true, 100, 0.6, ['capital-markets']);
  const next = planner.plan([]).curriculumDifficulty;
  assert(next >= base);
});

test('planner leverages domain experience to prioritise aligned jobs', async () => {
  const planner = await makePlanner();
  planner.recordOutcome('finance-alpha', true, 24, 0.55, ['capital-markets']);
  planner.recordOutcome('bio-miss', false, 20, 0.55, ['biotech']);

  const jobs: JobOpportunity[] = [
    { jobId: 'finance-new', reward: 14, difficulty: 0.5, risk: 0.25, tags: ['capital-markets'] },
    { jobId: 'biotech-new', reward: 16, difficulty: 0.5, risk: 0.25, tags: ['biotech'] }
  ];

  const result = planner.plan(jobs);
  assert.equal(result.selectedJobId, 'finance-new');
});
