'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
  deploymentSnapshot,
  verifyDeploymentSnapshot,
  evaluateCodeql,
  historicalReviewedCodeql,
  verifyHistoricalReviewedCodeql,
  scannerReview,
  scannerReviewPath,
  scannerHistory,
  canonical,
  exactFields,
  verifyScannerReviewSource,
} = require('./qualify-source-release-rc16.cjs');

const {
  profile,
  verifySourceScope: verifySourceProfile,
  verifyPublicationReview,
} = require('./source-profile-rc16.cjs');
const {
  assertPinnedAlphaCheckout,
} = require('../../integrations/alpha-agent/pinned-alpha-checkout.cjs');
const nativeEvidence = require('./source-native-evidence-rc16.cjs');
const { releaseOutputDirectory } = nativeEvidence;
const serviceEvidence = require('./source-codeql-service-rc16.cjs');

const gitSource = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !name.startsWith('GIT_')
          )
        ),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_LAZY_FETCH: '1',
      },
    }
  );
const {
  verifyIntegratedScannerArchive,
  expectedReceiverSources,
} = require('./source-scanner-gates-rc16.cjs');

function expectedAssets(tag) {
  return [
    'SHA256SUMS.txt',
    'provenance.json',
    `${tag}-source.zip`,
    'ethereum-mainnet-2026-10-12.json',
    deploymentSnapshot.asset,
    'configuration-readback-2026-10-13.json',
    'mainnet-deployment-2026-10-12.md',
    'mainnet-deployment-2026-10-18.md',
    'mainnet-deployment-receipts-2026-10-18.json',
    'RELEASE_NOTES_SOURCE_RC17.md',
    'compiler-warnings-2026-10-13.md',
    'solidity-compiler.json',
    'deployment-addresses.mainnet.json',
    'compiler-evidence.zip',
    'compiler-provenance.json',
    'codeql-evidence.zip',
    'codeql-reviewed-evidence.zip',
    'codeql-provenance.json',
    'codeql-service-evidence.json',
    'python-codeql-evidence.zip',
    'python-codeql-reviewed-evidence.zip',
    'python-codeql-provenance.json',
    'source-profile-rc17.json',
    'native-compatibility.zip',
    'native-provenance.json',
  ].sort();
}

function reviewedCodeqlProof(proof) {
  if (
    proof?.sourceSha !== compilerSourceBaseline ||
    !Array.isArray(proof.checks) ||
    !proof.checks.length ||
    proof.checks.length > 2000 ||
    new Set(proof.checks.map((check) => check?.id)).size !==
      proof.checks.length ||
    !proof.checks.every(
      (check) =>
        Number.isSafeInteger(check?.id) &&
        check.id > 0 &&
        check.headSha === compilerSourceBaseline &&
        check.name === 'CodeQL' &&
        check.appId === 57789 &&
        check.appSlug === 'github-advanced-security' &&
        check.status === 'completed' &&
        check.conclusion === 'success' &&
        check.url === `https://github.com/MontrealAI/AGIJobsv0/runs/${check.id}`
    )
  )
    throw Error('Remote reviewed CodeQL result identity mismatch');
  return proof.checks;
}

function verifyJavaScriptAndNativeAssets({
  downloaded,
  directory,
  draft,
  sha,
  tree,
  tag,
  repository,
  compilerArtifact,
  compilerRun,
  recordedCodeqlChecks,
  latestCodeqlChecks,
  finalCodeqlChecks,
  historicalCodeqlCheck,
  processedCodeqlServices,
  scannerEvidence,
  nativeArtifact,
  nativeRun,
}) {
  const expected = expectedAssets(tag);
  const digest = (file) =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (
    JSON.stringify(fs.readdirSync(downloaded).sort()) !==
    JSON.stringify(expected)
  )
    throw Error('Remote asset inventory mismatch');
  const sums = fs
    .readFileSync(path.join(downloaded, 'SHA256SUMS.txt'), 'utf8')
    .trim()
    .split('\n');
  const seen = new Set();
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (
      !match ||
      match[2] === 'SHA256SUMS.txt' ||
      !expected.includes(match[2]) ||
      seen.has(match[2])
    )
      throw Error('Malformed remote checksum inventory');
    seen.add(match[2]);
    if (digest(path.join(downloaded, match[2])) !== match[1])
      throw Error(`Remote checksum mismatch: ${match[2]}`);
  }
  if (seen.size !== expected.length - 1)
    throw Error('Incomplete remote checksums');
  verifyDeploymentSnapshot(
    fs.readFileSync(path.join(downloaded, deploymentSnapshot.asset))
  );
  for (const name of expected) {
    if (
      !draft &&
      [
        'provenance.json',
        'SHA256SUMS.txt',
        'compiler-evidence.zip',
        'compiler-provenance.json',
      ].includes(name)
    )
      continue;
    if (
      digest(path.join(downloaded, name)) !== digest(path.join(directory, name))
    )
      throw Error(`Producer/readback mismatch: ${name}`);
  }
  const provenance = JSON.parse(
    fs.readFileSync(path.join(downloaded, 'provenance.json'), 'utf8')
  );
  if (
    provenance.sha !== sha ||
    provenance.tree !== tree ||
    provenance.tag !== tag ||
    provenance.repository !== repository ||
    provenance.productionApproved !== false ||
    provenance.producer?.workflow !==
      '.github/workflows/source-release-rc16.yml' ||
    provenance.sourceScope?.compilerSourceBaseline !== compilerSourceBaseline ||
    provenance.sourceScope?.evidenceBaseline !== evidenceBaseline ||
    provenance.sourceScope?.deployedSourceBaseline !== deployedSourceBaseline ||
    provenance.sourceScope?.compiler !== '0.8.37+commit.f401782d' ||
    JSON.stringify(provenance.deploymentSnapshots) !==
      JSON.stringify([deploymentSnapshot]) ||
    JSON.stringify(provenance.sourceScope?.preservedEvidencePaths) !==
      JSON.stringify(preservedEvidencePaths) ||
    JSON.stringify(provenance.sourceScope?.reviewedCompilerPaths) !==
      JSON.stringify(reviewedCompilerPaths)
  )
    throw Error('Remote provenance identity mismatch');
  const expectedScannerReview = scannerEvidence?.review || scannerReview;
  if (
    expectedScannerReview !== null &&
    (canonical(provenance.scannerReview) !== canonical(expectedScannerReview) ||
      canonical(provenance.reviewedSourceCodeql?.checks) !==
        canonical(expectedScannerReview.codeqlChecks))
  )
    throw Error('Downloaded scanner review or reviewed CodeQL IDs differ');
  const historicalProof = verifyHistoricalReviewedCodeql(historicalCodeqlCheck);
  if (
    canonical(provenance.historicalReviewedSourceCodeql) !==
    canonical(historicalProof)
  )
    throw Error(
      'Remote historical f2 Advanced Security evidence differs from authenticated readback'
    );
  const reviewedCodeql = provenance.reviewedSourceCodeql;
  const claimedChecks = reviewedCodeqlProof(reviewedCodeql);
  const recorded = evaluateCodeql(
    recordedCodeqlChecks || [],
    compilerSourceBaseline
  );
  const latest = evaluateCodeql(
    latestCodeqlChecks || [],
    compilerSourceBaseline
  );
  const final = evaluateCodeql(finalCodeqlChecks || [], sha, false);
  if (
    !Array.isArray(finalCodeqlChecks) ||
    !final.ready ||
    !recorded.ready ||
    !latest.ready ||
    recorded.checks.length !== claimedChecks.length ||
    !claimedChecks.every((claim) =>
      recorded.checks.some(
        (actual) =>
          Object.keys(claim).length === Object.keys(actual).length &&
          Object.entries(actual).every(([key, value]) => claim[key] === value)
      )
    )
  )
    throw Error(
      'Remote reviewed CodeQL result does not match authenticated GitHub checks'
    );
  verifyScannerEvidence({
    directory: downloaded,
    sha,
    proof: JSON.parse(
      fs.readFileSync(path.join(downloaded, 'codeql-provenance.json'))
    ),
    ...scannerEvidence,
  });
  const compiler = JSON.parse(
    fs.readFileSync(path.join(downloaded, 'compiler-provenance.json'))
  );
  const producer = provenance.workflows?.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  const zip = path.join(downloaded, 'compiler-evidence.zip');
  validateCompilerArtifact(provenance, compilerArtifact);
  if (
    compiler.schema !== 'agijobsv0/compiler-artifact-provenance/1' ||
    compiler.repository !== repository ||
    compiler.sha !== sha ||
    compiler.workflow !== producer?.path ||
    compiler.runId !== producer?.id ||
    compiler.runAttempt !== producer?.run_attempt ||
    compiler.artifactId !== compilerArtifact.id ||
    compiler.artifactName !== compilerArtifact.name ||
    compiler.githubDigest !== compilerArtifact.digest ||
    compiler.downloadedSha256 !== digest(zip) ||
    compiler.githubDigest !== `sha256:${digest(zip)}` ||
    compilerRun?.id !== producer?.id ||
    compilerRun?.run_attempt !== producer?.run_attempt ||
    compilerRun?.head_sha !== sha ||
    compilerRun?.path !== producer?.path ||
    compilerRun?.repository?.full_name !== repository ||
    compilerRun?.event !== 'push' ||
    compilerRun?.head_branch !== 'main' ||
    compilerRun?.status !== 'completed' ||
    compilerRun?.conclusion !== 'success'
  )
    throw Error('Remote compiler producer provenance mismatch');
  const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  const summary = verifyCompilerArchive(files, (name) =>
    execFileSync('unzip', ['-p', zip, name], {
      maxBuffer: 128 * 1024 * 1024,
    })
  );
  if (
    compiler.compiler !== summary.compiler ||
    compiler.contracts !== summary.contracts
  )
    throw Error('Remote compiler summary mismatch');
  if (
    canonical(
      JSON.parse(
        fs.readFileSync(path.join(downloaded, 'source-profile-rc17.json'))
      )
    ) !== canonical(profile) ||
    canonical(provenance.sourceProfile?.protectedTransitions) !==
      canonical(profile.transitions) ||
    canonical(provenance.sourceProfile?.websiteTransitions) !==
      canonical(profile.websiteTransitions) ||
    canonical(provenance.sourceProfile?.integrationTransitions) !==
      canonical(profile.integrationTransitions) ||
    provenance.sourceProfile?.integrationBaseline !==
      profile.integrationBaseline ||
    provenance.sourceProfile?.integrationTree !== profile.integrationTree ||
    provenance.sourceProfile?.compilerSourceBaseline !==
      profile.compilerSourceBaseline ||
    provenance.sourceProfile?.implementationBaseline !==
      profile.implementationBaseline ||
    provenance.sourceProfile?.implementationTree !==
      profile.implementationTree ||
    canonical(provenance.sourceProfile?.nativeCompatibility) !==
      canonical(profile.nativeCompatibility) ||
    canonical(provenance.sourceProfile?.scannerRequiredPaths) !==
      canonical(profile.scannerRequiredPaths) ||
    canonical(provenance.sourceProfile?.scannerPolicy) !==
      canonical(profile.scannerPolicy) ||
    canonical(provenance.sourceProfile?.scannerReceiverPaths) !==
      canonical(profile.scannerReceiverPaths) ||
    provenance.sourceProfile?.nativePinBaseline !== profile.nativePinBaseline ||
    provenance.sourceProfile?.nativePinTree !== profile.nativePinTree ||
    provenance.sourceProfile?.sourceConvergenceBaseline !==
      profile.sourceConvergenceBaseline ||
    provenance.sourceProfile?.sourceConvergenceTree !==
      profile.sourceConvergenceTree ||
    provenance.sourceProfile?.pythonScannerBaseline !==
      profile.pythonScannerBaseline ||
    provenance.sourceProfile?.pythonScannerTree !== profile.pythonScannerTree ||
    canonical(provenance.sourceProfile?.pythonScannerPolicy) !==
      canonical(profile.pythonScannerPolicy) ||
    canonical(provenance.sourceProfile?.pythonScannerRequiredPaths) !==
      canonical(profile.pythonScannerRequiredPaths) ||
    canonical(provenance.sourceProfile?.pythonScannerReview) !==
      canonical(profile.pythonScannerReview) ||
    canonical(provenance.sourceProfile?.scannerReview) !==
      canonical(profile.scannerReview) ||
    provenance.sourceProfile?.productionApproved !== false
  )
    throw Error('Remote finite source profile differs');
  const genuineFinal = (finalCodeqlChecks || []).filter((check) =>
    require('./source-native-gates-rc16.cjs').authenticCodeQL(check, sha)
  );
  if (
    genuineFinal.some(
      (check) => check.status !== 'completed' || check.conclusion !== 'success'
    )
  )
    throw Error(
      'Remote final CodeQL result does not match authenticated GitHub checks'
    );
  serviceEvidence.assertFinalServices(processedCodeqlServices, { sha, tree });
  const retainedService = readCodeqlServiceAsset(downloaded, provenance, {
    sha,
    tree,
  });
  if (canonical(retainedService) !== canonical(processedCodeqlServices))
    throw Error(
      'Remote processed CodeQL service evidence differs from authenticated readback'
    );
  serviceEvidence.verifyRawBinding(
    processedCodeqlServices,
    'javascript',
    execFileSync(
      'unzip',
      ['-p', path.join(downloaded, 'codeql-evidence.zip'), 'javascript.sarif'],
      {
        maxBuffer: 32 * 1024 * 1024,
      }
    )
  );
  nativeEvidence.verifyNativeEvidence({
    directory: downloaded,
    artifact: nativeArtifact,
    run: nativeRun,
    sha,
    tree,
    provenance,
  });
}

