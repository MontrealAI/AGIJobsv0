import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import path from 'node:path';

const missionPath = path.resolve(
  __dirname,
  '../../../../demo/agi-governance/config/mission@v2.json'
);
const mission = JSON.parse(readFileSync(missionPath, 'utf8')) as {
  incentives: {
    mintRule: { rewardEngineShares: Array<{ share: number }> };
  };
  ci: { requiredJobs: Array<{ id: string }> };
  alphaField: { verification: { superintelligenceMinimum: number; quantumConfidenceMinimum: number } };
};

test('reward engine shares sum to one', () => {
  const shares = mission.incentives.mintRule.rewardEngineShares.map((entry) => entry.share);
  const total = shares.reduce((accumulator, share) => accumulator + share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'Reward engine shares must sum to 1');
});

test('ci guardrails include demo governance job', () => {
  const jobIds = mission.ci.requiredJobs.map((job) => job.id);
  for (const required of ['lint', 'tests', 'foundry', 'coverage', 'summary', 'invariants']) {
    assert.ok(jobIds.includes(required), `CI required jobs must include ${required}`);
  }
});

test('alpha-field verification thresholds are strengthened', () => {
  assert.ok(mission.alphaField.verification.superintelligenceMinimum >= 0.95);
  assert.ok(mission.alphaField.verification.quantumConfidenceMinimum >= 0.9);
});
