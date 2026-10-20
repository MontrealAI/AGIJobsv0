'use strict';

// Synthetic GitHub metadata and ordinary refusal tests only. No successful
// Python SARIF, rule inventory, result review or actual scan is fabricated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const {
  pythonScannerReference,
  validatePythonScannerReference,
  pythonReviewedScannerReference,
  pythonScannerReviewReference,
  readPythonScannerObservation,
  pythonEvidenceContexts,
  pythonArchiveInventory,
  verifyPythonSemanticSummary,
  verifyPythonEvidenceArchives,
} = require('../../scripts/release/source-python-evidence-rc16.cjs');

const clone = (value) => JSON.parse(JSON.stringify(value));
const repo = { id: 1031364470, full_name: 'MontrealAI/AGIJobsv0' };
const workflow = '.github/workflows/static-analysis-python-integrations.yml';
const source = 'a'.repeat(40),
  sourceTree = 'b'.repeat(40);
const reviewedSource = 'c'.repeat(40),
  reviewedTree = 'd'.repeat(40);
const rawNames = [
  'python.sarif',
  'source-extraction.json',
  'source-scope-after.json',
  'source-scope-before.json',
];

const reviewedBranch = 'fix/processed-codeql-release-proof-20261020';
function metadata(sha = source, id = 7, headBranch = 'main') {
  const run = {
    id,
    run_attempt: 2,
    run_number: 30,
    path: workflow,
    head_sha: sha,
    repository: clone(repo),
    head_repository: clone(repo),
    event: 'push',
    head_branch: headBranch,
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: id + 100,
    name: `python-codeql-security-report-${sha}-${id}-2`,
    expired: false,
    digest: 'sha256:' + 'e'.repeat(64),
    size_in_bytes: 123,
    workflow_run: {
      id,
      head_sha: sha,
      head_branch: headBranch,
      repository_id: repo.id,
      head_repository_id: repo.id,
    },
  };
  const data = {
    current: clone(run),
    attempt: clone(run),
    artifact: clone(artifact),
    runs: [clone(run)],
    artifacts: [clone(artifact)],
  };
  const calls = [];
  const api = async (method, resource) => {
    assert.equal(method, 'GET');
    calls.push(resource);
    if (resource === `actions/runs/${id}`) return clone(data.current);
    if (resource === `actions/runs/${id}/attempts/2`)
      return clone(data.attempt);
    if (resource === `actions/artifacts/${artifact.id}`)
      return clone(data.artifact);
    const parsed = new URL('https://example.invalid/' + resource);
    const page = Number(parsed.searchParams.get('page'));
    assert.equal(parsed.searchParams.get('per_page'), '100');
    if (
      parsed.pathname ===
      '/actions/workflows/static-analysis-python-integrations.yml/runs'
    ) {
      assert.equal(parsed.searchParams.get('head_sha'), sha);
      return {
        total_count: data.runs.length,
        workflow_runs: clone(data.runs.slice((page - 1) * 100, page * 100)),
      };
    }
    if (parsed.pathname === `/actions/runs/${id}/artifacts`)
      return {
        total_count: data.artifacts.length,
        artifacts: clone(data.artifacts.slice((page - 1) * 100, page * 100)),
      };
    throw Error('Unexpected synthetic metadata route: ' + resource);
  };
  return {
    run,
    artifact,
    data,
    api,
    calls,
    ref: validatePythonScannerReference(
      {
        runId: run.id,
        runAttempt: run.run_attempt,
        artifactId: artifact.id,
        artifactName: artifact.name,
        githubDigest: artifact.digest,
      },
      sha
    ),
  };
}

function review(fixture, tree = reviewedTree) {
  return {
    schema: 'agijobsv0/codeql-python-review/2',
    producerEvent: 'push',
    producerHeadBranch: 'fix/processed-codeql-release-proof-20261020',
    producerRef: 'refs/heads/fix/processed-codeql-release-proof-20261020',
    sourceCommit: fixture.run.head_sha,
    tree,
    producerRunId: fixture.run.id,
    producerRunAttempt: fixture.run.run_attempt,
    artifactId: fixture.artifact.id,
    artifactName: fixture.artifact.name,
    archiveSha256: fixture.artifact.digest.slice(7),
    rawRecords: Object.fromEntries(
      rawNames.map((name) => [name, 'f'.repeat(64)])
    ),
  };
}

