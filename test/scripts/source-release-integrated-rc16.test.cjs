const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  evaluate: evaluateGate,
  requiredPaths,
  requiredChecks,
  authenticCodeQL,
  assertNoScannerErrorDiagnostics,
  validateProducer,
  verifyScannerArchive,
  verifyScannerProducerArchive,
  verifyScannerResults,
  expectedReceiverSources,
  verifyScannerReviewBinding,
  resultIdentity,
  extracted,
  sha256,
} = require('../../scripts/release/source-scanner-gates-rc16.cjs');
const {
  expectedAssets,
  sourceApiUrl,
  verifyRetainedProducer,
} = require('../../scripts/release/publish-source-release-rc16.cjs');
const {
  profile,
  parseTree,
  validatePreparedProfile,
} = require('../../scripts/release/source-profile-rc16.cjs');
// Pending-only behavior uses copied metadata and unmodified production guards.
// Validate any installed live records before constructing the inert fixture.
function pendingProfileFixture() {
  const root = path.resolve(__dirname, '../..');
  const git = (...args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  const target = git('rev-parse', 'HEAD').trim();
  assert.equal(validatePreparedProfile(profile, { git, target }), profile);
  const qualifier = require('../../scripts/release/qualify-source-release-rc16.cjs');
  const notesReview = qualifier.parseScannerReview(
    fs.readFileSync(path.join(root, qualifier.scannerReviewPath), 'utf8')
  );
  if (notesReview !== null)
    qualifier.verifyScannerReviewSource({
      git,
      sha: target,
      review: notesReview,
    });
  return {
    ...structuredClone(profile),
    scannerReview: null,
    pythonScannerReview: null,
  };
}
function pendingReleaseFixture(t) {
  const pending = pendingProfileFixture();
  const repository = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc16-pending-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of [
    'scripts/release',
    'integrations/alpha-agent/pinned-alpha-checkout.cjs',
    'ci/required-contexts.json',
    'ci/required-companion-contexts.json',
  ]) {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(path.join(repository, name), destination, { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, 'scripts/release/source-profile-rc17.json'),
    JSON.stringify(pending, null, 2) + '\n'
  );
  const notes = path.join(root, 'docs/production/RELEASE_NOTES_SOURCE_RC17.md');
  fs.mkdirSync(path.dirname(notes), { recursive: true });
  fs.writeFileSync(notes, '<!-- rc16-scanner-review\nnull\n-->\n');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  });
  const git = (...args) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args],
      {
        encoding: 'utf8',
        env,
      }
    );
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Pending fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'Inert pending metadata fixture; no scanner proof'
  );
  const source = git('rev-parse', 'HEAD').trim();
  const offline = path.join(root, 'offline.cjs');
  fs.writeFileSync(
    offline,
    'global.fetch = () => { throw Error("NETWORK_MUST_NOT_BE_USED"); };\n'
  );
  return {
    root,
    offline,
    environment: {
      ...env,
      GITHUB_SHA: source,
      GITHUB_REPOSITORY: 'MontrealAI/AGIJobsv0',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GH_TOKEN: 'INERT_PENDING_FIXTURE_NEVER_USED_FOR_NETWORK',
      TAG: 'source-v2.1.0-rc.17',
    },
  };
}

const sha = 'a'.repeat(40);
const {
  syntheticServiceProof,
} = require('./source-codeql-service-fixture-rc16.cjs');
let processedCodeql;
before(async () => {
  processedCodeql = await syntheticServiceProof({ sha });
});
function evaluate(runs, checks, source, ...proof) {
  return evaluateGate(
    runs,
    checks,
    source,
    proof.length ? proof[0] : processedCodeql
  );
}

