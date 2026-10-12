import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCheckRuns } from '../../scripts/ci/wait-source-evidence-checks.mjs';

test('requires each named context to succeed', () => {
  const required = ['CI summary', 'rehearsal'];
  assert.equal(evaluateCheckRuns([
    { name: 'CI summary', status: 'completed', conclusion: 'success' },
    { name: 'rehearsal', status: 'completed', conclusion: 'success' },
  ], required).ready, true);
  assert.equal(evaluateCheckRuns([
    { name: 'CI summary', status: 'completed', conclusion: 'success' },
  ], required).ready, false);
  assert.equal(evaluateCheckRuns([
    { name: 'CI summary', status: 'completed', conclusion: 'success' },
    { name: 'rehearsal', status: 'in_progress', conclusion: null },
  ], required).ready, false);
});
test('fails closed on any recorded failed or cancelled context', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
    assert.equal(evaluateCheckRuns([
      { name: 'CI summary', status: 'completed', conclusion: 'success' },
      { name: 'unrelated', status: 'completed', conclusion },
    ], ['CI summary']).ready, false);
  }
});