// The existing JavaScript S1/S2 and native checks stay mandatory. Python
// independently authenticates its retained archive after that complete path.
function verifyDownloadedAssets(context) {
  verifyJavaScriptAndNativeAssets(context);
  const python = nativeEvidence.verifyPythonEvidence({
    directory: context.downloaded,
    finalObservation: context.pythonFinalObservation,
    reviewedObservation: context.pythonReviewedObservation,
    sha: context.sha,
    tree: context.tree,
    provenance: JSON.parse(
      fs.readFileSync(path.join(context.downloaded, 'provenance.json'))
    ),
  });
  serviceEvidence.verifyRawBinding(
    context.processedCodeqlServices,
    'python',
    execFileSync(
      'unzip',
      [
        '-p',
        path.join(context.downloaded, 'python-codeql-evidence.zip'),
        'python.sarif',
      ],
      {
        maxBuffer: 32 * 1024 * 1024,
      }
    )
  );
  return python;
}

function readCodeqlServiceAsset(directory, provenance, { sha, tree }) {
  const bytes = fs.readFileSync(
    path.join(directory, 'codeql-service-evidence.json')
  );
  if (bytes.length > 4 * 1024 * 1024)
    throw Error('CodeQL service evidence exceeds its byte bound');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes))
    throw Error('CodeQL service evidence must be exact UTF8');
  const retained = JSON.parse(text);
  if (JSON.stringify(retained, null, 2) + '\n' !== text)
    throw Error(
      'CodeQL service evidence must use its bounded canonical serialization'
    );
  const reference = provenance.processedCodeqlServiceEvidence;
  if (
    !exactFields(reference, ['schema', 'source', 'tree', 'file', 'sha256']) ||
    reference.schema !== 'agijobsv0/codeql-service-asset/1' ||
    reference.source !== sha ||
    reference.tree !== tree ||
    reference.file !== 'codeql-service-evidence.json' ||
    reference.sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')
  )
    throw Error(
      'CodeQL service asset differs from qualified source provenance'
    );
  return retained;
}

const scannerWorkflow = '.github/workflows/static-analysis.yml';
const scannerDigest = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
function scannerRequire(ok, message) {
  if (!ok) throw Error(message);
}
function scannerPath(location, artifacts) {
  const declared = location?.artifactLocation || location;
  const value =
    declared?.uri === undefined
      ? artifacts?.[declared?.index]?.location
      : declared;
  scannerRequire(
    value?.uriBaseId === '%SRCROOT%' && typeof value.uri === 'string',
    'Scanner source location is not repository relative'
  );
  let name;
  try {
    name = decodeURIComponent(value.uri);
  } catch {
    throw Error('Malformed scanner source URI');
  }
  scannerRequire(
    name &&
      !/[\\\r\n\0]/.test(name) &&
      !name.startsWith('/') &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(name) &&
      name.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Malformed scanner source path'
  );
  return name;
}
function summarizeScannerSarif(bytes, requiredSources = []) {
  scannerRequire(
    Buffer.byteLength(bytes) <= 64 * 1024 * 1024,
    'Raw SARIF exceeds the review bound'
  );
  const document = JSON.parse(bytes);
  scannerRequire(
    document.version === '2.1.0' &&
      Array.isArray(document.runs) &&
      document.runs.length === 1,
    'Complete single-run SARIF 2.1.0 is required'
  );
  const run = document.runs[0],
    config = run.properties?.codeqlConfigSummary;
  scannerRequire(
    run.tool?.driver?.name === 'CodeQL' &&
      typeof run.tool.driver.semanticVersion === 'string' &&
      Array.isArray(run.results) &&
      run.results.length <= 100000 &&
      Array.isArray(run.invocations) &&
      run.invocations.length > 0 &&
      run.invocations.every(
        (item) =>
          item.executionSuccessful === true &&
          !(item.toolExecutionNotifications || []).some(
            (note) => note.level === 'error'
          )
      ) &&
      config?.disableDefaultQueries === false &&
      canonical(
        config.queries?.map((query) => `${query.type}:${query.uses}`).sort()
      ) ===
        canonical([
          'builtinSuite:security-and-quality',
          'builtinSuite:security-extended',
        ]),
    'Scanner tool, successful extraction or original query suites differ'
  );
  require('./source-scanner-review-bindings-rc16.cjs').assertNoScannerErrorDiagnostics(
    run.invocations
  );
  const extracted = new Set();
  for (const invocation of run.invocations)
    for (const note of invocation.toolExecutionNotifications || [])
      if (
        note.descriptor?.id === 'js/diagnostics/successfully-extracted-files'
      ) {
        scannerRequire(
          Array.isArray(note.locations) && note.locations.length > 0,
          'Malformed successful-extraction diagnostic'
        );
        for (const location of note.locations)
          extracted.add(scannerPath(location.physicalLocation, run.artifacts));
      }
  scannerRequire(
    extracted.size > 0 && extracted.size <= 100000,
    'Complete extraction diagnostics are required'
  );
  for (const name of requiredSources)
    scannerRequire(
      extracted.has(name),
      `Required source was not actually extracted: ${name}`
    );
  const results = run.results
    .map((result) => {
      scannerRequire(
        typeof result.ruleId === 'string' &&
          result.ruleId.length > 0 &&
          Array.isArray(result.locations) &&
          result.locations.length > 0 &&
          !result.suppressions?.length,
        'Malformed or suppressed raw scanner result'
      );
      for (const location of result.locations)
        scannerPath(location.physicalLocation, run.artifacts);
      // Hash the entire result, including all code flows, fingerprints and repeated
      // instances. Do not reduce the inventory to counts or primary locations.
      return scannerDigest(canonical(result));
    })
    .sort();
  return {
    schema: 'agijobsv0/raw-codeql-summary/1',
    toolSha256: scannerDigest(canonical(run.tool)),
    queriesSha256: scannerDigest(canonical(config)),
    extractedPaths: [...extracted].sort(),
    results,
    resultCount: results.length,
  };
}
// Both inputs remain original authenticated report bytes. Only this explicit
// comparison object uses reversible copies in the reviewed report coordinates.
function compareScannerReports(actualRaw, reviewedRaw, requiredSources = []) {
  const actualSummary = summarizeScannerSarif(actualRaw, requiredSources);
  const reviewedSummary = summarizeScannerSarif(reviewedRaw, requiredSources);
  const actual = JSON.parse(actualRaw);
  const reviewed = JSON.parse(reviewedRaw);
  const { run, witness } =
    require('./source-scanner-gates-rc16.cjs').transportScannerRun(
      actual.runs[0],
      reviewed.runs[0]
    );
  const transportedSummary = summarizeScannerSarif(
    JSON.stringify({ ...actual, runs: [run] }),
    requiredSources
  );
  scannerRequire(
    canonical(witness.rawResultHashes) === canonical(actualSummary.results) &&
      canonical(witness.transportedResultHashes) ===
        canonical(transportedSummary.results),
    'Scanner transport and raw summary identities disagree'
  );
  return {
    schema: 'agijobsv0/codeql-lossless-reference-transport/1',
    actualSummary,
    reviewedSummary,
    transportedSummary,
    witness,
  };
}

