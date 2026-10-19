const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluate,
  evaluateCodeql,
  requiredPaths,
  requiredChecks,
  verifySourceScope,
  verifyDeploymentSnapshot,
  deploymentSnapshot,
  preservedEvidencePaths,
  reviewedCompilerPaths,
  scannerHistory,
  scannerReview,
  scannerReviewPath,
  parseScannerReview,
  verifyScannerReviewSource,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const sha = 'a'.repeat(40);
function sourceFixture() {
  return {
    sha,
    version: '2.1.0-rc.16',
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
  for (const compilerBaseline of [
    '',
    'REVIEW_REQUIRED',
    'REVIEW_REQUIRED_FOR_RC16',
    'source-v2.1.0-rc.5',
  ])
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
    '2.1.0-rc.14',
    '2.1.0-rc.15',
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
test('rc.16 source qualification agrees with both package version records', () => {
  const packageJson = require('../../package.json');
  const lock = require('../../package-lock.json');
  for (const version of [
    packageJson.version,
    lock.version,
    lock.packages[''].version,
  ]) {
    assert.equal(version, '2.1.0-rc.16');
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
  const triggers = pushPaths('.github/workflows/source-release-rc16.yml');
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
    checks: [
      ...requiredChecks.map((name) => ({
        name,
        head_sha: sha,
        app: { id: 15368, slug: 'github-actions' },
        status: 'completed',
        conclusion: 'success',
      })),
      codeqlResult(),
    ],
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
test('computer browser protocol qualification is mandatory on the exact main push', () => {
  const workflow = '.github/workflows/successor-computer.yml';
  assert.equal(requiredPaths.length, 17);
  assert.ok(requiredPaths.includes(workflow));
  const { runs, checks } = fixture();
  const others = runs.filter((run) => run.path !== workflow);
  const computer = runs.find((run) => run.path === workflow);
  assert.equal(evaluate(others, checks, sha).ready, false);
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { event: 'pull_request' },
    { status: 'queued' },
    { conclusion: 'skipped' },
    { conclusion: 'failure' },
  ])
    assert.equal(
      evaluate([...others, { ...computer, ...change }], checks, sha).ready,
      false
    );
  assert.equal(evaluate([...others, computer], checks, sha).ready, true);
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
          path: '.github/workflows/source-release-rc16.yml',
          status: 'in_progress',
        },
      ],
      checks,
      sha
    ).ready,
    true
  );
});

function codeqlResult(change = {}) {
  return {
    id: 123,
    name: 'CodeQL',
    head_sha: sha,
    app: { id: 57789, slug: 'github-advanced-security', owner: { id: 9919 } },
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/123',
    ...change,
  };
}
test('a successful Actions workflow cannot hide a failed or pending Advanced Security result', () => {
  const { runs, checks } = fixture();
  for (const change of [
    { conclusion: 'failure' },
    { conclusion: 'neutral' },
    { conclusion: 'skipped' },
    { status: 'in_progress', conclusion: null },
  ])
    assert.equal(
      evaluate(runs, [...checks, codeqlResult(change)], sha).ready,
      false
    );
  assert.equal(evaluate(runs, [...checks, codeqlResult()], sha).ready, true);
});
test('the reviewed code baseline requires its own authentic successful CodeQL result', () => {
  assert.equal(evaluateCodeql([], sha).ready, false);
  for (const change of [
    { app: { id: 15368, slug: 'github-actions' } },
    { app: { id: 57789, slug: 'another-app' } },
    { app: { id: 999, slug: 'github-advanced-security' } },
    { name: 'CodeQL analysis' },
    { head_sha: 'b'.repeat(40) },
    { id: 0 },
    { id: '123' },
    { html_url: 'https://example.invalid/result' },
    { conclusion: 'failure' },
    { status: 'queued', conclusion: null },
  ])
    assert.equal(evaluateCodeql([codeqlResult(change)], sha).ready, false);
  const result = evaluateCodeql([codeqlResult()], sha);
  assert.equal(result.ready, true);
  assert.deepEqual(result.checks[0], {
    id: 123,
    headSha: sha,
    name: 'CodeQL',
    appId: 57789,
    appSlug: 'github-advanced-security',
    status: 'completed',
    conclusion: 'success',
    url: 'https://github.com/MontrealAI/AGIJobsv0/runs/123',
  });
});

