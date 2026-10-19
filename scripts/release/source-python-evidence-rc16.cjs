'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  pythonReviewSchema,
  pythonFinalProducer,
  pythonReviewedProducerContext,
} = require('./source-scanner-review-bindings-rc16.cjs');

const repository = 'MontrealAI/AGIJobsv0';
const repositoryId = 1031364470;
const workflow = '.github/workflows/static-analysis-python-integrations.yml';
const archiveFiles = Object.freeze([
  'python.sarif',
  'source-extraction.json',
  'source-scope-after.json',
  'source-scope-before.json',
]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitIdentity = (value) => /^[a-f0-9]{40}$/.test(value || '');
const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value || '');
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const artifactName = (sha, id, attempt) =>
  `python-codeql-security-report-${sha}-${id}-${attempt}`;

function exactFields(value, fields, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), message);
}

function validatePythonScannerReference(ref, sha) {
  exactFields(
    ref,
    ['runId', 'runAttempt', 'artifactId', 'artifactName', 'githubDigest'],
    'Python evidence requires an exact attempt-bound reference'
  );
  assert(
    gitIdentity(sha) &&
      positive(ref.runId) &&
      positive(ref.runAttempt) &&
      positive(ref.artifactId) &&
      ref.artifactName === artifactName(sha, ref.runId, ref.runAttempt) &&
      digest(ref.githubDigest),
    'Invalid Python evidence source, attempt, artifact or digest reference'
  );
  return ref;
}

function validRun(run, ref, sha, expected = pythonFinalProducer) {
  return (
    run?.id === ref.runId &&
    run.run_attempt === ref.runAttempt &&
    positive(run.run_number) &&
    run.path === workflow &&
    run.head_sha === sha &&
    run.repository?.full_name === repository &&
    run.repository.id === repositoryId &&
    run.head_repository?.full_name === repository &&
    run.head_repository.id === repositoryId &&
    run.event === expected.event &&
    run.head_branch === expected.headBranch &&
    run.status === 'completed' &&
    run.conclusion === 'success'
  );
}

function validArtifact(artifact, ref, sha, expected = pythonFinalProducer) {
  return (
    artifact?.id === ref.artifactId &&
    artifact.name === ref.artifactName &&
    artifact.expired === false &&
    artifact.digest === ref.githubDigest &&
    positive(artifact.size_in_bytes) &&
    artifact.size_in_bytes <= 128 * 1024 * 1024 &&
    artifact.workflow_run?.id === ref.runId &&
    artifact.workflow_run.head_sha === sha &&
    artifact.workflow_run.head_branch === expected.headBranch &&
    artifact.workflow_run.repository_id === repositoryId &&
    artifact.workflow_run.head_repository_id === repositoryId
  );
}

function pythonScannerReference(run, artifact, sha) {
  const ref = {
    runId: run?.id,
    runAttempt: run?.run_attempt,
    artifactId: artifact?.id,
    artifactName: artifact?.name,
    githubDigest: artifact?.digest,
  };
  validatePythonScannerReference(ref, sha);
  assert(
    validRun(run, ref, sha) && validArtifact(artifact, ref, sha),
    'Python evidence requires a successful same-repository main-push producer'
  );
  return ref;
}

function pythonScannerReviewReference(review) {
  assert(
    review?.schema === pythonReviewSchema &&
      gitIdentity(review.sourceCommit) &&
      gitIdentity(review.tree) &&
      /^[a-f0-9]{64}$/.test(review.archiveSha256 || ''),
    'Python evidence requires the installed source-bound review'
  );
  pythonReviewedProducerContext(review);
  exactFields(
    review.rawRecords,
    archiveFiles,
    'Python review must bind all four actual raw records'
  );
  assert(
    archiveFiles.every((name) =>
      /^[a-f0-9]{64}$/.test(review.rawRecords[name])
    ),
    'Python reviewed raw-record digest is absent'
  );
  return validatePythonScannerReference(
    {
      runId: review.producerRunId,
      runAttempt: review.producerRunAttempt,
      artifactId: review.artifactId,
      artifactName: review.artifactName,
      githubDigest: 'sha256:' + review.archiveSha256,
    },
    review.sourceCommit
  );
}

async function pages(api, prefix, key) {
  const values = [],
    seen = new Set();
  let total;
  for (let page = 1; page <= 20; page++) {
    const separator = prefix.includes('?') ? '&' : '?';
    const response = await api(
      'GET',
      `${prefix}${separator}per_page=100&page=${page}`
    );
    assert(
      Number.isSafeInteger(response?.total_count) &&
        response.total_count >= 0 &&
        response.total_count <= 2000 &&
        (total === undefined || total === response.total_count) &&
        Array.isArray(response[key]) &&
        response[key].length <= 100,
      'Incomplete Python producer pagination'
    );
    total = response.total_count;
    for (const value of response[key]) {
      assert(
        positive(value?.id) && !seen.has(value.id),
        'Duplicate or malformed Python producer inventory'
      );
      seen.add(value.id);
      values.push(value);
    }
    if (values.length === total) return values;
    assert(
      values.length < total && response[key].length === 100,
      'Truncated Python producer inventory'
    );
  }
  throw Error('Python producer pagination exceeds its bound');
}