function scannerEvidencePair(
  directory,
  requiredSources,
  finalContext,
  reviewedContext
) {
  let actualRaw;
  let reviewedRaw;
  const summary = scannerArchive(
    path.join(directory, 'codeql-evidence.zip'),
    requiredSources,
    finalContext,
    {
      captureRaw: (raw) => {
        actualRaw = Buffer.from(raw);
      },
    }
  );
  const reviewed = scannerArchive(
    path.join(directory, 'codeql-reviewed-evidence.zip'),
    requiredSources,
    reviewedContext,
    {
      captureRaw: (raw) => {
        reviewedRaw = Buffer.from(raw);
      },
    }
  );
  const comparison = compareScannerReports(
    actualRaw,
    reviewedRaw,
    requiredSources
  );
  scannerRequire(
    canonical(summary) === canonical(comparison.actualSummary) &&
      canonical(reviewed) === canonical(comparison.reviewedSummary),
    'Scanner comparison does not retain the validated original reports'
  );
  return { summary, reviewed, comparison };
}

const scannerFiles = [
  'javascript.sarif',
  'source-scope-before.json',
  'source-scope-after.json',
  'source-extraction.json',
].sort();
function verifyScannerArchive(
  files,
  read,
  requiredSources,
  context,
  capture = {}
) {
  scannerRequire(
    canonical([...files].sort()) === canonical(scannerFiles),
    'Raw scanner archive inventory differs'
  );
  scannerRequire(
    context &&
      /^[a-f0-9]{40}$/.test(context.source || '') &&
      /^[a-f0-9]{40}$/.test(context.tree || '') &&
      Number.isSafeInteger(context.run) &&
      context.run > 0 &&
      Number.isSafeInteger(context.attempt) &&
      context.attempt > 0 &&
      context.event === 'push' &&
      typeof context.ref === 'string' &&
      context.ref.startsWith('refs/heads/') &&
      /^[a-f0-9]{64}$/.test(context.configSha256 || '') &&
      Array.isArray(context.requiredExtractedFiles) &&
      context.requiredExtractedFiles.length > 0 &&
      canonical([...new Set(context.requiredExtractedFiles)].sort()) ===
        canonical(context.requiredExtractedFiles),
    'Independent scanner execution context is required'
  );
  const raw = read('javascript.sarif'),
    summary = summarizeScannerSarif(raw, requiredSources);
  const json = (name) => {
    const bytes = read(name);
    scannerRequire(
      Buffer.byteLength(bytes) <= 8 * 1024 * 1024,
      'Bounded scanner provenance JSON required'
    );
    return JSON.parse(bytes);
  };
  const before = json('source-scope-before.json'),
    after = json('source-scope-after.json'),
    report = json('source-extraction.json');
  const identityFields = [
    'source',
    'tree',
    'run',
    'attempt',
    'event',
    'ref',
    'configSha256',
  ];
  scannerRequire(
    exactFields(before, [
      'schema',
      ...identityFields,
      'historicalConfigSha256',
      'staticAdmittedBefore',
      'staticAdditionalAdmitted',
      'allPreviousPathsRetained',
      'integrationClosureAdmitted',
      'browserClosureAdmitted',
      'requiredExtractedFiles',
      'actualExtractionRequiresSARIF',
    ]) &&
      before.schema === 'agijobsv0/codeql-scope/2' &&
      canonical(before) === canonical(after) &&
      identityFields.every((key) => before[key] === context[key]) &&
      before.historicalConfigSha256 === scannerHistory.configSha256 &&
      Number.isSafeInteger(before.staticAdmittedBefore) &&
      before.staticAdmittedBefore > 0 &&
      Number.isSafeInteger(before.staticAdditionalAdmitted) &&
      before.staticAdditionalAdmitted > 0 &&
      before.allPreviousPathsRetained === true &&
      before.integrationClosureAdmitted === true &&
      before.browserClosureAdmitted === true &&
      before.actualExtractionRequiresSARIF === true &&
      canonical(before.requiredExtractedFiles) ===
        canonical(context.requiredExtractedFiles),
    'Scanner before/after scope or execution identity differs'
  );
  const run = JSON.parse(raw).runs[0];
  const extracted = [
    ...new Set(
      run.invocations
        .flatMap((invocation) => invocation.toolExecutionNotifications || [])
        .filter(
          (item) =>
            item.descriptor?.id ===
            'js/diagnostics/successfully-extracted-files'
        )
        .flatMap((item) =>
          (item.locations || []).map(
            (location) => location.physicalLocation?.artifactLocation?.uri
          )
        )
        .filter(Boolean)
    ),
  ].sort();
  const ruleIds = [
    ...new Set(
      [run.tool.driver, ...(run.tool.extensions || [])].flatMap((component) =>
        (component.rules || []).map((rule) => rule.id)
      )
    ),
  ].sort();
  scannerRequire(
    ruleIds.length > 0 && ruleIds.every((id) => typeof id === 'string' && id),
    'Complete scanner rule identities required'
  );
  const missing = context.requiredExtractedFiles.filter(
    (name) => !extracted.includes(name)
  );
  scannerRequire(
    exactFields(report, [
      'schema',
      ...identityFields,
      'sarifSha256',
      'successfulExtractionFiles',
      'requiredExtractedFiles',
      'missingRequiredExtractedFiles',
      'ruleIds',
      'rawResultCount',
      'resultDisposition',
    ]) &&
      report.schema === 'agijobsv0/codeql-extraction/1' &&
      identityFields.every((key) => report[key] === context[key]) &&
      report.sarifSha256 === scannerDigest(raw) &&
      canonical(report.successfulExtractionFiles) === canonical(extracted) &&
      canonical(report.requiredExtractedFiles) ===
        canonical(context.requiredExtractedFiles) &&
      canonical(report.missingRequiredExtractedFiles) === canonical(missing) &&
      missing.length === 0 &&
      canonical(report.ruleIds) === canonical(ruleIds) &&
      report.rawResultCount === run.results.length &&
      report.resultDisposition === 'REQUIRES_INDEPENDENT_FINAL_SOURCE_REVIEW',
    'Scanner extraction report does not match actual complete SARIF'
  );
  if (capture.captureRaw) capture.captureRaw(Buffer.from(raw));
  return summary;
}
function readScannerZip(file, verify) {
  const info = fs.lstatSync(file);
  scannerRequire(
    info.isFile() && info.size > 0 && info.size <= 128 * 1024 * 1024,
    'Bounded regular scanner archive required'
  );
  const files = execFileSync('unzip', ['-Z1', file], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  return verify(files, (name) =>
    execFileSync('unzip', ['-p', file, name], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
    })
  );
}
function scannerArchive(file, requiredSources, context, capture) {
  return readScannerZip(file, (files, read) =>
    verifyScannerArchive(files, read, requiredSources, context, capture)
  );
}
// Historical archives predate the new producer records. This separate helper
// supplies only the preserved baseline; release evidence always requires four files.
function historicalScannerArchive(file) {
  return readScannerZip(file, (files, read) => {
    scannerRequire(
      canonical([...files].sort()) === canonical(['javascript.sarif']),
      'Historical scanner inventory differs'
    );
    return summarizeScannerSarif(read('javascript.sarif'));
  });
}
function scannerExecutionContext(git, sourceSha, producer, policy) {
  scannerRequire(
    /^[a-f0-9]{40}$/.test(sourceSha || ''),
    'Exact scanner context source required'
  );
  validateScannerProducer(producer, sourceSha);
  return {
    source: sourceSha,
    tree: String(git('rev-parse', sourceSha + '^{tree}')).trim(),
    run: producer.runId,
    attempt: producer.runAttempt,
    event: producer.event,
    ref: 'refs/heads/' + producer.headBranch,
    configSha256: scannerDigest(
      git('show', sourceSha + ':.github/codeql/config-integrations.yml')
    ),
    requiredExtractedFiles: policy.producerRequiredSources,
  };
}
function scannerPolicyContext(git, sourceSha) {
  scannerRequire(
    /^[a-f0-9]{40}$/.test(sourceSha || ''),
    'Exact scanner source SHA required'
  );
  const root = path.resolve(__dirname, '../..');
  const historical = {
    configSha256: '.github/codeql/config.yml',
    findingsSha256: 'docs/security/remediation-2026-10-19/findings.json',
    originalArchiveSha256:
      'docs/security/remediation-2026-10-19/baseline/original-codeql.zip',
  };
  for (const [key, name] of Object.entries(historical))
    scannerRequire(
      scannerDigest(fs.readFileSync(path.join(root, name))) ===
        scannerHistory[key],
      `Preserved scanner history changed: ${name}`
    );
  for (const name of Object.values(historical)) {
    const entry = String(git('ls-tree', '-z', sourceSha, '--', name));
    const [meta, found] = entry.split('\t');
    scannerRequire(
      /^100644 blob [a-f0-9]{40}$/.test(meta) && found === name + '\0',
      'Preserved scanner history mode changed'
    );
  }
  const baseline = historicalScannerArchive(
    path.join(root, historical.originalArchiveSha256)
  );
  scannerRequire(
    baseline.resultCount === 96,
    'Complete original 96-result scanner archive required'
  );
  const tracked = String(git('ls-tree', '-r', '--name-only', '-z', sourceSha))
    .split('\0')
    .filter(Boolean);
  const website = [
    'computer-receipt.mjs',
    'computer-receipt-model.mjs',
    'computer-receipt-copy.mjs',
    'computer-desk.mjs',
    'computer-desk-runtime-source.mjs',
    'computer-mission.js',
    'computer-mission-copy.mjs',
  ].map((name) => 'website/assets/' + name);
  const native = tracked.filter(
    (name) =>
      /\.[cm]?js$/.test(name) &&
      (name.startsWith('integrations/alpha-agent/') ||
        name.startsWith('packages/successor-core/src/'))
  );
  const explicit = [
    ...website,
    'scripts/pages/computer-mission.mjs',
    'scripts/pages/computer-receipt.mjs',
  ];
  for (const name of explicit)
    scannerRequire(
      tracked.includes(name),
      `Required native source is absent: ${name}`
    );
  scannerRequire(
    native.some((name) =>
      name.endsWith('/vendor/alpha/docs/assets/successor/engine.mjs')
    ) &&
      native.some((name) =>
        name.endsWith('/vendor/alpha-computer/docs/assets/successor/engine.mjs')
      ),
    'Both native vendor engine closures are required'
  );
  return {
    producerRequiredSources: expectedReceiverSources(git, sourceSha),
    requiredSources: [
      ...new Set([
        ...baseline.extractedPaths.filter((name) => tracked.includes(name)),
        ...native,
        ...explicit,
        ...profile.scannerRequiredPaths,
      ]),
    ].sort(),
  };
}
function scannerProducer(run, artifact) {
  return {
    runId: run.id,
    runAttempt: run.run_attempt,
    runNumber: run.run_number,
    event: run.event,
    headBranch: run.head_branch,
    artifactId: artifact.id,
    artifactName: artifact.name,
    githubDigest: artifact.digest,
  };
}
function validateScannerProducer(producer, sha) {
  scannerRequire(
    exactFields(producer, [
      'runId',
      'runAttempt',
      'runNumber',
      'event',
      'headBranch',
      'artifactId',
      'artifactName',
      'githubDigest',
    ]) &&
      ['runId', 'runAttempt', 'runNumber', 'artifactId'].every(
        (key) => Number.isSafeInteger(producer[key]) && producer[key] > 0
      ) &&
      producer.event === 'push' &&
      typeof producer.headBranch === 'string' &&
      producer.headBranch.length > 0 &&
      producer.headBranch.length <= 255 &&
      producer.artifactName ===
        `codeql-security-report-${sha}-${producer.runId}-${producer.runAttempt}` &&
      /^sha256:[a-f0-9]{64}$/.test(producer.githubDigest || ''),
    'Malformed attempt-bound scanner producer'
  );
}
async function scannerPages(api, prefix, key) {
  const values = [],
    seen = new Set();
  let total;
  for (let page = 1; page <= 20; page++) {
    const response = await api('GET', `${prefix}&per_page=100&page=${page}`);
    scannerRequire(
      Number.isSafeInteger(response?.total_count) &&
        response.total_count >= 0 &&
        response.total_count <= 2000 &&
        (total === undefined || total === response.total_count) &&
        Array.isArray(response[key]) &&
        response[key].length <= 100,
      'Incomplete scanner producer pagination'
    );
    total = response.total_count;
    for (const value of response[key]) {
      scannerRequire(
        Number.isSafeInteger(value?.id) && value.id > 0 && !seen.has(value.id),
        'Duplicate or malformed scanner producer identity'
      );
      seen.add(value.id);
      values.push(value);
    }
    if (values.length === total) return values;
    scannerRequire(
      values.length < total && response[key].length === 100,
      'Truncated scanner producer evidence'
    );
  }
  throw Error('Scanner producer pagination exceeds the bound');
}
async function readScannerObservation(api, producer, sha, finalSource = false) {
  validateScannerProducer(producer, sha);
  const role = finalSource
    ? { event: 'push', headBranch: 'main', ref: 'refs/heads/main' }
    : profile.scannerPolicy.reviewedProducer;
  scannerRequire(
    role?.event === 'push' &&
      role.ref === 'refs/heads/' + role.headBranch &&
      producer.event === role.event &&
      producer.headBranch === role.headBranch,
    'Scanner producer differs from its exact finite source role'
  );
  const [current, attempt, artifact, runs, artifacts] = await Promise.all([
    api('GET', `actions/runs/${producer.runId}`),
    api(
      'GET',
      `actions/runs/${producer.runId}/attempts/${producer.runAttempt}`
    ),
    api('GET', `actions/artifacts/${producer.artifactId}`),
    scannerPages(
      api,
      `actions/workflows/static-analysis.yml/runs?head_sha=${sha}`,
      'workflow_runs'
    ),
    scannerPages(api, `actions/runs/${producer.runId}/artifacts?`, 'artifacts'),
  ]);
  const validRun = (run) =>
    run?.id === producer.runId &&
    run.run_attempt === producer.runAttempt &&
    run.run_number === producer.runNumber &&
    run.path === scannerWorkflow &&
    run.head_sha === sha &&
    run.repository?.full_name === 'MontrealAI/AGIJobsv0' &&
    run.head_repository?.full_name === 'MontrealAI/AGIJobsv0' &&
    run.event === producer.event &&
    run.head_branch === producer.headBranch &&
    run.status === 'completed' &&
    run.conclusion === 'success';
  scannerRequire(
    validRun(current) && validRun(attempt),
    'Scanner run is stale, foreign, pending or unsuccessful'
  );
  scannerRequire(
    runs.every(
      (run) =>
        run.head_sha === sha &&
        run.path === scannerWorkflow &&
        Number.isSafeInteger(run.run_number) &&
        run.run_number > 0 &&
        Number.isSafeInteger(run.run_attempt) &&
        run.run_attempt > 0
    ),
    'Foreign-head or malformed scanner workflow inventory'
  );
  const latest = runs
    .filter(
      (run) =>
        run.path === scannerWorkflow &&
        run.event === producer.event &&
        run.head_branch === producer.headBranch
    )
    .sort(
      (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt
    )[0];
  scannerRequire(
    validRun(latest),
    'A newer scanner workflow or attempt supersedes retained evidence'
  );
  const matches = artifacts.filter(
    (item) => item.name === producer.artifactName
  );
  scannerRequire(
    matches.length === 1 &&
      matches[0].id === producer.artifactId &&
      artifact?.id === producer.artifactId &&
      artifact.name === producer.artifactName &&
      artifact.expired === false &&
      artifact.digest === producer.githubDigest &&
      artifact.workflow_run?.id === producer.runId &&
      artifact.workflow_run?.head_sha === sha &&
      artifact.workflow_run?.head_branch === producer.headBranch &&
      canonical(matches[0]) === canonical(artifact),
    'Scanner artifact identity differs from authenticated inventory'
  );
  return { producer, artifact };
}
function verifyScannerEvidence({
  directory,
  sha,
  proof,
  finalObservation,
  reviewedObservation,
  review = scannerReview,
  requiredSources,
  finalContext,
  reviewedContext,
}) {
  scannerRequire(
    review !== null &&
      exactFields(proof, [
        'schema',
        'repository',
        'sourceSha',
        'final',
        'reviewed',
        'summary',
        'comparison',
        'review',
        'history',
      ]) &&
      proof.schema === 'agijobsv0/raw-codeql-provenance/2' &&
      proof.repository === 'MontrealAI/AGIJobsv0' &&
      proof.sourceSha === sha &&
      canonical(proof.review) === canonical(review) &&
      canonical(proof.history) === canonical(scannerHistory),
    'Scanner review is pending or provenance differs'
  );
  scannerRequire(
    finalContext?.source === sha &&
      finalContext.run === proof.final?.runId &&
      finalContext.attempt === proof.final?.runAttempt &&
      finalContext.event === proof.final?.event &&
      finalContext.ref === 'refs/heads/' + proof.final?.headBranch &&
      reviewedContext?.source === review.sourceSha &&
      reviewedContext.tree === review.sourceTree &&
      reviewedContext.run === proof.reviewed?.runId &&
      reviewedContext.attempt === proof.reviewed?.runAttempt &&
      reviewedContext.event === proof.reviewed?.event &&
      reviewedContext.ref === 'refs/heads/' + proof.reviewed?.headBranch,
    'Scanner execution context differs from authenticated producer'
  );
  for (const [key, observation, file, sourceSha] of [
    ['final', finalObservation, 'codeql-evidence.zip', sha],
    [
      'reviewed',
      reviewedObservation,
      'codeql-reviewed-evidence.zip',
      review.sourceSha,
    ],
  ]) {
    const producer = proof[key];
    validateScannerProducer(producer, sourceSha);
    const role =
      key === 'final'
        ? { event: 'push', headBranch: 'main', ref: 'refs/heads/main' }
        : profile.scannerPolicy.reviewedProducer;
    scannerRequire(
      role?.event === 'push' &&
        role.ref === 'refs/heads/' + role.headBranch &&
        producer.event === role.event &&
        producer.headBranch === role.headBranch,
      'Scanner archive producer differs from its exact finite source role'
    );
    scannerRequire(
      canonical(producer) === canonical(observation?.producer) &&
        producer.githubDigest ===
          `sha256:${scannerDigest(
            fs.readFileSync(path.join(directory, file))
          )}`,
      'Scanner archive does not match authenticated producer digest'
    );
  }
  scannerRequire(
    canonical(proof.reviewed) === canonical(review.producer),
    'Reviewed scanner producer changed'
  );
  const { summary, reviewed, comparison } = scannerEvidencePair(
    directory,
    requiredSources,
    finalContext,
    reviewedContext
  );
  scannerRequire(
    canonical(reviewed) === canonical(review.summary) &&
      canonical(comparison.transportedSummary) === canonical(review.summary) &&
      canonical(proof.summary) === canonical(summary) &&
      canonical(proof.comparison) === canonical(comparison),
    'Complete original and transported scanner reconciliation differs'
  );
  return summary;
}
async function collectScannerEvidence() {
  verifyPublicationReview(profile, {
    git: gitSource,
    target: process.env.GITHUB_SHA,
  });
  const repository = process.env.GITHUB_REPOSITORY,
    sha = process.env.GITHUB_SHA;
  const directory = releaseOutputDirectory();
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, 'provenance.json'))
  );
  scannerRequire(
    repository === 'MontrealAI/AGIJobsv0' &&
      provenance.repository === repository &&
      provenance.sha === sha &&
      scannerReview !== null,
    'Scanner evidence collection requires the installed reviewed source record'
  );
  const git = (...args) => gitSource(...args);
  verifyScannerReviewSource({ git, sha });
  const context = scannerPolicyContext(git, sha);
  const cli = (...args) =>
    execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024, timeout: 30000 });
  const api = async (method, resource) => {
    sourceApiUrl(method, resource, sha);
    return JSON.parse(cli('api', `repos/${repository}/${resource}`));
  };
  const run = provenance.workflows?.find(
    (item) => item.path === scannerWorkflow
  );
  scannerRequire(
    run && run.head_sha === sha && run.conclusion === 'success',
    'Missing qualified final scanner workflow'
  );
  const current = await api('GET', `actions/runs/${producerId(run.id)}`);
  const items = await scannerPages(
    api,
    `actions/runs/${run.id}/artifacts?`,
    'artifacts'
  );
  const candidates = items.filter(
    (item) =>
      item.name === `codeql-security-report-${sha}-${run.id}-${run.run_attempt}`
  );
  scannerRequire(
    candidates.length === 1,
    'Missing or ambiguous final scanner artifact'
  );
  const final = scannerProducer(current, candidates[0]);
  scannerRequire(
    final.runId === run.id && final.runAttempt === run.run_attempt,
    'Qualified scanner attempt moved'
  );
  const reviewed = scannerReview.producer;
  const finalContext = scannerExecutionContext(git, sha, final, context);
  const reviewedContext = scannerExecutionContext(
    git,
    scannerReview.sourceSha,
    reviewed,
    context
  );
  for (const [producer, sourceSha, name, isFinal] of [
    [final, sha, 'codeql-evidence.zip', true],
    [reviewed, scannerReview.sourceSha, 'codeql-reviewed-evidence.zip', false],
  ]) {
    await readScannerObservation(api, producer, sourceSha, isFinal);
    const bytes = cli(
      'api',
      `repos/${repository}/actions/artifacts/${producer.artifactId}/zip`
    );
    scannerRequire(
      `sha256:${scannerDigest(bytes)}` === producer.githubDigest,
      'Downloaded raw scanner artifact digest differs'
    );
    fs.writeFileSync(path.join(directory, name), bytes, {
      flag: 'wx',
      mode: 0o600,
    });
  }
  const pair = scannerEvidencePair(
    directory,
    context.requiredSources,
    finalContext,
    reviewedContext
  );
  const proof = {
    schema: 'agijobsv0/raw-codeql-provenance/2',
    repository,
    sourceSha: sha,
    final,
    reviewed,
    summary: pair.summary,
    comparison: pair.comparison,
    review: scannerReview,
    history: scannerHistory,
  };
  const [finalObservation, reviewedObservation] = await Promise.all([
    readScannerObservation(api, final, sha, true),
    readScannerObservation(api, reviewed, scannerReview.sourceSha),
  ]);
  verifyScannerEvidence({
    directory,
    sha,
    proof,
    finalObservation,
    reviewedObservation,
    finalContext,
    reviewedContext,
    ...context,
  });
  verifyIntegratedScannerArchive({
    directory,
    sha,
    tree: git('rev-parse', `${sha}^{tree}`).trim(),
    producerRun: current,
    git,
  });
  const retainedService = readCodeqlServiceAsset(directory, provenance, {
    sha,
    tree: git('rev-parse', `${sha}^{tree}`).trim(),
  });
  const processedCodeqlServices = await serviceEvidence.observeFinalServices({
    api,
    git,
    sha,
    tree: git('rev-parse', `${sha}^{tree}`).trim(),
    runs: provenance.workflows,
    retained: retainedService,
  });
  serviceEvidence.assertFinalServices(processedCodeqlServices, { sha });
  if (canonical(processedCodeqlServices) !== canonical(retainedService))
    throw Error(
      'Collected CodeQL service evidence differs from authenticated readback'
    );
  serviceEvidence.verifyRawBinding(
    processedCodeqlServices,
    'javascript',
    execFileSync(
      'unzip',
      ['-p', path.join(directory, 'codeql-evidence.zip'), 'javascript.sarif'],
      {
        maxBuffer: 32 * 1024 * 1024,
      }
    )
  );
  fs.writeFileSync(
    path.join(directory, 'codeql-provenance.json'),
    JSON.stringify(proof, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
}

function validateCompilerArtifact(provenance, artifact) {
  const run = provenance.workflows?.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  if (
    !/^[a-f0-9]{40}$/.test(provenance.sha || '') ||
    !run ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    run.conclusion !== 'success' ||
    run.head_sha !== provenance.sha ||
    !Number.isSafeInteger(artifact?.id) ||
    artifact.id < 1 ||
    artifact?.name !==
      `compiler-evidence-${provenance.sha}-${run.id}-${run.run_attempt}` ||
    artifact.expired !== false ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run?.head_sha !== provenance.sha ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')
  )
    throw Error(
      'Compiler artifact does not match the qualified exact-SHA producer'
    );
  return run;
}

function verifyCompilerArchive(files, read) {
  const index = JSON.parse(read('verification/index.json'));
  const report = JSON.parse(read('build.json'));
  const policy = require('../../config/solidity-compiler.json');
  if (
    index.schema !== 'agijobsv0/verification-inputs/1' ||
    index.compiler !== policy.longVersion ||
    report.compiler !== policy.longVersion ||
    report.projectSourceWarnings !== 0 ||
    report.sizeGatePassed !== true ||
    !Array.isArray(index.contracts) ||
    !index.contracts.length ||
    index.contracts.length !== report.contracts?.length
  )
    throw Error('Compiler archive policy or inventory mismatch');
  const entries = Object.entries(index.files || {});
  const expected = ['build.json', 'verification/index.json'];
  for (const [name, digest] of entries) {
    if (
      !/^[A-Za-z0-9_./@-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').includes('..') ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw Error('Malformed compiler archive checksum entry');
    const file = `verification/${name}`;
    expected.push(file);
    if (crypto.createHash('sha256').update(read(file)).digest('hex') !== digest)
      throw Error(`Compiler archive checksum mismatch: ${file}`);
  }
  if (JSON.stringify([...files].sort()) !== JSON.stringify(expected.sort()))
    throw Error('Compiler archive file inventory mismatch');
  for (const item of index.contracts) {
    for (const file of [item.artifact, item.buildInfo, item.standardInput])
      if (!Object.hasOwn(index.files, file))
        throw Error('Missing contract compiler evidence');
  }
  const identities = (items) =>
    items.map((item) => `${item.source}:${item.contract}`).sort();
  if (
    JSON.stringify(identities(index.contracts)) !==
    JSON.stringify(identities(report.contracts))
  )
    throw Error('Compiler report and archive contract identities differ');
  return { compiler: index.compiler, contracts: index.contracts.length };
}

function collectCompilerEvidence() {
  verifyPublicationReview(profile, {
    git: gitSource,
    target: process.env.GITHUB_SHA,
  });
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const directory = releaseOutputDirectory();
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, 'provenance.json'))
  );
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    provenance.repository !== repository ||
    provenance.sha !== sha
  )
    throw Error('Invalid compiler evidence publication identity');
  const run = provenance.workflows.find(
    (item) => item.path === '.github/workflows/contracts.yml'
  );
  if (!run) throw Error('Missing qualified contracts workflow');
  const cli = (...args) =>
    execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024 });
  const response = JSON.parse(
    cli(
      'api',
      `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`
    )
  );
  if (response.total_count > 100)
    throw Error('Refusing truncated compiler artifact inventory');
  const artifacts = response.artifacts.filter(
    (item) =>
      item.name === `compiler-evidence-${sha}-${run.id}-${run.run_attempt}`
  );
  if (artifacts.length !== 1)
    throw Error('Missing or ambiguous compiler evidence artifact');
  const artifact = artifacts[0];
  validateCompilerArtifact(provenance, artifact);
  const bytes = cli(
    'api',
    `repos/${repository}/actions/artifacts/${artifact.id}/zip`
  );
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (`sha256:${digest}` !== artifact.digest)
    throw Error('Downloaded compiler artifact digest mismatch');
  const zip = path.join(directory, 'compiler-evidence.zip');
  fs.writeFileSync(zip, bytes, { flag: 'wx' });
  const read = (name) =>
    execFileSync('unzip', ['-p', zip, name], { maxBuffer: 128 * 1024 * 1024 });
  const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'));
  const summary = verifyCompilerArchive(files, read);
  fs.writeFileSync(
    path.join(directory, 'compiler-provenance.json'),
    JSON.stringify(
      {
        schema: 'agijobsv0/compiler-artifact-provenance/1',
        repository,
        sha,
        workflow: run.path,
        runId: run.id,
        runAttempt: run.run_attempt,
        artifactId: artifact.id,
        artifactName: artifact.name,
        githubDigest: artifact.digest,
        downloadedSha256: digest,
        ...summary,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx' }
  );
}

function assertTag(ref, sha) {
  if (ref?.object?.type !== 'commit' || ref.object.sha !== sha)
    throw Error('Release tag belongs to a different commit or object type');
}

const releaseBodyByteLimit = 4096;
const notesAsset = 'RELEASE_NOTES_SOURCE_RC17.md';
const releaseOwners = Object.freeze([
  Object.freeze({ id: 41898282, login: 'github-actions[bot]', type: 'Bot' }),
  Object.freeze({ id: 24208299, login: 'MontrealAI', type: 'User' }),
]);
function readQualifiedReleaseNotes({ git, sha, directory }) {
  if (typeof git !== 'function' || !/^[a-f0-9]{40}$/.test(sha || ''))
    throw Error('Immutable release notes source is required');
  const sourceBlob = String(
    git('rev-parse', `${sha}:docs/production/${notesAsset}`)
  ).trim();
  const asset = fs.readFileSync(path.join(directory, notesAsset));
  // Authenticate raw bytes, not UTF-8 text decoded by the shared Git helper.
  const assetBlob = crypto
    .createHash('sha1')
    .update(`blob ${asset.length}\0`)
    .update(asset)
    .digest('hex');
  if (!/^[a-f0-9]{40}$/.test(sourceBlob) || sourceBlob !== assetBlob)
    throw Error('Full release notes asset differs from immutable Git source');
  const notes = asset.toString('utf8');
  if (!Buffer.from(notes, 'utf8').equals(asset))
    throw Error('Full release notes asset is not valid UTF-8');
  return notes;
}
function releaseBody({ sha, tag, notes }) {
  if (
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    tag !== 'source-v2.1.0-rc.17' ||
    typeof notes !== 'string' ||
    !notes.trim() ||
    Buffer.byteLength(notes, 'utf8') > 8 * 1024 * 1024 ||
    Buffer.from(notes, 'utf8').toString('utf8') !== notes
  )
    throw Error('Invalid source release description inputs');
  const digest = crypto
    .createHash('sha256')
    .update(notes, 'utf8')
    .digest('hex');
  const base = 'https://github.com/MontrealAI/AGIJobsv0';
  const body = [
    `Qualified source snapshot ${tag}. Production approval remains false.`,
    '',
    `Source commit: ${sha}`,
    `Complete notes: [${notesAsset}](${base}/releases/download/${tag}/${notesAsset})`,
    `Exact-source notes: [view](${base}/blob/${sha}/docs/production/${notesAsset})`,
    `Full-notes SHA-256: ${digest}`,
    '',
    'The complete notes and all source, compiler, scanner and native evidence remain checksummed release assets. Historical deployment records retain their original identities and limits.',
    'This source prerelease does not authorize production operation, transactions, signing, funding, activation or migration.',
    '',
    `<!-- agijobs-source-release:${sha} -->`,
    '',
  ].join('\n');
  if (Buffer.byteLength(body, 'utf8') > releaseBodyByteLimit)
    throw Error('Source release description exceeds its UTF-8 byte limit');
  return body;
}
const normalizeReleaseBody = (body) =>
  typeof body === 'string' ? body.replace(/\r\n/g, '\n').trimEnd() : null;
function assertOwnedRelease(release, { sha, tag, body, id, draft, tagSha }) {
  const expected = expectedAssets(tag);
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id < 1 ||
    (id !== undefined && release.id !== id) ||
    !releaseOwners.some(
      (owner) =>
        owner.id === release.author?.id &&
        owner.login === release.author?.login &&
        owner.type === release.author?.type
    ) ||
    release.tag_name !== tag ||
    !(
      release.target_commitish === sha ||
      (release.target_commitish === 'main' && tagSha === sha)
    ) ||
    release.name !== `${tag} — Develop the strategy. Preserve the mission.` ||
    typeof release.draft !== 'boolean' ||
    (draft !== undefined && release.draft !== draft) ||
    release.prerelease !== true ||
    normalizeReleaseBody(release.body) !== normalizeReleaseBody(body) ||
    !Array.isArray(release.assets) ||
    release.assets.length > expected.length
  )
    throw Error('Existing release is not the exact owned source snapshot');
  const names = new Set(),
    ids = new Set();
  for (const asset of release.assets) {
    if (
      !Number.isSafeInteger(asset?.id) ||
      asset.id < 1 ||
      ids.has(asset.id) ||
      !expected.includes(asset.name) ||
      names.has(asset.name)
    )
      throw Error('Unexpected or ambiguous existing source release assets');
    names.add(asset.name);
    ids.add(asset.id);
  }
  return release;
}
async function discoverRelease(api, context) {
  // GitHub's by-tag endpoint returns published releases only, not drafts.
  const published = await api(
    'GET',
    `releases/tags/${context.tag}`,
    undefined,
    true
  );
  const values = [],
    seen = new Set();
  let previousLength;
  for (let page = 1; page <= 20; page++) {
    const entries = await api('GET', `releases?per_page=100&page=${page}`);
    if (
      !Array.isArray(entries) ||
      entries.length > 100 ||
      (previousLength !== undefined &&
        previousLength < 100 &&
        entries.length > 0)
    )
      throw Error('Incomplete or inconsistent source release pagination');
    for (const entry of entries) {
      if (
        !Number.isSafeInteger(entry?.id) ||
        entry.id < 1 ||
        seen.has(entry.id)
      )
        throw Error('Duplicate or malformed source release identity');
      seen.add(entry.id);
      if (entry.tag_name === context.tag) values.push(entry);
    }
    if (entries.length === 0) {
      if (
        values.length > 1 ||
        (published && (values.length !== 1 || published.id !== values[0].id))
      )
        throw Error('Ambiguous or inconsistent source release discovery');
      if (values.length === 0) return null;
      const listed = assertOwnedRelease(values[0], context);
      if (Boolean(published) !== !listed.draft)
        throw Error('Published and draft source release observations differ');
      if (published)
        assertOwnedRelease(published, {
          ...context,
          id: listed.id,
          draft: false,
        });
      const selected = assertOwnedRelease(
        await api('GET', `releases/${listed.id}`),
        { ...context, id: listed.id, draft: listed.draft }
      );
      if (canonical(selected.assets) !== canonical(listed.assets))
        throw Error('Source release assets changed during discovery');
      return selected;
    }
    previousLength = entries.length;
  }
  throw Error('Source release pagination exceeds the completeness bound');
}
function assertCompleteReleaseAssets(release, tag) {
  if (
    canonical(release.assets.map((asset) => asset.name).sort()) !==
    canonical(expectedAssets(tag))
  )
    throw Error('Remote source release asset inventory is incomplete');
}
function verifyExactProducerBytes(downloaded, directory, tag) {
  const names = expectedAssets(tag);
  for (const location of [downloaded, directory])
    if (canonical(fs.readdirSync(location).sort()) !== canonical(names))
      throw Error('Exact producer asset inventory mismatch');
  for (const name of names) {
    const digest = (location) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(location, name)))
        .digest('hex');
    if (digest(downloaded) !== digest(directory))
      throw Error(`Exact producer/readback mismatch: ${name}`);
  }
}
async function publish({ sha, tag, notes, api, upload, verify }) {
  const body = releaseBody({ sha, tag, notes });
  const refPath = `git/ref/tags/${tag}`;
  let ref = await api('GET', refPath, undefined, true);
  if (!ref) {
    const main = await api('GET', 'git/ref/heads/main');
    if (main?.object?.sha !== sha)
      throw Error('Main moved before tag reservation');
    ref = await api('POST', 'git/refs', { ref: `refs/tags/${tag}`, sha });
  }
  assertTag(ref, sha);
  // GitHub ignores target_commitish once the tag exists. Only literal main
  // may accompany the separately authenticated immutable tag/source binding.
  const context = { sha, tag, body, tagSha: ref.object.sha };
  let release = await discoverRelease(api, context);
  if (!release) {
    release = assertOwnedRelease(
      await api('POST', 'releases', {
        tag_name: tag,
        target_commitish: sha,
        draft: true,
        prerelease: true,
        name: `${tag} — Develop the strategy. Preserve the mission.`,
        body,
      }),
      { ...context, draft: true }
    );
  }
  const id = release.id;
  if (!release.draft) {
    assertCompleteReleaseAssets(release, tag);
    await verify(false);
    assertTag(await api('GET', refPath), sha);
    return release;
  }
  await upload();
  await verify(true);
  assertTag(await api('GET', refPath), sha);
  release = assertOwnedRelease(await api('GET', `releases/${id}`), {
    ...context,
    id,
    draft: true,
  });
  assertCompleteReleaseAssets(release, tag);
  // Once reserved, the tag defines the qualified snapshot. Same-SHA retries
  // remain valid if main advances; an existing tag is never moved or deleted.
  await api('PATCH', `releases/${id}`, {
    draft: false,
    prerelease: true,
    make_latest: 'false',
  });
  release = assertOwnedRelease(await api('GET', `releases/tags/${tag}`), {
    ...context,
    id,
    draft: false,
  });
  assertCompleteReleaseAssets(release, tag);
  await verify(false, true);
  assertTag(await api('GET', refPath), sha);
  return release;
}

