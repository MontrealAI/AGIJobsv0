'use strict';

const assert = require('node:assert/strict');
const { profile, parseTree } = require('./source-profile-rc16.cjs');
const {
  canonical,
  sha256,
  resultIdentity,
  validateProducer,
  verifyScannerReviewInstallBinding,
  assertNoScannerErrorDiagnostics,
} = require('./qualify-source-release-rc16.cjs');

const archiveFiles = Object.freeze([
  'python.sarif',
  'source-extraction.json',
  'source-scope-after.json',
  'source-scope-before.json',
]);
const sentinelFiles = Object.freeze(
  [
    'successor-computer-mission-lab.py',
    'successor-computer-worker-launch.py',
    'successor-frontier-mission-lab.py',
    'supplier-adapter-lab.py',
    'supplier-browser-lab.py',
    'supplier_browser_lab_support.py',
    'supplier_node_guard.py',
    'supplier_proof_guard.py',
  ]
    .map((name) => 'integrations/alpha-agent/' + name)
    .sort()
);
const scopeFields = Object.freeze([
  'schema',
  'source',
  'tree',
  'run',
  'attempt',
  'event',
  'ref',
  'configPath',
  'configSha256',
  'workflowPath',
  'workflowSha256',
  'requiredSentinelFiles',
  'requiredExtractedFiles',
  'actualExtractionRequiresSARIF',
]);
const extractionFields = Object.freeze([
  'schema',
  'source',
  'tree',
  'run',
  'attempt',
  'event',
  'ref',
  'configPath',
  'configSha256',
  'workflowPath',
  'workflowSha256',
  'sarifSha256',
  'successfulExtractionFiles',
  'requiredSentinelFiles',
  'requiredExtractedFiles',
  'missingRequiredExtractedFiles',
  'ruleIds',
  'rawResultCount',
  'resultDisposition',
]);
const reviewFields = Object.freeze([
  'schema',
  'sourceCommit',
  'tree',
  'producerRunId',
  'producerRunAttempt',
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
]);
const hashPattern = /^[a-f0-9]{64}$/;
const gitPattern = /^[a-f0-9]{40}$/;

function exactFields(value, fields, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), message);
}
function identity(value, label) {
  assert(gitPattern.test(value || ''), 'Invalid Python scanner ' + label);
}
function positive(value, label) {
  assert(
    Number.isSafeInteger(value) && value > 0,
    'Invalid Python scanner ' + label
  );
}
function normalized(value) {
  return JSON.parse(canonical(value));
}
function policy() {
  const value = profile.pythonScannerPolicy;
  assert(value && typeof value === 'object', 'Python scanner policy is absent');
  assert.equal(
    value.configPath,
    '.github/codeql/config-python-integrations.yml'
  );
  assert.equal(
    value.workflowPath,
    '.github/workflows/static-analysis-python-integrations.yml'
  );
  for (const field of ['configSha256', 'workflowSha256'])
    assert(
      hashPattern.test(value[field] || ''),
      'Invalid Python scanner policy digest'
    );
  for (const field of ['configBlob', 'workflowBlob'])
    identity(value[field], 'policy blob');
  assert.deepEqual(
    value.archiveFiles,
    archiveFiles,
    'Python scanner policy archive inventory differs'
  );
  assert.deepEqual(
    [...(profile.pythonScannerRequiredPaths || [])].sort(),
    sentinelFiles,
    'Complete Python receiver sentinel policy differs'
  );
  return value;
}
function archiveInventory(files) {
  assert(Array.isArray(files), 'Python scanner archive inventory is absent');
  assert.deepEqual(
    [...files].sort(),
    archiveFiles,
    'Python scanner archive inventory differs'
  );
}
function reviewedBranch(branch) {
  return (
    branch === 'main' ||
    (typeof branch === 'string' &&
      /^fix\/inherited-codeql-[A-Za-z0-9][A-Za-z0-9._-]{0,233}$/.test(branch) &&
      !branch.includes('..') &&
      !branch.endsWith('.') &&
      !branch.endsWith('.lock'))
  );
}
function producerIdentity({
  sha,
  tree,
  producerRun,
  git,
  sourceRole = 'final',
}) {
  identity(sha, 'source identity');
  identity(tree, 'tree identity');
  assert.equal(
    typeof git,
    'function',
    'Python scanner requires immutable Git source'
  );
  assert.equal(
    git('rev-parse', sha + '^{tree}').trim(),
    tree,
    'Python scanner tree differs from Git source'
  );
  positive(producerRun?.id, 'producer run');
  positive(producerRun?.run_attempt, 'producer attempt');
  assert(
    sourceRole === 'final' || sourceRole === 'reviewed',
    'Python scanner source role differs'
  );
  assert(
    sourceRole === 'reviewed'
      ? reviewedBranch(producerRun.head_branch)
      : producerRun.head_branch === 'main',
    'Python scanner producer branch is not admitted for its source role'
  );
  const expected = policy();
  assert(
    producerRun.head_sha === sha &&
      producerRun.path === expected.workflowPath &&
      producerRun.event === 'push' &&
      producerRun.repository?.full_name === 'MontrealAI/AGIJobsv0' &&
      producerRun.status === 'completed' &&
      producerRun.conclusion === 'success',
    'Python scanner requires the authenticated successful source-bound producer'
  );
  return expected;
}

