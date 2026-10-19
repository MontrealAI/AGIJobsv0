'use strict';
const assert = require('node:assert/strict');
const javascriptQualityPolicy = Object.freeze({
  schema: 'agijobsv0/nonsecurity-quality-review/1',
  disposition: 'Acknowledged nonsecurity quality',
  ruleIds: Object.freeze([
    'js/unused-local-variable',
    'js/useless-assignment-to-local',
  ]),
});
const pythonReviewSchema = 'agijobsv0/codeql-python-review/2';
const pythonReviewedProducer = Object.freeze({
  event: 'push',
  headBranch: 'fix/inherited-codeql-ti-final-rc16-20261019',
  ref: 'refs/heads/fix/inherited-codeql-ti-final-rc16-20261019',
});
const pythonFinalProducer = Object.freeze({
  event: 'push',
  headBranch: 'main',
  ref: 'refs/heads/main',
});
function pythonReviewedProducerContext(review) {
  assert.equal(
    review?.schema,
    pythonReviewSchema,
    'Python review schema differs'
  );
  assert.deepEqual(
    {
      event: review.producerEvent,
      headBranch: review.producerHeadBranch,
      ref: review.producerRef,
    },
    pythonReviewedProducer,
    'Reviewed Python producer must retain its exact approved premerge push branch and ref'
  );
  return pythonReviewedProducer;
}
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
    : JSON.stringify(value);