async function githubFailureDetails(response, token) {
  // Keep only bounded validation fields, never request headers, payloads or raw
  // non-JSON bodies. The caller's credential is redacted even if echoed back.
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return { truncated: true };
      }
      chunks.push(Buffer.from(value));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const safe = (value) => {
      if (typeof value !== 'string') return undefined;
      const redacted = value
        .split(token)
        .join('[REDACTED]')
        .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
        .replace(
          /(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g,
          '[REDACTED]'
        )
        .replace(/[\u0000-\u001f\u007f]/g, ' ');
      let output = '';
      for (const point of redacted) {
        if (Buffer.byteLength(output + point, 'utf8') > 512) break;
        output += point;
      }
      return output;
    };
    return {
      message: safe(parsed?.message),
      errors: Array.isArray(parsed?.errors)
        ? parsed.errors
            .slice(0, 10)
            .map((item) =>
              typeof item === 'string'
                ? { message: safe(item) }
                : Object.fromEntries(
                    ['resource', 'field', 'code', 'message'].map((key) => [
                      key,
                      safe(item?.[key]),
                    ])
                  )
            )
        : undefined,
    };
  } catch {
    return { validationResponseUnavailable: true };
  } finally {
    reader.releaseLock();
  }
}
function sourceApi({ sha, token, request = fetch }) {
  return async (method, resource, body, optional = false) => {
    const response = await request(sourceApiUrl(method, resource, sha), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      const details = await githubFailureDetails(response, token);
      throw Error(
        `GitHub ${method} ${resource}: HTTP ${
          response.status
        }; ${JSON.stringify(details)}`
      );
    }
    return response.json();
  };
}

