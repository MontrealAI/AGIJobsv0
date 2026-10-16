'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkSource } = require('../check-dependency-preservation.cjs');

const dependencies = [
  'hardhat',
  'solc',
  'ethers',
  '@openzeppelin/contracts',
  '@prb/math',
  '@ethereum-attestation-service/eas-contracts',
  '@ethereum-attestation-service/eas-sdk',
];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-preservation-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), value);
  };
  const commit = (message) => {
    git('add', '.');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  const lock = (version) =>
    JSON.stringify({
      packages: Object.fromEntries(
        dependencies.map((name) => [
          'node_modules/' + name,
          {
            version,
            resolved: 'https://example.invalid/' + name + '/' + version,
            integrity: 'sha512-' + version,
          },
        ])
      ),
    });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Preservation test');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('package-lock.json', lock('1.0.0'));
  write('config/network.json', '{"reviewed":1}\n');
  const original = commit('original baseline');
  // Model independently reviewed changes merged after the release baseline.
  write('package-lock.json', lock('2.0.0'));
  write('config/network.json', '{"reviewed":2}\n');
  const base = commit('later reviewed main changes');
  git('update-ref', 'refs/remotes/origin/main', base);
  git('switch', '-qc', 'repair');
  write('README.md', 'Dependency-only candidate fixture\n');
  const head = commit('candidate');
  return { root, git, write, commit, original, base, head };
}

test('preservation uses the current PR base and accepts previously reviewed source and dependency changes', (t) => {
  const f = fixture(t);
  const result = checkSource({
    root: f.root,
    env: { GITHUB_ACTIONS: 'true', DEPENDENCY_PRESERVATION_BASE_SHA: f.base },
  });
  assert.equal(result.baseline, f.base);
  assert.equal(result.baseTip, f.base);
  assert.equal(result.head, f.head);
  assert.equal(result.selectedDependencyIdentitiesPreserved.hardhat, '2.0.0');
  assert.throws(
    () =>
      checkSource({
        root: f.root,
        env: { DEPENDENCY_PRESERVATION_BASE_SHA: f.original },
      }),
    /Protected source changed/
  );
  assert.equal(checkSource({ root: f.root, env: {} }).baseline, f.base);
});

test('base-branch changes after divergence are not attributed to the PR', (t) => {
  const f = fixture(t);
  f.git('switch', '-q', 'main');
  f.write('config/network.json', '{"reviewed":3}\n');
  const advancedBase = f.commit('unrelated new main change');
  f.git('switch', '-q', 'repair');
  const result = checkSource({
    root: f.root,
    env: { DEPENDENCY_PRESERVATION_BASE_SHA: advancedBase },
  });
  assert.equal(result.baseline, f.base);
  assert.equal(result.baseTip, advancedBase);
});

test('a protected change actually introduced by the PR still fails', (t) => {
  const f = fixture(t);
  f.write('config/network.json', '{"unreviewed":true}\n');
  f.commit('unexpected protected change');
  assert.throws(
    () => checkSource({ root: f.root, env: {} }),
    /Protected source changed/
  );
});

test('selected installed identities still cannot drift from the current baseline', (t) => {
  const f = fixture(t);
  const lock = JSON.parse(
    fs.readFileSync(path.join(f.root, 'package-lock.json'), 'utf8')
  );
  lock.packages['node_modules/hardhat'].integrity = 'sha512-unexpected';
  f.write('package-lock.json', JSON.stringify(lock));
  f.commit('unexpected identity change');
  assert.throws(() => checkSource({ root: f.root, env: {} }), /hardhat/);
});

test('missing, malformed and unavailable CI base evidence fails closed', (t) => {
  const f = fixture(t);
  assert.throws(
    () => checkSource({ root: f.root, env: { GITHUB_ACTIONS: 'true' } }),
    /PR base SHA is required/
  );
  for (const value of ['', 'HEAD', '--help']) {
    assert.throws(
      () =>
        checkSource({
          root: f.root,
          env: { DEPENDENCY_PRESERVATION_BASE_SHA: value },
        }),
      /Invalid PR base SHA/
    );
  }
  assert.throws(() =>
    checkSource({
      root: f.root,
      env: { DEPENDENCY_PRESERVATION_BASE_SHA: 'a'.repeat(40) },
    })
  );
});

