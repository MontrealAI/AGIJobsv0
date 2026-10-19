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
  assertNoScannerErrorDiagnostics,
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
      x.runs = x.runs.filter(
        (item) => !item.path.endsWith('static-analysis-python-integrations.yml')
      );
    },
    (x) => {
      x.checks.find(
        (check) => check.name === 'Python integration CodeQL analysis'
      ).conclusion = 'skipped';
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
      pythonScannerReview: null,
      qualification: 'pending',
      native: 'fixed',
    },
    after = { ...before, scannerReview: review };
  const profilePath = 'scripts/release/source-profile-rc16.json';
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
test('rc.16 owns only its new tag/routes/assets and remains blocked pending actual security review', () => {
  const names = expectedAssets(profile.tag);
  assert.equal(new Set(names).size, 24);
  for (const name of [
    'codeql-evidence.zip',
    'codeql-provenance.json',
    'codeql-reviewed-evidence.zip',
    'python-codeql-evidence.zip',
    'python-codeql-provenance.json',
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

test('Python producer observation routes stay bound to the exact selected source and bounded pages', () => {
  const route = (resource) => sourceApiUrl('GET', resource, sha);
  for (const page of [1, 20]) {
    assert(
      route(
        `actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=${sha}&per_page=100&page=${page}`
      ).endsWith(`page=${page}`)
    );
    assert(
      route(`actions/runs/42/artifacts?per_page=100&page=${page}`).endsWith(
        `page=${page}`
      )
    );
  }
  for (const resource of [
    `actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=${'b'.repeat(
      40
    )}&per_page=100&page=1`,
    `actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=${sha}&per_page=100&page=21`,
    `actions/workflows/foreign.yml/runs?head_sha=${sha}&per_page=100&page=1`,
    'actions/runs/42/artifacts?per_page=100&page=0',
    'actions/runs/42/artifacts?per_page=100&page=21',
  ])
    assert.throws(() => route(resource), /Unsupported/);
});

test('pending Python evidence refuses before metadata, download or persistent output effects', async () => {
  const {
    retainPythonEvidence,
    qualifyPythonEvidence,
    collectAdditionalEvidence,
  } = require('../../scripts/release/source-native-evidence-rc16.cjs');
  let effects = 0;
  const context = {
    sha,
    tree: 'b'.repeat(40),
    provenance: { workflows: [] },
    directory: path.resolve(os.tmpdir(), 'benign-uncreated-python-evidence'),
    api: async () => {
      effects++;
      throw Error('MUST_NOT_BE_USED');
    },
    download: async () => {
      effects++;
      throw Error('MUST_NOT_BE_USED');
    },
  };
  await assert.rejects(retainPythonEvidence(context), /review/i);
  await assert.rejects(qualifyPythonEvidence(context), /review/i);
  await assert.rejects(collectAdditionalEvidence(), /scannerReview is pending/);
  assert.equal(effects, 0);
  assert.equal(fs.existsSync(context.directory), false);
});

test('every production admission supplies its immutable Git target before the pending hold', (t) => {
  // Intercept admission only to inspect context, then reject unconditionally.
  // No review record, successful scan, publication approval or effect is made.
  const root = path.resolve(__dirname, '../..');
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rc16-admission-context-')
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'utf8',
    }).trim();
  const target = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', `${target}^{tree}`);
  const policyPath = path.join(root, 'scripts/release/source-profile-rc16.cjs');
  const preload = path.join(temporary, 'inspect-context.cjs');
  const marker = 'INERT_CONTEXT_VERIFIED_PUBLICATION_REFUSED';
  fs.writeFileSync(
    preload,
    `
    const assert = require('node:assert/strict');
    const policyPath = ${JSON.stringify(policyPath)};
    const original = require(policyPath);
    require.cache[policyPath].exports = {
      ...original,
      verifyPublicationReview(value, context) {
        assert.equal(value, original.profile);
        assert.equal(context?.target, ${JSON.stringify(target)});
        assert.equal(typeof context.git, 'function');
        assert.equal(context.git('rev-parse', context.target + '^{tree}').trim(), ${JSON.stringify(
          tree
        )});
        assert.deepEqual(JSON.parse(context.git('show', context.target + ':scripts/release/source-profile-rc16.json')), value);
        throw Error(${JSON.stringify(marker)});
      }
    };
  `,
    { mode: 0o600 }
  );
  const qualifier = path.join(
    root,
    'scripts/release/qualify-source-release-rc16.cjs'
  );
  const publisher = path.join(
    root,
    'scripts/release/publish-source-release-rc16.cjs'
  );
  const { spawnSync } = require('node:child_process');
  for (const args of [
    [qualifier],
    [publisher],
    [publisher, '--collect-scanner-evidence'],
    [publisher, '--collect-compiler-evidence'],
    [publisher, '--collect-additional-evidence'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--require', preload, ...args],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_SHA: target,
          GITHUB_REPOSITORY: 'MontrealAI/AGIJobsv0',
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF: 'refs/heads/main',
          GH_TOKEN: 'INERT_TEST_VALUE_NEVER_USED_FOR_NETWORK',
          TAG: 'source-v2.1.0-rc.16',
        },
        timeout: 10000,
      }
    );
    assert.equal(result.status, 1, `${args.join(' ')} must remain refused`);
    assert.match(result.stderr, new RegExp(marker));
  }
});