function expectedPythonSources(git, sha) {
  assert.equal(
    typeof git,
    'function',
    'Python inventory requires immutable Git source'
  );
  identity(sha, 'source identity');
  const source = parseTree(git('ls-tree', '-rz', sha));
  return [...source.entries()]
    .filter(
      ([name]) =>
        name.startsWith('integrations/alpha-agent/') && /\.py$/i.test(name)
    )
    .map(([name, entry]) => {
      assert(
        ['100644', '100755'].includes(entry.mode) &&
          gitPattern.test(entry.blob),
        'Python source must retain a regular immutable Git blob'
      );
      return name;
    })
    .sort();
}

function verifyPythonScannerReviewBinding(options) {
  return verifyScannerReviewInstallBinding({
    ...options,
    field: 'pythonScannerReview',
  });
}

function analysis(document) {
  assert(
    document.version === '2.1.0' &&
      Array.isArray(document.runs) &&
      document.runs.length === 1,
    'Exactly one complete Python SARIF run is required'
  );
  const run = document.runs[0];
  assert.equal(
    run.tool?.driver?.name,
    'CodeQL',
    'Python scanner tool is not CodeQL'
  );
  assert(
    Array.isArray(run.invocations) &&
      run.invocations.length > 0 &&
      run.invocations.every((item) => item.executionSuccessful === true),
    'Python scanner did not complete successfully'
  );
  assertNoScannerErrorDiagnostics(run.invocations);
  assert(
    run.invocations.some((item) =>
      item.toolExecutionNotifications?.some(
        (note) => note.descriptor?.id === 'codeql-action/overlay-disabled'
      )
    ),
    'A complete non-overlay Python scan is required'
  );
  assert(
    Array.isArray(run.results),
    'Complete Python SARIF result array is required'
  );
  assert(
    run.tool.extensions === undefined || Array.isArray(run.tool.extensions),
    'Python scanner tool extensions are malformed'
  );
  const toolComponents = [run.tool.driver, ...(run.tool.extensions || [])].map(
    (component) => {
      assert(
        component && typeof component === 'object' && !Array.isArray(component),
        'Malformed Python tool component'
      );
      assert(
        component.rules === undefined || Array.isArray(component.rules),
        'Malformed Python tool rules'
      );
      return normalized({ ...component, rules: component.rules || [] });
    }
  );
  const rules = toolComponents.flatMap((component) =>
    component.rules.map((rule) => rule.id)
  );
  assert(
    rules.length > 0 && rules.every((rule) => typeof rule === 'string' && rule),
    'Actual Python rule inventory is absent'
  );
  const ruleIds = [...new Set(rules)].sort();
  const codeqlConfigSummary = run.properties?.codeqlConfigSummary;
  assert(
    codeqlConfigSummary &&
      typeof codeqlConfigSummary === 'object' &&
      !Array.isArray(codeqlConfigSummary) &&
      Object.keys(codeqlConfigSummary).length > 0,
    'Actual Python CodeQL config summary is absent'
  );
  const sources = [];
  for (const invocation of run.invocations) {
    const notes = invocation.toolExecutionNotifications || [];
    assert(Array.isArray(notes), 'Malformed Python execution diagnostics');
    for (const note of notes) {
      if (note.descriptor?.id !== 'py/diagnostics/successfully-extracted-files')
        continue;
      assert(
        Array.isArray(note.locations) && note.locations.length > 0,
        'Python extraction diagnostic has no file locations'
      );
      for (const location of note.locations) {
        const uri = location.physicalLocation?.artifactLocation?.uri;
        assert(
          typeof uri === 'string' && uri,
          'Malformed successful Python extraction URI'
        );
        sources.push(uri);
      }
    }
  }
  const successfulExtractionFiles = [...new Set(sources)].sort();
  assert(
    successfulExtractionFiles.length > 0,
    'Actual Python successful extraction inventory is absent'
  );
  const results = run.results
    .map(resultIdentity)
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return {
    tool: run.tool.driver.semanticVersion,
    toolComponents,
    codeqlConfigSummary: normalized(codeqlConfigSummary),
    successfulExtractionFiles,
    ruleIds,
    rawResultCount: run.results.length,
    results,
    completeNonOverlay: true,
  };
}

