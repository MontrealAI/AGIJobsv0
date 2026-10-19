const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  evaluate,
  requiredPaths,
  requiredChecks,
  authenticCodeQL,
  validateProducer,
  verifyScannerArchive,
  verifyScannerReviewBinding,
  resultIdentity,
  extracted,
  sha256,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const {
  expectedAssets,
  sourceApiUrl,
  verifyRetainedProducer,
} = require('../../scripts/release/publish-source-release-rc16.cjs');
const { profile } = require('../../scripts/release/source-profile-rc16.cjs');
const sha = 'a'.repeat(40);
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
test('all inherited and added workflows/checks plus the authentic separate CodeQL result are mandatory', () => {
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
          name: 'Publish qualified rc.16 source prerelease',
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
    },
    (x) => {
      x.checks.at(-1).app = actions;
    },
    (x) => {
      x.checks.at(-1).head_sha = 'b'.repeat(40);
    },
    (x) => {
      x.checks.at(-1).app.owner.id = 1;
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
    assert.equal(evaluate(changed.runs, changed.checks, sha).ready, false);
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
      workflow_run: { id: 42, head_sha: sha },
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
    verifyScannerArchive(['javascript.sarif'], () => JSON.stringify(doc), {
      baseline,
      review,
      requiredSources: extracted(baseline).slice(0, 1),
      sha,
      ...options,
    });
  assert.equal(verify().results.length, 96);
  assert.throws(
    () =>
      verify(document, { review: { ...review, sourceCommit: 'b'.repeat(40) } }),
    /does not bind/
  );
  assert.throws(
    () => verify(document, { requiredSources: profile.scannerRequiredPaths }),
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
      qualification: 'pending',
      native: 'fixed',
    },
    after = { ...before, scannerReview: review, qualification: 'reviewed' };
  const git = (command, ...args) =>
    command === 'diff'
      ? 'scripts/release/source-profile-rc16.json\0'
      : command === 'show'
      ? JSON.stringify(args[0].startsWith(review.sourceCommit) ? before : after)
      : '';
  verifyScannerReviewBinding({ sha, review, git });
  assert.throws(
    () =>
      verifyScannerReviewBinding({
        sha,
        review,
        git: (command) =>
          command === 'diff'
            ? 'scripts/release/qualify-source-release-rc16.cjs\0'
            : '',
      }),
    /beyond its record/
  );
  assert.throws(
    () =>
      verifyScannerReviewBinding({
        sha,
        review,
        git: (command, ...args) =>
          command === 'show' && args[0].startsWith(sha)
            ? JSON.stringify({ ...after, native: 'substituted' })
            : git(command, ...args),
      }),
    /profile pins/
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
      workflow_run: { id: 42, head_sha: sha },
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
test('rc.16 owns only its new tag/routes/assets and remains blocked pending actual security review', () => {
  const names = expectedAssets(profile.tag);
  assert.equal(new Set(names).size, 21);
  for (const name of [
    'codeql-evidence.zip',
    'codeql-provenance.json',
    'native-compatibility.zip',
    'native-provenance.json',
    'source-profile-rc16.json',
    'RELEASE_NOTES_SOURCE_RC16.md',
  ])
    assert(names.includes(name));
  assert(
    sourceApiUrl('GET', 'git/ref/tags/source-v2.1.0-rc.16').endsWith('rc.16')
  );
  assert.throws(() => sourceApiUrl('GET', 'git/ref/tags/source-v2.1.0-rc.15'));
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          path.resolve(
            __dirname,
            '../../scripts/release/publish-source-release-rc16.cjs'
          ),
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      ),
    (error) =>
      /publication blocked: scannerReview is pending/.test(error.stderr)
  );
});
