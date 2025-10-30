import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { runEraOfExperienceDemo } from '../src/demoRunner';

const scenarioPath = path.resolve('demo/Era-Of-Experience-v0/config/scenarios/baseline.json');

test('learning policy beats baseline GMV', async () => {
  const result = await runEraOfExperienceDemo({
    scenarioPath,
    writeReports: false,
    jobCountOverride: 96,
    seedOverride: 1337
  });
  assert.ok(result.learning.metrics.gmv > result.baseline.metrics.gmv, 'learning GMV must exceed baseline');
  assert.ok(result.learning.metrics.roi >= result.baseline.metrics.roi, 'ROI should not regress');
  assert.ok(result.learning.metrics.autonomyLift > result.baseline.metrics.autonomyLift, 'autonomy should lift');
});

test('identical seeds produce deterministic metrics', async () => {
  const options = {
    scenarioPath,
    writeReports: false,
    jobCountOverride: 48,
    seedOverride: 9876
  } as const;
  const first = await runEraOfExperienceDemo(options);
  const second = await runEraOfExperienceDemo(options);
  assert.equal(first.learning.metrics.gmv, second.learning.metrics.gmv, 'GMV must be deterministic');
  assert.equal(first.learning.metrics.roi, second.learning.metrics.roi, 'ROI must be deterministic');
});
