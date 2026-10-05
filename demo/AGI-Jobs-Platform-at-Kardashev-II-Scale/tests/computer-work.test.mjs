import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  defaults,
  fields,
  planCapacity,
  examples,
  taskDraft,
} from '../ui/computer-work-model.mjs';
const require = createRequire(import.meta.url);
require('ts-node').register({ compilerOptions: { module: 'commonjs' } });
const {
  parseComputerWorkTask,
  computerTaskDigest,
} = require('../../../apps/orchestrator/computerWork.ts');

test('planning baseline accounts for review, rejection and gross value separately', () => {
  const result = planCapacity(defaults);
  assert.deepEqual(result, {
    submitted: 200000,
    reviewCapacity: 112500,
    reviewed: 112500,
    accepted: 101250,
    valueUSD: 10125000,
    backlog: 87500,
    rejected: 11250,
    marketPercent: (10125000 / 40000000000000) * 100,
    bottleneck: 'Independent review',
    requiredReviewers: 45,
  });
});

test('zero reviewers and zero acceptance cannot create accepted value', () => {
  for (const overrides of [{ reviewers: 0 }, { acceptancePercent: 0 }]) {
    const result = planCapacity({ ...defaults, ...overrides });
    assert.equal(result.accepted, 0);
    assert.equal(result.valueUSD, 0);
    assert.equal(result.marketPercent, 0);
  }
  assert.equal(planCapacity({ ...defaults, reviewers: 45 }).backlog, 0);
});

test('review rounding never overstates capacity or accepted jobs', () => {
  const result = planCapacity({
    ...defaults,
    workers: 1,
    jobsPerDay: 7,
    days: 1,
    reviewers: 1,
    reviewHours: 1,
    reviewMinutes: 17,
    acceptancePercent: 50,
  });
  assert.equal(result.reviewCapacity, 3);
  assert.equal(result.reviewed, 3);
  assert.equal(result.accepted, 1);
  assert.equal(result.backlog, 4);
  assert.equal(result.rejected, 2);
});

test('all documented bounds reject missing, nonfinite, fractional and out-of-range assumptions', () => {
  for (const [id, , min, max] of fields) {
    for (const value of [
      undefined,
      null,
      '',
      NaN,
      Infinity,
      -Infinity,
      min - 1,
      max + 1,
      min + 0.5,
      '100',
    ])
      assert.throws(
        () => planCapacity({ ...defaults, [id]: value }),
        undefined,
        `${id}: ${value}`
      );
  }
  for (const input of [null, [], { ...defaults, approved: true }])
    assert.throws(() => planCapacity(input));
});

test('maximum permitted assumptions remain finite and conserve review outcomes', () => {
  for (const input of [
    Object.fromEntries(fields.map(([id, , , max]) => [id, max])),
    Object.fromEntries(fields.map(([id, , min]) => [id, min])),
  ]) {
    const result = planCapacity(input);
    assert.ok(
      Object.values(result)
        .filter((x) => typeof x === 'number')
        .every(Number.isFinite)
    );
    assert.equal(result.accepted + result.rejected, result.reviewed);
    assert.equal(result.reviewed + result.backlog, result.submitted);
    assert.ok(result.reviewed <= result.reviewCapacity);
  }
});

test('all ten downloadable drafts round-trip through the authoritative worker parser', () => {
  assert.equal(examples.length, 10);
  assert.equal(new Set(examples.map((x) => x.id)).size, 10);
  for (const example of examples) {
    const draft = taskDraft(example.id);
    assert.deepEqual(parseComputerWorkTask(draft), draft);
    assert.equal(draft.dataClass, 'synthetic');
    assert.deepEqual(draft.allowedOrigins, ['http://127.0.0.1:4175']);
    assert.equal(draft.workerProfile, 'k2_sandbox');
    assert.match(computerTaskDigest(draft), /^[a-f0-9]{64}$/);
    assert.notEqual(
      computerTaskDigest({ ...draft, goal: draft.goal + ' changed' }),
      computerTaskDigest(draft)
    );
    draft.goal = 'Local mutation';
    assert.notEqual(taskDraft(example.id).goal, draft.goal);
  }
  assert.throws(() => taskDraft('unknown'));
});