const { createHash } = require('node:crypto');
const { _test } = require('../check-dependency-preservation.cjs');
const reviewedPaths = [
  'demo/example/hardhat.config.ts',
  'scripts/v2/example.ts',
  'scripts/v2/other.ts',
  'scripts/v2/__tests__/example.test.ts',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function reviewedFixture(t) {
  const f = fixture(t);
  for (const name of reviewedPaths) f.write(name, 'before\n');
  const base = f.commit('rc8 baseline');
  for (const name of reviewedPaths) f.write(name, 'reviewed\n');
  const checkpoint = f.commit('independent reviewed source');
  f.write('README.md', 'aggregate candidate\n');
  f.commit('aggregate');
  const record = {
    schemaVersion: 1,
    dependencyBaseline: base,
    reviewedSourceCheckpoint: checkpoint,
    transitions: reviewedPaths.map((name) => ({
      path: name,
      before: f.git('rev-parse', base + ':' + name),
      after: f.git('rev-parse', checkpoint + ':' + name),
    })),
  };
  const bytes = Buffer.from(JSON.stringify(record));
  const trust = { bytes, digest: hash(bytes) };
  const check = (override = trust, baseline = base) =>
    _test.checkSourceWithRecord(
      { root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: baseline } },
      override
    );
  return { ...f, base, checkpoint, record, trust, check };
}

test('reviewed aggregate pins source checkpoint while preserving original dependency baseline', (t) => {
  const f = reviewedFixture(t);
  const result = f.check();
  assert.equal(result.baseline, f.base);
  assert.equal(result.generatedSourceBaseline, f.checkpoint);
  assert.equal(result.reviewedSourceReconciled, true);
  assert.equal(result.protectedSourceChanged, true);
  assert.throws(
    () =>
      checkSource({
        root: f.root,
        env: { DEPENDENCY_PRESERVATION_BASE_SHA: f.base },
      }),
    /Protected source changed/
  ); // A fixture record cannot affect the production trust anchor.
});

test('forged record and substituted dependency baseline fail closed', (t) => {
  const f = reviewedFixture(t);
  const forged = Buffer.from(
    JSON.stringify({ ...f.record, dependencyBaseline: f.checkpoint })
  );
  assert.throws(
    () => f.check({ ...f.trust, bytes: forged }),
    /record digest mismatch/
  );
  assert.throws(
    () =>
      _test.verifyReviewedSource({
        root: f.root,
        baseline: f.checkpoint,
        head: f.git('rev-parse', 'HEAD'),
        ...f.trust,
      }),
    /dependency baseline mismatch/
  );
  assert.throws(() => f.check(f.trust, f.original), /Protected source changed/);
});

test('incorrect recorded blob identity and transition set are rejected', (t) => {
  const f = reviewedFixture(t);
  const changed = structuredClone(f.record);
  changed.transitions[0].after = '0'.repeat(40);
  let bytes = Buffer.from(JSON.stringify(changed));
  assert.throws(
    () => f.check({ bytes, digest: hash(bytes) }),
    /Reviewed blob mismatch/
  );
  changed.transitions[0] = { ...changed.transitions[1] };
  bytes = Buffer.from(JSON.stringify(changed));
  assert.throws(
    () => f.check({ bytes, digest: hash(bytes) }),
    /Duplicate reviewed transition/
  );
});