const actions = { id: 15368, slug: 'github-actions' };
const security = {
  id: 57789,
  slug: 'github-advanced-security',
  owner: { id: 9919 },
};
const resultCheck = () => ({
  id: 123,
  html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/123',
  name: 'CodeQL',
  head_sha: sha,
  app: structuredClone(security),
  status: 'completed',
  conclusion: 'success',
});
const run = (workflow, id = 1) => ({
  id,
  run_attempt: 1,
  run_number: 1,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  path: workflow,
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: 'MontrealAI/AGIJobsv0' },
});
function evidence() {
  return {
    processedCodeql,
    runs: requiredPaths.map((file, index) => run(file, index + 1)),
    checks: [
      ...requiredChecks.map((name) => ({
        name,
        head_sha: sha,
        app: actions,
        status: 'completed',
        conclusion: 'success',
      })),
      resultCheck(),
    ],
  };
}
test('positive processed proof is mandatory when final AS results are absent', () => {
  const { runs, checks } = evidence();
  const actionsOnly = checks.filter((check) => check.app?.id !== 57789);
  assert.equal(evaluateGate(runs, actionsOnly, sha).ready, false);
  assert.equal(evaluateGate(runs, actionsOnly, sha, {}).ready, false);
  assert.equal(evaluate(runs, actionsOnly, sha).ready, true);
});
test('all workflows/checks, positive processed proof and observed genuine CodeQL results remain binding', () => {
  const valid = evidence();
  assert.equal(evaluate(valid.runs, valid.checks, sha).ready, true);
  assert.equal(
    evaluate(
      [
        ...valid.runs,
        {
          ...run('.github/workflows/source-release-rc16.yml'),
          status: 'in_progress',
        },
      ],
      [
        ...valid.checks,
        {
          head_sha: sha,
          name: 'Publish qualified rc.17 source prerelease',
          app: actions,
          status: 'in_progress',
        },
      ],
      sha
    ).ready,
    true
  );
  for (const mutate of [
    (x) => {
      x.checks.pop();
      x.processedCodeql = undefined;
    },
    (x) => {
      x.checks.at(-1).app = actions;
      x.processedCodeql = undefined;
    },
    (x) => {
      x.checks.at(-1).head_sha = 'b'.repeat(40);
      x.processedCodeql = undefined;
    },
    (x) => {
      x.checks.at(-1).app.owner.id = 1;
      x.processedCodeql = undefined;
    },
    (x) => {
      x.checks.at(-1).conclusion = 'failure';
    },
    (x) => {
      x.checks.at(-1).conclusion = 'skipped';
    },
    (x) => {
      x.runs = x.runs.filter(
        (item) => !item.path.endsWith('security-remediation.yml')
      );
    },
    (x) => {
      x.runs = x.runs.filter(
        (item) => !item.path.endsWith('transformational-compatibility.yml')
      );
    },
    (x) => {
      x.runs[0].event = 'pull_request';
    },
    (x) => {
      x.runs.push({ ...x.runs[0], run_number: 2, conclusion: 'failure' });
    },
    (x) => {
      x.checks.find(
        (check) => check.name === 'Pinned native transformation compatibility'
      ).conclusion = 'skipped';
    },
    (x) => {
      x.runs.push({
        ...run('.github/workflows/additional.yml'),
        conclusion: 'failure',
      });
    },
  ]) {
    const changed = evidence();
    mutate(changed);
    assert.equal(
      evaluate(changed.runs, changed.checks, sha, changed.processedCodeql)
        .ready,
      false
    );
  }
  assert.equal(
    authenticCodeQL({ ...resultCheck(), app: { ...security, id: 1 } }, sha),
    false
  );
});
test('retained artifacts require successful exact-main authenticated producer identity', () => {
  const producer = run('.github/workflows/static-analysis.yml', 42),
    artifact = {
      id: 9,
      name: 'codeql-security-report',
      expired: false,
      digest: 'sha256:' + 'c'.repeat(64),
      workflow_run: { id: 42, head_sha: sha, head_branch: 'main' },
    };
  const verify = (a = artifact, r = producer) =>
    validateProducer({
      artifact: a,
      run: r,
      sha,
      workflow: producer.path,
      name: artifact.name,
    });
  verify();
  for (const alter of [
    (x) => {
      x.expired = true;
    },
    (x) => {
      x.workflow_run.head_sha = 'b'.repeat(40);
    },
    (x) => {
      x.workflow_run.id = 43;
    },
    (x) => {
      x.digest = 'sha256:unknown';
    },
  ]) {
    const changed = structuredClone(artifact);
    alter(changed);
    assert.throws(() => verify(changed));
  }
  for (const alter of [
    (x) => {
      x.event = 'pull_request';
    },
    (x) => {
      x.head_branch = 'other';
    },
    (x) => {
      x.run_attempt = 0;
    },
    (x) => {
      x.conclusion = 'skipped';
    },
    (x) => {
      x.repository.full_name = 'other/repo';
    },
  ]) {
    const changed = structuredClone(producer);
    alter(changed);
    assert.throws(() => verify(artifact, changed));
  }
});
test('real retained SARIF parsing preserves full rules, coverage, result multiplicity and reviewed source', () => {
  const bytes = execFileSync(
    'unzip',
    [
      '-p',
      path.resolve(
        __dirname,
        '../../docs/security/remediation-2026-10-19/baseline/fresh-codeql.zip'
      ),
      'javascript.sarif',
    ],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const document = JSON.parse(bytes),
    baseline = structuredClone(document.runs[0]);
  const review = {
    sourceCommit: sha,
    reviewEvidence: 'Synthetic parser test only; not a publication review',
    results: baseline.results.map((item) => ({
      ...resultIdentity(item),
      disposition: 'Demonstrably false positive',
      justification: 'Synthetic test fixture disposition',
      regressionEvidence: ['test fixture'],
    })),
  };
  const verify = (doc = document, options = {}) =>
    verifyScannerResults(doc, {
      baseline,
      review,
      requiredSources: extracted(baseline).slice(0, 1),
      sha,
      ...options,
    });
  assert.equal(verify().results.length, 96);
  assert.equal(verify().referenceTransport, null);
  for (const reviewedDocument of [
    null,
    {},
    { runs: [] },
    { version: '2.1.0', runs: [baseline, baseline] },
  ]) {
    assert.throws(
      () => verify(document, { reviewedDocument }),
      /Original authenticated reviewed scanner report is required/
    );
  }
  assert.throws(
    () =>
      verify(document, { review: { ...review, sourceCommit: 'b'.repeat(40) } }),
    /does not bind/
  );
  assert.throws(
    () => verify(document, { requiredSources: profile.scannerReceiverPaths }),
    /integration source extraction/
  );
  assert.throws(
    () =>
      verify(document, {
        review: { ...review, results: review.results.slice(1) },
      }),
    /complete reviewed inventory/
  );
  for (const mutate of [
    (x) => {
      x.runs[0].results.pop();
    },
    (x) => {
      x.runs[0].results.push(x.runs[0].results[0]);
    },
    (x) => {
      x.runs[0].tool.driver.semanticVersion = 'other';
    },
    (x) => {
      x.runs[0].tool.extensions[0].rules.pop();
    },
    (x) => {
      x.runs[0].properties.codeqlConfigSummary.queries.pop();
    },
    (x) => {
      x.runs[0].invocations[0].executionSuccessful = false;
    },
    (x) => {
      x.runs[0].invocations.forEach((item) => {
        item.toolExecutionNotifications =
          item.toolExecutionNotifications.filter(
            (note) =>
              note.descriptor.id !==
              'js/diagnostics/successfully-extracted-files'
          );
      });
    },
  ]) {
    const changed = structuredClone(document);
    mutate(changed);
    assert.throws(() => verify(changed));
  }
});
test('scanner review installation permits only its own record and no executable or pin changes', () => {
  const review = {
    sourceCommit: 'b'.repeat(40),
    results: [],
    reviewEvidence: 'synthetic',
  };
  const before = {
      scannerReview: null,
      pythonScannerReview: null,
      qualification: 'pending',
      native: 'fixed',
    },
    after = { ...before, scannerReview: review };
  const profilePath = 'scripts/release/source-profile-rc17.json';
  const git = (command, ...args) =>
    command === 'rev-list'
      ? `${sha} ${review.sourceCommit}\n`
      : command === 'rev-parse'
      ? 'c'.repeat(40)
      : command === 'ls-tree'
      ? '100644 blob ' + 'd'.repeat(40) + '\t' + args.at(-1) + '\0'
      : command === 'diff'
      ? profilePath + '\0'
      : command === 'show'
      ? args[0].endsWith(':' + profilePath)
        ? JSON.stringify(
            args[0].startsWith(review.sourceCommit) ? before : after
          )
        : '<!-- rc16-scanner-review\nnull\n-->\n'
      : '';
  verifyScannerReviewBinding({ sha, review, git });
  assert.throws(
    () =>
      verifyScannerReviewBinding({
        sha,
        review,
        git: (command, ...args) =>
          command === 'show' && args[0] === sha + ':' + profilePath
            ? JSON.stringify({ ...after, qualification: 'reviewed' })
            : git(command, ...args),
      }),
    /profile bytes outside/
  );
  assert.throws(
    () =>
      verifyScannerReviewBinding({
        sha,
        review,
        git: (command, ...args) =>
          command === 'diff'
            ? 'scripts/release/qualify-source-release-rc16.cjs\0'
            : git(command, ...args),
      }),
    /outside the exact two review metadata paths/
  );
  assert.throws(
    () =>
      verifyScannerReviewBinding({
        sha,
        review,
        git: (command, ...args) =>
          command === 'show' && args[0] === sha + ':' + profilePath
            ? JSON.stringify({ ...after, native: 'substituted' })
            : git(command, ...args),
      }),
    /profile bytes outside/
  );
});
test('retained readback cannot relabel another successful same-SHA run or attempt as qualified', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-rc16-producer-')
  );
  try {
    const bytes = Buffer.from('synthetic transport fixture'),
      digest = sha256(bytes),
      producer = run('.github/workflows/static-analysis.yml', 42);
    const artifact = {
      id: 9,
      name: `codeql-security-report-${sha}-42-1`,
      expired: false,
      digest: 'sha256:' + digest,
      workflow_run: { id: 42, head_sha: sha, head_branch: 'main' },
    };
    fs.writeFileSync(path.join(directory, 'codeql-evidence.zip'), bytes);
    fs.writeFileSync(
      path.join(directory, 'codeql-provenance.json'),
      JSON.stringify({
        schema: 'agijobsv0/retained-producer/1',
        kind: 'codeql',
        repository: 'MontrealAI/AGIJobsv0',
        sha,
        workflow: producer.path,
        runId: 42,
        runAttempt: 1,
        artifactId: 9,
        artifactName: artifact.name,
        githubDigest: artifact.digest,
        downloadedSha256: digest,
      })
    );
    verifyRetainedProducer(directory, 'codeql', artifact, producer, sha, {
      workflows: [producer],
    });
    assert.throws(
      () =>
        verifyRetainedProducer(
          directory,
          'codeql',
          { ...artifact, name: 'codeql-security-report' },
          producer,
          sha,
          { workflows: [producer] }
        ),
      /artifact identity mismatch/
    );
    assert.throws(
      () =>
        verifyRetainedProducer(
          directory,
          'codeql',
          { ...artifact, name: `codeql-security-report-${sha}-42-1` },
          { ...producer, run_attempt: 2 },
          sha,
          { workflows: [{ ...producer, run_attempt: 2 }] }
        ),
      /artifact identity mismatch/
    );
    assert.throws(
      () =>
        verifyRetainedProducer(directory, 'codeql', artifact, producer, sha, {
          workflows: [{ ...producer, id: 43 }],
        }),
      /qualified run/
    );
    assert.throws(
      () =>
        verifyRetainedProducer(directory, 'codeql', artifact, producer, sha, {
          workflows: [{ ...producer, run_attempt: 2 }],
        }),
      /qualified run/
    );
    fs.writeFileSync(
      path.join(directory, 'codeql-evidence.zip'),
      'self-consistent bytes are not the authenticated artifact'
    );
    assert.throws(
      () =>
        verifyRetainedProducer(directory, 'codeql', artifact, producer, sha, {
          workflows: [producer],
        }),
      /provenance mismatch/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('rc.16 owns only its new tag/routes/assets and remains blocked pending actual security review', (t) => {
  const names = expectedAssets(profile.tag);
  assert.equal(new Set(names).size, 25);
  for (const name of [
    'codeql-evidence.zip',
    'codeql-provenance.json',
    'codeql-service-evidence.json',
    'native-compatibility.zip',
    'native-provenance.json',
    'source-profile-rc17.json',
    'RELEASE_NOTES_SOURCE_RC17.md',
  ])
    assert(names.includes(name));
  assert(
    sourceApiUrl('GET', 'git/ref/tags/source-v2.1.0-rc.17').endsWith('rc.17')
  );
  assert.throws(() => sourceApiUrl('GET', 'git/ref/tags/source-v2.1.0-rc.15'));
  const pending = pendingReleaseFixture(t);
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          '--require',
          pending.offline,
          path.join(
            pending.root,
            'scripts/release/publish-source-release-rc16.cjs'
          ),
        ],
        {
          cwd: pending.root,
          env: pending.environment,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      ),
    (error) =>
      /publication blocked: scannerReview is pending/.test(error.stderr) &&
      !error.stderr.includes('NETWORK_MUST_NOT_BE_USED')
  );
  assert.equal(fs.existsSync(path.join(pending.root, 'reports')), false);
});

test('four-record scanner contract requires external identities before reading reports', () => {
  const unread = () => {
    throw Error('Report must remain unread without valid external identity');
  };
  assert.throws(
    () => verifyScannerProducerArchive(['javascript.sarif'], unread),
    /inventory/
  );
  assert.throws(
    () =>
      verifyScannerProducerArchive(profile.scannerPolicy.archiveFiles, unread),
    /external source/
  );
  assert.deepEqual(profile.scannerPolicy.archiveFiles, [
    'javascript.sarif',
    'source-extraction.json',
    'source-scope-after.json',
    'source-scope-before.json',
  ]);
  const pending = pendingProfileFixture();
  assert.equal(pending.scannerReview, null);
  assert.equal(pending.pythonScannerReview, null);
});
test('mandatory scanner manifest is derived from actual pinned receiver Git source', () => {
  const root = path.resolve(__dirname, '../..');
  const git = (...args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  const required = expectedReceiverSources(
    git,
    git('rev-parse', 'HEAD').trim()
  );
  const priorSource = '5db66e4788afd6edf1b44f32578b89f2bf1ab67c';
  const priorProfile = JSON.parse(
    git('show', priorSource + ':scripts/release/source-profile-rc16.json')
  );
  // Apply the unchanged manifest algorithm to the actual historical policy.
  // Current sources still require both new helpers through the production call.
  const priorManifest = require('node:vm').runInNewContext(
    '(' + expectedReceiverSources.toString() + ')',
    { profile: priorProfile, parseTree, assert }
  );
  const prior = [...priorManifest(git, priorSource)];
  assert.equal(prior.length, 86);
  assert.deepEqual(
    required,
    [
      ...prior,
      ...profile.telemetryRuntime.transitions
        .map((item) => item.path)
        .filter(
          (file) => file.startsWith('agent-gateway/') && file.endsWith('.ts')
        ),
      'integrations/alpha-agent/tests/transformational-compatibility.test.mjs',
      'scripts/release/emit-codeql-review-rc16.cjs',
      'scripts/release/source-codeql-service-rc16.cjs',
    ].sort()
  );
  assert.equal(required.length, 95);
  assert(profile.scannerReceiverPaths.every((file) => required.includes(file)));
  assert.equal(new Set(required).size, required.length);
});

test('actual Git source and retained SARIF bind both mandatory extraction lists and the stronger producer bytes', () => {
  const {
    verifyScannerProducerArchive,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const {
    scannerPolicyContext,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  const root = path.resolve(__dirname, '../..');
  const git = (...args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  const source = git('rev-parse', 'HEAD').trim(),
    tree = git('rev-parse', 'HEAD^{tree}').trim();
  const required = expectedReceiverSources(git, source);
  const full = scannerPolicyContext(git, source);
  assert.deepEqual(full.producerRequiredSources, required);
  assert(
    profile.scannerRequiredPaths.every((name) =>
      full.requiredSources.includes(name)
    )
  );
  assert(required.includes('scripts/pages/build.mjs'));
  assert(full.requiredSources.includes('scripts/pages/build.mjs'));
  // This is a labeled synthetic producer record over real immutable Git source
  // and retained historical SARIF. It does not establish a current scan.
  const document = JSON.parse(
    execFileSync(
      'unzip',
      [
        '-p',
        path.join(
          root,
          'docs/security/remediation-2026-10-19/baseline/fresh-codeql.zip'
        ),
        'javascript.sarif',
      ],
      { maxBuffer: 32 * 1024 * 1024 }
    )
  );
  const baseline = structuredClone(document.runs[0]),
    run = document.runs[0];
  const notifications = run.invocations[0].toolExecutionNotifications;
  for (const uri of [
    ...new Set([...required, ...profile.scannerRequiredPaths]),
  ])
    notifications.push({
      descriptor: { id: 'js/diagnostics/successfully-extracted-files' },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri, uriBaseId: '%SRCROOT%' },
          },
        },
      ],
    });
  const sources = extracted(run),
    raw = Buffer.from(JSON.stringify(document));
  const producerRun = {
    id: 101,
    run_attempt: 2,
    head_sha: source,
    path: profile.scannerPolicy.workflowPath,
    event: 'push',
    head_branch: 'main',
    repository: { full_name: 'MontrealAI/AGIJobsv0' },
    status: 'completed',
    conclusion: 'success',
  };
  const before = {
    schema: 'agijobsv0/codeql-scope/2',
    source,
    tree,
    run: 101,
    attempt: 2,
    event: 'push',
    ref: 'refs/heads/main',
    historicalConfigSha256: profile.scannerPolicy.historicalConfigSha256,
    configSha256: profile.scannerPolicy.configSha256,
    staticAdmittedBefore: 1,
    staticAdditionalAdmitted: required.length,
    allPreviousPathsRetained: true,
    integrationClosureAdmitted: true,
    browserClosureAdmitted: true,
    requiredExtractedFiles: required,
    actualExtractionRequiresSARIF: true,
  };
  const report = {
    schema: 'agijobsv0/codeql-extraction/1',
    source,
    tree,
    run: 101,
    attempt: 2,
    event: 'push',
    ref: 'refs/heads/main',
    configSha256: profile.scannerPolicy.configSha256,
    sarifSha256: sha256(raw),
    successfulExtractionFiles: sources,
    requiredExtractedFiles: required,
    missingRequiredExtractedFiles: [],
    ruleIds: [
      ...new Set(
        [run.tool.driver, ...(run.tool.extensions || [])].flatMap((component) =>
          (component.rules || []).map((rule) => rule.id)
        )
      ),
    ].sort(),
    rawResultCount: (run.results || []).length,
    resultDisposition: 'REQUIRES_INDEPENDENT_FINAL_SOURCE_REVIEW',
  };
  const records = {
    'javascript.sarif': raw,
    'source-scope-before.json': JSON.stringify(before),
    'source-scope-after.json': JSON.stringify(before),
    'source-extraction.json': JSON.stringify(report),
  };
  const options = { baseline, sha: source, tree, producerRun, git };
  const verify = (values = records, extra = {}) =>
    verifyScannerProducerArchive(Object.keys(values), (name) => values[name], {
      ...options,
      ...extra,
    });
  assert.equal(
    verify().producer.requiredExtractedFiles.length,
    required.length
  );
  for (const [member, mutate] of [
    [
      'source-scope-before.json',
      (value) => {
        value.requiredExtractedFiles = [];
      },
    ],
    [
      'source-scope-after.json',
      (value) => {
        value.source = '0'.repeat(40);
      },
    ],
    [
      'source-extraction.json',
      (value) => {
        value.attempt = 1;
      },
    ],
    [
      'source-extraction.json',
      (value) => {
        value.successfulExtractionFiles = [];
      },
    ],
    [
      'source-extraction.json',
      (value) => {
        value.rawResultCount++;
      },
    ],
  ]) {
    const changed = { ...records };
    const value = JSON.parse(changed[member]);
    mutate(value);
    changed[member] = JSON.stringify(value);
    assert.throws(() => verify(changed));
  }
  assert.throws(
    () =>
      verify(records, {
        requiredSources: [
          ...profile.scannerReceiverPaths,
          'scripts/pages/absent-unreviewed-analysis.mjs',
        ],
      }),
    /missing integration source extraction/
  );
  assert.throws(
    () =>
      verify(records, {
        git: (command, ...args) =>
          command === 'show' &&
          args[0].endsWith(':' + profile.scannerPolicy.workflowPath)
            ? git(command, ...args) + '\n'
            : git(command, ...args),
      }),
    /policy\/workflow bytes differ/
  );
});

test('test-only execution metadata rejects error diagnostics for both scanner languages', () => {
  // Inert invocation metadata only; this is not a SARIF success fixture or
  // authenticated scan evidence, and contains no hosted producer/run identity.
  const label = 'SYNTHETIC_EXECUTION_METADATA_ONLY_NOT_SCAN_EVIDENCE';
  const invocation = {
    executionSuccessful: true,
    toolExecutionNotifications: [
      { level: 'note', message: { text: label } },
      { level: 'warning', message: { text: label } },
    ],
  };
  assertNoScannerErrorDiagnostics([invocation]);
  for (const field of [
    'toolExecutionNotifications',
    'toolConfigurationNotifications',
  ])
    assert.throws(
      () =>
        assertNoScannerErrorDiagnostics([
          {
            ...invocation,
            [field]: [{ level: 'error', message: { text: label } }],
          },
        ]),
      /error diagnostic/
    );
});

// Quality contract tests reuse authentic retained descriptors and raw results.
// Only acknowledgement metadata and review-reference strings are synthetic.
// No successful scan, independent review, API observation or release is made.
function qualityAcknowledgementFixture(ruleId) {
  const root = path.resolve(__dirname, '../..');
  const bindings = require('../../scripts/release/source-scanner-review-bindings-rc16.cjs');
  const gates = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const ledger = JSON.parse(
    fs.readFileSync(
      path.join(root, 'docs/security/remediation-2026-10-19/findings.json'),
      'utf8'
    )
  );
  const archive = path.join(
    root,
    'docs/security/remediation-2026-10-19/baseline/fresh-codeql.zip'
  );
  assert.equal(sha256(fs.readFileSync(archive)), ledger.baseline.fresh.sha256);
  const baseline = JSON.parse(
    execFileSync('unzip', ['-p', archive, 'javascript.sarif'], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    })
  ).runs[0];
  const run = structuredClone(baseline);
  const raw = run.results.find((item) => item.ruleId === ruleId);
  assert(raw, 'Both eligible rules must exist in the real retained baseline');
  const sourceCommit = ledger.baseline.commit;
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
    ),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
  };
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-C',
        root,
        ...args,
      ],
      { encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 }
    );
  const identity = resultIdentity(raw);
  const sourceEntry = git('ls-tree', '-z', sourceCommit, '--', identity.path);
  const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(
    sourceEntry
  );
  assert(match && match[3] === identity.path);
  const component = run.tool.extensions[raw.rule.toolComponent.index];
  const rule = component.rules[raw.rule.index];
  const digest = (value) => sha256(gates.canonical(value));
  const item = {
    ...identity,
    disposition: bindings.javascriptQualityPolicy.disposition,
    justification:
      'TEST-ONLY acknowledgement metadata; no actual finding disposition or behavioral acceptance is asserted.',
    regressionEvidence: [
      `https://github.com/MontrealAI/AGIJobsv0/blob/${sourceCommit}/${identity.path}`,
    ],
    qualityReview: {
      schema: bindings.javascriptQualityPolicy.schema,
      sourceBlob: match[2],
      ruleMetadataSha256: digest(rule),
      queryComponentSha256: digest(component),
      codeqlConfigSummarySha256: digest(run.properties.codeqlConfigSummary),
      behaviorAssessment: `TEST-ONLY ${ruleId} case: ${raw.message.text} Initializer and assignment side effects still require an independent real behavior review.`,
      // Synthetic test reference syntax only; this test does not claim that
      // this review exists or that its author approved the retained finding.
      independentReviewEvidence: [
        'https://github.com/MontrealAI/AGIJobsv0/pull/1#pullrequestreview-1',
      ],
    },
  };
  const review = {
    sourceCommit,
    results: [item],
    reviewEvidence: [
      'TEST-ONLY metadata; not an installed or authenticated result review',
    ],
  };
  const verify = (selectedItem = item, options = {}) =>
    gates.verifyAcknowledgedNonsecurityQuality(selectedItem, {
      run,
      baseline,
      review,
      git,
      ...options,
    });
  return {
    root,
    bindings,
    gates,
    baseline,
    run,
    raw,
    rule,
    component,
    item,
    review,
    git,
    digest,
    verify,
  };
}