function exactFields(value, fields, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), message);
}
function validateJavascriptQualityMetadata(item, sourceCommit, git) {
  assert(
    item.disposition === javascriptQualityPolicy.disposition &&
      javascriptQualityPolicy.ruleIds.includes(item.ruleId),
    'Only the two explicitly reviewed nonsecurity quality rules are eligible'
  );
  const quality = item.qualityReview;
  exactFields(
    quality,
    [
      'schema',
      'sourceBlob',
      'ruleMetadataSha256',
      'queryComponentSha256',
      'codeqlConfigSummarySha256',
      'behaviorAssessment',
      'independentReviewEvidence',
    ],
    'Complete versioned nonsecurity quality review fields differ'
  );
  assert.equal(quality.schema, javascriptQualityPolicy.schema);
  assert(/^[a-f0-9]{40}$/.test(quality.sourceBlob || ''));
  for (const field of [
    'ruleMetadataSha256',
    'queryComponentSha256',
    'codeqlConfigSummarySha256',
  ])
    assert(
      /^[a-f0-9]{64}$/.test(quality[field] || ''),
      'Quality review query/rule/config commitment is absent'
    );
  assert(
    typeof quality.behaviorAssessment === 'string' &&
      quality.behaviorAssessment.trim(),
    'Case-specific behavior and side-effect assessment is required'
  );
  const references = (value, pattern) =>
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every(
      (reference) =>
        typeof reference === 'string' &&
        reference === reference.trim() &&
        pattern.test(reference) &&
        new URL(reference).href === reference
    );
  // These are commitments to evidence that an independent result reviewer must
  // actually inspect. Their syntax is not proof that a finding is acceptable.
  assert(
    references(
      quality.independentReviewEvidence,
      /^https:\/\/github\.com\/MontrealAI\/AGIJobsv0\/pull\/[1-9][0-9]*#(?:pullrequestreview-|issuecomment-|discussion_r)[1-9][0-9]*$/
    ),
    'Quality review requires case-specific independent review references'
  );
  assert(
    references(
      item.regressionEvidence,
      /^https:\/\/github\.com\/MontrealAI\/AGIJobsv0\/(?:actions\/runs\/[1-9][0-9]*(?:\/job\/[1-9][0-9]*)?|commit\/[a-f0-9]{40}|blob\/[a-f0-9]{40}\/[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*)$/
    ),
    'Quality review requires immutable source or actual behavior-test evidence references'
  );
  assert(
    /^[a-f0-9]{40}$/.test(sourceCommit || '') &&
      typeof item.path === 'string' &&
      item.path &&
      !/[\\\0\r\n]/.test(item.path) &&
      !item.path.startsWith('/') &&
      !item.path.startsWith(':') &&
      item.path
        .split('/')
        .every((part) => part && part !== '.' && part !== '..'),
    'Quality review source identity or repository path differs'
  );
  if (git) {
    const entry = String(git('ls-tree', '-z', sourceCommit, '--', item.path));
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(
      entry
    );
    assert(
      match && match[3] === item.path && match[2] === quality.sourceBlob,
      'Quality review source blob or regular mode differs from immutable Git'
    );
  }
  return quality;
}
function validateScannerReviewMetadata(field, review, { git, target } = {}) {
  const python = field === 'pythonScannerReview';
  assert(python || field === 'scannerReview', 'Unknown scanner review field');
  const fields = python
    ? [
        'schema',
        'sourceCommit',
        'tree',
        'producerRunId',
        'producerRunAttempt',
        'producerEvent',
        'producerHeadBranch',
        'producerRef',
        'artifactId',
        'artifactName',
        'archiveSha256',
        'rawRecords',
        'toolComponents',
        'codeqlConfigSummary',
        'successfulExtractionFiles',
        'requiredExtractedFiles',
        'ruleIds',
        'rawResultCount',
        'results',
        'reviewEvidence',
      ]
    : ['sourceCommit', 'results', 'reviewEvidence'];
  exactFields(review, fields, 'Complete scanner review metadata fields differ');
  assert(
    /^[a-f0-9]{40}$/.test(review.sourceCommit || ''),
    'Scanner review requires exact source identities'
  );
  const references = (value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim());
  assert(
    references(review.reviewEvidence) ||
      (!python &&
        typeof review.reviewEvidence === 'string' &&
        review.reviewEvidence.trim()),
    'Scanner review evidence is absent'
  );
  assert(
    Array.isArray(review.results),
    'Scanner review result inventory is absent'
  );
  for (const item of review.results) {
    exactFields(
      item,
      [
        'ruleId',
        'path',
        'region',
        'resultSha256',
        'disposition',
        'justification',
        'regressionEvidence',
        ...(!python && item.disposition === javascriptQualityPolicy.disposition
          ? ['qualityReview']
          : []),
      ],
      'Complete scanner result disposition fields differ'
    );
    assert(
      typeof item.ruleId === 'string' &&
        item.ruleId &&
        typeof item.path === 'string' &&
        item.path &&
        item.region &&
        typeof item.region === 'object' &&
        !Array.isArray(item.region) &&
        /^[a-f0-9]{64}$/.test(item.resultSha256 || '') &&
        (item.disposition === 'Demonstrably false positive' ||
          (!python &&
            item.disposition === javascriptQualityPolicy.disposition)) &&
        typeof item.justification === 'string' &&
        item.justification.trim() &&
        references(item.regressionEvidence),
      'Every retained scanner result needs a complete disposition'
    );
    if (!python && item.disposition === javascriptQualityPolicy.disposition)
      validateJavascriptQualityMetadata(item, review.sourceCommit, git);
  }
  if (python) {
    pythonReviewedProducerContext(review);
    assert(
      /^[a-f0-9]{40}$/.test(review.tree || ''),
      'Python review tree identity is absent'
    );
    for (const value of [
      review.producerRunId,
      review.producerRunAttempt,
      review.artifactId,
    ])
      assert(
        Number.isSafeInteger(value) && value > 0,
        'Python review producer identity is absent'
      );
    assert.equal(
      review.artifactName,
      `python-codeql-security-report-${review.sourceCommit}-${review.producerRunId}-${review.producerRunAttempt}`
    );
    assert(
      /^[a-f0-9]{64}$/.test(review.archiveSha256 || ''),
      'Python review archive identity is absent'
    );
    const files = [
      'python.sarif',
      'source-extraction.json',
      'source-scope-after.json',
      'source-scope-before.json',
    ];
    exactFields(
      review.rawRecords,
      files,
      'Python review raw record inventory differs'
    );
    assert(
      files.every((name) =>
        /^[a-f0-9]{64}$/.test(review.rawRecords[name] || '')
      ),
      'Python review raw record digest is absent'
    );
    assert(
      Array.isArray(review.toolComponents) &&
        review.toolComponents.length > 0 &&
        review.toolComponents.every(
          (component) =>
            component &&
            typeof component.name === 'string' &&
            component.name &&
            Array.isArray(component.rules)
        ),
      'Python review complete tool/rule metadata is absent'
    );
    const rules = review.toolComponents.flatMap((component) =>
      component.rules.map((rule) => rule.id)
    );
    assert(
      rules.length > 0 &&
        rules.every((rule) => typeof rule === 'string' && rule),
      'Python review rule metadata is absent'
    );
    assert.deepEqual(
      review.ruleIds,
      [...new Set(rules)].sort(),
      'Python review rule metadata differs'
    );
    assert(
      review.codeqlConfigSummary &&
        typeof review.codeqlConfigSummary === 'object' &&
        !Array.isArray(review.codeqlConfigSummary) &&
        Object.keys(review.codeqlConfigSummary).length > 0,
      'Python review config summary is absent'
    );
    for (const name of [
      'successfulExtractionFiles',
      'requiredExtractedFiles',
    ]) {
      assert(
        Array.isArray(review[name]) &&
          review[name].length > 0 &&
          review[name].every((file) => typeof file === 'string' && file),
        'Python review extraction inventory is absent'
      );
      assert.deepEqual(
        review[name],
        [...new Set(review[name])].sort(),
        'Python review extraction inventory is not complete and normalized'
      );
    }
    assert(
      review.requiredExtractedFiles.every((file) =>
        review.successfulExtractionFiles.includes(file)
      ),
      'Python review is missing required extraction'
    );
    assert(
      Number.isSafeInteger(review.rawResultCount) &&
        review.rawResultCount >= 0 &&
        review.rawResultCount === review.results.length,
      'Python review raw result multiplicity differs'
    );
    assert.equal(
      typeof git,
      'function',
      'Python review requires immutable Git source'
    );
    assert.equal(
      git('rev-parse', review.sourceCommit + '^{tree}').trim(),
      review.tree,
      'Python review tree differs from its Git source'
    );
  }
  if (git && target)
    git('merge-base', '--is-ancestor', review.sourceCommit, target);
}

function verifyScannerReviewInstallBinding({
  sha,
  review,
  git,
  field = 'scannerReview',
}) {
  assert(
    /^[a-f0-9]{40}$/.test(sha || ''),
    'Scanner review requires exact source identities'
  );
  // Preserve the original same-source parser API; archive wrappers still bind
  // the producer, raw reports, exact result multiset and independent review.
  validateScannerReviewMetadata(field, review, { git, target: sha });
  if (review.sourceCommit === sha) return;
  assert.equal(
    typeof git,
    'function',
    'Scanner review does not bind this source'
  );
  git('merge-base', '--is-ancestor', review.sourceCommit, sha);
  const profilePath = 'scripts/release/source-profile-rc16.json';
  const slots = ['scannerReview', 'pythonScannerReview'];
  const profiles = new Map();
  const readProfile = (commit) => {
    if (!profiles.has(commit))
      profiles.set(commit, JSON.parse(git('show', `${commit}:${profilePath}`)));
    return profiles.get(commit);
  };
  assert.deepEqual(
    readProfile(sha)[field],
    review,
    'Installed scanner review differs'
  );
  const raw = git(
    'rev-list',
    '--parents',
    '--reverse',
    '--ancestry-path',
    '--max-count=65',
    `${review.sourceCommit}..${sha}`
  );
  const rows = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/));
  assert(
    rows.length > 0 && rows.length <= 64,
    'Scanner review installation history is absent or exceeds its bound'
  );
  const commits = new Set([review.sourceCommit]);
  for (const row of rows) {
    assert(
      row.length > 1 &&
        row.every((value) => /^[a-f0-9]{40}$/.test(value)) &&
        !commits.has(row[0]),
      'Malformed scanner review installation history'
    );
    commits.add(row[0]);
  }
  assert(
    commits.has(sha),
    'Scanner review installation history does not reach this source'
  );
  for (const [commit, ...parents] of rows) {
    const relevant = parents.filter((parent) => commits.has(parent));
    assert(
      relevant.length > 0,
      'Scanner review installation history is disconnected'
    );
    for (const parent of relevant) {
      const changed = git(
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-only',
        '-z',
        parent,
        commit,
        '--'
      )
        .split('\0')
        .filter(Boolean);
      assert(
        changed.length === 0 ||
          (changed.length === 1 && changed[0] === profilePath),
        'Source changed after scanner review beyond its record'
      );
      const before = readProfile(parent),
        after = readProfile(commit);
      for (const slot of slots) {
        assert(
          Object.hasOwn(before, slot) && Object.hasOwn(after, slot),
          'Both scanner review slots must remain explicit'
        );
        if (canonical(before[slot]) !== canonical(after[slot]))
          assert(
            before[slot] === null && after[slot] !== null,
            'An installed scanner review cannot be replaced or removed'
          );
        if (after[slot] !== null)
          validateScannerReviewMetadata(slot, after[slot], {
            git,
            target: commit,
          });
      }
      const projected = { ...after };
      for (const slot of slots) projected[slot] = before[slot];
      assert.deepEqual(
        projected,
        before,
        'Scanner review installation changed other profile pins or qualification'
      );
    }
  }
}

