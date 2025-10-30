import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { verifyExperienceLift } from '../src/verification';

const scenarioPath = path.resolve('demo/Era-Of-Experience-v0/config/scenarios/baseline.json');

test('multi-run verification confirms positive GMV lift', async () => {
  const result = await verifyExperienceLift({
    scenarioPath,
    runs: 8,
    baseSeed: 1337,
    jobCountOverride: 96,
    bootstrapSamples: 128,
    alpha: 0.05
  });
  assert.equal(result.metrics.gmv.judgement, 'pass', 'GMV lift should pass verification');
  assert.ok(result.metrics.gmv.bootstrapInterval.lower > 0, 'GMV bootstrap lower bound must be positive');
  assert.ok(result.metrics.roi.difference.mean >= 0, 'ROI lift should be non-negative');
});
