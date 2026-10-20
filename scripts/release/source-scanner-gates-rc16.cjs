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

const {
  verifyScannerReviewInstallBinding,
  validateScannerReviewMetadata,
  assertNoScannerErrorDiagnostics,
  javascriptQualityPolicy,
  validateJavascriptQualityMetadata,
} = require('./source-scanner-review-bindings-rc16.cjs');

const serviceEvidence = require('./source-codeql-service-rc16.cjs');

const ownPath = '.github/workflows/source-release-rc16.yml';
const requiredPaths = [
  ...new Set([
    ...historical.requiredPaths,
    '.github/workflows/security-remediation.yml',
    '.github/workflows/transformational-compatibility.yml',
  ]),
];
const requiredChecks = [
  ...new Set([
    ...historical.requiredChecks,
    'CodeQL analysis',
    'Inherited security boundaries and browser regressions',
    'Pinned native transformation compatibility',
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

function evaluate(runs, checks, sha, processedCodeql) {
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
  if (processedCodeql === undefined) {
    pending.push('Processed exact-main CodeQL service evidence: missing');
  } else {
    try {
      serviceEvidence.assertFinalServices(processedCodeql, { sha });
    } catch {
      failures.push('Processed exact-main CodeQL service evidence: invalid');
    }
  }
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
    processedCodeql,
  };
}

function validateProducer({
  artifact,
  run,
  sha,
  workflow,
  name,
  sourceRole = 'final',
}) {
  assert(/^[a-f0-9]{40}$/.test(sha), 'Invalid evidence source identity');
  assert(
    ['final', 'reviewed'].includes(sourceRole),
    'Invalid evidence source role'
  );
  const branch = run?.head_branch;
  const reviewedPolicy =
    workflow === profile.scannerPolicy.workflowPath
      ? profile.scannerPolicy.reviewedProducer
      : workflow === profile.pythonScannerPolicy.workflowPath
        ? profile.pythonScannerPolicy.reviewedProducer
        : null;
  const reviewedBranch =
    reviewedPolicy?.event === 'push' &&
    reviewedPolicy.ref === 'refs/heads/' + reviewedPolicy.headBranch &&
    branch === reviewedPolicy.headBranch &&
    run?.event === reviewedPolicy.event;
  for (const value of [run?.id, run?.run_attempt, artifact?.id])
    assert(
      Number.isSafeInteger(value) && value > 0,
      'Invalid evidence producer identity'
    );
  assert(
    run.head_sha === sha &&
      run.path === workflow &&
      run.event === 'push' &&
      (sourceRole === 'reviewed' ? reviewedBranch : branch === 'main') &&
      run.repository?.full_name === 'MontrealAI/AGIJobsv0' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'Evidence producer must be the successful exact-source push for its role'
  );
  assert(
    artifact.name === name &&
      artifact.expired === false &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.head_sha === sha &&
      artifact.workflow_run.head_branch === branch &&
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

function verifyScannerReviewBinding(options) {
  return require('./qualify-source-release-rc16.cjs').verifyScannerReviewInstallBinding(
    {
      ...options,
      field: 'scannerReview',
    }
  );
}

function verifyScannerAnalysis(
  document,
  { baseline, requiredSources = profile.scannerReceiverPaths } = {}
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
  assertNoScannerErrorDiagnostics(run.invocations);
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
    requiredSources = profile.scannerReceiverPaths,
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
        (item.disposition === 'Demonstrably false positive' ||
          item.disposition === javascriptQualityPolicy.disposition) &&
          typeof item.justification === 'string' &&
          item.justification.trim() &&
          item.regressionEvidence?.length,
        'Every retained scanner result needs a complete disposition'
      );
      if (item.disposition === javascriptQualityPolicy.disposition)
        verifyAcknowledgedNonsecurityQuality(item, {
          run,
          baseline,
          review,
          git,
        });
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

function verifyAcknowledgedNonsecurityQuality(
  item,
  { run, baseline, review, git } = {}
) {
  assert.deepEqual(
    profile.scannerPolicy.qualityReview,
    javascriptQualityPolicy,
    'Nonsecurity quality review policy differs'
  );
  assert.equal(
    typeof git,
    'function',
    'Quality review requires immutable source bytes'
  );
  const quality = validateJavascriptQualityMetadata(
    item,
    review?.sourceCommit,
    git
  );
  const matching = (run?.results || []).filter(
    (raw) => sha256(canonical(raw)) === item.resultSha256
  );
  assert(
    matching.length > 0,
    'Quality review does not bind an actual raw result'
  );
  for (const raw of matching) {
    assert.deepEqual(
      resultIdentity(raw),
      {
        ruleId: item.ruleId,
        path: item.path,
        region: item.region,
        resultSha256: item.resultSha256,
      },
      'Quality review full raw result identity differs'
    );
    const reference = raw.rule;
    assert(
      !Object.hasOwn(raw, 'ruleIndex'),
      'Quality result has an unsupported competing driver-rule reference'
    );
    exactFields(
      reference,
      ['id', 'index', 'toolComponent'],
      'Ambiguous quality rule reference'
    );
    exactFields(
      reference.toolComponent,
      ['index'],
      'Ambiguous quality query component reference'
    );
    assert(
      reference?.id === item.ruleId &&
        Number.isSafeInteger(reference.index) &&
        reference.index >= 0 &&
        Number.isSafeInteger(reference.toolComponent?.index) &&
        reference.toolComponent.index >= 0,
      'Quality result must identify its actual trusted query component and rule'
    );
    const index = reference.toolComponent.index;
    const component = run.tool?.extensions?.[index];
    const trusted = baseline?.tool?.extensions?.[index];
    assert(
      component?.name === 'codeql/javascript-queries' &&
        component.semanticVersion &&
        canonical(component) === canonical(trusted),
      'Quality query component differs from the trusted complete rule inventory'
    );
    const rule = component.rules?.[reference.index];
    assert(
      rule?.id === item.ruleId &&
        rule.name === item.ruleId &&
        rule.properties?.id === item.ruleId &&
        rule.properties.kind === 'problem' &&
        ['quality', 'maintainability', 'useless-code'].every((tag) =>
          rule.properties.tags?.includes(tag)
        ) &&
        !rule.properties.tags.some((tag) => /^security(?:\/|$)/i.test(tag)) &&
        !Object.hasOwn(rule.properties, 'security-severity'),
      'Quality rule is missing its trusted nonsecurity query metadata'
    );
    assert.equal(sha256(canonical(rule)), quality.ruleMetadataSha256);
    assert.equal(sha256(canonical(component)), quality.queryComponentSha256);
    assert.deepEqual(
      run.properties?.codeqlConfigSummary,
      baseline.properties?.codeqlConfigSummary,
      'Quality query selection differs from the trusted scanner configuration'
    );
    assert.equal(
      sha256(canonical(run.properties?.codeqlConfigSummary)),
      quality.codeqlConfigSummarySha256
    );
  }
  // The complete result multiset and independent source/result review remain
  // mandatory; this acknowledgement is never scanner or publication approval.
  return { metadataAcknowledgementOnly: true, productionApproved: false };
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
  const additional = profile.scannerRequiredPaths.filter(
    (file) => !/^(?:integrations\/alpha-agent|website\/assets)\//.test(file)
  );
  assert(
    additional.every((file) => source.has(file)),
    'Required release/scanner source is absent from immutable Git inventory'
  );
  const dynamic = [...source.keys()]
    .filter(
      (file) =>
        /^(?:integrations\/alpha-agent|website\/assets)\//.test(file) &&
        /\.(?:[cm]?[jt]sx?)$/i.test(file) &&
        !/\.d\.[cm]?ts$/i.test(file) &&
        !omittedDirectory.test(file) &&
        !omittedSubgraph.test(file)
    )
    .sort();
  return [...new Set([...dynamic, ...additional])].sort();
}
function verifyScannerProducerArchive(
  files,
  read,
  {
    baseline,
    requiredSources = profile.scannerReceiverPaths,
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
  verifyAcknowledgedNonsecurityQuality,
  expectedReceiverSources,
  verifyScannerReviewBinding,
  verifyScannerReviewInstallBinding,
  validateScannerReviewMetadata,
  assertNoScannerErrorDiagnostics,
  resultIdentity,
  extracted,
  readPages,
  sha256,
  canonical,
};

function verifyIntegratedScannerArchive({
  directory,
  sha,
  tree,
  producerRun,
  git,
}) {
  const zip = path.join(directory, 'codeql-evidence.zip');
  const files = execFileSync('unzip', ['-Z1', zip], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'))
    .sort();
  const read = (name) =>
    execFileSync('unzip', ['-p', zip, name], { maxBuffer: 32 * 1024 * 1024 });
  const baselinePath = path.resolve(
    __dirname,
    '../../docs/security/remediation-2026-10-19/baseline/fresh-codeql.zip'
  );
  const ledger = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../docs/security/remediation-2026-10-19/findings.json'
      )
    )
  );
  assert.equal(
    sha256(fs.readFileSync(baselinePath)),
    ledger.baseline.fresh.sha256,
    'Historical scanner baseline bytes changed'
  );
  const baseline = JSON.parse(
    execFileSync('unzip', ['-p', baselinePath, 'javascript.sarif'], {
      maxBuffer: 32 * 1024 * 1024,
    })
  ).runs[0];
  const options = {
    baseline,
    sha,
    tree,
    producerRun,
    git,
    requiredSources: profile.scannerReceiverPaths,
  };
  const current = verifyScannerArchive(files, read, options);
  const reviewedZip = path.join(directory, 'codeql-reviewed-evidence.zip');
  const reviewedFiles = execFileSync('unzip', ['-Z1', reviewedZip], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'))
    .sort();
  scannerArchiveInventory(reviewedFiles);
  // The publisher independently authenticates both S1/S2 archives before this
  // shared check. Bind both raw result multisets to the same installed S2
  // profile review; S1 itself need not have the final main-push producer shape.
  verifyScannerResults(
    JSON.parse(
      execFileSync('unzip', ['-p', reviewedZip, 'javascript.sarif'], {
        maxBuffer: 32 * 1024 * 1024,
      })
    ),
    options
  );
  return current;
}
module.exports.verifyIntegratedScannerArchive = verifyIntegratedScannerArchive;