function assertNoScannerErrorDiagnostics(invocations) {
  assert(
    Array.isArray(invocations) &&
      invocations.every((invocation) =>
        ['toolExecutionNotifications', 'toolConfigurationNotifications'].every(
          (field) =>
            !(invocation[field] || []).some((note) => note.level === 'error')
        )
      ),
    'Scanner execution reported an error diagnostic'
  );
}

function boundedReviewText(value, label) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  assert(
    typeof text === 'string' &&
      Buffer.byteLength(text) <= 8 * 1024 * 1024 &&
      !text.includes('\ufffd') &&
      (!Buffer.isBuffer(value) || Buffer.from(text).equals(value)),
    'Bounded UTF8 ' + label + ' required'
  );
  return text;
}

function projectThreeSlotProfile(value) {
  const raw = boundedReviewText(value, 'scanner review profile');
  const slots = ['scannerReview', 'pythonScannerReview'];
  const spans = new Map();
  let position = 0;
  const white = () => {
    while (/[\t\r\n ]/.test(raw[position] || 'x')) position++;
  };
  const string = () => {
    const start = position;
    assert.equal(raw[position++], '"', 'Profile JSON string required');
    while (position < raw.length) {
      const char = raw[position++];
      if (char === '"') return raw.slice(start, position);
      if (char === '\\') position++;
    }
    throw Error('Incomplete scanner review profile string');
  };
  const primitive =
    /(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;
  const valueEnd = (depth) => {
    assert(depth <= 64, 'Scanner review profile nesting exceeds its bound');
    white();
    if (raw[position] === '"') {
      string();
      return;
    }
    if (raw[position] === '{' || raw[position] === '[') {
      const object = raw[position++] === '{',
        close = object ? '}' : ']';
      white();
      if (raw[position] === close) {
        position++;
        return;
      }
      while (position < raw.length) {
        if (object) {
          string();
          white();
          assert.equal(raw[position++], ':', 'Profile JSON colon required');
        }
        valueEnd(depth + 1);
        white();
        if (raw[position] === close) {
          position++;
          return;
        }
        assert.equal(raw[position++], ',', 'Profile JSON comma required');
        white();
      }
      throw Error('Incomplete scanner review profile object');
    }
    primitive.lastIndex = position;
    const match = primitive.exec(raw);
    assert(match, 'Malformed scanner review profile value');
    position = primitive.lastIndex;
  };
  white();
  assert.equal(raw[position++], '{', 'Scanner profile must be an object');
  white();
  if (raw[position] !== '}')
    while (position < raw.length) {
      const key = JSON.parse(string());
      white();
      assert.equal(raw[position++], ':', 'Profile JSON colon required');
      white();
      const start = position;
      valueEnd(1);
      if (slots.includes(key)) {
        assert(!spans.has(key), 'Duplicate scanner review profile slot');
        spans.set(key, { start, end: position });
      }
      white();
      if (raw[position] === '}') break;
      assert.equal(raw[position++], ',', 'Profile JSON comma required');
      white();
    }
  assert.equal(raw[position++], '}', 'Incomplete scanner review profile');
  white();
  assert.equal(position, raw.length, 'Trailing scanner review profile bytes');
  const profile = JSON.parse(raw);
  assert(
    profile && typeof profile === 'object' && !Array.isArray(profile),
    'Scanner profile must be an object'
  );
  const compact = raw.replace(/"(?:\\.|[^"\\])*"|\s+/g, (token) =>
    token[0] === '"' ? token : ''
  );
  assert.equal(
    compact,
    JSON.stringify(profile),
    'Canonical scanner profile JSON required'
  );
  assert(
    slots.every((slot) => spans.has(slot) && Object.hasOwn(profile, slot)),
    'Both profile review slots must remain explicit'
  );
  let projection = '',
    cursor = 0;
  for (const span of [...spans.values()].sort((a, b) => a.start - b.start)) {
    projection += raw.slice(cursor, span.start) + 'null';
    cursor = span.end;
  }
  projection += raw.slice(cursor);
  return { profile, projection };
}