test('quality acknowledgement binds both real retained rules to descriptor, component, configuration and immutable source metadata only', () => {
  for (const id of [
    'js/unused-local-variable',
    'js/useless-assignment-to-local',
  ]) {
    const f = qualityAcknowledgementFixture(id);
    assert.deepEqual(
      profile.scannerPolicy.qualityReview,
      f.bindings.javascriptQualityPolicy
    );
    assert.equal(
      f.bindings.validateJavascriptQualityMetadata(
        f.item,
        f.review.sourceCommit,
        f.git
      ),
      f.item.qualityReview
    );
    assert.doesNotThrow(() =>
      f.bindings.validateScannerReviewMetadata('scannerReview', f.review, {
        git: f.git,
        target: f.review.sourceCommit,
      })
    );
    assert.deepEqual(f.verify(), {
      metadataAcknowledgementOnly: true,
      productionApproved: false,
    });
    assert.equal(f.run.results.length, 96);
    assert.deepEqual(
      f.run,
      f.baseline,
      'No retained raw result or scanner metadata was changed'
    );
  }
});

test('quality acknowledgement requires exact versioned metadata and independently reviewed evidence references', () => {
  const f = qualityAcknowledgementFixture('js/unused-local-variable');
  const changes = [
    (item) => {
      delete item.qualityReview;
    },
    (item) => {
      item.qualityReview.schema = 'unreviewed';
    },
    (item) => {
      item.qualityReview.approved = true;
    },
    (item) => {
      delete item.qualityReview.behaviorAssessment;
    },
    (item) => {
      item.qualityReview.behaviorAssessment = '  ';
    },
    (item) => {
      item.qualityReview.independentReviewEvidence = [];
    },
    (item) => {
      item.qualityReview.independentReviewEvidence = [
        'https://github.com/example/foreign/pull/1#pullrequestreview-1',
      ];
    },
    (item) => {
      item.qualityReview.independentReviewEvidence = [
        'https://github.com/MontrealAI/AGIJobsv0/issues/1#issuecomment-1',
      ];
    },
    (item) => {
      item.qualityReview.independentReviewEvidence[0] += '\n';
    },
    (item) => {
      item.qualityReview.sourceBlob = '0'.repeat(40);
    },
    (item) => {
      item.qualityReview.ruleMetadataSha256 = '0'.repeat(64);
    },
    (item) => {
      item.qualityReview.queryComponentSha256 = '0'.repeat(64);
    },
    (item) => {
      item.qualityReview.codeqlConfigSummarySha256 = '0'.repeat(64);
    },
    (item) => {
      item.regressionEvidence = [];
    },
    (item) => {
      item.regressionEvidence = [
        'https://github.com/MontrealAI/AGIJobsv0/blob/main/source.js',
      ];
    },
    (item) => {
      item.regressionEvidence = [
        `https://github.com/MontrealAI/AGIJobsv0/blob/${f.review.sourceCommit}`,
      ];
    },
    (item) => {
      item.regressionEvidence = [
        `https://github.com/MontrealAI/AGIJobsv0/commit/${f.review.sourceCommit}/unexpected`,
      ];
    },
    (item) => {
      item.regressionEvidence = [
        `https://github.com/MontrealAI/AGIJobsv0/blob/${f.review.sourceCommit}/source/../file.js`,
      ];
    },
    (item) => {
      item.regressionEvidence = [
        `https://github.com/MontrealAI/AGIJobsv0/blob/${f.review.sourceCommit}/source/%2e%2e/file.js`,
      ];
    },
    (item) => {
      item.regressionEvidence[0] += '\n';
    },
  ];
  for (const change of changes) {
    const item = structuredClone(f.item);
    change(item);
    assert.throws(() => f.verify(item));
  }
  for (const reference of [
    `https://github.com/MontrealAI/AGIJobsv0/commit/${f.review.sourceCommit}`,
    'https://github.com/MontrealAI/AGIJobsv0/actions/runs/1/job/2',
  ]) {
    const item = structuredClone(f.item);
    item.regressionEvidence = [reference];
    assert.equal(
      f.bindings.validateJavascriptQualityMetadata(
        item,
        f.review.sourceCommit,
        f.git
      ),
      item.qualityReview
    );
  }
});