function producerId(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw Error('Malformed remote compiler producer identity');
  // Normalize only after strict type/range validation; never coerce strings.
  return Number(value);
}

function reviewedCodeqlPagePath(page, sourceSha = compilerSourceBaseline) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 20)
    throw Error('Invalid reviewed CodeQL results page');
  return `commits/${sourceSha}/check-runs?filter=latest&per_page=100&page=${page}`;
}

// Inputs are claims until the repository-scoped authenticated API reobserves
// them. A successful old run remains valid evidence after a successful rerun,
// while the complete latest result set must also be successful now.
async function readReviewedCodeql(api, proof) {
  const claims = reviewedCodeqlProof(proof);
  const recordedCodeqlChecks = await Promise.all(
    claims.map((check) => api('GET', `check-runs/${check.id}`))
  );
  const latestCodeqlChecks = await readLatestCodeql(
    api,
    compilerSourceBaseline
  );
  return { recordedCodeqlChecks, latestCodeqlChecks };
}

async function readLatestCodeql(api, sourceSha) {
  const latestCodeqlChecks = [];
  let total;
  const seen = new Set();
  for (let page = 1; page <= 20; page++) {
    const response = await api('GET', reviewedCodeqlPagePath(page, sourceSha));
    if (
      !Number.isSafeInteger(response?.total_count) ||
      response.total_count < 0 ||
      response.total_count > 2000 ||
      (total !== undefined && total !== response.total_count) ||
      !Array.isArray(response.check_runs) ||
      response.check_runs.length > 100 ||
      response.check_runs.some(
        (check) =>
          !Number.isSafeInteger(check?.id) ||
          check.id < 1 ||
          check.head_sha !== sourceSha
      )
    )
      throw Error(
        'Incomplete or inconsistent authenticated reviewed CodeQL results'
      );
    for (const check of response.check_runs) {
      if (seen.has(check.id))
        throw Error('Duplicate authenticated reviewed CodeQL result');
      seen.add(check.id);
    }
    total = response.total_count;
    latestCodeqlChecks.push(...response.check_runs);
    if (latestCodeqlChecks.length === total) return latestCodeqlChecks;
    if (latestCodeqlChecks.length > total || response.check_runs.length < 100)
      throw Error(
        'Incomplete or inconsistent authenticated reviewed CodeQL results'
      );
  }
  throw Error('Incomplete authenticated reviewed CodeQL results pagination');
}