function verifyThreeSlotReviewBinding({
  sourceSha,
  sha,
  review,
  field,
  git,
  parseNotes,
  notesPath = 'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
}) {
  const profilePath = 'scripts/release/source-profile-rc16.json';
  const slots = ['notesReview', 'scannerReview', 'pythonScannerReview'];
  const identity = (value) => /^[a-f0-9]{40}$/.test(value || '');
  assert(
    identity(sourceSha) &&
      identity(sha) &&
      slots.includes(field) &&
      typeof git === 'function' &&
      typeof parseNotes === 'function' &&
      notesPath === 'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
    'Exact three-slot review source, field, Git and strict notes parser required'
  );
  assert(
    review && typeof review === 'object' && !Array.isArray(review),
    'Installed three-slot review is required'
  );
  assert.equal(
    field === 'notesReview' ? review.sourceSha : review.sourceCommit,
    sourceSha,
    'Review source differs from its binding origin'
  );
  const textGit = (...args) => {
    const result = git(...args);
    return Buffer.isBuffer(result) ? result.toString('utf8') : result;
  };
  const trees = new Map();
  const tree = (commit) => {
    if (!trees.has(commit)) {
      const result = String(textGit('rev-parse', commit + '^{tree}')).trim();
      assert(identity(result), 'Scanner review Git tree identity is absent');
      trees.set(commit, result);
    }
    return trees.get(commit);
  };
  const validate = (slot, record, target) => {
    if (record === null) return;
    if (slot === 'notesReview') {
      assert(
        record && identity(record.sourceSha) && identity(record.sourceTree),
        'Notes review source identities are absent'
      );
      assert.equal(
        tree(record.sourceSha),
        record.sourceTree,
        'Notes review source tree differs'
      );
      textGit('merge-base', '--is-ancestor', record.sourceSha, target);
    } else {
      validateScannerReviewMetadata(slot, record, { git: textGit, target });
      const actual = tree(record.sourceCommit);
      if (slot === 'pythonScannerReview')
        assert.equal(actual, record.tree, 'Python review source tree differs');
    }
  };
  const snapshots = new Map();
  const snapshot = (commit) => {
    if (snapshots.has(commit)) return snapshots.get(commit);
    for (const name of [notesPath, profilePath]) {
      const entry = String(textGit('ls-tree', '-z', commit, '--', name));
      assert(
        new RegExp(
          '^100644 blob [a-f0-9]{40}\\t' +
            name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
            '\\0$'
        ).test(entry),
        'Review metadata must retain its regular-file mode'
      );
    }
    const notes = boundedReviewText(
      git('show', `${commit}:${notesPath}`),
      'scanner review notes'
    );
    const parsedNotes = parseNotes(notes);
    assert(
      parsedNotes === null ||
        (parsedNotes &&
          typeof parsedNotes === 'object' &&
          !Array.isArray(parsedNotes)),
      'Strict notes review parser returned malformed metadata'
    );
    const markers = [
      ...notes.matchAll(/<!-- rc16-scanner-review\n([\s\S]*?)\n-->/g),
    ];
    assert.equal(
      markers.length,
      1,
      'Exactly one strict notes review marker required'
    );
    const marker = markers[0];
    const notesProjection =
      notes.slice(0, marker.index) +
      '<!-- rc16-scanner-review\nnull\n-->' +
      notes.slice(marker.index + marker[0].length);
    const profile = projectThreeSlotProfile(
      git('show', `${commit}:${profilePath}`)
    );
    const records = {
      notesReview: parsedNotes,
      scannerReview: profile.profile.scannerReview,
      pythonScannerReview: profile.profile.pythonScannerReview,
    };
    for (const slot of slots) validate(slot, records[slot], commit);
    const result = {
      records,
      notesProjection,
      profileProjection: profile.projection,
    };
    snapshots.set(commit, result);
    return result;
  };
  textGit('merge-base', '--is-ancestor', sourceSha, sha);
  tree(sourceSha);
  tree(sha);
  const current = snapshot(sha);
  assert.deepEqual(
    current.records[field],
    review,
    'Current installed review differs from the bound record'
  );
  // Production installation never borrows the reviewed-archive same-source
  // shortcut: even this branch has already checked the installed current slot.
  if (sourceSha === sha) return review;
  snapshot(sourceSha);
  const rows = String(
    textGit(
      'rev-list',
      '--parents',
      '--reverse',
      '--topo-order',
      '--ancestry-path',
      '--max-count=65',
      `${sourceSha}..${sha}`
    )
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/));
  assert(
    rows.length > 0 && rows.length <= 64,
    'Three-slot review history is absent or exceeds 64 commits'
  );
  const commits = new Set([sourceSha]);
  for (const row of rows) {
    assert(
      row.length > 1 && row.every(identity) && !commits.has(row[0]),
      'Malformed three-slot review history'
    );
    commits.add(row[0]);
  }
  assert(
    commits.has(sha),
    'Three-slot review history does not reach the target'
  );
  const connected = new Set([sourceSha]);
  for (const [commit, ...parents] of rows) {
    const relevant = parents.filter((parent) => commits.has(parent));
    assert(
      relevant.length > 0 && relevant.every((parent) => connected.has(parent)),
      'Disconnected or non-topological three-slot review history'
    );
    const after = snapshot(commit);
    for (const parent of relevant) {
      const changed = String(
        textGit(
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--name-only',
          '-z',
          parent,
          commit,
          '--'
        )
      )
        .split('\0')
        .filter(Boolean);
      assert(
        changed.every((name) => name === notesPath || name === profilePath),
        'Source changed outside the exact two review metadata paths'
      );
      const before = snapshot(parent);
      assert.equal(
        after.notesProjection,
        before.notesProjection,
        'Review installation changed notes outer bytes'
      );
      assert.equal(
        after.profileProjection,
        before.profileProjection,
        'Review installation changed profile bytes outside the two review values'
      );
      for (const slot of slots)
        if (canonical(before.records[slot]) !== canonical(after.records[slot]))
          assert(
            before.records[slot] === null && after.records[slot] !== null,
            'An installed review cannot be removed or replaced'
          );
    }
    connected.add(commit);
  }
  return review;
}
module.exports = {
  javascriptQualityPolicy,
  validateJavascriptQualityMetadata,
  pythonReviewSchema,
  pythonReviewedProducer,
  pythonFinalProducer,
  pythonReviewedProducerContext,
  validateScannerReviewMetadata,
  verifyScannerReviewInstallBinding,
  assertNoScannerErrorDiagnostics,
  projectThreeSlotProfile,
  verifyThreeSlotReviewBinding,
};
