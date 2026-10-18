const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluate,
  requiredPaths,
  requiredChecks,
  verifySourceScope,
  verifyDeploymentSnapshot,
  deploymentSnapshot,
  preservedEvidencePaths,
  reviewedCompilerPaths,
} = require('../../scripts/release/qualify-source-release.cjs');
const sha = 'a'.repeat(40);
function sourceFixture() {
  return {
    sha,
    version: '2.1.0-rc.14',
    compilerBaseline: 'b'.repeat(40),
    policy: {
      version: '0.8.37',
      longVersion: '0.8.37+commit.f401782d',
      evmVersion: 'cancun',
      optimizerRuns: 200,
      viaIR: true,
    },
    git: () => '',
  };
}
test('source scope preserves historical evidence and the reviewed compiler tree', () => {
  const calls = [];
  const scope = verifySourceScope({
    ...sourceFixture(),
    git: (...args) => calls.push(args),
  });
  assert.equal(calls.filter(([command]) => command === 'merge-base').length, 3);
  assert.ok(
    calls.some(
      (args) =>
        args[0] === 'diff' &&
        args.includes('docs/deployments/') &&
        args.includes('scripts/verification/')
    )
  );
  assert.ok(
    calls.some(
      (args) =>
        args[0] === 'diff' &&
        args.includes('contracts/') &&
        args.includes('hardhat.config.js')
    )
  );
  assert.deepEqual(scope.preservedEvidencePaths, preservedEvidencePaths);
  assert.deepEqual(scope.reviewedCompilerPaths, reviewedCompilerPaths);
  for (const command of ['merge-base', 'diff']) {
    assert.throws(
      () =>
        verifySourceScope({
          ...sourceFixture(),
          git: (...args) => {
            if (args[0] === command) throw Error('source drift');
          },
        }),
      /source drift/
    );
  }
});
test('source release rejects missing review, old compiler, changed production settings and wrong version', () => {
  for (const compilerBaseline of ['', 'REVIEW_REQUIRED', 'source-v2.1.0-rc.5'])
    assert.throws(
      () => verifySourceScope({ ...sourceFixture(), compilerBaseline }),
      /reviewed compiler/
    );
  for (const version of [
    '2.1.0-rc.5',
    '2.1.0-rc.6',
    '2.1.0-rc.7',
    '2.1.0-rc.8',
    '2.1.0-rc.9',
    '2.1.0-rc.10',
    '2.1.0-rc.11',
    '2.1.0-rc.12',
    '2.1.0-rc.13',
    '2.1.0',
  ])
    assert.throws(
      () => verifySourceScope({ ...sourceFixture(), version }),
      /mismatch/
    );
  for (const change of [
    { version: '0.8.25' },
    { longVersion: '0.8.37+commit.other' },
    { evmVersion: 'osaka' },
    { optimizerRuns: 1 },
    { viaIR: false },
  ]) {
    const fixture = sourceFixture();
    assert.throws(
      () =>
        verifySourceScope({
          ...fixture,
          policy: { ...fixture.policy, ...change },
        }),
      /mismatch/
    );
  }
});
test('rc.14 source qualification agrees with both package version records', () => {
  const packageJson = require('../../package.json');
  const lock = require('../../package-lock.json');
  for (const version of [
    packageJson.version,
    lock.version,
    lock.packages[''].version,
  ]) {
    assert.equal(version, '2.1.0-rc.14');
    assert.doesNotThrow(() =>
      verifySourceScope({ ...sourceFixture(), version })
    );
  }
});
test('current deployment reference requires exact pinned bytes without changing source equivalence', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const bytes = fs.readFileSync(
    path.resolve(__dirname, '../..', deploymentSnapshot.localPath)
  );
  assert.deepEqual(verifyDeploymentSnapshot(bytes), deploymentSnapshot);
  assert.deepEqual(
    fs.readFileSync(
      path.resolve(__dirname, '../..', deploymentSnapshot.recordPath)
    ),
    bytes
  );
  assert.equal(deploymentSnapshot.currentMainEquivalenceNotAssumed, true);
  assert.equal(deploymentSnapshot.liveRecheckedByThisRelease, false);
  assert.equal(
    deploymentSnapshot.recordCommit,
    '284351148d96c5390a655aec1f9db806284f2400'
  );
  const snapshot = JSON.parse(bytes);
  assert.equal(
    snapshot.deployedSource.commit,
    deploymentSnapshot.deployedSourceCommit
  );
  assert.equal(
    snapshot.deployedSource.tree,
    deploymentSnapshot.deployedSourceTree
  );
  assert.equal(snapshot.deployedSource.currentMainEquivalenceNotAssumed, true);
  assert.throws(
    () => verifyDeploymentSnapshot(Buffer.concat([bytes, Buffer.from('\n')])),
    /snapshot hash mismatch/
  );
});
test('every path-filtered dependency runs for every source publication trigger', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const pushPaths = (file) => {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    const start = lines.indexOf('  push:');
    assert.notEqual(start, -1, `${file} must run on push`);
    const block = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() && !lines[i].startsWith('    ')) break;
      block.push(lines[i]);
    }
    if (!block.includes('    paths:')) return null;
    return block
      .filter((line) => line.startsWith("      - '"))
      .map((line) => line.slice(9, -1));
  };
  const triggers = pushPaths('.github/workflows/source-release.yml');
  for (const workflow of requiredPaths) {
    const filters = pushPaths(workflow);
    if (filters)
      for (const trigger of triggers)
        assert.ok(filters.includes(trigger), `${workflow} omits ${trigger}`);
  }
});
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