function reviewedExpectation(review, ref, sha) {
  const expected = pythonReviewedProducerContext(review);
  assert.equal(
    review.sourceCommit,
    sha,
    'Reviewed Python context source differs'
  );
  assert.deepEqual(
    pythonScannerReviewReference(review),
    ref,
    'Reviewed Python producer reference differs'
  );
  return expected;
}

function pythonReviewedScannerReference(run, artifact, sha, review) {
  const ref = pythonScannerReviewReference(review);
  const expected = reviewedExpectation(review, ref, sha);
  assert(
    validRun(run, ref, sha, expected) &&
      validArtifact(artifact, ref, sha, expected),
    'Reviewed Python archive producer differs from its approved source and branch'
  );
  return ref;
}

async function readPythonScannerObservation(api, ref, sha, { review } = {}) {
  assert.equal(
    typeof api,
    'function',
    'Authenticated Python evidence API is required'
  );
  validatePythonScannerReference(ref, sha);
  const expected =
    review === undefined
      ? pythonFinalProducer
      : reviewedExpectation(review, ref, sha);
  const [currentRun, run, artifact, runs, artifacts] = await Promise.all([
    api('GET', `actions/runs/${ref.runId}`),
    api('GET', `actions/runs/${ref.runId}/attempts/${ref.runAttempt}`),
    api('GET', `actions/artifacts/${ref.artifactId}`),
    pages(
      api,
      `actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=${sha}`,
      'workflow_runs'
    ),
    pages(api, `actions/runs/${ref.runId}/artifacts`, 'artifacts'),
  ]);
  assert(
    validRun(currentRun, ref, sha, expected) &&
      validRun(run, ref, sha, expected) &&
      currentRun.run_number === run.run_number,
    'Python run is stale, foreign, pending, unsuccessful or not a main push'
  );
  assert(
    runs.every(
      (item) =>
        item.head_sha === sha &&
        item.path === workflow &&
        positive(item.run_number) &&
        positive(item.run_attempt)
    ),
    'Foreign-head or malformed Python workflow inventory'
  );
  const ordered = runs
    .filter(
      (item) =>
        item.event === expected.event &&
        item.head_branch === expected.headBranch
    )
    .sort(
      (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt
    );
  const latestRun = ordered[0];
  assert(
    validRun(latestRun, ref, sha, expected) &&
      latestRun.run_number === run.run_number &&
      !(
        ordered[1]?.run_number === latestRun.run_number &&
        ordered[1].run_attempt === latestRun.run_attempt
      ),
    'A newer or ambiguous Python workflow/attempt supersedes retained evidence'
  );
  const matches = artifacts.filter((item) => item.name === ref.artifactName);
  assert(
    matches.length === 1 && validArtifact(artifact, ref, sha, expected),
    'Python artifact identity differs from the authenticated producer'
  );
  assert.deepEqual(
    matches[0],
    artifact,
    'Python artifact differs from authenticated inventory'
  );
  return {
    schema: 'agijobsv0/python-codeql-observation/1',
    repository,
    source: sha,
    producer: { ...ref },
    currentRun,
    run,
    latestRun,
    artifact,
  };
}

function validateObservation(observation, sha, { review } = {}) {
  assert(
    observation?.schema === 'agijobsv0/python-codeql-observation/1' &&
      observation.repository === repository &&
      observation.source === sha,
    'Python observation source or schema differs'
  );
  const ref = validatePythonScannerReference(observation.producer, sha);
  const expected =
    review === undefined
      ? pythonFinalProducer
      : reviewedExpectation(review, ref, sha);
  assert(
    validRun(observation.currentRun, ref, sha, expected) &&
      validRun(observation.run, ref, sha, expected) &&
      validRun(observation.latestRun, ref, sha, expected) &&
      observation.currentRun.run_number === observation.run.run_number &&
      observation.latestRun.run_number === observation.run.run_number &&
      validArtifact(observation.artifact, ref, sha, expected),
    'Python observation does not retain a successful current exact-main producer'
  );
  return ref;
}

function pythonEvidenceContexts({
  sha,
  tree,
  review,
  finalObservation,
  reviewedObservation,
  git,
}) {
  assert(
    gitIdentity(sha) && gitIdentity(tree) && typeof git === 'function',
    'Python archive evidence requires exact external Git identities'
  );
  const reviewedRef = pythonScannerReviewReference(review);
  const finalRef = validateObservation(finalObservation, sha);
  assert.deepEqual(
    validateObservation(reviewedObservation, review.sourceCommit, { review }),
    reviewedRef,
    'Reviewed Python observation differs from the installed review producer'
  );
  assert.equal(
    git('rev-parse', sha + '^{tree}').trim(),
    tree,
    'Current Python evidence tree differs from Git source'
  );
  assert.equal(
    git('rev-parse', review.sourceCommit + '^{tree}').trim(),
    review.tree,
    'Reviewed Python evidence tree differs from Git source'
  );
  git('merge-base', '--is-ancestor', review.sourceCommit, sha);
  return {
    reviewed: {
      role: 'reviewed',
      sha: review.sourceCommit,
      tree: review.tree,
      producerRun: reviewedObservation.run,
      artifact: reviewedObservation.artifact,
      archiveSha256: reviewedRef.githubDigest.slice(7),
      review,
      git,
    },
    final: {
      role: 'final',
      sha,
      tree,
      producerRun: finalObservation.run,
      artifact: finalObservation.artifact,
      archiveSha256: finalRef.githubDigest.slice(7),
      review,
      git,
    },
  };
}

function captureArchive(file, expectedDigest) {
  const maxBytes = 128 * 1024 * 1024;
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  let bytes;
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    assert(
      before.isFile() &&
        before.nlink === 1n &&
        before.size > 0n &&
        before.size <= BigInt(maxBytes),
      'Bounded regular Python archive required'
    );
    const chunks = [];
    let length = 0;
    while (length <= maxBytes) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maxBytes + 1 - length)
      );
      const read = fs.readSync(fd, chunk, 0, chunk.length, length);
      if (!read) break;
      chunks.push(chunk.subarray(0, read));
      length += read;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    assert(
      length <= maxBytes &&
        BigInt(length) === before.size &&
        ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(
          (key) => before[key] === after[key]
        ),
      'Python archive changed or exceeded its bound'
    );
    bytes = Buffer.concat(chunks, length);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(
    'sha256:' + hash(bytes),
    expectedDigest,
    'Python archive bytes differ from authenticated artifact digest'
  );
  return bytes;
}

