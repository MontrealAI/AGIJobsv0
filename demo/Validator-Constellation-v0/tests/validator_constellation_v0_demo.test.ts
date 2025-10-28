import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSimulationInput, ValidatorConstellationSimulation } from '../src/simulation';
import { validatorConfig } from '../src/config';

test('v0 demo committee respects config', () => {
  const input = buildSimulationInput(9001);
  const simulation = new ValidatorConstellationSimulation(input);
  const report = simulation.run();
  assert.equal(report.committee.length, validatorConfig.committeeSize);
});

test('v0 demo triggers sentinel pause and resume', () => {
  const input = buildSimulationInput(9002);
  const simulation = new ValidatorConstellationSimulation(input);
  const report = simulation.run();
  assert.ok(report.alerts.length >= 1);
  assert.ok(report.pausedDomains.length >= 1);
  assert.ok(report.resumedDomains.length >= 1);
});

test('v0 demo batches 1000 jobs per zk proof', () => {
  const input = buildSimulationInput(9003);
  const simulation = new ValidatorConstellationSimulation(input);
  const report = simulation.run();
  assert.equal(report.zkBatch.jobs.length, input.jobs.length);
  assert.equal(report.zkBatch.verified, true);
});
