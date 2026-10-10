import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveStartProgress,
  openStartProgress,
} from '../../website/assets/start-state.mjs';

const initial = {
  step: 0,
  role: '',
  type: 'research',
  goal: '',
  largeText: false,
};
const envelope = (fields) => ({ schema: 'agi-jobs-start/v1', fields });

test('unfinished bilingual requests and text preferences survive a round trip exactly', () => {
  for (const goal of [
    '',
    'Compare',
    '  Compare three public tools.\nKeep source links and explain the differences.  ',
    '  Comparer trois logiciels publics — inclure les sources, les coûts et les différences.\nQuébec ⚜️  ',
    '<img src=x onerror=alert(1)> is text in this draft, not markup.',
  ]) {
    const state = Object.freeze({
      ...initial,
      step: 1,
      role: 'buyer',
      goal,
      largeText: true,
    });
    const saved = saveStartProgress(state);
    const restored = openStartProgress(saved);
    assert.deepEqual(restored, state);
    assert.notEqual(restored, state);
    restored.goal = 'A different request';
    assert.equal(state.goal, goal);
    assert.deepEqual(openStartProgress(saved), state);
  }
});

test('all four journeys can resume at valid steps without granting execution authority', () => {
  assert.deepEqual(openStartProgress(saveStartProgress(initial)), initial);
  for (const role of ['buyer', 'worker', 'reviewer', 'explorer'])
    for (const step of [0, 1, 2])
      for (const type of ['research', 'feature', 'tests']) {
        const state = {
          ...initial,
          step,
          role,
          type,
          goal: role === 'buyer' ? 'Compare public software tools.' : '',
        };
        const saved = JSON.parse(saveStartProgress(state));
        assert.deepEqual(saved, envelope(state));
        assert.deepEqual(openStartProgress(JSON.stringify(saved)), state);
      }
});

test('a request is bounded in UTF-16 units without truncating it', () => {
  for (const goal of ['a'.repeat(2000), '🔎'.repeat(1000)]) {
    const state = { ...initial, step: 2, role: 'buyer', goal };
    assert.equal(openStartProgress(saveStartProgress(state)).goal, goal);
  }
  for (const goal of ['a'.repeat(2001), '🔎'.repeat(1001)]) {
    const state = { ...initial, role: 'buyer', goal };
    assert.throws(() => saveStartProgress(state));
    assert.throws(() => openStartProgress(JSON.stringify(envelope(state))));
  }
});

test('missing, incorrectly typed and impossible states are rejected on save and restore', () => {
  const missingGoal = { ...initial };
  delete missingGoal.goal;
  const invalid = [
    null,
    [],
    missingGoal,
    { ...initial, step: '1' },
    { ...initial, step: 0.5 },
    { ...initial, step: -1 },
    { ...initial, step: 3 },
    { ...initial, step: NaN },
    { ...initial, step: Infinity },
    { ...initial, step: 1 },
    { ...initial, step: 2 },
    { ...initial, role: 'administrator' },
    { ...initial, role: null },
    { ...initial, type: 'performance' },
    { ...initial, type: ['research'] },
    { ...initial, goal: 123 },
    { ...initial, goal: null },
    { ...initial, largeText: 'true' },
    { ...initial, largeText: 1 },
    { ...initial, step: 2, role: 'buyer', goal: '' },
    { ...initial, step: 2, role: 'buyer', goal: '  short  ' },
    { ...initial, step: 2, role: 'buyer', goal: ' '.repeat(20) },
  ];
  for (const state of invalid) {
    assert.throws(() => saveStartProgress(state), JSON.stringify(state));
    assert.throws(
      () => openStartProgress(JSON.stringify(envelope(state))),
      JSON.stringify(state)
    );
  }
});

test('authority fields and prototype keys cannot enter saved or restored progress', () => {
  for (const key of [
    'approved',
    'authorization',
    'workerProfile',
    '__proto__',
    'constructor',
    'prototype',
  ]) {
    const state = { ...initial, [key]: { execute: true } };
    assert.throws(() => saveStartProgress(state), key);
    assert.throws(
      () => openStartProgress(JSON.stringify(envelope(state))),
      key
    );
    assert.throws(
      () =>
        openStartProgress(
          JSON.stringify({ ...envelope(initial), [key]: true })
        ),
      key
    );
  }
  const inherited = Object.assign(Object.create({ approved: true }), initial);
  assert.throws(() => saveStartProgress(inherited));
  assert.throws(() =>
    saveStartProgress({ ...initial, [Symbol('approved')]: true })
  );
  const nonEnumerable = Object.defineProperty({ ...initial }, 'approved', {
    value: true,
  });
  assert.throws(() => saveStartProgress(nonEnumerable));
  let accessed = false;
  const accessor = { ...initial };
  Object.defineProperty(accessor, 'goal', {
    get() {
      accessed = true;
      return 'Hidden side effect';
    },
  });
  assert.throws(() => saveStartProgress(accessor));
  assert.equal(accessed, false);
  assert.equal(Object.prototype.approved, undefined);
});

test('malformed, oversized and unrelated JSON never becomes progress', () => {
  for (const text of [
    undefined,
    null,
    {},
    [],
    1,
    '',
    '{',
    'null',
    '[]',
    'true',
    '"text"',
  ])
    assert.throws(() => openStartProgress(text));
  for (const saved of [
    {},
    { fields: initial },
    { schema: 'agi-jobs-start/v1' },
    { schema: 'agi-jobs-work-draft/v1', fields: initial },
    { schema: 'agi-jobs-start/v2', fields: initial },
    { ...envelope(initial), execute: true },
    { ...envelope(initial), fields: [] },
  ])
    assert.throws(() => openStartProgress(JSON.stringify(saved)));
  const valid = saveStartProgress(initial);
  assert.deepEqual(openStartProgress(valid.padEnd(16_384)), initial);
  assert.throws(() => openStartProgress(valid.padEnd(16_385)), /too large/);
  assert.throws(() => openStartProgress('{'.repeat(16_385)), /too large/);
});
