import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  validateComparison,
  analyse,
  review,
  makeTask,
  workOrder,
  marketScenario,
  jobTypes,
} from '../model.mjs';
const root = fileURLToPath(new URL('../../../../build/hgm/', import.meta.url));
const record = (name = 'reference') =>
  JSON.parse(fs.readFileSync(root + 'records/' + name + '.json'));
test('all recorded scenarios reconcile, including no-cost owner pause', () => {
  for (const name of ['reference', 'constrained', 'paused'])
    validateComparison(record(name));
});
test('analysis includes pending costs and binds its source', async () => {
  const data = record(),
    a = await analyse(data);
  assert.equal(
    a.strategies[0].committedCost,
    data.hgm.summary.cost + data.hgm.summary.reserved_cost
  );
  assert.equal(
    a.strategies[0].valueLessCommittedCost,
    data.hgm.summary.gmv -
      data.hgm.summary.cost -
      data.hgm.summary.reserved_cost
  );
  assert.equal((await review(data, a)).accepted, true);
  a.strategies[0].committedCost++;
  assert.equal((await review(data, a)).accepted, false);
});
test('candidate cannot grant approval or move between sources', async () => {
  const a = await analyse(record());
  a.settlementApproved = true;
  assert.equal((await review(record(), a)).accepted, false);
  assert.equal(
    (await review(record('constrained'), await analyse(record()))).accepted,
    false
  );
});
test('imports reject malformed, non-finite, forged and injected records', () => {
  for (const change of [
    (d) => (d.hgm.summary.gmv = NaN),
    (d) => d.hgm.summary.profit++,
    (d) =>
      (d.hgm.timeline[0].agents[0].agent_id = '<img src=x onerror=alert(1)>'),
    (d) => (d.evidence_class = 'live'),
    (d) => (d.production_approved = true),
    (d) => (d.seed = -1),
    (d) => (d.hgm.summary.roi = null),
  ]) {
    const d = record();
    change(d);
    assert.throws(() => validateComparison(d));
  }
});
test('imports require exact totals, derived values and evidence for pending work', async () => {
  for (const field of ['gmv', 'cost', 'reserved_cost', 'profit', 'roi']) {
    const d = record();
    d.hgm.summary[field] += 0.000001;
    if (field !== 'profit')
      d.hgm.summary.profit = d.hgm.summary.gmv - d.hgm.summary.cost;
    if (field !== 'roi')
      d.hgm.summary.roi = d.hgm.summary.gmv / d.hgm.summary.cost;
    assert.throws(() => validateComparison(d), field);
    await assert.rejects(() => analyse(d));
    await assert.rejects(() => review(d, {}));
  }
  const d = record();
  d.hgm.summary.gmv += 0.01;
  d.hgm.summary.profit = d.hgm.summary.gmv - d.hgm.summary.cost;
  d.hgm.summary.roi = d.hgm.summary.gmv / d.hgm.summary.cost;
  assert.throws(() => validateComparison(d), /final snapshot/);
  for (const field of [
    'reserved_cost',
    'pending_tasks',
    'successes',
    'failures',
  ]) {
    const paused = record('paused');
    paused.hgm.timeline = [];
    paused.hgm.summary[field] = 1;
    assert.throws(() => validateComparison(paused), /final snapshot/);
  }
});
test('worker task is bounded to a synthetic benchmark analysis', async () => {
  const t = await makeTask(record());
  assert.equal(t.workerProfile, 'hgm-analysis');
  assert.equal(t.dataClass, 'synthetic');
  assert.equal(t.deliverables[0].name, 'benchmark-analysis.json');
  assert.deepEqual(t.allowedOrigins, ['https://github.com']);
});
test('work orders cover ten workflows and preserve separate admission', () => {
  assert.equal(jobTypes.length, 10);
  for (const [id] of jobTypes) {
    const d = workOrder(id, 1500, 60);
    assert.equal(d.admitted, false);
    assert.equal(d.settlementApproved, false);
    assert.equal(d.budgetUsdc, '1500.000000');
  }
  for (const value of [0, -1, NaN, 1.5, 1000001])
    assert.throws(() => workOrder('reports', value, 60));
});
test('market arithmetic uses percent twice and rejects invalid assumptions', () => {
  assert.equal(marketScenario(40, 10, 0.01), 400000000);
  assert.equal(marketScenario(40, 0, 10), 0);
  assert.throws(() => marketScenario(40, -1, 5));
  assert.throws(() => marketScenario(Infinity, 10, 1));
});