test('quality acknowledgement rejects unknown or security rule IDs and keeps Python and existing false-positive shapes separate', () => {
  const f = qualityAcknowledgementFixture('js/unused-local-variable');
  for (const ruleId of [
    'js/unknown-quality',
    'js/path-injection',
    'js/code-injection',
  ])
    assert.throws(
      () => f.verify({ ...f.item, ruleId }),
      /Only the two explicitly reviewed/
    );
  const fp = structuredClone(f.item);
  delete fp.qualityReview;
  fp.disposition = 'Demonstrably false positive';
  fp.regressionEvidence = ['Existing synthetic FP metadata remains unchanged'];
  assert.doesNotThrow(() =>
    f.bindings.validateScannerReviewMetadata(
      'scannerReview',
      {
        ...f.review,
        results: [fp],
      },
      { git: f.git, target: f.review.sourceCommit }
    )
  );
  assert.throws(
    () =>
      f.bindings.validateScannerReviewMetadata('scannerReview', {
        ...f.review,
        results: [{ ...fp, qualityReview: f.item.qualityReview }],
      }),
    /Complete scanner result disposition fields differ/
  );
  const python = {
    schema: 'agijobsv0/codeql-python-review/2',
    sourceCommit: f.review.sourceCommit,
    tree: f.git('rev-parse', f.review.sourceCommit + '^{tree}').trim(),
    producerRunId: 1,
    producerRunAttempt: 1,
    producerEvent: 'push',
    producerHeadBranch: 'fix/inherited-codeql-telemetry-runtime-20261021',
    producerRef: 'refs/heads/fix/inherited-codeql-telemetry-runtime-20261021',
    artifactId: 2,
    artifactName: `python-codeql-security-report-${f.review.sourceCommit}-1-1`,
    archiveSha256: 'a'.repeat(64),
    rawRecords: Object.fromEntries(
      [
        'python.sarif',
        'source-extraction.json',
        'source-scope-after.json',
        'source-scope-before.json',
      ].map((name) => [name, 'b'.repeat(64)])
    ),
    toolComponents: [
      { name: 'INERT-PYTHON-METADATA', rules: [{ id: 'py/inert' }] },
    ],
    codeqlConfigSummary: { inertMetadataOnly: true },
    successfulExtractionFiles: ['INERT.py'],
    requiredExtractedFiles: ['INERT.py'],
    ruleIds: ['py/inert'],
    rawResultCount: 1,
    results: [f.item],
    reviewEvidence: ['TEST-ONLY Python refusal metadata; no scanner evidence'],
  };
  assert.throws(
    () =>
      f.bindings.validateScannerReviewMetadata('pythonScannerReview', python, {
        git: f.git,
        target: f.review.sourceCommit,
      }),
    /Complete scanner result disposition fields differ/
  );
  const noExtraObject = structuredClone(f.item);
  delete noExtraObject.qualityReview;
  assert.throws(
    () =>
      f.bindings.validateScannerReviewMetadata(
        'pythonScannerReview',
        {
          ...python,
          results: [noExtraObject],
        },
        { git: f.git, target: f.review.sourceCommit }
      ),
    /Every retained scanner result needs a complete disposition/
  );
});