function sourceApiUrl(method, resource, finalSha) {
  const allowed = {
    GET: /^(?:git\/ref\/(?:heads\/main|tags\/source-v2\.1\.0-rc\.17)|releases\/tags\/source-v2\.1\.0-rc\.17|releases\/[1-9][0-9]*|releases\?per_page=100&page=(?:[1-9]|1[0-9]|20)|actions\/artifacts\/[1-9][0-9]*|actions\/runs\/[1-9][0-9]*\/attempts\/[1-9][0-9]*|check-runs\/[1-9][0-9]*)$/,
    POST: /^(?:git\/refs|releases)$/,
    PATCH: /^releases\/[1-9][0-9]*$/,
  };
  const scannerRoute =
    method === 'GET' &&
    (/^actions\/runs\/[1-9][0-9]*$/.test(resource) ||
      /^actions\/runs\/[1-9][0-9]*\/artifacts\?&per_page=100&page=(?:[1-9]|1[0-9]|20)$/.test(
        resource
      ) ||
      [scannerReview?.sourceSha, finalSha].some(
        (sourceSha) =>
          /^[a-f0-9]{40}$/.test(sourceSha || '') &&
          Array.from(
            { length: 20 },
            (_, i) =>
              `actions/workflows/static-analysis.yml/runs?head_sha=${sourceSha}&per_page=100&page=${
                i + 1
              }`
          ).includes(resource)
      ));
  const pythonScannerRoute =
    method === 'GET' &&
    (/^actions\/runs\/[1-9][0-9]*\/artifacts\?per_page=100&page=(?:[1-9]|1[0-9]|20)$/.test(
      resource
    ) ||
      [profile.pythonScannerReview?.sourceCommit, finalSha].some(
        (sourceSha) =>
          /^[a-f0-9]{40}$/.test(sourceSha || '') &&
          Array.from(
            { length: 20 },
            (_, index) =>
              `actions/workflows/static-analysis-python-integrations.yml/runs?head_sha=${sourceSha}&per_page=100&page=${
                index + 1
              }`
          ).includes(resource)
      ));
  const serviceRoute =
    method === 'GET' &&
    serviceEvidence.isServiceApiResource(resource, finalSha);
  const reviewedResults =
    method === 'GET' &&
    [compilerSourceBaseline, finalSha].some(
      (sourceSha) =>
        /^[a-f0-9]{40}$/.test(sourceSha || '') &&
        Array.from({ length: 20 }, (_, index) =>
          reviewedCodeqlPagePath(index + 1, sourceSha)
        ).includes(resource)
    );
  if (
    typeof method !== 'string' ||
    typeof resource !== 'string' ||
    !Object.hasOwn(allowed, method) ||
    (!reviewedResults &&
      !serviceRoute &&
      !scannerRoute &&
      !pythonScannerRoute &&
      allowed[method].exec(resource)?.[0] !== resource)
  )
    throw Error('Unsupported source publication API route');
  return `https://api.github.com/repos/MontrealAI/AGIJobsv0/${resource}`;
}

