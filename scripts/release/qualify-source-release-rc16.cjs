'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const historical = require('./qualify-source-release.cjs');
const {
  profile,
  verifySourceScope,
  verifyPublicationReview,
  parseTree,
} = require('./source-profile-rc16.cjs');
const {
  assertPinnedAlphaCheckout,
} = require('../../integrations/alpha-agent/pinned-alpha-checkout.cjs');

const ownPath = '.github/workflows/source-release-rc16.yml';
const requiredPaths = [
  ...new Set([
    ...historical.requiredPaths,
    '.github/workflows/security-remediation.yml',
    '.github/workflows/transformational-compatibility.yml',
    '.github/workflows/static-analysis-python-integrations.yml',
  ]),
];
const requiredChecks = [
  ...new Set([
    ...historical.requiredChecks,
    'CodeQL analysis',
    'Inherited security boundaries and browser regressions',
    'Pinned native transformation compatibility',
    'Python integration CodeQL analysis',
  ]),
];
const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
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

function authenticCodeQL(check, sha) {
  return (
    check.head_sha === sha &&
    check.name === 'CodeQL' &&
    check.app?.id === 57789 &&
    check.app.slug === 'github-advanced-security' &&
    check.app.owner?.id === 9919
  );
}

function evaluate(runs, checks, sha) {
  const latest = new Map(),
    failures = [],
    pending = [];
  for (const run of runs) {
    if (
      run.head_sha !== sha ||
      run.head_branch !== 'main' ||
      run.event !== 'push' ||
      run.path === ownPath
    )
      continue;
    const prior = latest.get(run.path);
    if (
      !prior ||
      run.run_number > prior.run_number ||
      (run.run_number === prior.run_number &&
        run.run_attempt > prior.run_attempt)
    )
      latest.set(run.path, run);
  }
  for (const file of requiredPaths)
    if (!latest.has(file)) pending.push(file + ': missing');
  for (const run of latest.values()) {
    if (run.status !== 'completed') pending.push(run.path + ': ' + run.status);
    else if (run.conclusion !== 'success')
      failures.push(run.path + ': ' + run.conclusion);
  }
  const trusted = checks.filter(
    (check) =>
      check.head_sha === sha &&
      check.app?.id === 15368 &&
      check.app.slug === 'github-actions'
  );
  for (const check of trusted) {
    if (check.name === 'Publish qualified rc.16 source prerelease') continue;
    if (check.status !== 'completed')
      pending.push(check.name + ': ' + check.status);
    else if (!['success', 'skipped', 'neutral'].includes(check.conclusion))
      failures.push(check.name + ': ' + check.conclusion);
  }
  for (const name of requiredChecks) {
    const matching = trusted.filter((check) => check.name === name);
    if (!matching.length) pending.push(name + ': missing');
    for (const check of matching) {
      if (check.status !== 'completed')
        pending.push(name + ': ' + check.status);
      else if (check.conclusion !== 'success')
        failures.push(name + ': ' + check.conclusion);
    }
  }
  const codeql = checks.filter((check) => authenticCodeQL(check, sha));
  if (!codeql.length)
    pending.push('GitHub Advanced Security CodeQL result: missing');
  for (const check of codeql) {
    if (check.status !== 'completed')
      pending.push('CodeQL result: ' + check.status);
    else if (check.conclusion !== 'success')
      failures.push('CodeQL result: ' + check.conclusion);
  }
  return {
    ready: !failures.length && !pending.length,
    failures,
    pending,
    workflows: [...latest.values()],
    codeql,
  };
}

function validateProducer({ artifact, run, sha, workflow, name }) {
  assert(/^[a-f0-9]{40}$/.test(sha), 'Invalid evidence source identity');
  for (const value of [run?.id, run?.run_attempt, artifact?.id])
    assert(
      Number.isSafeInteger(value) && value > 0,
      'Invalid evidence producer identity'
    );
  assert(
    run.head_sha === sha &&
      run.path === workflow &&
      run.event === 'push' &&
      run.head_branch === 'main' &&
      run.repository?.full_name === 'MontrealAI/AGIJobsv0' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'Evidence producer must be the successful exact-main push'
  );
  assert(
    artifact.name === name &&
      artifact.expired === false &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.head_sha === sha &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest),
    'Evidence artifact identity mismatch'
  );
}