test('quality acknowledgement refuses raw identity, query metadata, configuration and ambiguous descriptor drift', () => {
  const f = qualityAcknowledgementFixture('js/useless-assignment-to-local');
  for (const change of [
    (item) => {
      item.region.startLine++;
    },
    (item) => {
      item.resultSha256 = '0'.repeat(64);
    },
    (item) => {
      item.path = 'other/source.js';
    },
  ]) {
    const item = structuredClone(f.item);
    change(item);
    assert.throws(() => f.verify(item));
  }
  for (const change of [
    (run) => {
      run.results.find((item) => item.ruleId === f.item.ruleId).locations[0]
        .physicalLocation.region.startLine++;
    },
    (run) => {
      run.tool.extensions[0].rules[f.raw.rule.index].shortDescription.text =
        'Forged descriptor';
    },
    (run) => {
      run.tool.extensions[0].semanticVersion = 'Forged query component';
    },
    (run) => {
      run.properties.codeqlConfigSummary.queries.pop();
    },
  ]) {
    const run = structuredClone(f.run);
    change(run);
    assert.throws(() => f.verify(f.item, { run }));
  }
  for (const change of [
    (raw) => {
      raw.ruleIndex = raw.rule.index;
    },
    (raw) => {
      raw.rule.unreviewed = true;
    },
    (raw) => {
      raw.rule.id = 'js/path-injection';
    },
    (raw) => {
      raw.rule.toolComponent.name = 'Other component';
    },
    (raw) => {
      raw.rule.toolComponent.index = 1;
    },
    (raw) => {
      raw.rule.index = 100000;
    },
  ]) {
    const run = structuredClone(f.run);
    const raw = run.results.find((item) => item.ruleId === f.item.ruleId);
    change(raw);
    const item = structuredClone(f.item);
    item.resultSha256 = f.digest(raw);
    assert.throws(() => f.verify(item, { run }));
  }
  for (const change of [
    (rule) => {
      rule.properties.tags.push('security');
    },
    (rule) => {
      rule.properties['security-severity'] = 0;
    },
    (rule) => {
      rule.properties.tags = rule.properties.tags.filter(
        (tag) => tag !== 'quality'
      );
    },
  ]) {
    const run = structuredClone(f.run),
      baseline = structuredClone(f.baseline);
    const rule = run.tool.extensions[0].rules[f.raw.rule.index];
    change(rule);
    baseline.tool.extensions[0] = structuredClone(run.tool.extensions[0]);
    const item = structuredClone(f.item);
    item.qualityReview.ruleMetadataSha256 = f.digest(rule);
    item.qualityReview.queryComponentSha256 = f.digest(run.tool.extensions[0]);
    assert.throws(
      () => f.verify(item, { run, baseline }),
      /trusted nonsecurity query metadata/
    );
  }
});