function readArchive(bytes, verify) {
  const inventory = pythonArchiveInventory(bytes);
  // Extract only a private snapshot of the already captured, digest-checked ZIP.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-python-evidence-'));
  try {
    const file = path.join(root, 'evidence.zip');
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    const env = { ...process.env };
    for (const name of ['UNZIP', 'UNZIPOPT', 'ZIPINFO', 'ZIPINFOOPT'])
      delete env[name];
    const options = { env, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 };
    const files = execFileSync('unzip', ['-Z1', file], {
      ...options,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
      .trim()
      .split('\n')
      .filter((name) => !name.endsWith('/'))
      .sort();
    assert.deepEqual(
      files,
      archiveFiles,
      'Python archive must retain exactly four raw files'
    );
    const captured = new Map(
      files.map((name) => {
        const raw = execFileSync('unzip', ['-p', file, name], options);
        assert.equal(
          raw.length,
          inventory.get(name),
          'Python raw ZIP member size differs'
        );
        return [name, raw];
      })
    );
    return verify(
      files,
      (name) => captured.get(name),
      Object.fromEntries(files.map((name) => [name, hash(captured.get(name))]))
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function pythonArchiveInventory(bytes) {
  assert(
    Buffer.isBuffer(bytes) &&
      bytes.length >= 22 &&
      bytes.length <= 128 * 1024 * 1024,
    'Bounded Python ZIP bytes required'
  );
  let end = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 22 - 65535);
    i--
  )
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  assert(end >= 0, 'Python ZIP directory is absent');
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    offset = bytes.readUInt32LE(end + 16);
  assert(
    bytes.readUInt16LE(end + 4) === 0 &&
      bytes.readUInt16LE(end + 6) === 0 &&
      bytes.readUInt16LE(end + 8) === count &&
      count > 0 &&
      count <= 256 &&
      offset + size === end,
    'Unsupported or incomplete Python ZIP directory'
  );
  const names = new Set(),
    locations = new Set(),
    files = new Map();
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    assert(
      cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50,
      'Malformed Python ZIP central entry'
    );
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      compressed = bytes.readUInt32LE(cursor + 20),
      length = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32),
      attributes = bytes.readUInt32LE(cursor + 38),
      local = bytes.readUInt32LE(cursor + 42);
    assert(
      nameLength > 0 &&
        nameLength <= 4096 &&
        cursor + 46 + nameLength + extraLength + commentLength <= end &&
        bytes.readUInt16LE(cursor + 34) === 0 &&
        !(flags & 0x41) &&
        [0, 8].includes(method) &&
        length <= 32 * 1024 * 1024 &&
        compressed <= bytes.length,
      'Unbounded, encrypted or unsupported Python ZIP member'
    );
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      name = rawName.toString('utf8');
    assert(
      Buffer.from(name).equals(rawName) &&
        !names.has(name) &&
        !/[\\\0\r\n]/.test(name) &&
        !name.startsWith('/') &&
        !name
          .replace(/\/$/, '')
          .split('/')
          .some((part) => !part || part === '.' || part === '..'),
      'Duplicate or invalid Python ZIP member name'
    );
    names.add(name);
    const type = (attributes >>> 16) & 0xf000,
      directory = name.endsWith('/');
    assert(
      directory
        ? (type === 0 || type === 0x4000) && length === 0
        : (type === 0 || type === 0x8000) && !(attributes & 0x10),
      'Python ZIP member must be regular source evidence, not a link'
    );
    assert(
      local + 30 <= offset &&
        !locations.has(local) &&
        bytes.readUInt32LE(local) === 0x04034b50,
      'Malformed or duplicate Python ZIP local entry'
    );
    locations.add(local);
    const localName = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28),
      start = local + 30;
    assert(
      bytes.readUInt16LE(local + 6) === flags &&
        bytes.readUInt16LE(local + 8) === method &&
        localName === nameLength &&
        start + localName + localExtra + compressed <= offset &&
        bytes.subarray(start, start + localName).equals(rawName),
      'Python ZIP local source differs from central inventory'
    );
    if (!directory) files.set(name, length);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end, 'Python ZIP central inventory is incomplete');
  assert.deepEqual(
    [...files.keys()].sort(),
    archiveFiles,
    'Python ZIP must retain exactly four raw records'
  );
  return files;
}