function ordinaryZip(records = rawNames.map((name) => ({ name }))) {
  const local = [],
    central = [];
  let offset = 0;
  for (const record of records) {
    const name = Buffer.from(record.name),
      raw = Buffer.from(
        record.contents ?? '{"ordinaryFixture":"not a scanner report"}\n'
      );
    const data = record.deflate ? deflateRawSync(raw) : raw;
    let checksum = 0xffffffff;
    for (const byte of raw) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit++)
        checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    const flags = record.deflate ? 8 : 0,
      method = record.deflate ? 8 : 0;
    const header = Buffer.alloc(30),
      entry = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    if (!record.deflate) {
      header.writeUInt32LE(checksum, 14);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(raw.length, 22);
    }
    header.writeUInt16LE(name.length, 26);
    const descriptor = record.deflate ? Buffer.alloc(16) : Buffer.alloc(0);
    if (record.deflate) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(data.length, 8);
      descriptor.writeUInt32LE(raw.length, 12);
    }
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0x0314, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(flags, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(((record.mode ?? 0x81a4) * 0x10000) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    local.push(header, name, data, descriptor);
    central.push(entry, name);
    offset += header.length + name.length + data.length + descriptor.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

test('synthetic Python metadata authenticates the current run, exact attempt and artifact inventory', async () => {
  const f = metadata();
  assert.deepEqual(pythonScannerReference(f.run, f.artifact, source), f.ref);
  const observed = await readPythonScannerObservation(f.api, f.ref, source);
  assert.equal(observed.schema, 'agijobsv0/python-codeql-observation/1');
  assert.equal(observed.source, source);
  assert.deepEqual(observed.producer, f.ref);
  assert.deepEqual(observed.run, f.run);
  assert.deepEqual(observed.artifact, f.artifact);
  assert.equal(f.calls.length, 5);
  assert(f.calls.includes('actions/runs/7/attempts/2'));
});

test('reviewed Python prefix evidence requires its installed role context while final evidence remains main-only', async () => {
  const retained = metadata(reviewedSource, 9, reviewedBranch);
  const installed = review(retained);
  assert.deepEqual(pythonScannerReviewReference(installed), retained.ref);
  assert.deepEqual(
    pythonReviewedScannerReference(
      retained.run,
      retained.artifact,
      reviewedSource,
      installed
    ),
    retained.ref
  );
  const observed = await readPythonScannerObservation(
    retained.api,
    retained.ref,
    reviewedSource,
    { review: installed }
  );
  assert.equal(observed.run.head_branch, reviewedBranch);
  assert.equal(observed.artifact.workflow_run.head_branch, reviewedBranch);
  assert.equal(retained.calls.length, 5);
  assert.throws(
    () =>
      pythonScannerReference(retained.run, retained.artifact, reviewedSource),
    /same-repository main-push producer/
  );
  await assert.rejects(
    readPythonScannerObservation(retained.api, retained.ref, reviewedSource),
    /Python run is stale, foreign, pending, unsuccessful or not a main push/
  );
  const main = metadata(reviewedSource, 9);
  assert.throws(
    () =>
      pythonReviewedScannerReference(
        main.run,
        main.artifact,
        reviewedSource,
        installed
      ),
    /approved source and branch/
  );
  await assert.rejects(
    readPythonScannerObservation(main.api, main.ref, reviewedSource, {
      review: installed,
    }),
    /Python run is stale, foreign, pending, unsuccessful or not a main push/
  );
});

test('invalid installed Python review roles and identities refuse before any API access', async () => {
  const changes = [
    [
      'old schema',
      (value) => {
        value.schema = 'agijobsv0/codeql-python-review/1';
      },
    ],
    [
      'pull request event',
      (value) => {
        value.producerEvent = 'pull_request';
      },
    ],
    [
      'dispatch event',
      (value) => {
        value.producerEvent = 'workflow_dispatch';
      },
    ],
    [
      'missing event',
      (value) => {
        delete value.producerEvent;
      },
    ],
    [
      'main branch',
      (value) => {
        value.producerHeadBranch = 'main';
      },
    ],
    [
      'different prefix branch',
      (value) => {
        value.producerHeadBranch = 'fix/inherited-codeql-other';
      },
    ],
    [
      'missing branch',
      (value) => {
        delete value.producerHeadBranch;
      },
    ],
    [
      'main ref',
      (value) => {
        value.producerRef = 'refs/heads/main';
      },
    ],
    [
      'tag ref',
      (value) => {
        value.producerRef = 'refs/tags/source-v2.1.0-rc.16';
      },
    ],
    [
      'missing ref',
      (value) => {
        delete value.producerRef;
      },
    ],
    [
      'different source',
      (value) => {
        value.sourceCommit = source;
      },
    ],
    [
      'different run',
      (value) => {
        value.producerRunId++;
        value.artifactName = `python-codeql-security-report-${reviewedSource}-${value.producerRunId}-${value.producerRunAttempt}`;
      },
    ],
    [
      'different attempt',
      (value) => {
        value.producerRunAttempt++;
        value.artifactName = `python-codeql-security-report-${reviewedSource}-${value.producerRunId}-${value.producerRunAttempt}`;
      },
    ],
    [
      'different artifact',
      (value) => {
        value.artifactId++;
      },
    ],
    [
      'different archive digest',
      (value) => {
        value.archiveSha256 = '0'.repeat(64);
      },
    ],
  ];
  for (const [name, change] of changes) {
    const f = metadata(reviewedSource, 9, reviewedBranch);
    const installed = review(f);
    change(installed);
    await assert.rejects(
      readPythonScannerObservation(f.api, f.ref, reviewedSource, {
        review: installed,
      }),
      undefined,
      name
    );
    assert.equal(f.calls.length, 0, name);
  }
  const f = metadata(reviewedSource, 9, reviewedBranch);
  await assert.rejects(
    readPythonScannerObservation(f.api, f.ref, reviewedSource, { review: null })
  );
  assert.equal(f.calls.length, 0);
});

test('same-SHA Python S1 and S2 observations remain distinct roles with independent latest-branch selection', async () => {
  const final = metadata(source, 7),
    retained = metadata(source, 9, reviewedBranch);
  // Higher-number runs on the other role's branch do not replace this role's
  // latest selected producer, even though all runs have the identical SHA.
  final.data.runs.push({ ...clone(retained.run), run_number: 100 });
  retained.data.runs.push({ ...clone(final.run), run_number: 101 });
  const installed = review(retained, sourceTree);
  const finalObservation = await readPythonScannerObservation(
    final.api,
    final.ref,
    source
  );
  const reviewedObservation = await readPythonScannerObservation(
    retained.api,
    retained.ref,
    source,
    { review: installed }
  );
  assert.equal(finalObservation.latestRun.id, final.run.id);
  assert.equal(reviewedObservation.latestRun.id, retained.run.id);
  const options = {
    sha: source,
    tree: sourceTree,
    review: installed,
    finalObservation,
    reviewedObservation,
    git: (...args) => {
      if (args[0] === 'rev-parse') {
        assert.equal(args[1], source + '^{tree}');
        return sourceTree;
      }
      assert.deepEqual(args, ['merge-base', '--is-ancestor', source, source]);
      return '';
    },
  };
  const contexts = pythonEvidenceContexts(options);
  assert.equal(contexts.reviewed.role, 'reviewed');
  assert.equal(contexts.final.role, 'final');
  assert.equal(contexts.reviewed.sha, contexts.final.sha);
  assert.equal(contexts.reviewed.tree, contexts.final.tree);
  assert.equal(contexts.reviewed.producerRun.id, 9);
  assert.equal(contexts.final.producerRun.id, 7);
  assert.notEqual(contexts.reviewed.artifact.id, contexts.final.artifact.id);
  assert.throws(
    () =>
      pythonEvidenceContexts({
        ...options,
        finalObservation: reviewedObservation,
      }),
    /successful current exact-main producer/
  );
  assert.throws(
    () =>
      pythonEvidenceContexts({
        ...options,
        reviewedObservation: finalObservation,
      }),
    /Reviewed Python producer reference differs/
  );
});

test('both Python roles reject changed current, attempt, latest and artifact metadata', async () => {
  const cases = [
    [
      'current branch',
      (f, other) => {
        f.data.current.head_branch = other;
      },
      /Python run is stale/,
    ],
    [
      'attempt branch',
      (f, other) => {
        f.data.attempt.head_branch = other;
      },
      /Python run is stale/,
    ],
    [
      'current event',
      (f) => {
        f.data.current.event = 'pull_request';
      },
      /Python run is stale/,
    ],
    [
      'attempt event',
      (f) => {
        f.data.attempt.event = 'workflow_dispatch';
      },
      /Python run is stale/,
    ],
    [
      'current repository',
      (f) => {
        f.data.current.repository.id++;
      },
      /Python run is stale/,
    ],
    [
      'attempt repository',
      (f) => {
        f.data.attempt.repository.full_name = 'example/foreign';
      },
      /Python run is stale/,
    ],
    [
      'current head repository',
      (f) => {
        f.data.current.head_repository.full_name = 'example/foreign';
      },
      /Python run is stale/,
    ],
    [
      'attempt head repository',
      (f) => {
        f.data.attempt.head_repository.id++;
      },
      /Python run is stale/,
    ],
    [
      'stale current attempt',
      (f) => {
        f.data.current.run_attempt++;
      },
      /Python run is stale/,
    ],
    [
      'different run numbers',
      (f) => {
        f.data.attempt.run_number++;
      },
      /Python run is stale/,
    ],
    [
      'latest branch',
      (f, other) => {
        f.data.runs[0].head_branch = other;
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'latest repository',
      (f) => {
        f.data.runs[0].repository.id++;
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'latest head repository',
      (f) => {
        f.data.runs[0].head_repository.full_name = 'example/foreign';
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'latest attempt',
      (f) => {
        f.data.runs[0].run_attempt++;
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'newer pending run',
      (f) => {
        f.data.runs.push({
          ...clone(f.run),
          id: 100,
          run_number: 31,
          status: 'queued',
          conclusion: null,
        });
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'newer failed run',
      (f) => {
        f.data.runs.push({
          ...clone(f.run),
          id: 100,
          run_number: 31,
          conclusion: 'failure',
        });
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'newer completed run',
      (f) => {
        f.data.runs.push({ ...clone(f.run), id: 100, run_number: 31 });
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'ambiguous latest runs',
      (f) => {
        f.data.runs.push({ ...clone(f.run), id: 100 });
      },
      /newer or ambiguous Python workflow/,
    ],
    [
      'artifact branch',
      (f, other) => {
        f.data.artifact.workflow_run.head_branch = other;
      },
      /Python artifact identity differs/,
    ],
    [
      'artifact repository',
      (f) => {
        f.data.artifact.workflow_run.repository_id++;
      },
      /Python artifact identity differs/,
    ],
    [
      'artifact head repository',
      (f) => {
        f.data.artifact.workflow_run.head_repository_id++;
      },
      /Python artifact identity differs/,
    ],
    [
      'artifact inventory branch',
      (f, other) => {
        f.data.artifacts[0].workflow_run.head_branch = other;
      },
      /Python artifact differs from authenticated inventory/,
    ],
    [
      'ambiguous artifacts',
      (f) => {
        f.data.artifacts.push({ ...clone(f.artifact), id: 200 });
      },
      /Python artifact identity differs/,
    ],
  ];
  for (const role of ['reviewed', 'final'])
    for (const [name, change, message] of cases) {
      const reviewed = role === 'reviewed';
      const f = metadata(
        reviewed ? reviewedSource : source,
        reviewed ? 9 : 7,
        reviewed ? reviewedBranch : 'main'
      );
      const installed = reviewed ? review(f) : undefined;
      change(f, reviewed ? 'main' : reviewedBranch);
      await assert.rejects(
        readPythonScannerObservation(
          f.api,
          f.ref,
          f.run.head_sha,
          reviewed ? { review: installed } : {}
        ),
        message,
        `${role}: ${name}`
      );
    }
});

test('Python references reject incomplete, nonnumeric or unbound metadata before API use', async () => {
  const f = metadata();
  for (const ref of [
    null,
    { ...f.ref, runAttempt: '2' },
    { ...f.ref, githubDigest: 'e'.repeat(64) },
    { ...f.ref, artifactName: 'python-codeql-security-report-' + source },
    { ...f.ref, extra: true },
  ])
    await assert.rejects(readPythonScannerObservation(f.api, ref, source));
  await assert.rejects(readPythonScannerObservation(f.api, f.ref, 'HEAD'));
  assert.equal(f.calls.length, 0);
  assert.throws(
    () => pythonScannerReviewReference(null),
    /installed source-bound review/
  );
});

test('Python observations reject foreign repositories, stale attempts and non-main producer routes', async () => {
  for (const change of [
    (f) => {
      f.data.current.run_attempt++;
    },
    (f) => {
      f.data.attempt.head_sha = reviewedSource;
    },
    (f) => {
      f.data.current.repository.full_name = 'example/foreign';
    },
    (f) => {
      f.data.current.head_repository.id++;
    },
    (f) => {
      f.data.current.head_branch = 'fix/inherited-codeql-test';
    },
    (f) => {
      f.data.current.event = 'workflow_dispatch';
    },
    (f) => {
      f.data.attempt.status = 'queued';
      f.data.attempt.conclusion = null;
    },
    (f) => {
      f.data.attempt.conclusion = 'failure';
    },
    (f) => {
      f.data.current.path = '.github/workflows/static-analysis.yml';
    },
    (f) => {
      f.data.runs.push({
        ...clone(f.run),
        id: 8,
        run_number: 31,
        status: 'queued',
        conclusion: null,
      });
    },
    (f) => {
      f.data.runs.push({
        ...clone(f.run),
        id: 8,
        run_number: 31,
        conclusion: 'failure',
      });
    },
  ]) {
    const f = metadata();
    change(f);
    await assert.rejects(readPythonScannerObservation(f.api, f.ref, source));
  }
});

test('Python artifacts require exact name, digest, source, repository and unique inventory membership', async () => {
  for (const change of [
    (f) => {
      f.data.artifact.expired = true;
    },
    (f) => {
      f.data.artifact.digest = 'sha256:' + 'f'.repeat(64);
    },
    (f) => {
      f.data.artifact.workflow_run.head_sha = reviewedSource;
    },
    (f) => {
      f.data.artifact.workflow_run.head_repository_id++;
    },
    (f) => {
      f.data.artifacts = [];
    },
    (f) => {
      f.data.artifacts.push({ ...clone(f.artifact), id: 108 });
    },
    (f) => {
      f.data.artifacts[0].size_in_bytes++;
    },
  ]) {
    const f = metadata();
    change(f);
    await assert.rejects(readPythonScannerObservation(f.api, f.ref, source));
  }
});

test('Python workflow/artifact pagination is complete, stable, bounded and duplicate-free', async () => {
  const f = metadata();
  f.data.runs.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      ...clone(f.run),
      id: 1000 + i,
      event: 'pull_request',
      run_number: i + 100,
    }))
  );
  f.data.artifacts.push(
    ...Array.from({ length: 100 }, (_, i) => ({
      ...clone(f.artifact),
      id: 2000 + i,
      name: 'unrelated-synthetic-artifact-' + i,
    }))
  );
  await readPythonScannerObservation(f.api, f.ref, source);
  assert(
    f.calls.some(
      (route) => route.includes('/runs?') && route.endsWith('page=2')
    )
  );
  assert(
    f.calls.some(
      (route) => route.includes('/artifacts?') && route.endsWith('page=2')
    )
  );
  for (const replacement of [
    (result) => ({ ...result, total_count: 2001 }),
    (result) => ({ ...result, total_count: result.total_count + 1 }),
    (result) => ({
      ...result,
      workflow_runs: [result.workflow_runs[0], result.workflow_runs[0]],
    }),
  ]) {
    const g = metadata();
    const api = async (method, route) => {
      const result = await g.api(method, route);
      return route.includes('/workflows/') ? replacement(result) : result;
    };
    await assert.rejects(readPythonScannerObservation(api, g.ref, source));
  }
});

test('reviewed S1 and current S2 contexts route to their own authenticated source identities', async () => {
  const current = metadata(source, 7),
    retained = metadata(reviewedSource, 9, reviewedBranch);
  const finalObservation = await readPythonScannerObservation(
    current.api,
    current.ref,
    source
  );
  const reviewedObservation = await readPythonScannerObservation(
    retained.api,
    retained.ref,
    reviewedSource,
    { review: review(retained) }
  );
  const installedReview = review(retained),
    calls = [];
  const git = (...args) => {
    calls.push(args);
    if (args[0] === 'rev-parse')
      return args[1] === source + '^{tree}' ? sourceTree : reviewedTree;
    assert.deepEqual(args, [
      'merge-base',
      '--is-ancestor',
      reviewedSource,
      source,
    ]);
    return '';
  };
  const options = {
    sha: source,
    tree: sourceTree,
    review: installedReview,
    finalObservation,
    reviewedObservation,
    git,
  };
  const contexts = pythonEvidenceContexts(options);
  assert.equal(contexts.reviewed.role, 'reviewed');
  assert.equal(contexts.final.role, 'final');
  assert.equal(contexts.reviewed.sha, reviewedSource);
  assert.equal(contexts.reviewed.tree, reviewedTree);
  assert.equal(contexts.reviewed.producerRun.id, 9);
  assert.equal(contexts.final.sha, source);
  assert.equal(contexts.final.tree, sourceTree);
  assert.equal(contexts.final.producerRun.id, 7);
  assert.equal(contexts.reviewed.review, installedReview);
  assert.equal(contexts.final.review, installedReview);
  assert.equal(calls.length, 3);
  assert.throws(
    () =>
      pythonEvidenceContexts({
        ...options,
        reviewedObservation: finalObservation,
      }),
    /source or schema/
  );
  const changed = clone(installedReview);
  changed.archiveSha256 = '0'.repeat(64);
  assert.throws(
    () => pythonEvidenceContexts({ ...options, review: changed }),
    /Reviewed Python producer reference differs/
  );
});

test('Python archive verification refuses pending reviews and unretained reviewed archives', async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-python-evidence-test-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () =>
      verifyPythonEvidenceArchives({
        directory: root,
        sha: source,
        tree: sourceTree,
        review: null,
        git: () => '',
      }),
    /installed source-bound review/
  );
  const current = metadata(source, 7),
    retained = metadata(reviewedSource, 9, reviewedBranch);
  const finalObservation = await readPythonScannerObservation(
    current.api,
    current.ref,
    source
  );
  const reviewedObservation = await readPythonScannerObservation(
    retained.api,
    retained.ref,
    reviewedSource,
    { review: review(retained) }
  );
  const options = {
    directory: root,
    sha: source,
    tree: sourceTree,
    review: review(retained),
    finalObservation,
    reviewedObservation,
    git: (...args) =>
      args[0] === 'rev-parse'
        ? args[1] === source + '^{tree}'
          ? sourceTree
          : reviewedTree
        : '',
  };
  assert.throws(() => verifyPythonEvidenceArchives(options), /ENOENT/);
  fs.writeFileSync(
    path.join(root, 'python-codeql-reviewed-evidence.zip'),
    'ordinary invalid archive; not a scan\n'
  );
  assert.throws(
    () => verifyPythonEvidenceArchives(options),
    /authenticated artifact digest/
  );
});

test('Python ZIP metadata refuses malformed input without inventing a scanner report', () => {
  assert.throws(() =>
    pythonArchiveInventory(Buffer.from('ordinary text; not a scan'))
  );
  assert.throws(() => pythonArchiveInventory(Buffer.alloc(22)), /directory/);
});

test('ordinary non-scan ZIP metadata retains four regular records, including deflate descriptors', () => {
  for (const deflate of [false, true]) {
    const bytes = ordinaryZip(rawNames.map((name) => ({ name, deflate })));
    assert.deepEqual(
      [...pythonArchiveInventory(bytes).keys()].sort(),
      rawNames
    );
  }
  const withDirectory = ordinaryZip([
    { name: 'ordinary-directory/', mode: 0x41ed, contents: '' },
    ...rawNames.map((name) => ({ name })),
  ]);
  assert.deepEqual(
    [...pythonArchiveInventory(withDirectory).keys()].sort(),
    rawNames
  );
});

test('ordinary ZIP metadata refuses duplicate, link, nonregular and oversized records', () => {
  for (const records of [
    [...rawNames.map((name) => ({ name })), { name: rawNames[0] }],
    rawNames.map((name, i) => ({ name, mode: i === 0 ? 0xa1ff : 0x81a4 })),
    rawNames.map((name, i) => ({ name, mode: i === 0 ? 0x41ed : 0x81a4 })),
    [...rawNames.map((name) => ({ name })), { name: 'unexpected.txt' }],
  ])
    assert.throws(() => pythonArchiveInventory(ordinaryZip(records)));
  const oversized = ordinaryZip();
  const central = oversized.readUInt32LE(oversized.length - 6);
  oversized.writeUInt32LE(32 * 1024 * 1024 + 1, central + 24);
  assert.throws(() => pythonArchiveInventory(oversized), /Unbounded/);
  const changedLocalName = ordinaryZip();
  changedLocalName[30] ^= 1;
  assert.throws(() => pythonArchiveInventory(changedLocalName), /local source/);
});

test('actual owner verifier refuses a retained S1 ordinary ZIP that contains no scanner report', async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-python-s1-refusal-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = ordinaryZip(rawNames.map((name) => ({ name, deflate: true })));
  const current = metadata(source, 7),
    retained = metadata(reviewedSource, 9, reviewedBranch);
  retained.artifact.digest =
    retained.data.artifact.digest =
    retained.data.artifacts[0].digest =
      'sha256:' + createHash('sha256').update(bytes).digest('hex');
  retained.ref = pythonReviewedScannerReference(
    retained.run,
    retained.artifact,
    reviewedSource,
    review(retained)
  );
  const finalObservation = await readPythonScannerObservation(
    current.api,
    current.ref,
    source
  );
  const reviewedObservation = await readPythonScannerObservation(
    retained.api,
    retained.ref,
    reviewedSource,
    { review: review(retained) }
  );
  fs.writeFileSync(
    path.join(root, 'python-codeql-reviewed-evidence.zip'),
    bytes
  );
  assert.throws(
    () =>
      verifyPythonEvidenceArchives({
        directory: root,
        sha: source,
        tree: sourceTree,
        review: review(retained),
        finalObservation,
        reviewedObservation,
        git: (...args) =>
          args[0] === 'rev-parse'
            ? args[1] === source + '^{tree}'
              ? sourceTree
              : reviewedTree
            : '',
      }),
    /Exactly one complete Python SARIF/
  );
  assert.equal(
    fs.existsSync(path.join(root, 'python-codeql-evidence.zip')),
    false
  );
});

// Preserve the owner's shared-producer branch binding case using the stricter
// root-approved immutable Python review context, rather than a generic prefix.
test('SYNTHETIC_REVIEW_METADATA_ONLY_NOT_SCAN_EVIDENCE: reviewed Python branch role binds API envelopes and shared producer metadata', async () => {
  const {
    validateProducer,
  } = require('../../scripts/release/source-scanner-gates-rc16.cjs');
  const branch = reviewedBranch;
  // Deliberately synthetic identifiers; no archive, SARIF or scan is created.
  const f = metadata(source, 1_000_000_000_000_077, branch);
  const installedReview = review(f, sourceTree);
  for (const run of [f.data.current, f.data.attempt, ...f.data.runs])
    run.head_branch = branch;
  for (const artifact of [f.data.artifact, ...f.data.artifacts])
    artifact.workflow_run.head_branch = branch;

  const observed = await readPythonScannerObservation(f.api, f.ref, source, {
    review: installedReview,
  });
  for (const run of [observed.currentRun, observed.run, observed.latestRun])
    assert.equal(run.head_branch, branch);
  assert.equal(observed.artifact.workflow_run.head_branch, branch);
  assert.deepEqual(observed.producer, f.ref);
  assert.equal(f.calls.length, 5);
  await assert.rejects(readPythonScannerObservation(f.api, f.ref, source));
  await assert.rejects(
    readPythonScannerObservation(f.api, f.ref, source, { review: undefined })
  );

  const producer = {
    artifact: observed.artifact,
    run: observed.run,
    sha: source,
    workflow,
    name: f.ref.artifactName,
  };
  assert.doesNotThrow(() =>
    validateProducer({ ...producer, sourceRole: 'reviewed' })
  );
  assert.throws(() => validateProducer(producer));
  assert.throws(() => validateProducer({ ...producer, sourceRole: 'final' }));

  // An otherwise matching artifact envelope must bind the observed run branch.
  f.data.artifact.workflow_run.head_branch = 'main';
  f.data.artifacts[0].workflow_run.head_branch = 'main';
  await assert.rejects(
    readPythonScannerObservation(f.api, f.ref, source, {
      review: installedReview,
    }),
    /artifact identity differs/
  );
  assert.throws(
    () =>
      validateProducer({
        ...producer,
        artifact: f.data.artifact,
        sourceRole: 'reviewed',
      }),
    /artifact identity mismatch/
  );
});

// Ordinary component/outer metadata only, not a SARIF report, scan result,
// independent review, source admission or successful archive qualification.
function ordinaryPythonComparisonMetadata() {
  return {
    scope: 'UNQUALIFIED_ORDINARY_METADATA_ONLY',
    toolComponents: [
      {
        name: 'ordinary first component',
        rules: [
          { id: 'ordinary-b', text: 'all B metadata' },
          { id: 'ordinary-a', text: 'all A metadata' },
        ],
        notifications: [
          { id: 'ordinary-note-b', text: 'all note B metadata' },
          { id: 'ordinary-note-a', text: 'all note A metadata' },
        ],
      },
      { name: 'ordinary second component', rules: [], notifications: [] },
    ],
    outerMetadata: { values: ['left', 'right'], retained: true },
  };
}

test('ordinary Python comparison metadata accepts complete unique-ID reordering without changing originals', () => {
  const reviewed = ordinaryPythonComparisonMetadata();
  const current = clone(reviewed);
  current.toolComponents[0].rules.reverse();
  current.toolComponents[0].notifications.reverse();
  const before = clone({ reviewed, current });
  verifyPythonSemanticSummary(current, reviewed);
  assert.deepEqual({ reviewed, current }, before);
});

test('ordinary Python comparison metadata retains full records, component positions and duplicate ordering', () => {
  const reviewed = ordinaryPythonComparisonMetadata();
  const changedRecord = clone(reviewed);
  changedRecord.toolComponents[0].rules[0].text = 'changed ordinary metadata';
  assert.throws(() => verifyPythonSemanticSummary(changedRecord, reviewed), /complete independently reviewed toolComponents/);
  const movedComponent = clone(reviewed);
  movedComponent.toolComponents.reverse();
  assert.throws(() => verifyPythonSemanticSummary(movedComponent, reviewed), /complete independently reviewed toolComponents/);
  const duplicate = clone(reviewed);
  duplicate.toolComponents[0].rules[1].id = duplicate.toolComponents[0].rules[0].id;
  const reorderedDuplicate = clone(duplicate);
  reorderedDuplicate.toolComponents[0].rules.reverse();
  assert.throws(() => verifyPythonSemanticSummary(reorderedDuplicate, duplicate), /complete independently reviewed toolComponents/);
  const lostMultiplicity = clone(reviewed);
  lostMultiplicity.toolComponents[0].rules.pop();
  assert.throws(() => verifyPythonSemanticSummary(lostMultiplicity, reviewed), /complete independently reviewed toolComponents/);
});

test('ordinary Python comparison metadata compares every remaining outer field exactly', () => {
  const reviewed = ordinaryPythonComparisonMetadata();
  for (const change of [
    (value) => { value.outerMetadata.values.reverse(); },
    (value) => { value.newOuterMetadata = 'not silently ignored'; },
    (value) => { delete value.outerMetadata; },
  ]) {
    const current = clone(reviewed);
    change(current);
    assert.throws(() => verifyPythonSemanticSummary(current, reviewed), /complete Python scanner semantics differ/);
  }
});
