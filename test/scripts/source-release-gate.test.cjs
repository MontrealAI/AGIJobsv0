const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluate,
  requiredPaths,
  requiredChecks,
} = require('../../scripts/release/qualify-source-release.cjs');
const sha = 'a'.repeat(40);
function fixture() {
  return {
    runs: requiredPaths.map((path) => ({
      path,
      head_sha: sha,
      head_branch: 'main',
      event: 'push',
      run_number: 2,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    })),
    checks: requiredChecks.map((name) => ({
      name,
      head_sha: sha,
      app: { slug: 'github-actions' },
      status: 'completed',
      conclusion: 'success',
    })),
  };
}
test('source publication requires every workflow and context on the exact main push', () => {
  const { runs, checks } = fixture();
  assert.equal(evaluate(runs, checks, sha).ready, true);
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { event: 'pull_request' },
    { head_branch: 'other' },
    { status: 'in_progress' },
    { conclusion: 'skipped' },
    { conclusion: 'failure' },
  ]) {
    assert.equal(
      evaluate([{ ...runs[0], ...change }, ...runs.slice(1)], checks, sha)
        .ready,
      false
    );
  }
  assert.equal(evaluate(runs.slice(1), checks, sha).ready, false);
  assert.equal(evaluate(runs, checks.slice(1), sha).ready, false);
});
test('newer failures and pending attempts supersede older workflow success', () => {
  const { runs, checks } = fixture();
  for (const change of [
    { run_attempt: 2, conclusion: 'failure' },
    { run_number: 3, status: 'queued' },
  ]) {
    assert.equal(
      evaluate([...runs, { ...runs[0], ...change }], checks, sha).ready,
      false
    );
  }
  assert.equal(
    evaluate(
      [...runs, { ...runs[0], run_number: 1, conclusion: 'failure' }],
      checks,
      sha
    ).ready,
    true
  );
});
test('pending or failed additional workflows and untrusted contexts cannot qualify', () => {
  const { runs, checks } = fixture();
  for (const state of [{ status: 'queued' }, { conclusion: 'cancelled' }]) {
    assert.equal(
      evaluate(
        [
          ...runs,
          { ...runs[0], path: '.github/workflows/extra.yml', ...state },
        ],
        checks,
        sha
      ).ready,
      false
    );
  }
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { app: { slug: 'other' } },
    { status: 'queued' },
    { conclusion: 'neutral' },
  ]) {
    assert.equal(
      evaluate(runs, [{ ...checks[0], ...change }, ...checks.slice(1)], sha)
        .ready,
      false
    );
  }
  assert.equal(
    evaluate(
      [
        ...runs,
        {
          ...runs[0],
          path: '.github/workflows/source-release.yml',
          status: 'in_progress',
        },
      ],
      checks,
      sha
    ).ready,
    true
  );
});