function referenceTransportMetadataOnly() {
  // Benign metadata unit input; never a successful scanner or review fixture.
  const location = (index) => ({
    uri: 'metadata/public-' + index + '.txt',
    uriBaseId: '%SRCROOT%',
    index,
  });
  return {
    tool: {
      driver: {
        name: 'CodeQL',
        semanticVersion: 'SYNTHETIC_METADATA_ONLY',
        rules: [
          { id: 'metadata/a', name: 'first' },
          { id: 'metadata/b', name: 'second' },
        ],
        notifications: [{ id: 'metadata/note-a' }, { id: 'metadata/note-b' }],
      },
    },
    artifacts: [0, 1, 2].map((index) => ({ location: location(index) })),
    invocations: [
      {
        executionSuccessful: true,
        toolExecutionNotifications: [
          {
            descriptor: { id: 'metadata/note-a', index: 0 },
            locations: [
              { physicalLocation: { artifactLocation: location(0) } },
            ],
          },
        ],
        toolConfigurationNotifications: [
          { associatedRule: { id: 'metadata/b', index: 1 } },
        ],
        ruleConfigurationOverrides: [
          { descriptor: { id: 'metadata/a', index: 0 } },
        ],
      },
    ],
    properties: {
      metricResults: [
        { ruleId: 'metadata/b', rule: { id: 'metadata/b', index: 1 } },
      ],
    },
    results: [
      {
        ruleId: 'metadata/a',
        rule: { id: 'metadata/a', index: 0 },
        message: { text: 'SYNTHETIC_METADATA_ONLY' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: location(0),
              region: { startLine: 1 },
            },
          },
        ],
        codeFlows: [
          {
            threadFlows: [
              {
                locations: [
                  {
                    location: {
                      physicalLocation: { artifactLocation: location(1) },
                    },
                  },
                ],
              },
            ],
          },
        ],
        relatedLocations: [
          { physicalLocation: { artifactLocation: location(2) } },
        ],
        partialFingerprints: { testOnly: 'complete-field-preserved' },
      },
    ],
  };
}
function permutedReferenceMetadataOnly(original) {
  const value = structuredClone(original);
  value.tool.driver.rules.reverse();
  value.tool.driver.notifications.reverse();
  value.artifacts.reverse();
  value.artifacts.forEach((artifact, index) => {
    artifact.location.index = index;
  });
  value.invocations[0].toolExecutionNotifications[0].descriptor.index = 1;
  value.invocations[0].toolExecutionNotifications[0].locations[0].physicalLocation.artifactLocation.index = 2;
  value.invocations[0].toolConfigurationNotifications[0].associatedRule.index = 0;
  value.invocations[0].ruleConfigurationOverrides[0].descriptor.index = 1;
  value.properties.metricResults[0].rule.index = 0;
  value.results[0].rule.index = 1;
  value.results[0].locations[0].physicalLocation.artifactLocation.index = 2;
  value.results[0].relatedLocations[0].physicalLocation.artifactLocation.index = 0;
  return value;
}
test('versioned reference transport preserves original reports and exact complete reviewed hashes', () => {
  const {
    transportScannerRun,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const reference = referenceTransportMetadataOnly();
  const actual = permutedReferenceMetadataOnly(reference);
  const before = structuredClone([actual, reference]);
  assert.notEqual(
    resultIdentity(actual.results[0]).resultSha256,
    resultIdentity(reference.results[0]).resultSha256
  );
  const comparison = transportScannerRun(actual, reference);
  assert.deepEqual(comparison.run, reference);
  assert.deepEqual([actual, reference], before);
  assert.equal(
    comparison.witness.schema,
    'agijobsv0/codeql-lossless-reference-transport/1'
  );
  assert.equal(comparison.witness.inverseReconstructsEntireOriginalRun, true);
  assert.equal(
    comparison.witness.sourceRunSha256,
    comparison.witness.inverseRunSha256
  );
  assert.deepEqual(comparison.witness.transportedResultHashes, [
    resultIdentity(reference.results[0]).resultSha256,
  ]);
  assert.deepEqual(comparison.witness.rawResultHashes, [
    resultIdentity(actual.results[0]).resultSha256,
  ]);
});
test('reference transport keeps every flow field and repeated result in its comparison', () => {
  const {
    transportScannerRun,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const reference = referenceTransportMetadataOnly();
  const changed = permutedReferenceMetadataOnly(reference);
  changed.results[0].partialFingerprints.testOnly = 'changed-complete-field';
  changed.results.push(structuredClone(changed.results[0]));
  const comparison = transportScannerRun(changed, reference);
  assert.equal(comparison.run.results.length, 2);
  assert.notDeepEqual(comparison.witness.transportedResultHashes, [
    resultIdentity(reference.results[0]).resultSha256,
  ]);
  assert.equal(comparison.witness.rawResultHashes.length, 2);
  assert.equal(comparison.witness.transportedResultHashes.length, 2);
  assert.equal(
    comparison.run.results[0].partialFingerprints.testOnly,
    'changed-complete-field'
  );
});
test('reference transport rejects record changes, ambiguous tables and unsupported indices', () => {
  const {
    transportScannerRun,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const reference = referenceTransportMetadataOnly();
  for (const change of [
    (value) => {
      value.tool.driver.rules[0].name = 'changed-full-record';
    },
    (value) => {
      value.tool.driver.semanticVersion = 'different';
    },
    (value) => {
      value.artifacts[0].extra = 'unsupported-full-artifact-field';
    },
    (value) => {
      value.artifacts[0].location.index = 1;
    },
    (value) => {
      value.artifacts[0].location.uri = value.artifacts[1].location.uri;
    },
    (value) => {
      value.results[0].rule.index = 0;
    },
    (value) => {
      value.results[0].locations[0].physicalLocation.artifactLocation.index = 0;
    },
    (value) => {
      value.results[0].properties = { index: 0 };
    },
    (value) => {
      value.results[0].taxa = [{ id: 'metadata/unsupported', index: 0 }];
    },
    (value) => {
      value.tool.driver.rules[0].relationships = [
        { target: { id: 'metadata/a', index: 0 } },
      ];
    },
    (value) => {
      value.conversion = {};
    },
    (value) => {
      value.results[0].message.text = 'METADATA_ONLY SARIF:unsupported-scheme';
    },
  ]) {
    const value = permutedReferenceMetadataOnly(reference);
    change(value);
    assert.throws(() => transportScannerRun(value, reference));
  }
  const duplicate = referenceTransportMetadataOnly();
  duplicate.tool.driver.rules.forEach((rule) => {
    rule.id = 'metadata/duplicate';
  });
  duplicate.results[0].ruleId = duplicate.results[0].rule.id =
    'metadata/duplicate';
  duplicate.properties.metricResults[0].ruleId =
    duplicate.properties.metricResults[0].rule.id = 'metadata/duplicate';
  duplicate.invocations[0].toolConfigurationNotifications[0].associatedRule.id =
    duplicate.invocations[0].ruleConfigurationOverrides[0].descriptor.id =
      'metadata/duplicate';
  assert.doesNotThrow(() =>
    transportScannerRun(duplicate, structuredClone(duplicate))
  );
  const reversed = structuredClone(duplicate);
  reversed.tool.driver.rules.reverse();
  assert.throws(() => transportScannerRun(reversed, duplicate));
});

test('reference transport preserves the exact index-free CodeQL flow annotation', () => {
  const {
    transportScannerRun,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const reference = referenceTransportMetadataOnly();
  reference.results[0].codeFlows[0].threadFlows[0].locations[0].taxa = [
    { id: 'Config', properties: { 'CodeQL/DataflowRole': 'step' } },
  ];
  const actual = permutedReferenceMetadataOnly(reference);
  const before = structuredClone([actual, reference]);
  const comparison = transportScannerRun(actual, reference);
  assert.deepEqual(comparison.run, reference);
  assert.deepEqual([actual, reference], before);
  assert.equal(comparison.witness.inverseReconstructsEntireOriginalRun, true);
  assert.deepEqual(comparison.witness.transportedResultHashes, [
    resultIdentity(reference.results[0]).resultSha256,
  ]);
});
test('flow annotation admission is exact and checks both originals including property bags', () => {
  const {
    transportScannerRun,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const annotation = () => [
    { id: 'Config', properties: { 'CodeQL/DataflowRole': 'step' } },
  ];
  for (const change of [
    (value) => {
      value[0].id = 'metadata/other';
    },
    (value) => {
      value[0].index = 0;
    },
    (value) => {
      value[0].toolComponent = { index: 0 };
    },
    (value) => {
      value[0].properties['CodeQL/DataflowRole'] = 'metadata/other';
    },
    (value) => {
      value[0].properties.extra = 'metadata-only';
    },
    (value) => {
      value.push(structuredClone(value[0]));
    },
  ]) {
    for (const selected of ['actual', 'reference']) {
      const reference = referenceTransportMetadataOnly();
      const actual = permutedReferenceMetadataOnly(reference);
      const target = selected === 'actual' ? actual : reference;
      const value = annotation();
      change(value);
      target.results[0].codeFlows[0].threadFlows[0].locations[0].taxa = value;
      assert.throws(() => transportScannerRun(actual, reference));
    }
  }
  for (const selected of ['actual', 'reference']) {
    for (const inProperties of [false, true]) {
      const reference = referenceTransportMetadataOnly();
      const actual = permutedReferenceMetadataOnly(reference);
      const target = selected === 'actual' ? actual : reference;
      const owner = inProperties
        ? (target.results[0].properties = {})
        : target.results[0];
      owner.taxa = annotation();
      assert.throws(() => transportScannerRun(actual, reference));
    }
  }
});