function verifyPythonScannerProducerArchive(
  files,
  read,
  { sha, tree, producerRun, git, sourceRole = 'final' } = {}
) {
  archiveInventory(files);
  const expected = producerIdentity({
    sha,
    tree,
    producerRun,
    git,
    sourceRole,
  });
  assert.equal(typeof read, 'function', 'Python archive reader is absent');
  const captured = new Map(
    archiveFiles.map((name) => [name, Buffer.from(read(name))])
  );
  const rawRecords = Object.fromEntries(
    archiveFiles.map((name) => [name, sha256(captured.get(name))])
  );
  const checked = analysis(JSON.parse(captured.get('python.sarif')));
  const before = JSON.parse(captured.get('source-scope-before.json'));
  const after = JSON.parse(captured.get('source-scope-after.json'));
  exactFields(before, scopeFields, 'Python source scope fields differ');
  assert.deepEqual(
    after,
    before,
    'Python source/scope changed across analysis'
  );
  assert(
    before.schema === 'agijobsv0/codeql-python-scope/1' &&
      before.source === sha &&
      before.tree === tree &&
      before.run === producerRun.id &&
      before.attempt === producerRun.run_attempt &&
      before.event === 'push' &&
      before.ref === 'refs/heads/' + producerRun.head_branch &&
      before.actualExtractionRequiresSARIF === true,
    'Python source scope differs from the authenticated producer'
  );
  const source = parseTree(git('ls-tree', '-rz', sha));
  for (const prefix of ['config', 'workflow']) {
    const name = expected[prefix + 'Path'];
    const bytes = Buffer.from(git('show', sha + ':' + name));
    assert.deepEqual(
      source.get(name),
      { mode: '100644', blob: expected[prefix + 'Blob'] },
      'Python policy/workflow Git blob differs'
    );
    assert.equal(
      sha256(bytes),
      expected[prefix + 'Sha256'],
      'Python policy/workflow bytes differ'
    );
    assert.equal(
      before[prefix + 'Path'],
      name,
      'Python source policy path differs'
    );
    assert.equal(
      before[prefix + 'Sha256'],
      expected[prefix + 'Sha256'],
      'Python source policy digest differs'
    );
  }
  const requiredExtractedFiles = expectedPythonSources(git, sha);
  assert(
    requiredExtractedFiles.length > 0 &&
      sentinelFiles.every((name) => requiredExtractedFiles.includes(name)),
    'Mandatory Python receiver source is absent from immutable Git inventory'
  );
  assert.deepEqual(
    before.requiredSentinelFiles,
    sentinelFiles,
    'Python receiver sentinel inventory differs'
  );
  assert.deepEqual(
    before.requiredExtractedFiles,
    requiredExtractedFiles,
    'Python mandatory extraction inventory differs'
  );
  assert(
    requiredExtractedFiles.every((name) =>
      checked.successfulExtractionFiles.includes(name)
    ),
    'Python scanner did not actually extract every mandatory source file'
  );
  const record = JSON.parse(captured.get('source-extraction.json'));
  exactFields(
    record,
    extractionFields,
    'Python extraction record fields differ'
  );
  assert.equal(record.schema, 'agijobsv0/codeql-python-extraction/1');
  for (const name of [
    'source',
    'tree',
    'run',
    'attempt',
    'event',
    'ref',
    'configPath',
    'configSha256',
    'workflowPath',
    'workflowSha256',
  ])
    assert.deepEqual(
      record[name],
      before[name],
      'Python extraction source identity differs: ' + name
    );
  assert.equal(
    record.sarifSha256,
    rawRecords['python.sarif'],
    'Python raw SARIF digest differs'
  );
  assert.deepEqual(record.requiredSentinelFiles, sentinelFiles);
  assert.deepEqual(record.requiredExtractedFiles, requiredExtractedFiles);
  assert.deepEqual(
    record.missingRequiredExtractedFiles,
    [],
    'Python extraction is missing mandatory source'
  );
  assert.deepEqual(
    record.successfulExtractionFiles,
    checked.successfulExtractionFiles,
    'Retained Python extraction differs from raw diagnostics'
  );
  assert.deepEqual(
    record.ruleIds,
    checked.ruleIds,
    'Retained Python rule inventory differs from raw report'
  );
  assert.equal(
    record.rawResultCount,
    checked.rawResultCount,
    'Python raw result multiplicity differs'
  );
  assert.equal(
    record.resultDisposition,
    'REQUIRES_INDEPENDENT_FINAL_SOURCE_REVIEW'
  );
  return {
    ...checked,
    requiredExtractedFiles,
    producer: {
      source: sha,
      tree,
      runId: producerRun.id,
      runAttempt: producerRun.run_attempt,
      configPath: expected.configPath,
      configSha256: expected.configSha256,
      workflowPath: expected.workflowPath,
      workflowSha256: expected.workflowSha256,
      sarifSha256: rawRecords['python.sarif'],
      rawRecords,
    },
  };
}