for (const [label, change] of [
  ['changed blob', (f) => f.write(reviewedPaths[0], 'unreviewed\n')],
  [
    'extra protected path',
    (f) => f.write('contracts/Extra.sol', 'unreviewed\n'),
  ],
  ['missing file', (f) => fs.unlinkSync(path.join(f.root, reviewedPaths[0]))],
  ['missing transition', (f) => f.write(reviewedPaths[0], 'before\n')],
]) {
  test('reviewed aggregate rejects ' + label, (t) => {
    const f = reviewedFixture(t);
    change(f);
    f.commit(label);
    assert.throws(
      () => f.check(),
      /Protected source differs from reviewed checkpoint/
    );
  });
}

test('reviewed aggregate still rejects dependency identity drift from rc8', (t) => {
  const f = reviewedFixture(t);
  const lock = JSON.parse(
    fs.readFileSync(path.join(f.root, 'package-lock.json'))
  );
  lock.packages['node_modules/hardhat'].version = '99.0.0';
  f.write('package-lock.json', JSON.stringify(lock));
  f.commit('dependency drift');
  assert.throws(() => f.check(), /hardhat/);
});

test('generated-byte comparison rejects mixed source even with identical generated change lists', (t) => {
  const f = reviewedFixture(t);
  const other = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agi-generated-source-test-')
  );
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', f.root, other]);
  execFileSync('git', ['checkout', '-q', f.checkpoint], { cwd: other });
  assert.doesNotThrow(() => _test.compareGeneratedSources(f.root, other));
  // Both sides normalize the same generated file. A source mismatch elsewhere
  // must still fail, even though their generated path lists are identical.
  fs.writeFileSync(path.join(other, 'config/network.json'), 'generated\n');
  f.write('config/network.json', 'generated\n');
  assert.doesNotThrow(() => _test.compareGeneratedSources(f.root, other));
  execFileSync('git', ['checkout', '-q', f.base, '--', reviewedPaths[0]], {
    cwd: other,
  });
  assert.throws(
    () => _test.compareGeneratedSources(f.root, other),
    /hardhat.config.ts/
  );
});

test('ordinary post-merge PRs use their newer base and retain strict source protection', (t) => {
  const f = reviewedFixture(t);
  const mergedBase = f.git('rev-parse', 'HEAD');
  f.write('README.md', 'ordinary future dependency PR\n');
  f.commit('future PR');
  const result = f.check(f.trust, mergedBase);
  assert.equal(result.baseline, mergedBase);
  assert.equal(result.generatedSourceBaseline, mergedBase);
  assert.equal(result.reviewedSourceReconciled, false);
  f.write(reviewedPaths[0], 'new unreviewed change\n');
  f.commit('future protected change');
  assert.throws(() => f.check(f.trust, mergedBase), /Protected source changed/);
});

function economicFreezeFixture(t) {
  const f = fixture(t);
  for (const name of reviewedPaths) f.write(name, 'before\n');
  f.write('contracts/RetiredFixture.sol', 'before\n');
  const base = f.commit('economic source baseline');
  for (const name of reviewedPaths.slice(0, 2)) f.write(name, 'reviewed\n');
  const intermediate = f.commit('reviewed demo source merged first');
  for (const name of reviewedPaths.slice(2)) f.write(name, 'reviewed\n');
  f.write('contracts/AddedFixture.sol', 'reviewed\n');
  fs.unlinkSync(path.join(f.root, 'contracts/RetiredFixture.sol'));
  const checkpoint = f.commit('complete frozen economic source');
  f.write('README.md', 'source release candidate\n');
  f.commit('release metadata');
  const sourcePaths = [
    ...reviewedPaths,
    'contracts/AddedFixture.sol',
    'contracts/RetiredFixture.sol',
  ].sort();
  const blob = (ref, name) => {
    const row = f.git('ls-tree', ref, '--', name);
    return row ? row.match(/ blob ([0-9a-f]{40})\t/)[1] : null;
  };
  const record = {
    schemaVersion: 2,
    dependencyBaseline: base,
    reviewedSourceCheckpoint: checkpoint,
    transitionCount: sourcePaths.length,
    transitions: sourcePaths.map((name) => ({
      path: name,
      before: blob(base, name),
      after: blob(checkpoint, name),
    })),
  };
  const trustFor = (r) => {
    const bytes = Buffer.from(JSON.stringify(r));
    return { bytes, digest: hash(bytes) };
  };
  const trust = trustFor(record);
  const check = (baseline = base, authority = trust) =>
    _test.checkSourceWithRecord(
      { root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: baseline } },
      authority
    );
  return {
    ...f,
    base,
    intermediate,
    checkpoint,
    record,
    trust,
    trustFor,
    check,
  };
}