function extracted(run) {
  return [
    ...new Set(
      (run.invocations || []).flatMap((invocation) =>
        (invocation.toolExecutionNotifications || [])
          .filter(
            (note) =>
              note.descriptor?.id ===
              'js/diagnostics/successfully-extracted-files'
          )
          .flatMap((note) =>
            (note.locations || []).map(
              (location) => location.physicalLocation?.artifactLocation?.uri
            )
          )
      )
    ),
  ].sort();
}
function resultIdentity(result) {
  const location = result.locations?.[0]?.physicalLocation;
  assert(
    typeof result.ruleId === 'string' &&
      location?.artifactLocation?.uri &&
      location.region,
    'Malformed scanner result'
  );
  return {
    ruleId: result.ruleId,
    path: location.artifactLocation.uri,
    region: location.region,
    resultSha256: sha256(canonical(result)),
  };
}

// Review records are installed after their scan, so both language slots may be
// added together or in either order. All other source/profile bytes stay fixed.
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
        item.disposition === 'Demonstrably false positive' &&
        typeof item.justification === 'string' &&
        item.justification.trim() &&
        references(item.regressionEvidence),
      'Every retained scanner result needs a complete disposition'
    );
  }
  if (python) {
    assert.equal(review.schema, 'agijobsv0/codeql-python-review/1');
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

function verifyScannerReviewBinding(options) {
  return verifyScannerReviewInstallBinding({
    ...options,
    field: 'scannerReview',
  });
}

function verifyScannerAnalysis(
  document,
  { baseline, requiredSources = profile.scannerRequiredPaths } = {}
) {
  assert(
    document.version === '2.1.0' && document.runs?.length === 1,
    'Exactly one SARIF run is required'
  );
  const run = document.runs[0];
  assert(
    run.tool?.driver?.name === 'CodeQL' &&
      run.invocations?.every((item) => item.executionSuccessful === true),
    'Scanner did not complete successfully'
  );
  assert(
    run.invocations.some((item) =>
      item.toolExecutionNotifications?.some(
        (note) => note.descriptor?.id === 'codeql-action/overlay-disabled'
      )
    ),
    'A complete non-overlay scan is required'
  );
  assert(
    baseline?.tool?.driver?.semanticVersion === run.tool.driver.semanticVersion,
    'Scanner tool identity changed'
  );
  const tools = (value) =>
    [value.tool.driver, ...(value.tool.extensions || [])].map((item) => ({
      name: item.name,
      semanticVersion: item.semanticVersion || null,
      rules: item.rules || [],
    }));
  assert.deepEqual(
    tools(run),
    tools(baseline),
    'Scanner query/rule inventory changed'
  );
  assert.deepEqual(
    run.properties?.codeqlConfigSummary,
    baseline.properties?.codeqlConfigSummary,
    'Scanner query suites changed'
  );
  const sources = extracted(run),
    oldSources = extracted(baseline);
  assert(
    oldSources.length > 0 && oldSources.every((file) => sources.includes(file)),
    'Scanner lost baseline source coverage'
  );
  assert(
    Array.isArray(requiredSources) &&
      requiredSources.length > 0 &&
      requiredSources.every((file) => sources.includes(file)),
    'Scanner is missing integration source extraction'
  );
  const actual = (run.results || [])
    .map(resultIdentity)
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return { run, sources, actual };
}

function verifyScannerResults(
  document,
  {
    baseline,
    review = profile.scannerReview,
    requiredSources = profile.scannerRequiredPaths,
    sha,
    git,
  } = {}
) {
  const { run, sources, actual } = verifyScannerAnalysis(document, {
    baseline,
    requiredSources,
  });
  assert(
    review &&
      Array.isArray(review.results) &&
      review.reviewEvidence &&
      /^[a-f0-9]{40}$/.test(review.sourceCommit || ''),
    'Current scanner results require explicit source-bound review'
  );
  verifyScannerReviewBinding({ sha, review, git });
  const reviewed = review.results
    .map((item) => {
      assert(
        item.disposition === 'Demonstrably false positive' &&
          typeof item.justification === 'string' &&
          item.justification.trim() &&
          item.regressionEvidence?.length,
        'Every retained scanner result needs a complete disposition'
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
    actual,
    reviewed,
    'Current scanner results differ from the complete reviewed inventory'
  );
  return {
    tool: run.tool.driver.semanticVersion,
    extractedFiles: sources.length,
    results: actual,
    reviewSource: review.sourceCommit,
    reviewEvidence: review.reviewEvidence,
    completeNonOverlay: true,
  };
}

function scannerArchiveInventory(files) {
  assert.deepEqual(
    [...files].sort(),
    profile.scannerPolicy.archiveFiles,
    'Scanner archive inventory mismatch'
  );
}
function exactFields(value, fields, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), message);
}
function expectedReceiverSources(git, sha) {
  const source = parseTree(git('ls-tree', '-rz', sha));
  const omittedDirectory =
    /\/(?:node_modules|dist|\.next|coverage|reports|data|deploy|deployment|deployments|test)\//;
  const omittedSubgraph = /\/subgraph\/(?:generated|build|node_modules)\//;
  return [...source.keys()]
    .filter(
      (file) =>
        /^(?:integrations\/alpha-agent|website\/assets)\//.test(file) &&
        /\.(?:[cm]?[jt]sx?)$/i.test(file) &&
        !/\.d\.[cm]?ts$/i.test(file) &&
        !omittedDirectory.test(file) &&
        !omittedSubgraph.test(file)
    )
    .sort();
}
function verifyScannerProducerArchive(
  files,
  read,
  {
    baseline,
    requiredSources = profile.scannerRequiredPaths,
    sha,
    tree,
    producerRun,
    git,
  } = {}
) {
  scannerArchiveInventory(files);
  assert(
    typeof git === 'function' &&
      /^[a-f0-9]{40}$/.test(sha || '') &&
      /^[a-f0-9]{40}$/.test(tree || ''),
    'Scanner archive requires external source/tree identities'
  );
  assert.equal(
    git('rev-parse', sha + '^{tree}').trim(),
    tree,
    'Scanner archive tree differs from release Git source'
  );
  assert(
    producerRun &&
      Number.isSafeInteger(producerRun.id) &&
      producerRun.id > 0 &&
      Number.isSafeInteger(producerRun.run_attempt) &&
      producerRun.run_attempt > 0 &&
      producerRun.head_sha === sha &&
      producerRun.path === profile.scannerPolicy.workflowPath &&
      producerRun.event === 'push' &&
      producerRun.head_branch === 'main' &&
      producerRun.repository?.full_name === 'MontrealAI/AGIJobsv0' &&
      producerRun.status === 'completed' &&
      producerRun.conclusion === 'success',
    'Scanner sidecars require the authenticated successful exact-main producer'
  );
  const raw = Buffer.from(read('javascript.sarif'));
  const document = JSON.parse(raw);
  const { run, sources, actual } = verifyScannerAnalysis(document, {
    baseline,
    requiredSources,
  });
  assert(
    sources.every((file) => typeof file === 'string' && file),
    'Malformed successful extraction diagnostic'
  );
  const before = JSON.parse(read('source-scope-before.json'));
  const after = JSON.parse(read('source-scope-after.json'));
  exactFields(
    before,
    [
      'schema',
      'source',
      'tree',
      'run',
      'attempt',
      'event',
      'ref',
      'historicalConfigSha256',
      'configSha256',
      'staticAdmittedBefore',
      'staticAdditionalAdmitted',
      'allPreviousPathsRetained',
      'integrationClosureAdmitted',
      'browserClosureAdmitted',
      'requiredExtractedFiles',
      'actualExtractionRequiresSARIF',
    ],
    'Scanner source scope fields differ'
  );
  assert.deepEqual(
    after,
    before,
    'Scanner source/scope changed across analysis'
  );
  assert(
    before.schema === 'agijobsv0/codeql-scope/2' &&
      before.source === sha &&
      before.tree === tree &&
      before.run === producerRun.id &&
      before.attempt === producerRun.run_attempt &&
      before.event === 'push' &&
      before.ref === 'refs/heads/main',
    'Scanner source scope identity differs from authenticated producer'
  );
  const policy = profile.scannerPolicy;
  for (const [name, expected] of [
    [policy.historicalConfigPath, policy.historicalConfigSha256],
    [policy.configPath, policy.configSha256],
    [policy.workflowPath, policy.workflowSha256],
  ])
    assert.equal(
      sha256(git('show', sha + ':' + name)),
      expected,
      'Scanner policy/workflow bytes differ from reviewed source: ' + name
    );
  assert.equal(before.historicalConfigSha256, policy.historicalConfigSha256);
  assert.equal(before.configSha256, policy.configSha256);
  assert(
    before.allPreviousPathsRetained === true &&
      before.integrationClosureAdmitted === true &&
      before.browserClosureAdmitted === true &&
      before.actualExtractionRequiresSARIF === true &&
      Number.isSafeInteger(before.staticAdmittedBefore) &&
      before.staticAdmittedBefore > 0 &&
      Number.isSafeInteger(before.staticAdditionalAdmitted) &&
      before.staticAdditionalAdmitted >= 0,
    'Scanner static policy proof is incomplete'
  );
  const expectedSources = expectedReceiverSources(git, sha);
  assert(
    expectedSources.length > 0 &&
      requiredSources.every((file) => expectedSources.includes(file)),
    'Required receiver source is absent from release Git inventory'
  );
  assert.deepEqual(
    before.requiredExtractedFiles,
    expectedSources,
    'Scanner required extraction inventory differs from release Git source'
  );
  assert(
    expectedSources.every((file) => sources.includes(file)),
    'Scanner is missing actual integration/browser extraction'
  );
  const record = JSON.parse(read('source-extraction.json'));
  exactFields(
    record,
    [
      'schema',
      'source',
      'tree',
      'run',
      'attempt',
      'event',
      'ref',
      'configSha256',
      'sarifSha256',
      'successfulExtractionFiles',
      'requiredExtractedFiles',
      'missingRequiredExtractedFiles',
      'ruleIds',
      'rawResultCount',
      'resultDisposition',
    ],
    'Scanner extraction record fields differ'
  );
  assert(
    record.schema === 'agijobsv0/codeql-extraction/1' &&
      record.source === sha &&
      record.tree === tree &&
      record.run === producerRun.id &&
      record.attempt === producerRun.run_attempt &&
      record.event === 'push' &&
      record.ref === 'refs/heads/main' &&
      record.configSha256 === policy.configSha256 &&
      record.resultDisposition === 'REQUIRES_INDEPENDENT_FINAL_SOURCE_REVIEW',
    'Scanner extraction record identity or review state differs'
  );
  assert.equal(
    record.sarifSha256,
    sha256(raw),
    'Raw SARIF digest differs from extraction proof'
  );
  assert.deepEqual(
    record.successfulExtractionFiles,
    sources,
    'Retained extraction inventory differs from raw SARIF'
  );
  assert.deepEqual(record.requiredExtractedFiles, expectedSources);
  assert.deepEqual(
    record.missingRequiredExtractedFiles,
    [],
    'Scanner extraction has missing required source'
  );
  const rules = [
    ...new Set(
      [run.tool.driver, ...(run.tool.extensions || [])].flatMap((component) =>
        (component.rules || []).map((rule) => rule.id)
      )
    ),
  ].sort();
  assert.deepEqual(
    record.ruleIds,
    rules,
    'Scanner extraction rule inventory differs from raw SARIF'
  );
  assert.equal(
    record.rawResultCount,
    (run.results || []).length,
    'Scanner extraction raw result count differs'
  );
  return {
    tool: run.tool.driver.semanticVersion,
    extractedFiles: sources.length,
    results: actual,
    completeNonOverlay: true,
    producer: {
      source: sha,
      tree,
      runId: producerRun.id,
      runAttempt: producerRun.run_attempt,
      configSha256: policy.configSha256,
      sarifSha256: sha256(raw),
      requiredExtractedFiles: expectedSources,
      successfulExtractionFiles: sources,
      ruleIds: rules,
      rawResultCount: record.rawResultCount,
    },
  };
}
function verifyScannerArchive(files, read, options = {}) {
  scannerArchiveInventory(files);
  const captured = new Map(
    profile.scannerPolicy.archiveFiles.map((name) => [
      name,
      Buffer.from(read(name)),
    ])
  );
  const checked = verifyScannerProducerArchive(
    files,
    (name) => captured.get(name),
    options
  );
  const reviewed = verifyScannerResults(
    JSON.parse(captured.get('javascript.sarif')),
    options
  );
  return { ...checked, ...reviewed };
}

async function readPages(resource, key, token, fetchImpl = fetch) {
  const values = [];
  for (let page = 1; page <= 20; page++) {
    const response = await fetchImpl(
      `https://api.github.com/repos/MontrealAI/AGIJobsv0/${resource}&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      }
    );
    assert(response.ok, 'Cannot authenticate GitHub qualification evidence');
    const data = await response.json();
    assert(Array.isArray(data[key]), 'Malformed qualification inventory');
    values.push(...data[key]);
    if (data[key].length < 100) return values;
  }
  throw Error('Refusing truncated qualification inventory');
}

async function main() {
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
  } = process.env;
  assert(
    repository === 'MontrealAI/AGIJobsv0' &&
      /^[a-f0-9]{40}$/.test(sha || '') &&
      token &&
      process.env.GITHUB_EVENT_NAME === 'push' &&
      process.env.GITHUB_REF === 'refs/heads/main',
    'Invalid exact-main qualification identity'
  );
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
    ),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
  };
  const git = (...args) =>
    execFileSync(
      'git',
      ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args],
      { encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 }
    );
  assert.equal(
    git('rev-parse', 'HEAD').trim(),
    sha,
    'Checkout/source mismatch'
  );
  assertPinnedAlphaCheckout(process.cwd(), sha);
  const sourceScope = verifySourceScope({
    git,
    sha,
    version: JSON.parse(fs.readFileSync('package.json')).version,
    lock: JSON.parse(fs.readFileSync('package-lock.json')),
    policy: JSON.parse(fs.readFileSync('config/solidity-compiler.json')),
  });
  verifyPublicationReview(profile);
  const deadline = Date.now() + 85 * 60000;
  while (Date.now() < deadline) {
    const [runs, checks] = await Promise.all([
      readPages(`actions/runs?head_sha=${sha}`, 'workflow_runs', token),
      readPages(`commits/${sha}/check-runs?filter=latest`, 'check_runs', token),
    ]);
    const state = evaluate(runs, checks, sha);
    if (state.failures.length)
      throw Error('Source release refused: ' + state.failures.join('; '));
    if (state.ready) {
      assertPinnedAlphaCheckout(process.cwd(), sha);
      const directory = path.resolve('reports/source-release-rc16');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'provenance.json'),
        JSON.stringify(
          {
            schema: 'agijobsv0/source-release-provenance/2',
            repository,
            tag: profile.tag,
            sha,
            tree: git('rev-parse', 'HEAD^{tree}').trim(),
            recordedAt: new Date().toISOString(),
            productionApproved: false,
            artifactSigning: 'unsigned source and evidence only',
            sourceScope,
            deploymentSnapshots: [
              historical.verifyDeploymentSnapshot(
                fs.readFileSync(historical.deploymentSnapshot.localPath)
              ),
            ],
            producer: {
              workflow: ownPath,
              runId: process.env.GITHUB_RUN_ID,
              runAttempt: process.env.GITHUB_RUN_ATTEMPT,
            },
            requiredPaths,
            requiredChecks,
            workflows: state.workflows,
            checks,
            authenticCodeQL: state.codeql,
          },
          null,
          2
        ) + '\n',
        { flag: 'wx' }
      );
      console.log('Exact merged rc.16 candidate qualified: ' + sha);
      return;
    }
    console.log('Waiting for exact merged SHA: ' + state.pending.join('; '));
    await delay(30000);
  }
  throw Error('Exact source qualification timed out; no publication');
}

module.exports = {
  ...historical,
  verifySourceScope,
  compilerSourceBaseline: profile.compilerSourceBaseline,
  ownPath,
  requiredPaths,
  requiredChecks,
  evaluate,
  authenticCodeQL,
  validateProducer,
  verifyScannerArchive,
  verifyScannerProducerArchive,
  verifyScannerResults,
  expectedReceiverSources,
  verifyScannerReviewBinding,
  verifyScannerReviewInstallBinding,
  resultIdentity,
  extracted,
  readPages,
  sha256,
  canonical,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