async function main() {
  verifyPublicationReview(profile, {
    git: gitSource,
    target: process.env.GITHUB_SHA,
  });
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
    TAG: tag,
  } = process.env;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    tag !== 'source-v2.1.0-rc.17' ||
    !token
  )
    throw Error('Invalid source publication identity or authorization');
  const cli = (...args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  const git = (...args) => gitSource(...args);
  if (git('rev-parse', 'HEAD').trim() !== sha)
    throw Error('Checkout identity mismatch');
  assertPinnedAlphaCheckout(process.cwd(), sha);
  verifySourceProfile({
    git,
    sha,
    policy: JSON.parse(fs.readFileSync('config/solidity-compiler.json')),
    version: JSON.parse(fs.readFileSync('package.json')).version,
    lock: JSON.parse(fs.readFileSync('package-lock.json')),
  });
  verifyScannerReviewSource({ git, sha });
  const scannerContext = scannerPolicyContext(git, sha);
  const tree = git('rev-parse', 'HEAD^{tree}').trim();
  const directory = releaseOutputDirectory();
  const files = fs.readdirSync(directory).sort();
  const expected = expectedAssets(tag);
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw Error('Unexpected or missing source assets');
  const api = sourceApi({ sha, token });
  // Local preflight and remote readback use the same authenticated evidence
  // path. Installed review metadata alone cannot reserve a release tag.
  const verifyEvidence = async (downloaded, draft) => {
    assertPinnedAlphaCheckout(process.cwd(), sha);
    const compiler = JSON.parse(
      fs.readFileSync(path.join(downloaded, 'compiler-provenance.json'), 'utf8')
    );
    const artifactId = producerId(compiler.artifactId);
    const runId = producerId(compiler.runId);
    const runAttempt = producerId(compiler.runAttempt);
    const provenance = JSON.parse(
      fs.readFileSync(path.join(downloaded, 'provenance.json'), 'utf8')
    );
    const [
      compilerArtifact,
      compilerRun,
      codeql,
      finalCodeqlChecks,
      historicalCodeqlCheck,
    ] = await Promise.all([
      api('GET', `actions/artifacts/${artifactId}`),
      api('GET', `actions/runs/${runId}/attempts/${runAttempt}`),
      readReviewedCodeql(api, provenance.reviewedSourceCodeql),
      readLatestCodeql(api, sha),
      api('GET', `check-runs/${historicalReviewedCodeql.checkId}`),
    ]);
    const scannerProof = JSON.parse(
      fs.readFileSync(path.join(downloaded, 'codeql-provenance.json'))
    );
    const [finalObservation, reviewedObservation] = await Promise.all([
      readScannerObservation(api, scannerProof.final, sha, true),
      readScannerObservation(
        api,
        scannerProof.reviewed,
        scannerReview.sourceSha
      ),
    ]);
    const native = JSON.parse(
      fs.readFileSync(path.join(downloaded, 'native-provenance.json'))
    );
    const pythonScanner = JSON.parse(
      fs.readFileSync(path.join(downloaded, 'python-codeql-provenance.json'))
    );
    const {
      readPythonScannerObservation,
    } = require('./source-python-evidence-rc16.cjs');
    const [
      nativeArtifact,
      nativeRun,
      pythonFinalObservation,
      pythonReviewedObservation,
    ] = await Promise.all([
      api('GET', `actions/artifacts/${producerId(native.artifactId)}`),
      api(
        'GET',
        `actions/runs/${producerId(native.runId)}/attempts/${producerId(
          native.runAttempt
        )}`
      ),
      readPythonScannerObservation(api, pythonScanner.final.producer, sha),
      readPythonScannerObservation(
        api,
        pythonScanner.reviewed.producer,
        profile.pythonScannerReview.sourceCommit,
        { review: profile.pythonScannerReview }
      ),
    ]);
    const retainedService = readCodeqlServiceAsset(downloaded, provenance, {
      sha,
      tree,
    });
    const processedCodeqlServices = await serviceEvidence.observeFinalServices({
      api,
      git,
      sha,
      tree,
      runs: provenance.workflows,
      retained: retainedService,
    });
    serviceEvidence.assertFinalServices(processedCodeqlServices, { sha, tree });
    verifyScannerReviewSource({ git, sha });
    verifyDownloadedAssets({
      nativeArtifact,
      nativeRun,
      pythonFinalObservation,
      pythonReviewedObservation,
      downloaded,
      directory,
      draft,
      sha,
      tree,
      tag,
      repository,
      compilerArtifact,
      compilerRun,
      ...codeql,
      finalCodeqlChecks,
      historicalCodeqlCheck,
      processedCodeqlServices,
      scannerEvidence: {
        ...scannerContext,
        finalObservation,
        reviewedObservation,
        finalContext: scannerExecutionContext(
          git,
          sha,
          scannerProof.final,
          scannerContext
        ),
        reviewedContext: scannerExecutionContext(
          git,
          scannerReview.sourceSha,
          scannerProof.reviewed,
          scannerContext
        ),
      },
    });
    const finalScannerRun = await api(
      'GET',
      `actions/runs/${producerId(
        scannerProof.final.runId
      )}/attempts/${producerId(scannerProof.final.runAttempt)}`
    );
    verifyIntegratedScannerArchive({
      directory: downloaded,
      sha,
      tree,
      producerRun: finalScannerRun,
      git,
    });
    assertPinnedAlphaCheckout(process.cwd(), sha);
  };
  const verify = async (draft, exactProducer = false) => {
    assertPinnedAlphaCheckout(process.cwd(), sha);
    const downloaded = fs.mkdtempSync(
      path.join(
        process.env.RUNNER_TEMP || os.tmpdir(),
        'source-release-readback-'
      )
    );
    try {
      cli('release', 'download', tag, '--dir', downloaded);
      await verifyEvidence(downloaded, draft);
      if (exactProducer) verifyExactProducerBytes(downloaded, directory, tag);
    } finally {
      fs.rmSync(downloaded, { recursive: true, force: true });
    }
  };
  await verifyEvidence(directory, true);
  const release = await publish({
    sha,
    tag,
    api,
    verify,
    notes: readQualifiedReleaseNotes({ git, sha, directory }),
    upload: async () =>
      cli(
        'release',
        'upload',
        tag,
        ...files.map((name) => path.join(directory, name)),
        '--clobber'
      ),
  });
  console.log(
    JSON.stringify({
      url: release.html_url,
      tag,
      sha,
      draft: release.draft,
      prerelease: release.prerelease,
      assetsVerified: true,
    })
  );
}