test('economic freeze admits the original, intermediate and complete reviewed merge bases', (t) => {
  const f = economicFreezeFixture(t);
  for (const baseline of [f.base, f.intermediate, f.checkpoint]) {
    const result = f.check(baseline);
    assert.equal(result.baseline, baseline);
    assert.equal(result.generatedSourceBaseline, f.checkpoint);
    assert.equal(result.reviewedSourceReconciled, true);
  }
});

test('economic freeze rejects a base before or outside the frozen ancestry', (t) => {
  const f = economicFreezeFixture(t);
  const head = f.git('rev-parse', 'HEAD');
  assert.throws(() =>
    _test.verifyReviewedSource({
      root: f.root,
      baseline: f.original,
      head,
      ...f.trust,
    })
  );
  f.git('switch', '-qc', 'unrelated-base', f.base);
  f.write('config/network.json', 'unreviewed sibling\n');
  const sibling = f.commit('unrelated protected source');
  assert.throws(() =>
    _test.verifyReviewedSource({
      root: f.root,
      baseline: sibling,
      head,
      ...f.trust,
    })
  );
});

test('economic freeze requires an exact transition count and complete protected-path set', (t) => {
  const f = economicFreezeFixture(t);
  for (const transitionCount of [
    undefined,
    0,
    -1,
    1.5,
    f.record.transitionCount - 1,
  ]) {
    assert.throws(
      () => f.check(f.base, f.trustFor({ ...f.record, transitionCount })),
      /transition count/i
    );
  }
  const record = structuredClone(f.record);
  record.transitions.pop();
  record.transitionCount -= 1;
  assert.throws(
    () => f.check(f.base, f.trustFor(record)),
    /transition set mismatch/
  );
});

test('economic freeze verifies additions and deletions instead of accepting false absence', (t) => {
  const f = economicFreezeFixture(t);
  for (const [name, field] of [
    [reviewedPaths[0], 'before'],
    [reviewedPaths[0], 'after'],
  ]) {
    const record = structuredClone(f.record);
    record.transitions.find((entry) => entry.path === name)[field] = null;
    assert.throws(
      () => f.check(f.base, f.trustFor(record)),
      /absent blob mismatch/
    );
  }
});

test('economic freeze retains digest authority and rejects source changes after the checkpoint', (t) => {
  const f = economicFreezeFixture(t);
  const bytes = Buffer.from(
    JSON.stringify({ ...f.record, reviewedSourceCheckpoint: f.base })
  );
  assert.throws(
    () => f.check(f.base, { ...f.trust, bytes }),
    /record digest mismatch/
  );
  f.write('contracts/AddedFixture.sol', 'changed after freeze\n');
  f.commit('unreviewed mutation');
  assert.throws(
    () => f.check(),
    /Protected source differs from reviewed checkpoint/
  );
});

test('ordinary branches after an economic freeze regain strict source checks', (t) => {
  const f = economicFreezeFixture(t);
  const merged = f.git('rev-parse', 'HEAD');
  f.write('README.md', 'new ordinary dependency candidate\n');
  f.commit('future ordinary branch');
  const result = f.check(merged);
  assert.equal(result.reviewedSourceReconciled, false);
  assert.equal(result.generatedSourceBaseline, merged);
  f.write(reviewedPaths[0], 'new unreviewed source\n');
  f.commit('source drift');
  assert.throws(() => f.check(merged), /Protected source changed/);
});