test('pending scanner review cannot be enabled through missing or malformed metadata', () => {
  assert.throws(
    () => verifyScannerReviewSource({ git: () => '', sha, review: null }),
    /pending/
  );
  const block = (value) =>
    `notes\n<!-- rc16-scanner-review\n${JSON.stringify(value)}\n-->\n`;
  assert.equal(parseScannerReview(block(null)), null);
  assert.throws(() => parseScannerReview('no record'), /Exactly one/);
  assert.throws(
    () => parseScannerReview('x'.repeat(8 * 1024 * 1024 + 1)),
    /Bounded/
  );
  assert.throws(
    () => parseScannerReview(block(null) + block(null)),
    /Exactly one/
  );
  assert.throws(
    () => parseScannerReview(block({ approved: true })),
    /Malformed/
  );
});
test('review installation permits only the exact existing notes block after the reviewed source', (t) => {
  const source = 'b'.repeat(40),
    tree = 'c'.repeat(40);
  const review = {
    schema: 'agijobsv0/rc16-scanner-review/1',
    sourceSha: source,
    sourceTree: tree,
    producer: {
      runId: 1,
      runAttempt: 1,
      runNumber: 1,
      event: 'push',
      headBranch: 'main',
      artifactId: 2,
      artifactName: `codeql-security-report-${source}-1-1`,
      githubDigest: 'sha256:' + 'a'.repeat(64),
    },
    summary: {
      schema: 'agijobsv0/raw-codeql-summary/1',
      toolSha256: 'a'.repeat(64),
      queriesSha256: 'b'.repeat(64),
      extractedPaths: ['integrations/alpha-agent/native.mjs'],
      results: [],
      resultCount: 0,
    },
    resultReviews: [],
    codeqlChecks: [
      {
        id: 3,
        headSha: source,
        name: 'CodeQL',
        appId: 57789,
        appSlug: 'github-advanced-security',
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.com/MontrealAI/AGIJobsv0/runs/3',
      },
    ],
    history: scannerHistory,
    reviewLinks: [
      'https://github.com/MontrealAI/AGIJobsv0/pull/3991#issuecomment-1',
    ],
  };
  const block = (value) =>
    `notes\n<!-- rc16-scanner-review\n${JSON.stringify(value)}\n-->\n`;
  assert.deepEqual(parseScannerReview(block(review)), review);
  assert.throws(
    () =>
      parseScannerReview(
        block(review).replace(
          '"sourceSha":',
          '"sourceSha":"' + review.sourceSha + '","sourceSha":'
        )
      ),
    /canonical JSON/
  );
  const git = (command, ...args) =>
    command === 'rev-parse'
      ? tree
      : command === 'diff'
      ? scannerReviewPath + '\0'
      : command === 'ls-tree'
      ? '100644 blob ' + 'd'.repeat(40) + '\t' + scannerReviewPath + '\0'
      : command === 'show'
      ? block(args[0].startsWith(source + ':') ? null : review)
      : '';
  verifyScannerReviewSource({ git, sha, review });
  assert.throws(
    () =>
      verifyScannerReviewSource({
        git: (command, ...args) =>
          command === 'diff'
            ? 'scripts/release/qualify-source-release-rc16.cjs\0'
            : git(command, ...args),
        sha,
        review,
      }),
    /beyond/
  );
  assert.throws(
    () =>
      verifyScannerReviewSource({
        git: (command, ...args) =>
          command === 'show' && args[0].startsWith(sha + ':')
            ? block(review) + 'changed text'
            : git(command, ...args),
        sha,
        review,
      }),
    /beyond/
  );
  assert.throws(
    () =>
      verifyScannerReviewSource({
        git: (command, ...args) =>
          command === 'show' && args[0].startsWith(sha + ':')
            ? block(review) + '\n'
            : git(command, ...args),
        sha,
        review,
      }),
    /beyond/
  );
  assert.throws(
    () =>
      verifyScannerReviewSource({
        git: (command, ...args) =>
          command === 'ls-tree'
            ? '100755 blob ' + 'd'.repeat(40) + '\t' + scannerReviewPath + '\0'
            : git(command, ...args),
        sha,
        review,
      }),
    /regular-file mode/
  );
  // Exercise the actual Git mode-only transition as well as the pure boundary.
  const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-review-mode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const realGit = (...args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'utf8',
    });
  realGit('init', '-q');
  const file = path.join(root, scannerReviewPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, block(null));
  fs.chmodSync(file, 0o644);
  realGit('add', '.');
  realGit(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Benign feature source'
  );
  const realReview = structuredClone(review);
  realReview.sourceSha = realGit('rev-parse', 'HEAD').trim();
  realReview.sourceTree = realGit('rev-parse', 'HEAD^{tree}').trim();
  realReview.producer.artifactName = `codeql-security-report-${realReview.sourceSha}-1-1`;
  realReview.codeqlChecks[0].headSha = realReview.sourceSha;
  fs.writeFileSync(file, block(realReview));
  realGit('add', '.');
  realGit(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Install benign review metadata'
  );
  verifyScannerReviewSource({
    git: realGit,
    sha: realGit('rev-parse', 'HEAD').trim(),
    review: realReview,
  });
  fs.chmodSync(file, 0o755);
  realGit('add', scannerReviewPath);
  realGit(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Mode-only negative fixture'
  );
  assert.throws(
    () =>
      verifyScannerReviewSource({
        git: realGit,
        sha: realGit('rev-parse', 'HEAD').trim(),
        review: realReview,
      }),
    /regular-file mode/
  );
  const withResult = structuredClone(review);
  withResult.summary.results = ['a'.repeat(64)];
  withResult.summary.resultCount = 1;
  withResult.resultReviews = [
    {
      sha256: 'a'.repeat(64),
      disposition: 'quality-only',
      rationale:
        'Benign provenance fixture independently described for this test only.',
      reviewLink: withResult.reviewLinks[0],
    },
  ];
  assert.equal(parseScannerReview(block(withResult)).resultReviews.length, 1);
  withResult.resultReviews[0].sha256 = 'b'.repeat(64);
  assert.throws(() => parseScannerReview(block(withResult)), /Malformed/);
  for (const mutate of [
    (value) => {
      value.history.findingsSha256 = '0'.repeat(64);
    },
    (value) => {
      value.codeqlChecks[0].appId = 1;
    },
    (value) => {
      value.producer.artifactName = 'codeql-security-report';
    },
    (value) => {
      value.producer.event = 'pull_request';
    },
    (value) => {
      value.summary.extractedPaths.push('../escape');
    },
    (value) => {
      value.reviewLinks = [];
    },
    (value) => {
      value.summary.resultCount = 1;
    },
    (value) => {
      value.summary.results.push('a'.repeat(64));
      value.summary.resultCount = 1;
    },
  ]) {
    const value = structuredClone(review);
    mutate(value);
    assert.throws(() => parseScannerReview(block(value)), /Malformed/);
  }
});