module.exports = {
  ...nativeEvidence,
  collectScannerEvidence,
  gitSource,
  summarizeScannerSarif,
  compareScannerReports,
  historicalScannerArchive,
  scannerExecutionContext,
  verifyScannerArchive,
  scannerArchive,
  scannerPolicyContext,
  scannerProducer,
  validateScannerProducer,
  scannerPages,
  readScannerObservation,
  verifyScannerEvidence,
  producerId,
  sourceApiUrl,
  sourceApi,
  githubFailureDetails,
  releaseBody,
  readQualifiedReleaseNotes,
  releaseBodyByteLimit,
  verifyExactProducerBytes,
  discoverRelease,
  assertOwnedRelease,
  readReviewedCodeql,
  readLatestCodeql,
  reviewedCodeqlPagePath,
  publish,
  assertTag,
  expectedAssets,
  verifyJavaScriptAndNativeAssets,
  verifyDownloadedAssets,
  readCodeqlServiceAsset,
  validateCompilerArtifact,
  verifyCompilerArchive,
};
if (require.main === module)
  Promise.resolve()
    .then(() => {
      if (process.argv[2] === '--collect-additional-evidence')
        return nativeEvidence.collectAdditionalEvidence();
      if (process.argv[2] === '--collect-scanner-evidence')
        return collectScannerEvidence();
      if (process.argv[2] === '--collect-compiler-evidence')
        return collectCompilerEvidence();
      if (process.argv.length !== 2)
        throw Error('Unknown source publication argument');
      return main();
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