function references(value, message) {
  assert(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === 'string' && item.trim()),
    message
  );
}
function verifyPythonScannerArchive(files, read, options = {}) {
  archiveInventory(files);
  const {
    sha,
    tree,
    producerRun,
    git,
    artifact,
    archiveSha256,
    sourceRole = 'final',
  } = options;
  const expected = producerIdentity({
    sha,
    tree,
    producerRun,
    git,
    sourceRole,
  });
  assert(
    hashPattern.test(archiveSha256 || ''),
    'Actual Python archive SHA256 is required'
  );
  const artifactName = `python-codeql-security-report-${sha}-${producerRun.id}-${producerRun.run_attempt}`;
  validateProducer({
    artifact,
    run: producerRun,
    sha,
    workflow: expected.workflowPath,
    name: artifactName,
    sourceRole,
  });
  assert.equal(
    artifact.digest,
    'sha256:' + archiveSha256,
    'Python archive bytes differ from authenticated artifact digest'
  );
  assert.equal(typeof read, 'function', 'Python archive reader is absent');
  const captured = new Map(
    archiveFiles.map((name) => [name, Buffer.from(read(name))])
  );
  const checked = verifyPythonScannerProducerArchive(
    files,
    (name) => captured.get(name),
    options
  );
  const review =
    options.review === undefined ? profile.pythonScannerReview : options.review;
  exactFields(
    review,
    reviewFields,
    'Python scan requires a complete independent final-source review'
  );
  assert.equal(
    review.schema,
    'agijobsv0/codeql-python-review/1',
    'Python review schema differs'
  );
  verifyPythonScannerReviewBinding({ sha, review, git });
  for (const [value, label] of [
    [review.producerRunId, 'review producer run'],
    [review.producerRunAttempt, 'review producer attempt'],
    [review.artifactId, 'review artifact'],
  ])
    positive(value, label);
  assert(
    hashPattern.test(review.archiveSha256 || ''),
    'Python review archive digest is absent'
  );
  assert.equal(
    review.artifactName,
    `python-codeql-security-report-${review.sourceCommit}-${review.producerRunId}-${review.producerRunAttempt}`,
    'Python review artifact identity differs'
  );
  exactFields(
    review.rawRecords,
    archiveFiles,
    'Python review must retain all four raw record digests'
  );
  for (const name of archiveFiles)
    assert(
      hashPattern.test(review.rawRecords[name] || ''),
      'Python review raw record digest is absent'
    );
  if (review.sourceCommit === sha) {
    assert.equal(review.producerRunId, producerRun.id);
    assert.equal(review.producerRunAttempt, producerRun.run_attempt);
    assert.equal(review.artifactId, artifact.id);
    assert.equal(review.artifactName, artifact.name);
    assert.equal(review.archiveSha256, archiveSha256);
    assert.deepEqual(
      review.rawRecords,
      checked.producer.rawRecords,
      'Current Python raw records differ from the reviewed records'
    );
  }
  for (const field of [
    'toolComponents',
    'codeqlConfigSummary',
    'successfulExtractionFiles',
    'requiredExtractedFiles',
    'ruleIds',
    'rawResultCount',
  ])
    assert.deepEqual(
      review[field],
      checked[field],
      'Python scan differs from the complete independently reviewed ' + field
    );
  assert(
    Array.isArray(review.results),
    'Python reviewed result inventory is absent'
  );
  const reviewedResults = review.results
    .map((item) => {
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
        ],
        'Python retained result disposition fields differ'
      );
      assert(
        item.disposition === 'Demonstrably false positive' &&
          typeof item.justification === 'string' &&
          item.justification.trim() &&
          typeof item.ruleId === 'string' &&
          item.ruleId &&
          typeof item.path === 'string' &&
          item.path &&
          item.region &&
          typeof item.region === 'object' &&
          !Array.isArray(item.region) &&
          hashPattern.test(item.resultSha256 || ''),
        'Every retained Python result requires a complete false-positive disposition'
      );
      references(
        item.regressionEvidence,
        'Each retained Python result requires actual regression evidence references'
      );
      return {
        ruleId: item.ruleId,
        path: item.path,
        region: item.region,
        resultSha256: item.resultSha256,
      };
    })
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
  assert.deepEqual(
    reviewedResults,
    checked.results,
    'Python raw result multiset differs from the complete reviewed inventory'
  );
  references(
    review.reviewEvidence,
    'Independent Python final-source review evidence references are absent'
  );
  return {
    ...checked,
    producer: {
      ...checked.producer,
      artifactId: artifact.id,
      artifactName: artifact.name,
      archiveSha256,
    },
    reviewSource: review.sourceCommit,
    reviewTree: review.tree,
    reviewEvidence: review.reviewEvidence,
    reviewedProducer: {
      source: review.sourceCommit,
      tree: review.tree,
      runId: review.producerRunId,
      runAttempt: review.producerRunAttempt,
      artifactId: review.artifactId,
      artifactName: review.artifactName,
      archiveSha256: review.archiveSha256,
      rawRecords: review.rawRecords,
    },
  };
}

module.exports = {
  expectedPythonSources,
  verifyPythonScannerProducerArchive,
  verifyPythonScannerArchive,
  verifyPythonScannerReviewBinding,
};