function semanticSummary(summary) {
  const {
    producer,
    reviewSource,
    reviewTree,
    reviewEvidence,
    reviewedProducer,
    ...semantic
  } = summary;
  for (const name of [
    'tool',
    'toolComponents',
    'codeqlConfigSummary',
    'successfulExtractionFiles',
    'requiredExtractedFiles',
    'ruleIds',
    'rawResultCount',
    'results',
    'completeNonOverlay',
  ])
    assert(
      Object.hasOwn(semantic, name),
      'Python semantic summary is incomplete: ' + name
    );
  assert.equal(semantic.completeNonOverlay, true);
  return semantic;
}

function verifyPythonEvidenceArchives(options) {
  const {
    directory,
    sha,
    tree,
    review,
    finalObservation,
    reviewedObservation,
    git,
  } = options;
  assert(
    path.isAbsolute(directory || ''),
    'Absolute retained Python evidence directory required'
  );
  const contexts = pythonEvidenceContexts({
    sha,
    tree,
    review,
    finalObservation,
    reviewedObservation,
    git,
  });
  // Lazy loading avoids importing the qualifier through the owner module while
  // the qualifier itself is still being initialized by a caller.
  const { verifyPythonScannerArchive } = require('./python-scanner-rc16.cjs');
  const checked = {};
  for (const [kind, name, observation] of [
    ['reviewed', 'python-codeql-reviewed-evidence.zip', reviewedObservation],
    ['final', 'python-codeql-evidence.zip', finalObservation],
  ]) {
    const bytes = captureArchive(
      path.join(directory, name),
      observation.producer.githubDigest
    );
    checked[kind] = readArchive(bytes, (files, read, rawRecords) => {
      const summary = verifyPythonScannerArchive(files, read, contexts[kind]);
      assert.deepEqual(
        summary.producer.rawRecords,
        rawRecords,
        'Python verified summary differs from actual raw archive bytes'
      );
      if (kind === 'reviewed')
        assert.deepEqual(
          rawRecords,
          review.rawRecords,
          'Reviewed Python raw records differ from the installed review'
        );
      return summary;
    });
  }
  const summary = semanticSummary(checked.final);
  assert.deepEqual(
    summary,
    semanticSummary(checked.reviewed),
    'Current/reviewed complete Python scanner semantics differ'
  );
  return {
    schema: 'agijobsv0/raw-python-codeql-provenance/1',
    repository,
    source: sha,
    tree,
    final: {
      source: sha,
      tree,
      producer: finalObservation.producer,
      rawRecords: checked.final.producer.rawRecords,
      observation: finalObservation,
    },
    reviewed: {
      source: review.sourceCommit,
      tree: review.tree,
      producer: reviewedObservation.producer,
      rawRecords: checked.reviewed.producer.rawRecords,
      observation: reviewedObservation,
    },
    summary,
    review,
  };
}

module.exports = {
  pythonReviewedScannerReference,
  pythonScannerReference,
  pythonScannerReviewReference,
  validatePythonScannerReference,
  readPythonScannerInventory: pages,
  readPythonScannerObservation,
  pythonEvidenceContexts,
  pythonArchiveInventory,
  verifyPythonEvidenceArchives,
};
