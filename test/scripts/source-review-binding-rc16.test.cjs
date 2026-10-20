'use strict';

// INERT review metadata in disposable Git histories. These records are not
// scanner reports, authentic API evidence, installed policy or qualification.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  verifyThreeSlotReviewBinding,
  projectThreeSlotProfile,
} = require('../../scripts/release/source-scanner-review-bindings-rc16.cjs');
const {
  parseScannerReview,
  scannerHistory,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const notesPath = 'docs/production/RELEASE_NOTES_SOURCE_RC16.md';
const profilePath = 'scripts/release/source-profile-rc16.json';
const slots = ['notesReview', 'scannerReview', 'pythonScannerReview'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const empty = () => Object.fromEntries(slots.map((slot) => [slot, null]));
const notes = (review) =>
  '# INERT METADATA ONLY; NO SCAN PROOF\n<!-- rc16-scanner-review\n' +
  JSON.stringify(review) +
  '\n-->\n';
const profile = (records) => ({
  schema: 'inert-binding-fixture',
  qualification: 'PENDING_FINAL_SOURCE_MAIN_PUSH',
  pinNumber: 1,
  pins: { compiler: 'unchanged', policy: ['fixed', 'source'] },
  scannerReview: records.scannerReview,
  pythonScannerReview: records.pythonScannerReview,
});

function reviewRecords(sourceSha, tree) {
  return {
    notesReview: {
      schema: 'agijobsv0/rc16-scanner-review/1',
      sourceSha,
      sourceTree: tree,
      producer: {
        runId: 1,
        runAttempt: 1,
        runNumber: 1,
        event: 'push',
        headBranch: 'main',
        artifactId: 2,
        artifactName: `codeql-security-report-${sourceSha}-1-1`,
        githubDigest: 'sha256:' + 'a'.repeat(64),
      },
      summary: {
        schema: 'agijobsv0/raw-codeql-summary/1',
        toolSha256: 'a'.repeat(64),
        queriesSha256: 'b'.repeat(64),
        extractedPaths: ['INERT-METADATA-ONLY.js'],
        results: [],
        resultCount: 0,
      },
      resultReviews: [],
      codeqlChecks: [
        {
          id: 3,
          headSha: sourceSha,
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
    },
    scannerReview: {
      sourceCommit: sourceSha,
      results: [],
      reviewEvidence: [
        'INERT metadata fixture; not authentic scanner evidence',
      ],
    },
    pythonScannerReview: {
      schema: 'agijobsv0/codeql-python-review/2',
      producerEvent: 'push',
      producerHeadBranch: 'fix/processed-codeql-release-proof-20261020',
      producerRef: 'refs/heads/fix/processed-codeql-release-proof-20261020',
      sourceCommit: sourceSha,
      tree,
      producerRunId: 4,
      producerRunAttempt: 1,
      artifactId: 5,
      artifactName: `python-codeql-security-report-${sourceSha}-4-1`,
      archiveSha256: 'c'.repeat(64),
      rawRecords: Object.fromEntries(
        [
          'python.sarif',
          'source-extraction.json',
          'source-scope-after.json',
          'source-scope-before.json',
        ].map((name) => [name, 'd'.repeat(64)])
      ),
      toolComponents: [
        { name: 'INERT-METADATA-ONLY', rules: [{ id: 'inert-metadata-only' }] },
      ],
      codeqlConfigSummary: { inertMetadataOnly: true },
      successfulExtractionFiles: ['INERT-METADATA-ONLY.py'],
      requiredExtractedFiles: ['INERT-METADATA-ONLY.py'],
      ruleIds: ['inert-metadata-only'],
      rawResultCount: 0,
      results: [],
      reviewEvidence: [
        'INERT metadata fixture; not authentic scanner evidence',
      ],
    },
  };
}

function repository(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-three-review-slots-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Inert fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Inert fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    GIT_AUTHOR_DATE: '2026-10-19T00:00:00Z',
    GIT_COMMITTER_DATE: '2026-10-19T00:00:00Z',
  });
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-C',
        root,
        ...args,
      ],
      {
        encoding: 'utf8',
        env,
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  const put = (name, bytes, mode = '100644') => {
    const blob = execFileSync(
      'git',
      ['--no-replace-objects', '-C', root, 'hash-object', '-w', '--stdin'],
      { encoding: 'utf8', input: bytes, env }
    ).trim();
    git('update-index', '--add', '--cacheinfo', `${mode},${blob},${name}`);
  };
  git('init', '--quiet');
  const make = (records, parents, options = {}) => {
    const list = parents ? (Array.isArray(parents) ? parents : [parents]) : [];
    if (list.length) git('read-tree', list[0]);
    else git('read-tree', '--empty');
    put(
      notesPath,
      options.notes ?? notes(records.notesReview),
      options.notesMode
    );
    put(
      profilePath,
      options.profile ?? JSON.stringify(profile(records), null, 2) + '\n',
      options.profileMode
    );
    for (const [name, bytes] of options.others || []) put(name, bytes);
    for (const name of options.remove || [])
      git('update-index', '--force-remove', name);
    return git(
      'commit-tree',
      git('write-tree').trim(),
      ...list.flatMap((parent) => ['-p', parent]),
      '-m',
      'INERT metadata fixture'
    ).trim();
  };
  const base = make(empty());
  const tree = git('rev-parse', base + '^{tree}').trim();
  return { git, put, make, base, tree, records: reviewRecords(base, tree) };
}

function verify(r, sha, field = 'notesReview', records = r.records, sourceSha) {
  return verifyThreeSlotReviewBinding({
    sourceSha:
      sourceSha ??
      (field === 'notesReview'
        ? records[field].sourceSha
        : records[field].sourceCommit),
    sha,
    review: records[field],
    field,
    git: r.git,
    parseNotes: parseScannerReview,
    notesPath,
  });
}

test('all six installation orders preserve the three independent review records', (t) => {
  const r = repository(t);
  for (const order of [
    ['notesReview', 'scannerReview', 'pythonScannerReview'],
    ['notesReview', 'pythonScannerReview', 'scannerReview'],
    ['scannerReview', 'notesReview', 'pythonScannerReview'],
    ['scannerReview', 'pythonScannerReview', 'notesReview'],
    ['pythonScannerReview', 'notesReview', 'scannerReview'],
    ['pythonScannerReview', 'scannerReview', 'notesReview'],
  ]) {
    const state = empty();
    let target = r.base;
    for (const field of order) {
      state[field] = r.records[field];
      target = r.make(state, target);
    }
    for (const field of slots)
      assert.equal(verify(r, target, field), r.records[field]);
  }
});

test('simultaneous, parallel metadata merge and unchanged replay installs remain valid', (t) => {
  const r = repository(t),
    simultaneous = r.make(r.records, r.base);
  for (const field of slots) verify(r, simultaneous, field);
  const left = r.make(
    { ...empty(), scannerReview: r.records.scannerReview },
    r.base
  );
  const right = r.make(
    {
      ...empty(),
      notesReview: r.records.notesReview,
      pythonScannerReview: r.records.pythonScannerReview,
    },
    r.base
  );
  const merged = r.make(r.records, [left, right]);
  const replay = r.make(r.records, merged);
  for (const field of slots) {
    verify(r, merged, field);
    verify(r, replay, field);
    verify(r, replay, field);
  }
});

test('a previously installed peer is validated and preserved when another review is installed', (t) => {
  const r = repository(t),
    existing = { ...empty(), scannerReview: r.records.scannerReview };
  const peer = r.make(existing, r.base);
  const python = reviewRecords(
    peer,
    r.git('rev-parse', peer + '^{tree}').trim()
  ).pythonScannerReview;
  const state = { ...existing, pythonScannerReview: python },
    target = r.make(state, peer);
  verify(r, target, 'pythonScannerReview', state, peer);
  assert.equal(
    JSON.parse(r.git('show', `${target}:${profilePath}`)).scannerReview
      .sourceCommit,
    r.base
  );
});

test('same-source production binding still requires the current own record to be installed', (t) => {
  const r = repository(t);
  for (const field of slots)
    assert.throws(
      () => verify(r, r.base, field),
      /Current installed review differs/
    );
  const target = r.make(r.records, r.base),
    changed = clone(r.records);
  changed.scannerReview.reviewEvidence = ['Different inert metadata'];
  assert.throws(
    () => verify(r, target, 'scannerReview', changed),
    /Current installed review differs/
  );
});

test('every installed slot rejects transient removal, replacement and remove/reinsert history', (t) => {
  const r = repository(t),
    installed = r.make(r.records, r.base);
  for (const field of slots) {
    const removed = { ...r.records, [field]: null },
      hop = r.make(removed, installed),
      restored = r.make(r.records, hop);
    assert.throws(() => verify(r, restored), /cannot be removed or replaced/);
    const changed = clone(r.records);
    if (field === 'notesReview')
      changed[field].reviewLinks.push(
        'https://github.com/MontrealAI/AGIJobsv0/pull/3991#issuecomment-2'
      );
    else changed[field].reviewEvidence = ['Replaced INERT metadata'];
    const replaced = r.make(changed, installed),
      reset = r.make(r.records, replaced);
    assert.throws(() => verify(r, reset), /cannot be removed or replaced/);
  }
});

test('transient notes prose, profile pins, qualification, executable and mode edits cannot hide behind a final revert', (t) => {
  const r = repository(t),
    installed = r.make(r.records, r.base);
  const changedProfile = profile(r.records);
  changedProfile.pins.compiler = 'changed';
  const changedQualification = profile(r.records);
  changedQualification.qualification = 'QUALIFIED';
  for (const options of [
    { notes: 'Changed outer prose\n' + notes(r.records.notesReview) },
    { profile: JSON.stringify(changedProfile, null, 2) + '\n' },
    { profile: JSON.stringify(changedQualification, null, 2) + '\n' },
    {
      others: [['scripts/release/unreviewed.cjs', '// INERT changed source\n']],
    },
    { notesMode: '100755' },
    { profileMode: '100755' },
    { notesMode: '120000' },
    { profileMode: '120000' },
  ]) {
    const hop = r.make(r.records, installed, options);
    const restored = r.make(r.records, hop, {
      remove: (options.others || []).map(([name]) => name),
    });
    assert.equal(
      r.git('rev-parse', restored + '^{tree}').trim(),
      r.git('rev-parse', installed + '^{tree}').trim()
    );
    assert.throws(() => verify(r, restored));
  }
});

test('canonical JSON and profile byte projection reject duplicates, alternate spellings and non-slot whitespace edits', (t) => {
  const r = repository(t),
    original = JSON.stringify(profile(r.records), null, 2) + '\n';
  for (const raw of [
    original.replace('"pinNumber": 1,', '"pinNumber": 1, "pinNumber": 1,'),
    original.replace('"pinNumber": 1,', '"pinNumber": 1e0,'),
    original.replace('"qualification"', '"\\u0071ualification"'),
    original.replace('  "pins":', '   "pins":'),
  ]) {
    const target = r.make(r.records, r.base, { profile: raw });
    assert.throws(() => verify(r, target));
  }
  assert.throws(
    () =>
      projectThreeSlotProfile(
        '{"scannerReview":null,"scannerReview":null,"pythonScannerReview":null}'
      ),
    /Duplicate/
  );
  assert.throws(
    () => projectThreeSlotProfile('{"scannerReview":null}'),
    /explicit/
  );
});

test('the profile scanner changes only the two top-level review value spans and bounds nested JSON', () => {
  const original = {
    pins: {
      scannerReview: 'nested key is a pin',
      text: 'quoted "scannerReview": null, }',
    },
    scannerReview: null,
    pythonScannerReview: null,
  };
  const installed = {
    ...original,
    scannerReview: {
      sourceCommit: 'a'.repeat(40),
      reviewEvidence: ['quote " } [ \\ text'],
      results: [],
    },
  };
  assert.equal(
    projectThreeSlotProfile(JSON.stringify(original, null, 2)).projection,
    projectThreeSlotProfile(JSON.stringify(installed, null, 2)).projection
  );
  const changedPin = clone(installed);
  changedPin.pins.scannerReview = 'changed';
  assert.notEqual(
    projectThreeSlotProfile(JSON.stringify(changedPin, null, 2)).projection,
    projectThreeSlotProfile(JSON.stringify(original, null, 2)).projection
  );
  assert.throws(
    () =>
      projectThreeSlotProfile(
        '{"pins":' +
          '['.repeat(65) +
          'null' +
          ']'.repeat(65) +
          ',"scannerReview":null,"pythonScannerReview":null}'
      ),
    /nesting/
  );
  assert.throws(
    () => projectThreeSlotProfile(' '.repeat(8 * 1024 * 1024 + 1)),
    /Bounded/
  );
});

test('all installed peers retain the unchanged strict notes and owner metadata validators', (t) => {
  const r = repository(t);
  for (const change of [
    (records) => {
      records.notesReview.history = {
        ...scannerHistory,
        findingsSha256: '0'.repeat(64),
      };
    },
    (records) => {
      records.notesReview.codeqlChecks[0].appId = 15368;
    },
    (records) => {
      records.notesReview.reviewLinks = ['https://example.invalid/inert'];
    },
    (records) => {
      records.notesReview.sourceTree = '0'.repeat(40);
    },
    (records) => {
      records.scannerReview.sourceCommit = 'f'.repeat(40);
    },
    (records) => {
      records.pythonScannerReview.tree = '0'.repeat(40);
    },
    (records) => {
      records.pythonScannerReview.rawRecords = {};
    },
  ]) {
    const bad = clone(r.records);
    change(bad);
    const target = r.make(bad, r.base);
    assert.throws(() => verify(r, target, 'scannerReview', bad));
  }
  const doubled = r.make(r.records, r.base, {
    notes: notes(r.records.notesReview) + notes(null),
  });
  assert.throws(() => verify(r, doubled), /Exactly one/);
});

test('real Git history accepts exactly 64 monotonic commits and rejects a 65th', (t) => {
  const r = repository(t);
  let target = r.base;
  for (let i = 0; i < 64; i++) target = r.make(r.records, target);
  verify(r, target);
  const extra = r.make(r.records, target);
  assert.throws(() => verify(r, extra), /exceeds 64/);
});

test('a replay onto unrelated source and disconnected or malformed history metadata are refused', (t) => {
  const r = repository(t),
    target = r.make(r.records, r.base);
  const unrelated = r.make(empty(), null, {
    notes: '# Unrelated INERT source\n<!-- rc16-scanner-review\nnull\n-->\n',
  });
  const replay = r.make(r.records, unrelated);
  assert.throws(() => verify(r, replay));
  for (const rows of [
    '',
    `${target} ${'e'.repeat(40)}\n`,
    `${target} ${target}\n`,
    `${target} ${r.base}\n${target} ${r.base}\n`,
    `${target} not-a-Git-parent\n`,
  ]) {
    const git = (...args) => (args[0] === 'rev-list' ? rows : r.git(...args));
    assert.throws(() =>
      verifyThreeSlotReviewBinding({
        sourceSha: r.base,
        sha: target,
        review: r.records.notesReview,
        field: 'notesReview',
        git,
        parseNotes: parseScannerReview,
        notesPath,
      })
    );
  }
});