test('both real entrypoints reject a null notes record before network or publication', (t) => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const { execFileSync, spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'source-release-pending-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = path.resolve(__dirname, '../..');
  for (const name of [
    'scripts/release/qualify-source-release-rc16.cjs',
    'scripts/release/publish-source-release-rc16.cjs',
    'scripts/release/check-release-ci.js',
    'scripts/release/qualify-source-release.cjs',
    'scripts/release/source-profile-rc16.cjs',
    'scripts/release/source-profile-rc16.json',
    'scripts/release/source-native-gates-rc16.cjs',
    'scripts/release/source-native-evidence-rc16.cjs',
    'scripts/release/source-scanner-gates-rc16.cjs',
    'integrations/alpha-agent/pinned-alpha-checkout.cjs',
    'ci/required-contexts.json',
    'ci/required-companion-contexts.json',
  ]) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repository, name), target);
  }
  const notes = path.join(root, scannerReviewPath);
  fs.mkdirSync(path.dirname(notes), { recursive: true });
  fs.writeFileSync(notes, '<!-- rc16-scanner-review\nnull\n-->\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Benign pending gate fixture',
  ]);
  const source = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const preload = path.join(root, 'offline.cjs');
  fs.writeFileSync(
    preload,
    'global.fetch = () => { throw Error("NETWORK_MUST_NOT_BE_USED"); };'
  );
  for (const name of [
    'qualify-source-release-rc16.cjs',
    'publish-source-release-rc16.cjs',
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--require', preload, path.join(root, 'scripts/release', name)],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_SHA: source,
          GITHUB_REPOSITORY: 'MontrealAI/AGIJobsv0',
          GH_TOKEN: 'BENIGN_UNUSED_FIXTURE',
          TAG: 'source-v2.1.0-rc.16',
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /scannerReview is pending/);
    assert.ok(!result.stderr.includes('NETWORK_MUST_NOT_BE_USED'));
    assert.equal(fs.existsSync(path.join(root, 'reports')), false);
  }
});
