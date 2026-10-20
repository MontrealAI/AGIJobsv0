const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  publish,
  expectedAssets,
  verifyJavaScriptAndNativeAssets: verifyDownloadedAssets,
  verifyDownloadedAssets: verifyAllDownloadedAssets,
  readReviewedCodeql,
  readLatestCodeql,
  reviewedCodeqlPagePath,
  verifyScannerArchive,
  summarizeScannerSarif,
  historicalScannerArchive,
  scannerArchive,
  readScannerObservation,
  scannerPages,
  scannerPolicyContext,
  sourceApiUrl,
} = require('../../scripts/release/publish-source-release-rc16.cjs');
const {
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
  deploymentSnapshot,
  scannerHistory,
  historicalReviewedCodeql,
  verifyHistoricalReviewedCodeql,
} = require('../../scripts/release/qualify-source-release-rc16.cjs');
const { profile } = require('../../scripts/release/source-profile-rc16.cjs');
const sha = 'a'.repeat(40),
  tag = 'source-v2.1.0-rc.16';
const { syntheticServiceProof } =
  require('./source-codeql-service-fixture-rc16.cjs');
let processedCodeqlServices;
before(async () => {
  processedCodeqlServices = await syntheticServiceProof({
    sha, tree: 'c'.repeat(40),
    javascriptRaw: Buffer.from(JSON.stringify(scannerDocument())),
  });
});
function compilerArchiveFixture(contents = {}) {
  const compiler = require('../../config/solidity-compiler.json').longVersion;
  const payloads = {
    'artifact.json': JSON.stringify({ contractName: 'C', abi: [] }),
    'input.json': JSON.stringify({ language: 'Solidity', sources: {} }),
    'build-info.json': JSON.stringify({ solcLongVersion: compiler }),
    ...contents,
  };
  const contract = {
    contract: 'C',
    source: 'contracts/v2/C.sol',
    artifact: 'artifact.json',
    standardInput: 'input.json',
    buildInfo: 'build-info.json',
  };
  return {
    'verification/index.json': JSON.stringify({
      schema: 'agijobsv0/verification-inputs/1',
      compiler,
      contracts: [contract],
      files: Object.fromEntries(
        Object.entries(payloads).map(([name, bytes]) => [
          name,
          crypto.createHash('sha256').update(bytes).digest('hex'),
        ])
      ),
    }),
    'build.json': JSON.stringify({
      compiler,
      projectSourceWarnings: 0,
      sizeGatePassed: true,
      contracts: [contract],
    }),
    ...Object.fromEntries(
      Object.entries(payloads).map(([name, bytes]) => [
        `verification/${name}`,
        bytes,
      ])
    ),
  };
}
function scannerDocument(
  paths = [
    'integrations/alpha-agent/native.mjs',
    'website/assets/computer-receipt-model.mjs',
  ]
) {
  return {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeQL',
            semanticVersion: '2.27.2',
            rules: [{ id: 'js/test' }],
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            toolExecutionNotifications: paths.map((uri) => ({
              descriptor: { id: 'js/diagnostics/successfully-extracted-files' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri, uriBaseId: '%SRCROOT%' },
                  },
                },
              ],
            })),
          },
        ],
        properties: {
          codeqlConfigSummary: {
            disableDefaultQueries: false,
            queries: [
              { type: 'builtinSuite', uses: 'security-extended' },
              { type: 'builtinSuite', uses: 'security-and-quality' },
            ],
          },
        },
        results: [
          {
            ruleId: 'js/test',
            message: { text: 'Benign test provenance only' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: paths[0], uriBaseId: '%SRCROOT%' },
                  region: { startLine: 1 },
                },
              },
            ],
            codeFlows: [
              {
                threadFlows: [
                  {
                    locations: [
                      { location: { message: { text: 'test flow' } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
function scannerContextFixture(
  source = sha,
  tree = 'c'.repeat(40),
  run = 10,
  headBranch = 'main',
  required = [
    'integrations/alpha-agent/native.mjs',
    'website/assets/computer-receipt-model.mjs',
  ]
) {
  return {
    source,
    tree,
    run,
    attempt: 2,
    event: 'push',
    ref: 'refs/heads/' + headBranch,
    configSha256: 'e'.repeat(64),
    requiredExtractedFiles: [...required].sort(),
  };
}
function scannerArchiveFixture(
  document = scannerDocument(),
  context = scannerContextFixture()
) {
  const raw = JSON.stringify(document),
    run = document.runs[0];
  const identity = Object.fromEntries(
    ['source', 'tree', 'run', 'attempt', 'event', 'ref', 'configSha256'].map(
      (name) => [name, context[name]]
    )
  );
  const before = {
    schema: 'agijobsv0/codeql-scope/2',
    ...identity,
    historicalConfigSha256: scannerHistory.configSha256,
    staticAdmittedBefore: 856,
    staticAdditionalAdmitted: 100,
    allPreviousPathsRetained: true,
    integrationClosureAdmitted: true,
    browserClosureAdmitted: true,
    requiredExtractedFiles: context.requiredExtractedFiles,
    actualExtractionRequiresSARIF: true,
  };
  const extracted = [
    ...new Set(
      run.invocations
        .flatMap((invocation) => invocation.toolExecutionNotifications || [])
        .flatMap((item) =>
          item.locations.map(
            (location) => location.physicalLocation.artifactLocation.uri
          )
        )
    ),
  ].sort();
  const report = {
    schema: 'agijobsv0/codeql-extraction/1',
    ...identity,
    sarifSha256: crypto.createHash('sha256').update(raw).digest('hex'),
    successfulExtractionFiles: extracted,
    requiredExtractedFiles: context.requiredExtractedFiles,
    missingRequiredExtractedFiles: context.requiredExtractedFiles.filter(
      (name) => !extracted.includes(name)
    ),
    ruleIds: [
      ...new Set(
        [run.tool.driver, ...(run.tool.extensions || [])].flatMap((component) =>
          (component.rules || []).map((rule) => rule.id)
        )
      ),
    ].sort(),
    rawResultCount: run.results.length,
    resultDisposition: 'REQUIRES_INDEPENDENT_FINAL_SOURCE_REVIEW',
  };
  return {
    'javascript.sarif': raw,
    'source-scope-before.json': JSON.stringify(before),
    'source-scope-after.json': JSON.stringify(before),
    'source-extraction.json': JSON.stringify(report),
  };
}
function assetFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'producer');
  const downloaded = path.join(root, 'downloaded');
  fs.mkdirSync(directory);
  fs.mkdirSync(downloaded);
  const serviceBytes = JSON.stringify(processedCodeqlServices, null, 2) + '\n';
  // This models the retained existing historical f2 API record only. It is
  // never a new-source scan, installed review or release evidence fixture.
  const historicalCodeqlCheck = {
    id: historicalReviewedCodeql.checkId,
    head_sha: historicalReviewedCodeql.sourceSha,
    name: 'CodeQL',
    app: { id: 57789, slug: 'github-advanced-security' },
    status: 'completed', conclusion: 'success',
    html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/' +
      historicalReviewedCodeql.checkId,
  };
  const provenance = {
    historicalReviewedSourceCodeql:
      verifyHistoricalReviewedCodeql(historicalCodeqlCheck),
    processedCodeqlServiceEvidence: {
      schema: 'agijobsv0/codeql-service-asset/1',
      source: sha, tree: 'c'.repeat(40), file: 'codeql-service-evidence.json',
      sha256: crypto.createHash('sha256').update(serviceBytes).digest('hex'),
    },
    sha,
    tree: 'c'.repeat(40),
    tag,
    repository: 'MontrealAI/AGIJobsv0',
    productionApproved: false,
    producer: { workflow: '.github/workflows/source-release-rc16.yml' },
    workflows: [
      {
        path: '.github/workflows/contracts.yml',
        id: 7,
        run_attempt: 2,
        head_sha: sha,
        conclusion: 'success',
      },
    ],
    sourceProfile: {
      ...profile,
      protectedTransitions: profile.transitions,
      productionApproved: false,
    },
    sourceScope: {
      compilerSourceBaseline,
      evidenceBaseline,
      deployedSourceBaseline,
      preservedEvidencePaths,
      reviewedCompilerPaths,
      compiler: '0.8.37+commit.f401782d',
    },
    reviewedSourceCodeql: {
      sourceSha: compilerSourceBaseline,
      checks: [
        {
          id: 9,
          headSha: compilerSourceBaseline,
          name: 'CodeQL',
          appId: 57789,
          appSlug: 'github-advanced-security',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/MontrealAI/AGIJobsv0/runs/9',
        },
      ],
    },
    deploymentSnapshots: [deploymentSnapshot],
  };
  const checksums = (dir) =>
    fs.writeFileSync(
      path.join(dir, 'SHA256SUMS.txt'),
      expectedAssets(tag)
        .filter((name) => name !== 'SHA256SUMS.txt')
        .map(
          (name) =>
            `${crypto
              .createHash('sha256')
              .update(fs.readFileSync(path.join(dir, name)))
              .digest('hex')}  ${name}`
        )
        .join('\n') + '\n'
    );
  for (const name of expectedAssets(tag)) {
    if (name === 'SHA256SUMS.txt') continue;
    fs.writeFileSync(
      path.join(directory, name),
      name === 'codeql-service-evidence.json'
        ? serviceBytes
        : name === 'provenance.json'
        ? JSON.stringify(provenance)
        : name === deploymentSnapshot.asset
        ? fs.readFileSync(
            path.resolve(__dirname, '../..', deploymentSnapshot.localPath)
          )
        : `fixture:${name}`
    );
  }
  const writeCompilerZip = (target, contents = compilerArchiveFixture()) => {
    const staging = fs.mkdtempSync(path.join(root, 'compiler-files-'));
    for (const [name, bytes] of Object.entries(contents)) {
      fs.mkdirSync(path.dirname(path.join(staging, name)), { recursive: true });
      fs.writeFileSync(path.join(staging, name), bytes);
    }
    fs.rmSync(target, { force: true });
    execFileSync('zip', ['-q', '-r', target, '.'], { cwd: staging });
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(target))
      .digest('hex');
  };
  const compilerDigest = writeCompilerZip(
    path.join(directory, 'compiler-evidence.zip')
  );
  const compilerArtifact = {
    id: 8,
    name: `compiler-evidence-${sha}-7-2`,
    expired: false,
    digest: `sha256:${compilerDigest}`,
    workflow_run: { id: 7, head_sha: sha },
  };
  const compilerRun = {
    id: 7,
    run_attempt: 2,
    path: '.github/workflows/contracts.yml',
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: provenance.repository },
  };
  const compilerProvenance = {
    schema: 'agijobsv0/compiler-artifact-provenance/1',
    repository: provenance.repository,
    sha,
    workflow: compilerRun.path,
    runId: compilerRun.id,
    runAttempt: compilerRun.run_attempt,
    artifactId: compilerArtifact.id,
    artifactName: compilerArtifact.name,
    githubDigest: compilerArtifact.digest,
    downloadedSha256: compilerDigest,
    compiler: '0.8.37+commit.f401782d',
    contracts: 1,
  };
  fs.writeFileSync(
    path.join(directory, 'compiler-provenance.json'),
    JSON.stringify(compilerProvenance)
  );
  const requiredSources = [
    'integrations/alpha-agent/native.mjs',
    'website/assets/computer-receipt-model.mjs',
  ];
  const finalContext = scannerContextFixture(
    sha,
    provenance.tree,
    10,
    'main',
    requiredSources
  );
  const reviewedContext = scannerContextFixture(
    'b'.repeat(40),
    'd'.repeat(40),
    20,
    profile.scannerPolicy.reviewedProducer.headBranch,
    requiredSources
  );
  const finalDigest = writeCompilerZip(
    path.join(directory, 'codeql-evidence.zip'),
    scannerArchiveFixture(scannerDocument(requiredSources), finalContext)
  );
  const reviewedDigest = writeCompilerZip(
    path.join(directory, 'codeql-reviewed-evidence.zip'),
    scannerArchiveFixture(scannerDocument(requiredSources), reviewedContext)
  );
  const producer = (source, id, digest) => ({
    runId: id,
    runAttempt: 2,
    runNumber: 10,
    event: 'push',
    headBranch: id === 20 ? profile.scannerPolicy.reviewedProducer.headBranch : 'main',
    artifactId: id + 1,
    artifactName: `codeql-security-report-${source}-${id}-2`,
    githubDigest: `sha256:${digest}`,
  });
  const summary = scannerArchive(
    path.join(directory, 'codeql-evidence.zip'),
    requiredSources,
    finalContext
  );
  const review = {
    sourceSha: 'b'.repeat(40),
    sourceTree: reviewedContext.tree,
    producer: producer('b'.repeat(40), 20, reviewedDigest),
    summary,
    codeqlChecks: provenance.reviewedSourceCodeql.checks,
  };
  provenance.scannerReview = review;
  fs.writeFileSync(
    path.join(directory, 'provenance.json'),
    JSON.stringify(provenance)
  );
  const scannerProof = {
    schema: 'agijobsv0/raw-codeql-provenance/1',
    repository: provenance.repository,
    sourceSha: sha,
    final: producer(sha, 10, finalDigest),
    reviewed: review.producer,
    summary,
    review,
    history: scannerHistory,
  };
  fs.writeFileSync(
    path.join(directory, 'codeql-provenance.json'),
    JSON.stringify(scannerProof)
  );
  const scannerEvidence = {
    requiredSources,
    finalContext,
    reviewedContext,
    review,
    finalObservation: { producer: scannerProof.final },
    reviewedObservation: { producer: scannerProof.reviewed },
  };
  const nativeSummary = {
    schema: 'agijobsv0/native-ti-compatibility/1',
    jobsCommit: sha,
    jobsTree: provenance.tree,
    alphaCommit: profile.nativeCompatibility.commit,
    alphaTree: profile.nativeCompatibility.tree,
    sources: profile.nativeCompatibility.files,
    nativeFreeInspection: true,
    positiveAGIALPHARefused: true,
    staleBindingsRefused: true,
    authorityExpansionRefused: true,
    credentialFieldsRefused: true,
    privateURLsRefused: true,
    sourceCheckedBeforeAndAfter: true,
    currencySpend: '0',
    chainOperations: 0,
    independentProof: false,
    executionAuthority: false,
    currencyCaps: { AGIALPHABaseUnits: '0', USDCBaseUnits: '0' },
  };
  const nativeDigest = writeCompilerZip(
    path.join(directory, 'native-compatibility.zip'),
    { 'native-compatibility.json': JSON.stringify(nativeSummary) }
  );
  const nativeRun = {
    ...compilerRun,
    id: 30,
    path: '.github/workflows/transformational-compatibility.yml',
  };
  const nativeArtifact = {
    id: 31,
    name: `native-ti-compatibility-${sha}-30-2`,
    expired: false,
    digest: `sha256:${nativeDigest}`,
    workflow_run: { id: 30, head_sha: sha },
  };
  provenance.workflows.push({ ...nativeRun });
  fs.writeFileSync(
    path.join(directory, 'provenance.json'),
    JSON.stringify(provenance)
  );
  fs.writeFileSync(
    path.join(directory, 'source-profile-rc16.json'),
    JSON.stringify(profile)
  );
  fs.writeFileSync(
    path.join(directory, 'native-provenance.json'),
    JSON.stringify({
      schema: 'agijobsv0/retained-producer/1',
      kind: 'native',
      repository: provenance.repository,
      sha,
      workflow: nativeRun.path,
      runId: 30,
      runAttempt: 2,
      artifactId: 31,
      artifactName: nativeArtifact.name,
      githubDigest: nativeArtifact.digest,
      downloadedSha256: nativeDigest,
      summary: nativeSummary,
    })
  );
  checksums(directory);
  for (const name of expectedAssets(tag))
    fs.copyFileSync(path.join(directory, name), path.join(downloaded, name));
  // These records model responses from the authenticated GitHub API, separate
  // from the downloaded claims and their self-contained checksums.
  const recordedCodeqlChecks = [
    {
      id: 9,
      head_sha: compilerSourceBaseline,
      name: 'CodeQL',
      app: { id: 57789, slug: 'github-advanced-security' },
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/9',
    },
  ];
  const verify = (draft = true, overrides = {}) =>
    verifyDownloadedAssets({
      directory,
      downloaded,
      draft,
      ...provenance,
      compilerArtifact,
      compilerRun,
      nativeArtifact,
      nativeRun,
      recordedCodeqlChecks,
      latestCodeqlChecks: recordedCodeqlChecks,
      finalCodeqlChecks: [
        {
          ...recordedCodeqlChecks[0],
          id: 40,
          head_sha: sha,
          app: {
            id: 57789,
            slug: 'github-advanced-security',
            owner: { id: 9919 },
          },
          html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/40',
        },
      ],
      scannerEvidence,
      processedCodeqlServices,
      historicalCodeqlCheck,
      ...overrides,
    });
  return {
    directory,
    downloaded,
    provenance,
    verify,
    verifyAll: () =>
      verifyAllDownloadedAssets({
        directory,
        downloaded,
        draft: true,
        ...provenance,
        compilerArtifact,
        compilerRun,
        nativeArtifact,
        nativeRun,
        recordedCodeqlChecks,
        latestCodeqlChecks: recordedCodeqlChecks,
        finalCodeqlChecks: [
          {
            ...recordedCodeqlChecks[0],
            id: 40,
            head_sha: sha,
            app: {
              id: 57789,
              slug: 'github-advanced-security',
              owner: { id: 9919 },
            },
            html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/40',
          },
        ],
        scannerEvidence,
        processedCodeqlServices,
        historicalCodeqlCheck,
      }),
    checksums,
    compilerArtifact,
    compilerRun,
    compilerProvenance,
    nativeArtifact,
    nativeRun,
    writeCompilerZip,
    recordedCodeqlChecks,
    scannerEvidence,
    scannerProof,
    processedCodeqlServices,
    historicalCodeqlCheck,
  };
}
test('compiler and evidence assets must match the complete checksum inventory and producer', (t) => {
  const fixture = assetFixture(t);
  assert.equal(expectedAssets(tag).length, 24);
  assert.equal(
    fs
      .readFileSync(path.join(fixture.downloaded, 'SHA256SUMS.txt'), 'utf8')
      .trim()
      .split('\n').length,
    23
  );
  fixture.verify();
  fs.appendFileSync(
    path.join(fixture.downloaded, 'solidity-compiler.json'),
    'altered'
  );
  assert.throws(() => fixture.verify(), /checksum mismatch/);
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(), /Producer\/readback mismatch/);
  fs.unlinkSync(
    path.join(fixture.downloaded, 'compiler-warnings-2026-10-13.md')
  );
  assert.throws(() => fixture.verify(), /inventory mismatch/);
});
test('downloaded provenance cannot erase, replace or relabel the reviewed CodeQL result', (t) => {
  const fixture = assetFixture(t);
  for (const mutate of [
    (value) => {
      delete value.reviewedSourceCodeql;
    },
    (value) => {
      value.reviewedSourceCodeql.sourceSha = 'f'.repeat(40);
    },
    (value) => {
      value.reviewedSourceCodeql.checks = [];
    },
    (value) => {
      value.reviewedSourceCodeql.checks[0].conclusion = 'failure';
    },
    (value) => {
      value.reviewedSourceCodeql.checks[0].appSlug = 'github-actions';
    },
    (value) => {
      value.reviewedSourceCodeql.checks[0].headSha = 'e'.repeat(40);
    },
    (value) => {
      value.reviewedSourceCodeql.checks[0].url =
        'https://example.invalid/result';
    },
    (value) => {
      value.reviewedSourceCodeql.checks[0].id = 999999999;
      value.reviewedSourceCodeql.checks[0].url =
        'https://github.com/MontrealAI/AGIJobsv0/runs/999999999';
    },
  ]) {
    const changed = JSON.parse(JSON.stringify(fixture.provenance));
    mutate(changed);
    fs.writeFileSync(
      path.join(fixture.downloaded, 'provenance.json'),
      JSON.stringify(changed)
    );
    fixture.checksums(fixture.downloaded);
    assert.throws(() => fixture.verify(false), /reviewed CodeQL/);
  }
});
test('readback authenticates recorded results and rejects an old success when the latest result fails or waits', (t) => {
  const fixture = assetFixture(t);
  const old = fixture.recordedCodeqlChecks[0];
  const rerun = {
    ...old,
    id: 10,
    html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/10',
  };
  // A real successful rerun need not use the same ID as the published proof.
  fixture.verify(false, { latestCodeqlChecks: [rerun] });
  for (const latest of [
    [],
    [{ ...rerun, conclusion: 'failure' }],
    [{ ...rerun, status: 'in_progress', conclusion: null }],
    [rerun, { ...old, conclusion: 'failure' }],
  ])
    assert.throws(
      () => fixture.verify(false, { latestCodeqlChecks: latest }),
      /authenticated GitHub checks/
    );
  for (const recorded of [
    [],
    [{ ...old, id: 11 }],
    [{ ...old, head_sha: 'f'.repeat(40) }],
    [{ ...old, app: { id: 15368, slug: 'github-actions' } }],
    [{ ...old, conclusion: 'failure' }],
    [{ ...old, html_url: 'https://example.invalid/result' }],
    [old, old],
  ])
    assert.throws(
      () => fixture.verify(false, { recordedCodeqlChecks: recorded }),
      /authenticated GitHub checks/
    );
});

test('publication readback requires processed main proof and blocks any observed failed or pending AS result', (t) => {
  const fixture = assetFixture(t);
  const result = {
    ...fixture.recordedCodeqlChecks[0],
    id: 20,
    app: { id: 57789, slug: 'github-advanced-security', owner: { id: 9919 } },
    head_sha: sha,
    html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/20',
  };
  fixture.verify(false, { finalCodeqlChecks: [] });
  for (const processedCodeqlServices of [undefined, {}])
    assert.throws(
      () => fixture.verify(false, {
        finalCodeqlChecks: [], processedCodeqlServices,
      }),
      /Positive authenticated/
    );
  fixture.verify(false, { finalCodeqlChecks: [result] });
  for (const finalCodeqlChecks of [
    undefined,
    [{ ...result, conclusion: 'failure' }],
    [{ ...result, status: 'queued', conclusion: null }],
    [result, { ...result, id: 21, conclusion: 'failure' }],
  ])
    assert.throws(
      () => fixture.verify(false, { finalCodeqlChecks }),
      /authenticated GitHub checks/
    );
});

test('authenticated CodeQL readback reads every bounded latest page independently of recorded IDs', async (t) => {
  const fixture = assetFixture(t);
  const seen = [];
  const old = fixture.recordedCodeqlChecks[0];
  const otherChecks = Array.from({ length: 100 }, (_, index) => ({
    id: index + 100,
    head_sha: compilerSourceBaseline,
    name: 'other',
  }));
  const latest = {
    ...old,
    id: 10,
    html_url: 'https://github.com/MontrealAI/AGIJobsv0/runs/10',
  };
  const result = await readReviewedCodeql(async (method, resource) => {
    assert.equal(method, 'GET');
    seen.push(resource);
    if (resource === 'check-runs/9') return old;
    if (resource === reviewedCodeqlPagePath(1))
      return { total_count: 101, check_runs: otherChecks };
    assert.equal(resource, reviewedCodeqlPagePath(2));
    return { total_count: 101, check_runs: [latest] };
  }, fixture.provenance.reviewedSourceCodeql);
  assert.deepEqual(seen, [
    'check-runs/9',
    reviewedCodeqlPagePath(1),
    reviewedCodeqlPagePath(2),
  ]);
  assert.deepEqual(result.recordedCodeqlChecks, [old]);
  assert.equal(result.latestCodeqlChecks.length, 101);
  fixture.verify(false, result);
});

test('authenticated CodeQL readback refuses incomplete, drifting, duplicate or excessive pages', async (t) => {
  const fixture = assetFixture(t);
  const old = fixture.recordedCodeqlChecks[0];
  const full = Array.from({ length: 100 }, (_, index) => ({
    id: index + 100,
    head_sha: compilerSourceBaseline,
  }));
  for (const pages of [
    [{ total_count: 2, check_runs: [old] }],
    [{ total_count: 0, check_runs: [old] }],
    [{ total_count: 2001, check_runs: full }],
    [{ total_count: '1', check_runs: [old] }],
    [{ total_count: 1, check_runs: [{ ...old, head_sha: 'f'.repeat(40) }] }],
    [
      { total_count: 101, check_runs: full },
      { total_count: 102, check_runs: [old] },
    ],
    [
      { total_count: 101, check_runs: full },
      { total_count: 101, check_runs: [full[0]] },
    ],
    [{ total_count: 2, check_runs: [old, old] }],
  ]) {
    let index = 0;
    await assert.rejects(
      readReviewedCodeql(
        async (_method, resource) =>
          resource === 'check-runs/9' ? old : pages[index++],
        fixture.provenance.reviewedSourceCodeql
      ),
      /authenticated reviewed CodeQL/
    );
  }
});
test('final-source readback uses its own exact source and preserves an absent main result', async () => {
  const seen = [];
  assert.deepEqual(
    await readLatestCodeql(async (method, resource) => {
      seen.push([method, resource]);
      return { total_count: 0, check_runs: [] };
    }, sha),
    []
  );
  assert.deepEqual(seen, [['GET', reviewedCodeqlPagePath(1, sha)]]);
  await assert.rejects(
    readLatestCodeql(
      async () => ({
        total_count: 1,
        check_runs: [{ id: 1, head_sha: 'f'.repeat(40) }],
      }),
      sha
    ),
    /authenticated reviewed CodeQL/
  );
});

test('recomputed checksums cannot substitute the pinned current deployment snapshot or its provenance', (t) => {
  const fixture = assetFixture(t);
  const snapshot = path.join(fixture.downloaded, deploymentSnapshot.asset);
  fs.appendFileSync(snapshot, '\n');
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /snapshot hash mismatch/);
  fs.copyFileSync(
    path.join(fixture.directory, deploymentSnapshot.asset),
    snapshot
  );
  const provenance = {
    ...fixture.provenance,
    deploymentSnapshots: [
      { ...deploymentSnapshot, currentMainEquivalenceNotAssumed: false },
    ],
  };
  fs.writeFileSync(
    path.join(fixture.downloaded, 'provenance.json'),
    JSON.stringify(provenance)
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /provenance identity mismatch/);
});
test('incomplete checksums, extra assets and changed published provenance fail closed', (t) => {
  const fixture = assetFixture(t);
  const sumsPath = path.join(fixture.downloaded, 'SHA256SUMS.txt');
  fs.writeFileSync(
    sumsPath,
    fs.readFileSync(sumsPath, 'utf8').split('\n').slice(1).join('\n')
  );
  assert.throws(() => fixture.verify(), /Incomplete remote checksums/);
  fixture.checksums(fixture.downloaded);
  fs.writeFileSync(path.join(fixture.downloaded, 'unexpected.txt'), 'extra');
  assert.throws(() => fixture.verify(), /inventory mismatch/);
  fs.unlinkSync(path.join(fixture.downloaded, 'unexpected.txt'));
  fixture.provenance.sourceScope.compilerSourceBaseline = 'd'.repeat(40);
  fs.writeFileSync(
    path.join(fixture.downloaded, 'provenance.json'),
    JSON.stringify(fixture.provenance)
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /provenance identity mismatch/);
});
test('same-SHA published retries accept the original producer evidence without changing assets', (t) => {
  const fixture = assetFixture(t);
  fs.writeFileSync(
    path.join(fixture.directory, 'provenance.json'),
    JSON.stringify({ ...fixture.provenance, recordedAt: 'later retry' })
  );
  fixture.checksums(fixture.directory);
  assert.throws(() => fixture.verify(), /Producer\/readback mismatch/);
  fixture.verify(false);
});
test('published compiler provenance requires the authentic artifact and successful exact run attempt', (t) => {
  const fixture = assetFixture(t);
  fixture.verify(false);
  for (const changed of [
    { schema: 'untrusted/schema' },
    { artifactId: 9 },
    { runAttempt: 3 },
    { artifactName: `compiler-evidence-${sha}-7-1` },
  ]) {
    fs.writeFileSync(
      path.join(fixture.downloaded, 'compiler-provenance.json'),
      JSON.stringify({ ...fixture.compilerProvenance, ...changed })
    );
    fixture.checksums(fixture.downloaded);
    assert.throws(() => fixture.verify(false), /compiler producer provenance/);
  }
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify(fixture.compilerProvenance)
  );
  fixture.checksums(fixture.downloaded);
  for (const changed of [
    { run_attempt: 1 },
    { head_sha: 'b'.repeat(40) },
    { repository: { full_name: 'another/repository' } },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])
    assert.throws(
      () =>
        fixture.verify(false, {
          compilerRun: { ...fixture.compilerRun, ...changed },
        }),
      /compiler producer provenance/
    );
  assert.throws(
    () =>
      fixture.verify(false, {
        compilerArtifact: { ...fixture.compilerArtifact, id: 9 },
      }),
    /compiler producer provenance/
  );
  assert.throws(
    () => fixture.verify(false, { compilerArtifact: undefined }),
    /qualified exact-SHA producer/
  );
});
test('self-consistent replacement compiler ZIP and release checksums cannot replace GitHub producer bytes', (t) => {
  const fixture = assetFixture(t);
  const replacement = compilerArchiveFixture({
    'input.json': JSON.stringify({
      language: 'Solidity',
      sources: { forged: {} },
    }),
  });
  const {
    verifyCompilerArchive,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  assert.doesNotThrow(() =>
    verifyCompilerArchive(Object.keys(replacement), (name) =>
      Buffer.from(replacement[name])
    )
  );
  const digest = fixture.writeCompilerZip(
    path.join(fixture.downloaded, 'compiler-evidence.zip'),
    replacement
  );
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify({
      ...fixture.compilerProvenance,
      downloadedSha256: digest,
      githubDigest: `sha256:${digest}`,
    })
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(() => fixture.verify(false), /compiler producer provenance/);
});
test('producer archive readback checks its internal file checksums', (t) => {
  const fixture = assetFixture(t);
  const malformed = compilerArchiveFixture();
  malformed['verification/input.json'] = 'tampered after indexing';
  const digest = fixture.writeCompilerZip(
    path.join(fixture.downloaded, 'compiler-evidence.zip'),
    malformed
  );
  const githubDigest = `sha256:${digest}`;
  fs.writeFileSync(
    path.join(fixture.downloaded, 'compiler-provenance.json'),
    JSON.stringify({
      ...fixture.compilerProvenance,
      downloadedSha256: digest,
      githubDigest,
    })
  );
  fixture.checksums(fixture.downloaded);
  assert.throws(
    () =>
      fixture.verify(false, {
        compilerArtifact: { ...fixture.compilerArtifact, digest: githubDigest },
      }),
    /Compiler archive checksum mismatch/
  );
});
test('workflow packages every declared immutable release asset', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/source-release-rc16.yml'),
    'utf8'
  );
  assert.ok(workflow.includes(`TAG: ${tag}`));
  assert.ok(workflow.includes('group: source-release-rc16-${{ github.ref }}'));
  assert.ok(workflow.includes('name: source-rc16-${{ github.sha }}'));
  assert.ok(expectedAssets(tag).includes('RELEASE_NOTES_SOURCE_RC16.md'));
  for (const prior of [
    'RC7',
    'RC8',
    'RC9',
    'RC10',
    'RC11',
    'RC12',
    'RC13',
    'RC14',
    'RC15',
  ]) {
    assert.ok(
      !expectedAssets(tag).includes(`RELEASE_NOTES_SOURCE_${prior}.md`)
    );
    assert.ok(
      fs.existsSync(
        path.resolve(
          __dirname,
          `../../docs/production/RELEASE_NOTES_SOURCE_${prior}.md`
        )
      )
    );
  }
  const notes = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../docs/production/RELEASE_NOTES_SOURCE_RC16.md'
    ),
    'utf8'
  );
  assert.ok(notes.startsWith(`# ${tag}`));
  assert.ok(
    fs.existsSync(
      path.resolve(
        __dirname,
        '../../docs/production/RELEASE_NOTES_SOURCE_RC7.md'
      )
    )
  );
  assert.ok(!workflow.includes('source-v2.1.0-rc.7'));
  for (const name of expectedAssets(tag)) {
    if (
      [
        'SHA256SUMS.txt',
        'provenance.json',
        `${tag}-source.zip`,
        'compiler-evidence.zip',
        'compiler-provenance.json',
        'codeql-evidence.zip',
        'codeql-reviewed-evidence.zip',
        'codeql-provenance.json',
        'python-codeql-evidence.zip',
        'python-codeql-reviewed-evidence.zip',
        'python-codeql-provenance.json',
        'native-compatibility.zip',
        'native-provenance.json',
        'source-profile-rc16.json',
      ].includes(name)
    )
      continue;
    const newEvidence = {
      'mainnet-deployment-2026-10-18.md': 'README.md',
      'mainnet-deployment-receipts-2026-10-18.json': 'deployment-receipts.json',
    };
    const expectedCopy = newEvidence[name]
      ? `cp docs/production/mainnet-2026-10-18/${newEvidence[name]} "$out/${name}"`
      : `${name} "$out/"`;
    assert.ok(workflow.includes(expectedCopy), `${name} missing from producer`);
  }
  assert.ok(
    workflow.includes('sha256sum -- *.json *.md *.zip > SHA256SUMS.txt')
  );
  assert.ok(
    workflow.includes(
      'node scripts/release/publish-source-release-rc16.cjs --collect-compiler-evidence'
    )
  );
});
test('standalone current guide keeps pinned links and current receipts retain exact public bytes', (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'current-evidence-assets-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.resolve(
    __dirname,
    '../../docs/production/mainnet-2026-10-18'
  );
  const guide = fs.readFileSync(path.join(sourceRoot, 'README.md'));
  const receiptBytes = fs.readFileSync(
    path.join(sourceRoot, 'deployment-receipts.json')
  );
  const hash = (bytes) =>
    crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    hash(guide),
    '6ca6b642d227c7c9f060cd28e7ca81a57deb3750da5b6b86a97b3140ba04b9af'
  );
  assert.equal(
    hash(receiptBytes),
    '69fac1728be59752d4aadc66157f6e533273c5d9bef3b71d86a97530ce7db576'
  );
  const receipts = JSON.parse(receiptBytes);
  assert.equal(receipts.sourceCommit, deploymentSnapshot.deployedSourceCommit);
  assert.equal(receipts.operations.length, 39);
  assert.deepEqual(
    receipts.operations.map((operation) => operation.nonce),
    Array.from({ length: 39 }, (_, index) => index + 308)
  );
  assert.ok(
    receipts.operations.every((operation) => operation.receipt.status === 1)
  );
  const target = path.join(root, 'reports/source-release-rc16');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, 'mainnet-deployment-2026-10-18.md'),
    guide
  );
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/source-release-rc16.yml'),
    'utf8'
  );
  const match = workflow.match(/node - <<'NODE'\n([\s\S]*?)\n {10}NODE/);
  assert.ok(match, 'the actual producer must prepare the standalone guide');
  const script = match[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  execFileSync(process.execPath, ['-e', script], { cwd: root });
  const rendered = fs.readFileSync(
    path.join(target, 'mainnet-deployment-2026-10-18.md'),
    'utf8'
  );
  assert.equal(
    hash(rendered),
    'f35f728d821a1b30c81e0151d3df138b01db891a0764ef6f2b91f7a5da7c027d'
  );
  const base = `https://github.com/MontrealAI/AGIJobsv0/blob/${deploymentSnapshot.recordCommit}/docs/production/`;
  for (const targetPath of [
    'mainnet-2026-10-18/deployment-snapshot.json',
    'mainnet-2026-10-18/deployment-receipts.json',
    'mainnet-deployment-2026-10-12.md',
    'readiness.md',
  ])
    assert.ok(rendered.includes(`](${base}${targetPath})`));
  assert.doesNotMatch(
    rendered,
    /\]\((?:deployment-(?:snapshot|receipts)\.json|\.\.\/)/
  );
});

function fixture() {
  const state = {
    main: sha,
    ref: null,
    release: null,
    uploads: 0,
    verifies: 0,
    mutations: 0,
    failAfter: 0,
  };
  const api = async (method, resource, body) => {
    if (method === 'GET') {
      if (resource === 'git/ref/heads/main')
        return { object: { sha: state.main } };
      if (resource.startsWith('git/ref/tags/')) return state.ref;
      if (resource.startsWith('releases/tags/')) return state.release;
    }
    state.mutations++;
    if (resource === 'git/refs')
      state.ref = { object: { type: 'commit', sha: body.sha } };
    else if (resource === 'releases') state.release = { id: 1, ...body };
    else if (method === 'PATCH') Object.assign(state.release, body);
    else throw Error('Unexpected API operation');
    if (state.failAfter === state.mutations)
      throw Error('Simulated interrupted response');
    return resource === 'git/refs' ? state.ref : state.release;
  };
  const run = (overrides = {}) =>
    publish({
      sha,
      tag,
      notes: 'Reviewed notes',
      api,
      upload: async () => {
        state.uploads++;
      },
      verify: async () => {
        state.verifies++;
      },
      ...overrides,
    });
  return { state, run };
}
test('fresh publication verifies assets before publishing; public retries do not mutate', async () => {
  const { state, run } = fixture();
  await run();
  assert.equal(state.release.draft, false);
  assert.equal(state.verifies, 1);
  const mutations = state.mutations,
    uploads = state.uploads;
  await run();
  assert.equal(state.mutations, mutations);
  assert.equal(state.uploads, uploads);
  assert.equal(state.verifies, 2);
});
test('interrupted tag, draft, publication responses and upload/download failures can resume at the same SHA', async () => {
  for (const failAfter of [1, 2, 3]) {
    const { state, run } = fixture();
    state.failAfter = failAfter;
    await assert.rejects(run(), /interrupted/);
    state.failAfter = 0;
    state.main = 'b'.repeat(40);
    await run();
    assert.equal(state.release.draft, false);
    assert.equal(state.ref.object.sha, sha);
  }
  for (const stage of ['upload', 'verify']) {
    const { state, run } = fixture();
    await assert.rejects(
      run({
        [stage]: async () => {
          throw Error('transfer interrupted');
        },
      }),
      /interrupted/
    );
    assert.equal(state.release.draft, true);
    await run();
    assert.equal(state.release.draft, false);
  }
});
test('different commits, unrelated releases and pre-reservation main movement fail without mutation', async () => {
  for (const setup of [
    (s) => (s.main = 'b'.repeat(40)),
    (s) => (s.ref = { object: { type: 'commit', sha: 'b'.repeat(40) } }),
    (s) => {
      s.ref = { object: { type: 'commit', sha } };
      s.release = {
        tag_name: tag,
        prerelease: true,
        draft: true,
        body: 'someone else',
      };
    },
  ]) {
    const { state, run } = fixture();
    setup(state);
    await assert.rejects(run());
    assert.equal(state.mutations, 0);
    assert.equal(state.uploads, 0);
  }
});
test('verification failure never publishes and public verification failure never edits assets', async () => {
  const { state, run } = fixture();
  await assert.rejects(
    run({
      verify: async () => {
        throw Error('checksum mismatch');
      },
    }),
    /checksum/
  );
  assert.equal(state.release.draft, true);
  await run();
  const mutations = state.mutations,
    uploads = state.uploads;
  await assert.rejects(
    run({
      verify: async () => {
        throw Error('checksum mismatch');
      },
    }),
    /checksum/
  );
  assert.equal(state.mutations, mutations);
  assert.equal(state.uploads, uploads);
});

test('compiler evidence rejects another head, producer, name, expiration or missing digest', () => {
  const {
    validateCompilerArtifact,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  const provenance = {
    sha,
    workflows: [
      {
        path: '.github/workflows/contracts.yml',
        id: 7,
        run_attempt: 2,
        head_sha: sha,
        conclusion: 'success',
      },
    ],
  };
  const artifact = {
    id: 8,
    name: `compiler-evidence-${sha}-7-2`,
    expired: false,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 7, head_sha: sha },
  };
  assert.equal(validateCompilerArtifact(provenance, artifact).id, 7);
  for (const changed of [
    { ...artifact, expired: true },
    { ...artifact, name: 'other' },
    { ...artifact, digest: null },
    { ...artifact, id: 0 },
    { ...artifact, id: 1.5 },
    { ...artifact, name: `compiler-evidence-${sha}-7-1` },
    { ...artifact, workflow_run: { id: 9, head_sha: sha } },
    { ...artifact, workflow_run: { id: 7, head_sha: 'c'.repeat(40) } },
  ])
    assert.throws(
      () => validateCompilerArtifact(provenance, changed),
      /producer/
    );
  for (const changed of [
    { id: 0 },
    { run_attempt: 0 },
    { run_attempt: undefined },
  ])
    assert.throws(
      () =>
        validateCompilerArtifact(
          {
            ...provenance,
            workflows: [{ ...provenance.workflows[0], ...changed }],
          },
          artifact
        ),
      /producer/
    );
});

test('compiler archive rejects tampered bytes, omitted files and mismatched inventories', () => {
  const {
    verifyCompilerArchive,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  const { createHash } = require('node:crypto');
  const compiler = require('../../config/solidity-compiler.json').longVersion;
  const contents = {
    'artifact.json': '{}',
    'input.json': '{"language":"Solidity"}',
    'build-info.json': '{}',
  };
  const contract = {
    contract: 'C',
    source: 'contracts/v2/C.sol',
    artifact: 'artifact.json',
    standardInput: 'input.json',
    buildInfo: 'build-info.json',
  };
  const index = {
    schema: 'agijobsv0/verification-inputs/1',
    compiler,
    contracts: [contract],
    files: Object.fromEntries(
      Object.entries(contents).map(([name, bytes]) => [
        name,
        createHash('sha256').update(bytes).digest('hex'),
      ])
    ),
  };
  const report = {
    compiler,
    projectSourceWarnings: 0,
    sizeGatePassed: true,
    contracts: [contract],
  };
  const archive = {
    'verification/index.json': JSON.stringify(index),
    'build.json': JSON.stringify(report),
    ...Object.fromEntries(
      Object.entries(contents).map(([name, bytes]) => [
        'verification/' + name,
        bytes,
      ])
    ),
  };
  const inspect = (files = archive) =>
    verifyCompilerArchive(Object.keys(files), (name) =>
      Buffer.from(files[name])
    );
  assert.deepEqual(inspect(), { compiler, contracts: 1 });
  assert.throws(
    () => inspect({ ...archive, 'verification/input.json': 'changed' }),
    /checksum/
  );
  assert.throws(() => inspect({ ...archive, extra: '{}' }), /inventory/);
  assert.throws(
    () =>
      inspect({
        ...archive,
        'build.json': JSON.stringify({ ...report, projectSourceWarnings: 1 }),
      }),
    /policy/
  );
  assert.throws(
    () =>
      inspect({
        ...archive,
        'build.json': JSON.stringify({
          ...report,
          contracts: [{ ...contract, contract: 'Other' }],
        }),
      }),
    /identities/
  );
});

test('producer identities require positive safe numeric scalars', () => {
  const {
    producerId,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  for (const id of [1, 123, Number.MAX_SAFE_INTEGER])
    assert.equal(producerId(id), id);
  for (const id of [
    '1',
    '../1',
    'https://example.com',
    {},
    [],
    null,
    true,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => producerId(id), /Malformed/);
});
test('source API boundary allows only exact supported methods and routes', () => {
  const {
    sourceApiUrl,
  } = require('../../scripts/release/publish-source-release-rc16.cjs');
  for (const [method, resource] of [
    ['GET', 'git/ref/heads/main'],
    ['GET', `git/ref/tags/${tag}`],
    ['GET', `releases/tags/${tag}`],
    ['GET', 'actions/artifacts/123'],
    ['GET', 'actions/runs/456/attempts/2'],
    ['GET', 'check-runs/9'],
    ['POST', 'git/refs'],
    ['POST', 'releases'],
    ['PATCH', 'releases/789'],
  ])
    assert.equal(
      sourceApiUrl(method, resource),
      `https://api.github.com/repos/MontrealAI/AGIJobsv0/${resource}`
    );
  for (const [method, resource] of [
    ['DELETE', 'releases/1'],
    ['POST', 'actions/artifacts/1'],
    ['GET', 'actions/artifacts/../secrets'],
    ['GET', 'actions/artifacts/1?x=2'],
    ['GET', 'actions/artifacts/1\n'],
    ['GET', 'actions/artifacts/0'],
    ['GET', 'actions/artifacts/1/extra'],
    ['GET', 'check-runs/0'],
    ['GET', 'check-runs/9?x=2'],
    ['GET', 'check-runs/9/extra'],
    [
      'GET',
      `commits/${'f'.repeat(40)}/check-runs?filter=latest&per_page=100&page=1`,
    ],
    [
      'GET',
      `commits/${compilerSourceBaseline}/check-runs?filter=latest&per_page=100&page=0`,
    ],
    [
      'GET',
      `commits/${compilerSourceBaseline}/check-runs?filter=latest&per_page=100&page=21`,
    ],
    [
      'GET',
      `commits/${compilerSourceBaseline}/check-runs?filter=all&per_page=100&page=1`,
    ],
    ['GET', '//example.com'],
    ['GET', 'https://example.com'],
    ['GET', 'git/ref/heads/other'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.9'],
    ['GET', 'releases/tags/source-v2.1.0-rc.9'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.12'],
    ['GET', 'releases/tags/source-v2.1.0-rc.12'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.14'],
    ['GET', 'releases/tags/source-v2.1.0-rc.14'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.15'],
    ['GET', 'releases/tags/source-v2.1.0-rc.15'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.13'],
    ['GET', 'releases/tags/source-v2.1.0-rc.13'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.11'],
    ['GET', 'releases/tags/source-v2.1.0-rc.11'],
    ['GET', 'git/ref/tags/source-v2.1.0-rc.10'],
    ['GET', 'releases/tags/source-v2.1.0-rc.10'],
    ['GET', 'releases/tags/source-v2.1.0-rc.8'],
    ['toString', 'releases'],
    ['GET', null],
  ])
    assert.throws(() => sourceApiUrl(method, resource), /Unsupported/);
  for (let page = 1; page <= 20; page++) {
    const resource = reviewedCodeqlPagePath(page);
    if (/^[a-f0-9]{40}$/.test(compilerSourceBaseline))
      assert.equal(
        sourceApiUrl('GET', resource),
        `https://api.github.com/repos/MontrealAI/AGIJobsv0/${resource}`
      );
    // The unreplaced release sentinel must not authorize an API source.
    else assert.throws(() => sourceApiUrl('GET', resource), /Unsupported/);
    const finalResource = reviewedCodeqlPagePath(page, sha);
    assert.equal(
      sourceApiUrl('GET', finalResource, sha),
      `https://api.github.com/repos/MontrealAI/AGIJobsv0/${finalResource}`
    );
    assert.throws(
      () => sourceApiUrl('GET', finalResource, 'f'.repeat(40)),
      /Unsupported/
    );
  }
  for (const page of [0, 21, '1', 1.5, null])
    assert.throws(() => reviewedCodeqlPagePath(page), /Invalid/);
});

test('rc.12 retains the exact published rc.11 notes and identifies its limits', () => {
  const read = (name) =>
    fs.readFileSync(path.resolve(__dirname, '../../docs/production', name));
  const original = read('history/RELEASE_NOTES_SOURCE_RC11_PUBLISHED.md');
  assert.equal(
    crypto.createHash('sha256').update(original).digest('hex'),
    '605b947ae60921d954b90d078adc286928d11880efa361e5638a6080c44712cd'
  );
  const pointer = read('RELEASE_NOTES_SOURCE_RC11.md').toString('utf8');
  assert.match(pointer, /5d7d89ccba236cc1fdf7067223dfae813bd64387/);
  assert.match(pointer, /partial owner-report escaping/);
  assert.match(pointer, /history\/RELEASE_NOTES_SOURCE_RC11_PUBLISHED\.md/);
  const current = read('RELEASE_NOTES_SOURCE_RC12.md').toString('utf8');
  assert.ok(current.startsWith('# source-v2.1.0-rc.12'));
  assert.match(current, /11c26f28751cf9042e2795782edf225cee9e6828/);
  assert.match(current, /29721b96ab4443e213afecfd423422aef1b327fe/);
  assert.match(current, /Production approval remains \*\*false\*\*/);
});

test('rc.13 preserves published rc.12 notes and states the source-only boundary', () => {
  const read = (name) =>
    fs.readFileSync(path.resolve(__dirname, '../../docs/production', name));
  assert.equal(
    crypto
      .createHash('sha256')
      .update(read('RELEASE_NOTES_SOURCE_RC12.md'))
      .digest('hex'),
    '9e10de3df71a6035bdacd81483a6ce3ae7af15d6a1eff414dc024ba88f3d0ef5'
  );
  const current = read('RELEASE_NOTES_SOURCE_RC13.md').toString('utf8');
  assert.ok(current.startsWith('# source-v2.1.0-rc.13'));
  assert.match(current, /bd45f34de1c1e58986aafb4b0e5c48bc155839ca/);
  assert.match(current, /3c17153942251116ee51163055eb1a25d652454b/);
  assert.match(current, /Production approval remains \*\*false\*\*/);
  assert.match(
    current,
    /authorityComplete.*sourceVerificationComplete.*activationReady/
  );
  assert.match(current, /Ledger.*EIP-1193.*EIP-7702/);
  assert.match(current, /Previous deployments remain outside/);
  assert.match(current, /Unpublished proposal/);
  assert.match(current, /not tagged or published/);
});

test('rc.14 consolidates flagship and deployment records without claiming rc.13 publication', () => {
  const notes = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../docs/production/RELEASE_NOTES_SOURCE_RC14.md'
    ),
    'utf8'
  );
  assert.ok(notes.startsWith('# source-v2.1.0-rc.14'));
  assert.match(notes, /70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/);
  assert.match(notes, /818b3a246871e4cd4dde86558dbb91ef82b15eef/);
  assert.match(notes, /Production approval remains \*\*false\*\*/);
  assert.match(notes, /all eight managed modules remain paused/);
  assert.match(notes, /rc\.13 was not tagged or published/);
  assert.match(notes, /39 successful/);
  for (const asset of [
    deploymentSnapshot.asset,
    'mainnet-deployment-2026-10-18.md',
    'mainnet-deployment-receipts-2026-10-18.json',
  ])
    assert.ok(expectedAssets(tag).includes(asset));
});

test('rc.15 preserves the published rc.14 checksum receipt, notes and retained evidence bytes', () => {
  // Independently downloaded from release 416750326 after publication. These
  // are the immutable rc.14 payloads, not a new rc.15 producer's checksums.
  const publishedReceipt = `43facdcacac7d2fe45bb2223969023f909bee1c59bc0f3b74c75487be9686d8c  compiler-provenance.json
ce2db778b31e50f2085e5e269cc83fa4aa59daa807543bb80066737ed754f314  configuration-readback-2026-10-13.json
2589882de18dbf7395b11e20fa1135966685671ecd8579433c1895f12a4b4c31  deployment-addresses.mainnet.json
7565891a776b1d058342818dec51d4f13f46b10ee2a497e74f3203f9ac1c31ff  ethereum-mainnet-2026-10-12.json
b4335f5763f73e8da664c3cd45ac7ca8fa6f0d3beb2780b209e50fd1e3def23f  jobs-mainnet-2026-10-18.json
69fac1728be59752d4aadc66157f6e533273c5d9bef3b71d86a97530ce7db576  mainnet-deployment-receipts-2026-10-18.json
995906a5a435cc0bb6ec53306d422c89f9488dcbfcc4097e9179e4e00cddbd04  provenance.json
48b1584546fa588b961eff8534daba37d7fea69ad557c85c599757213a53efdf  solidity-compiler.json
7cf35c789d6bc61f5e96a12542a8fd8dd1f1f38be2ab1b97d301f3304909c233  RELEASE_NOTES_SOURCE_RC14.md
48944bcc484100c8e42df3af57d7f56c6a3bf845c0054de3142e3bab287d2e38  compiler-warnings-2026-10-13.md
43c3fccf6e2ccd70ae95869cd50ddafd0ba882ffb1e2246ec114d0d8977fc5e2  mainnet-deployment-2026-10-12.md
f35f728d821a1b30c81e0151d3df138b01db891a0764ef6f2b91f7a5da7c027d  mainnet-deployment-2026-10-18.md
2f95601965ae6e2a01e8a09baabdc1fb6ab7408188b089f11c694207051e583c  compiler-evidence.zip
7221fdbf9b4e29475debb4f557e8ce4682f7a92a4e561fbb0af0877405417365  source-v2.1.0-rc.14-source.zip
`;
  const hash = (bytes) =>
    crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    hash(publishedReceipt),
    '1bb00255deb6175ac96bd3aa72020647131efd837ec9343b1dbc33c6e3c51c13'
  );
  const rows = publishedReceipt.trim().split('\n');
  assert.equal(rows.length, 14);
  const receipt = new Map(rows.map((row) => row.split('  ').reverse()));
  assert.equal(receipt.size, 14);
  assert.deepEqual(
    [...receipt.keys()].sort(),
    expectedAssets('source-v2.1.0-rc.14')
      .filter(
        (name) =>
          name !== 'SHA256SUMS.txt' &&
          !name.startsWith('codeql-') &&
          !name.startsWith('native-') &&
          !name.startsWith('python-codeql-') &&
          name !== 'source-profile-rc16.json'
      )
      .map((name) => name.replace('RC16.md', 'RC14.md'))
      .sort()
  );
  const retainedFiles = {
    'RELEASE_NOTES_SOURCE_RC14.md':
      'docs/production/RELEASE_NOTES_SOURCE_RC14.md',
    'configuration-readback-2026-10-13.json':
      'docs/deployments/evidence/configuration-readback-2026-10-13.json',
    'deployment-addresses.mainnet.json':
      'docs/deployment-addresses.mainnet.json',
    'ethereum-mainnet-2026-10-12.json':
      'docs/deployments/ethereum-mainnet-2026-10-12.json',
    'jobs-mainnet-2026-10-18.json': deploymentSnapshot.localPath,
    'mainnet-deployment-receipts-2026-10-18.json':
      'docs/production/mainnet-2026-10-18/deployment-receipts.json',
    'solidity-compiler.json': 'config/solidity-compiler.json',
    'compiler-warnings-2026-10-13.md':
      'docs/production/compiler-warnings-2026-10-13.md',
    'mainnet-deployment-2026-10-12.md':
      'docs/production/mainnet-deployment-2026-10-12.md',
  };
  for (const [asset, file] of Object.entries(retainedFiles))
    assert.equal(
      hash(fs.readFileSync(path.resolve(__dirname, '../..', file))),
      receipt.get(asset),
      `${asset} must preserve the published rc.14 bytes`
    );
});

test('rc.15 identifies computer-use evidence limits and preserves the exact-source publication boundary', () => {
  const notes = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../docs/production/RELEASE_NOTES_SOURCE_RC15.md'
    ),
    'utf8'
  );
  assert.ok(notes.startsWith('# source-v2.1.0-rc.15'));
  assert.match(notes, /fecde507f770481bfd68efddcb92230a0d885b53/);
  assert.match(
    notes,
    /7cf35c789d6bc61f5e96a12542a8fd8dd1f1f38be2ab1b97d301f3304909c233/
  );
  assert.match(notes, /Production approval remains \*\*false\*\*/);
  assert.match(notes, /no same-task superiority/);
  assert.match(notes, /INCUMBENT_RETAINED_PENDING_INDEPENDENT_REVIEW/);
  assert.match(notes, /scripted native Responses/);
  assert.match(notes, /not protected\nindependent holdouts/);
  assert.match(notes, /all 15 required workflow paths/);
  assert.match(notes, /14 checksummed payloads/);
  assert.match(notes, /No fixture-proof asset is added/);
  assert.equal(expectedAssets(tag).length, 24);
});

test('rc.16 preserves rc.15 notes and states exact computer evidence, settlement and gate boundaries', () => {
  const root = path.resolve(__dirname, '../..');
  const previous = fs.readFileSync(
    path.join(root, 'docs/production/RELEASE_NOTES_SOURCE_RC15.md')
  );
  assert.equal(
    crypto.createHash('sha256').update(previous).digest('hex'),
    '0ce2c2652e95a984fd49242716b5b2bfb9b6c06bab00bd2f60829ff4d8195513'
  );
  const notes = fs.readFileSync(
    path.join(root, 'docs/production/RELEASE_NOTES_SOURCE_RC16.md'),
    'utf8'
  );
  assert.ok(notes.startsWith('# ' + tag));
  for (const required of [
    'Production approval remains false',
    '96 scanner results',
    'not 96 established vulnerabilities',
    'separate CodeQL result check',
    'PROTOCOL_DOUBLE_NO_BROWSER',
    'unfunded proposal',
    'four native sealed A0 jobs reserve zero',
    'Mock',
    'Previous deployments stay read-only',
    'Ledger',
    'Mac Studio',
    'ENS configuration',
  ])
    assert.ok(notes.toLowerCase().includes(required.toLowerCase()), required);
  assert.equal(expectedAssets(tag).length, 24);
  assert.ok(expectedAssets(tag).includes('RELEASE_NOTES_SOURCE_RC16.md'));
  assert.ok(!expectedAssets(tag).includes('RELEASE_NOTES_SOURCE_RC15.md'));
});

test('raw SARIF requires successful complete extraction and preserves every full result instance', () => {
  const document = scannerDocument(),
    required = [
      'integrations/alpha-agent/native.mjs',
      'website/assets/computer-receipt-model.mjs',
    ];
  const inspect = (value) =>
    summarizeScannerSarif(JSON.stringify(value), required);
  const baseline = inspect(document);
  assert.equal(baseline.resultCount, 1);
  const duplicate = structuredClone(document);
  duplicate.runs[0].results.push(duplicate.runs[0].results[0]);
  assert.equal(inspect(duplicate).resultCount, 2);
  assert.deepEqual(inspect(duplicate).results, [
    baseline.results[0],
    baseline.results[0],
  ]);
  const changed = structuredClone(document);
  changed.runs[0].results[0].codeFlows[0].threadFlows[0].locations[0].location.message.text +=
    ' changed';
  assert.notDeepEqual(inspect(changed).results, baseline.results);
  for (const mutate of [
    (doc) => {
      doc.runs[0].invocations[0].executionSuccessful = false;
    },
    (doc) => {
      doc.runs[0].invocations[0].toolExecutionNotifications.pop();
    },
    (doc) => {
      doc.runs[0].properties.codeqlConfigSummary.queries.pop();
    },
    (doc) => {
      doc.runs[0].results[0].suppressions = [{ kind: 'external' }];
    },
    (doc) => {
      doc.runs[0].invocations[0].toolExecutionNotifications[0].locations[0].physicalLocation.artifactLocation.uri =
        '../escape.mjs';
    },
    (doc) => {
      doc.runs.push(doc.runs[0]);
    },
  ]) {
    const value = structuredClone(document);
    mutate(value);
    assert.throws(() => inspect(value));
  }
  const contents = scannerArchiveFixture(document);
  assert.throws(
    () =>
      verifyScannerArchive(
        [...Object.keys(contents), 'javascript.sarif'],
        (name) => contents[name],
        required,
        scannerContextFixture()
      ),
    /inventory/
  );
});

test('downloaded scanner archives require installed review, authenticated producer and full reconciliation', (t) => {
  const fixture = assetFixture(t);
  fixture.verify();
  for (const scannerEvidence of [
    undefined,
    { ...fixture.scannerEvidence, review: null },
    { ...fixture.scannerEvidence, finalObservation: undefined },
    { ...fixture.scannerEvidence, finalContext: undefined },
    {
      ...fixture.scannerEvidence,
      reviewedContext: fixture.scannerEvidence.finalContext,
    },
    {
      ...fixture.scannerEvidence,
      review: {
        ...fixture.scannerEvidence.review,
        summary: { ...fixture.scannerEvidence.review.summary, resultCount: 0 },
      },
    },
  ])
    assert.throws(
      () => fixture.verify(true, { scannerEvidence }),
      /Scanner|scanner/
    );
  const file = path.join(fixture.downloaded, 'codeql-provenance.json');
  const proof = JSON.parse(fs.readFileSync(file));
  proof.final.runAttempt++;
  fs.writeFileSync(file, JSON.stringify(proof));
  fixture.checksums(fixture.downloaded);
  fs.copyFileSync(file, path.join(fixture.directory, 'codeql-provenance.json'));
  assert.throws(() => fixture.verify(false), /scanner|Scanner/);
});

function scannerApiFixture(change = {}) {
  const producer = {
    runId: 40,
    runAttempt: 2,
    runNumber: 12,
    event: 'push',
    headBranch: 'main',
    artifactId: 41,
    artifactName: `codeql-security-report-${sha}-40-2`,
    githubDigest: 'sha256:' + 'a'.repeat(64),
  };
  const run = {
    id: 40,
    run_attempt: 2,
    run_number: 12,
    path: '.github/workflows/static-analysis.yml',
    head_sha: sha,
    repository: { full_name: 'MontrealAI/AGIJobsv0' },
    head_repository: { full_name: 'MontrealAI/AGIJobsv0' },
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: 41,
    name: producer.artifactName,
    digest: producer.githubDigest,
    expired: false,
    workflow_run: { id: 40, head_sha: sha, head_branch: 'main' },
  };
  const responses = {
    'actions/runs/40': run,
    'actions/runs/40/attempts/2': run,
    'actions/artifacts/41': artifact,
    [`actions/workflows/static-analysis.yml/runs?head_sha=${sha}&per_page=100&page=1`]:
      { total_count: 1, workflow_runs: [run] },
    'actions/runs/40/artifacts?&per_page=100&page=1': {
      total_count: 1,
      artifacts: [artifact],
    },
    ...change,
  };
  return {
    producer,
    run,
    artifact,
    api: async (method, resource) => {
      assert.equal(method, 'GET');
      assert.ok(Object.hasOwn(responses, resource), resource);
      return responses[resource];
    },
  };
}
test('scanner observation authenticates exact source, latest run/attempt and unique artifact', async () => {
  const fixture = scannerApiFixture();
  await readScannerObservation(fixture.api, fixture.producer, sha, true);
  for (const change of [
    { run_attempt: 3 },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { head_sha: 'b'.repeat(40) },
    { head_repository: { full_name: 'other/repo' } },
    { event: 'pull_request' },
    { head_branch: 'other' },
  ]) {
    const altered = scannerApiFixture({
      'actions/runs/40': { ...fixture.run, ...change },
    });
    await assert.rejects(
      readScannerObservation(altered.api, altered.producer, sha, true)
    );
  }
  const newer = scannerApiFixture({
    [`actions/workflows/static-analysis.yml/runs?head_sha=${sha}&per_page=100&page=1`]:
      {
        total_count: 2,
        workflow_runs: [
          fixture.run,
          { ...fixture.run, id: 42, run_number: 13, conclusion: 'failure' },
        ],
      },
  });
  await assert.rejects(
    readScannerObservation(newer.api, newer.producer, sha, true),
    /supersedes/
  );
  for (const artifact of [
    { ...fixture.artifact, expired: true },
    { ...fixture.artifact, digest: 'sha256:' + 'b'.repeat(64) },
    { ...fixture.artifact, workflow_run: { id: 40, head_sha: 'b'.repeat(40) } },
  ]) {
    const altered = scannerApiFixture({ 'actions/artifacts/41': artifact });
    await assert.rejects(
      readScannerObservation(altered.api, altered.producer, sha, true),
      /artifact/
    );
  }
});
test('scanner producer pagination refuses missing, duplicate, drifting and overbound data', async () => {
  for (const response of [
    { total_count: 1, artifacts: [] },
    { total_count: 2001, artifacts: [] },
    { total_count: 2, artifacts: [{ id: 1 }, { id: 1 }] },
  ])
    await assert.rejects(
      scannerPages(
        async () => response,
        'actions/runs/40/artifacts?',
        'artifacts'
      )
    );
  let page = 0;
  await assert.rejects(
    scannerPages(
      async () =>
        ++page === 1
          ? {
              total_count: 101,
              artifacts: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
            }
          : { total_count: 102, artifacts: [{ id: 101 }] },
      'actions/runs/40/artifacts?',
      'artifacts'
    ),
    /pagination/
  );
});

test('fully resealed scanner result changes cannot replace the installed independent review', (t) => {
  const fixture = assetFixture(t),
    changed = scannerDocument();
  changed.runs[0].results[0].codeFlows[0].threadFlows[0].locations[0].location.message.text =
    'Different benign test flow with the same primary location';
  const zip = path.join(fixture.directory, 'codeql-evidence.zip');
  const digest = fixture.writeCompilerZip(
    zip,
    scannerArchiveFixture(changed, fixture.scannerEvidence.finalContext)
  );
  fs.copyFileSync(zip, path.join(fixture.downloaded, 'codeql-evidence.zip'));
  const proof = structuredClone(fixture.scannerProof);
  proof.final.githubDigest = 'sha256:' + digest;
  proof.summary = scannerArchive(
    zip,
    fixture.scannerEvidence.requiredSources,
    fixture.scannerEvidence.finalContext
  );
  for (const directory of [fixture.directory, fixture.downloaded]) {
    fs.writeFileSync(
      path.join(directory, 'codeql-provenance.json'),
      JSON.stringify(proof)
    );
    fixture.checksums(directory);
  }
  assert.throws(
    () =>
      fixture.verify(false, {
        scannerEvidence: {
          ...fixture.scannerEvidence,
          finalObservation: { producer: proof.final },
        },
      }),
    /reconciliation differs/
  );
});
test('scanner evidence API routes stay source, workflow, page-size and page-count bounded', () => {
  for (const resource of [
    `actions/workflows/static-analysis.yml/runs?head_sha=${sha}&per_page=100&page=20`,
    'actions/runs/40/artifacts?&per_page=100&page=20',
    'actions/runs/40',
  ])
    assert.ok(sourceApiUrl('GET', resource, sha).endsWith(resource));
  for (const resource of [
    `actions/workflows/static-analysis.yml/runs?head_sha=${'f'.repeat(
      40
    )}&per_page=100&page=1`,
    `actions/workflows/other.yml/runs?head_sha=${sha}&per_page=100&page=1`,
    `actions/workflows/static-analysis.yml/runs?head_sha=${sha}&per_page=99&page=1`,
    'actions/runs/40/artifacts?&per_page=100&page=21',
    'actions/runs/40/artifacts?&per_page=100&page=0',
  ])
    assert.throws(() => sourceApiUrl('GET', resource, sha), /Unsupported/);
});
test('scanner observation rejects duplicate named artifacts and legitimate latest reruns remain usable', async () => {
  const fixture = scannerApiFixture();
  const duplicate = scannerApiFixture({
    'actions/runs/40/artifacts?&per_page=100&page=1': {
      total_count: 2,
      artifacts: [fixture.artifact, { ...fixture.artifact, id: 43 }],
    },
  });
  await assert.rejects(
    readScannerObservation(duplicate.api, duplicate.producer, sha, true),
    /artifact/
  );
  // Attempt2 is valid: the guard binds the currently successful attempt rather
  // than prohibiting reruns. A later pending/failing attempt is tested above.
  const result = await readScannerObservation(
    fixture.api,
    fixture.producer,
    sha,
    true
  );
  assert.equal(result.producer.runAttempt, 2);
  await assert.rejects(
    readScannerObservation(
      fixture.api,
      { ...fixture.producer, event: 'pull_request' },
      sha
    ),
    /producer/
  );
});
test('real retained 96-result SARIF supplies pinned historical scope, never current qualification', () => {
  const root = path.resolve(__dirname, '../..');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const context = scannerPolicyContext(
    (...args) =>
      execFileSync('git', ['--no-replace-objects', ...args], {
        cwd: root,
        encoding: 'utf8',
      }),
    source
  );
  const baseline = historicalScannerArchive(
    path.join(
      root,
      'docs/security/remediation-2026-10-19/baseline/original-codeql.zip'
    )
  );
  assert.equal(baseline.resultCount, 96);
  assert.ok(
    context.requiredSources.includes(
      'website/assets/computer-receipt-model.mjs'
    )
  );
  assert.ok(
    context.requiredSources.includes(
      'integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs'
    )
  );
  assert.ok(
    context.requiredSources.includes(
      'integrations/alpha-agent/vendor/alpha-computer/docs/assets/successor/engine.mjs'
    )
  );
  assert.ok(
    context.requiredSources.includes(
      'integrations/alpha-agent/four-repo-computer-lifecycle.cjs'
    )
  );
  assert.ok(!Object.hasOwn(context, 'qualified'));
});

test('four-file scanner evidence binds scope, extraction and actual SARIF to an independent execution context', () => {
  const context = scannerContextFixture(),
    document = scannerDocument(),
    contents = scannerArchiveFixture(document, context);
  const verify = (value = contents, expected = context) =>
    verifyScannerArchive(
      Object.keys(value),
      (name) => value[name],
      context.requiredExtractedFiles,
      expected
    );
  const summary = verify();
  assert.equal(summary.resultCount, 1);
  for (const field of [
    'source',
    'tree',
    'run',
    'attempt',
    'event',
    'ref',
    'configSha256',
  ]) {
    const expected = {
      ...context,
      [field]:
        typeof context[field] === 'number'
          ? context[field] + 1
          : context[field] + 'different',
    };
    assert.throws(() => verify(contents, expected), /context|scope|identity/);
  }
  for (const mutate of [
    (records) => {
      records['source-scope-after.json'].run++;
    },
    (records) => {
      records['source-scope-before.json'].historicalConfigSha256 = '0'.repeat(
        64
      );
      records['source-scope-after.json'] = records['source-scope-before.json'];
    },
    (records) => {
      records['source-extraction.json'].sarifSha256 = '0'.repeat(64);
    },
    (records) => {
      records['source-extraction.json'].rawResultCount = 0;
    },
    (records) => {
      records['source-extraction.json'].ruleIds = ['invented-rule'];
    },
    (records) => {
      records['source-extraction.json'].successfulExtractionFiles.pop();
    },
    (records) => {
      records['source-extraction.json'].missingRequiredExtractedFiles = [
        'integrations/alpha-agent/native.mjs',
      ];
    },
    (records) => {
      records['source-extraction.json'].resultDisposition = 'APPROVED';
    },
    (records) => {
      records['source-extraction.json'].extra = true;
    },
    (records) => {
      records['source-scope-before.json'].requiredExtractedFiles = [];
      records['source-scope-after.json'] = records['source-scope-before.json'];
    },
  ]) {
    const records = Object.fromEntries(
      Object.entries(contents)
        .filter(([name]) => name.endsWith('.json'))
        .map(([name, raw]) => [name, JSON.parse(raw)])
    );
    mutate(records);
    assert.throws(() =>
      verify({
        ...contents,
        ...Object.fromEntries(
          Object.entries(records).map(([name, value]) => [
            name,
            JSON.stringify(value),
          ])
        ),
      })
    );
  }
  for (const name of Object.keys(contents)) {
    const missing = { ...contents };
    delete missing[name];
    assert.throws(() => verify(missing), /inventory/);
  }
  assert.throws(() => verify({ ...contents, 'extra.json': '{}' }), /inventory/);
  assert.throws(
    () => verify({ 'javascript.sarif': contents['javascript.sarif'] }),
    /inventory/
  );
  assert.throws(() => verify(contents, null), /context/);
});

test('additive native evidence and finite source claims remain bound after resealing transport checksums', (t) => {
  const fixture = assetFixture(t);
  fixture.verify(false);
  assert.throws(
    () =>
      fixture.verify(false, {
        nativeArtifact: {
          ...fixture.nativeArtifact,
          name: 'native-ti-compatibility-' + sha + '-30-1',
        },
      }),
    /artifact identity/
  );
  assert.throws(
    () =>
      fixture.verify(false, {
        nativeRun: { ...fixture.nativeRun, run_attempt: 3 },
      }),
    /artifact identity|qualified run/
  );
  for (const mutate of [
    (value) => {
      value.sourceProfile.integrationTransitions[0].after.blob = '0'.repeat(40);
    },
    (value) => {
      value.sourceProfile.integrationBaseline = '0'.repeat(40);
    },
    (value) => {
      value.sourceProfile.compilerSourceBaseline = '0'.repeat(40);
    },
    (value) => {
      value.sourceProfile.scannerRequiredPaths.pop();
    },
  ]) {
    const value = JSON.parse(JSON.stringify(fixture.provenance));
    mutate(value);
    fs.writeFileSync(
      path.join(fixture.downloaded, 'provenance.json'),
      JSON.stringify(value)
    );
    fixture.checksums(fixture.downloaded);
    assert.throws(() => fixture.verify(false), /finite source profile/);
  }
  fs.writeFileSync(
    path.join(fixture.downloaded, 'provenance.json'),
    JSON.stringify(fixture.provenance)
  );
  const record = JSON.parse(
    fs.readFileSync(path.join(fixture.downloaded, 'native-provenance.json'))
  );
  const changed = { ...record.summary, alphaCommit: '0'.repeat(40) };
  const digest = fixture.writeCompilerZip(
    path.join(fixture.downloaded, 'native-compatibility.zip'),
    { 'native-compatibility.json': JSON.stringify(changed) }
  );
  fs.writeFileSync(
    path.join(fixture.downloaded, 'native-provenance.json'),
    JSON.stringify({
      ...record,
      githubDigest: 'sha256:' + digest,
      downloadedSha256: digest,
      summary: changed,
    })
  );
  fixture.checksums(fixture.downloaded);
  for (const name of ['native-compatibility.zip', 'native-provenance.json'])
    fs.copyFileSync(
      path.join(fixture.downloaded, name),
      path.join(fixture.directory, name)
    );
  fixture.checksums(fixture.directory);
  assert.throws(
    () =>
      fixture.verify(false, {
        nativeArtifact: {
          ...fixture.nativeArtifact,
          digest: 'sha256:' + digest,
        },
      }),
    /different Alpha source/
  );
});

test('public readback always retains JavaScript/native validation and refuses absent authenticated Python evidence', (t) => {
  // Existing retained JavaScript/native test data deliberately contains no
  // successful Python scan. These two new payloads are invalid on purpose.
  const fixture = assetFixture(t);
  fixture.verify();
  assert.throws(
    () => fixture.verifyAll(),
    /JSON|Unexpected|Retained|producer/i
  );
  fs.appendFileSync(
    path.join(fixture.downloaded, 'solidity-compiler.json'),
    'altered'
  );
  assert.throws(() => fixture.verifyAll(), /checksum mismatch/);
});

test('publisher authenticates retained local evidence before any tag, draft, upload or remote download', async (t) => {
  // INERT_ORCHESTRATION_ONLY: execute the actual CLI main body with isolated
  // prerequisite adapters and stop at an ordinary read/API or verifier refusal.
  // No successful scanner report, authenticated evidence or publication exists.
  const vm = require('node:vm');
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../scripts/release/publish-source-release-rc16.cjs'
    ),
    'utf8'
  );
  const start = source.indexOf('async function main() {');
  const end = source.indexOf('\nmodule.exports = {', start);
  assert(
    start >= 0 && end > start,
    'The actual publisher CLI main is required'
  );
  const mainSource = source.slice(start, end);
  for (const refusal of ['api', 'verifier']) {
    await t.test(
      refusal + ' refusal leaves publication effects untouched',
      async () => {
        const calls = [];
        const directory = path.resolve('reports/source-release-rc16');
        const marker = 'INERT_LOCAL_' + refusal.toUpperCase() + '_REFUSAL';
        const metadata = {
          'compiler-provenance.json': {
            artifactId: 1,
            runId: 2,
            runAttempt: 1,
          },
          'provenance.json': { reviewedSourceCodeql: {} },
          'codeql-provenance.json': {
            final: { runId: 3, runAttempt: 1 },
            reviewed: {},
          },
          'native-provenance.json': { artifactId: 4, runId: 5, runAttempt: 1 },
          'python-codeql-provenance.json': {
            final: { producer: {} },
            reviewed: { producer: {} },
          },
        };
        const context = {
          process: {
            env: {
              GITHUB_SHA: sha,
              GITHUB_REPOSITORY: 'MontrealAI/AGIJobsv0',
              GH_TOKEN: 'INERT_NEVER_USED_FOR_NETWORK',
              TAG: tag,
            },
            cwd: () => '/inert-publication-only',
          },
          path,
          os,
          AbortSignal,
          console,
          profile: { pythonScannerReview: { sourceCommit: 'b'.repeat(40) } },
          scannerReview: { sourceSha: 'b'.repeat(40) },
          verifyPublicationReview: () => ({
            metadataAdmissionOnly: true,
            productionApproved: false,
          }),
          gitSource: (...args) => {
            assert.equal(args[0], 'rev-parse');
            return args[1] === 'HEAD' ? sha : 'c'.repeat(40);
          },
          assertPinnedAlphaCheckout: () => calls.push('prerequisite pin check'),
          verifySourceProfile: () => calls.push('prerequisite source check'),
          verifyScannerReviewSource: () =>
            calls.push('prerequisite metadata check'),
          scannerPolicyContext: () => ({}),
          expectedAssets,
          fs: {
            readdirSync: (requested) => {
              assert.equal(requested, directory);
              return expectedAssets(tag);
            },
            readFileSync: (requested) =>
              JSON.stringify(metadata[path.basename(requested)] || {}),
            mkdtempSync: () => {
              calls.push('remote download directory');
              throw Error('INERT_REMOTE_DOWNLOAD_MUST_REMAIN_UNREACHED');
            },
          },
          execFileSync: () => {
            calls.push('gh effect');
            throw Error('INERT_GH_MUST_REMAIN_UNREACHED');
          },
          sourceApiUrl,
          fetch: async (_url, options) => {
            assert.equal(options.method, 'GET');
            calls.push('local evidence GET');
            if (refusal === 'api') throw Error(marker);
            return { ok: true, json: async () => ({}) };
          },
          producerId:
            require('../../scripts/release/publish-source-release-rc16.cjs')
              .producerId,
          readReviewedCodeql: async () => ({}),
          readLatestCodeql: async () => [],
          readScannerObservation: async () => ({}),
          require: (name) => {
            assert.equal(name, './source-python-evidence-rc16.cjs');
            return { readPythonScannerObservation: async () => ({}) };
          },
          scannerExecutionContext: () => ({}),
          verifyDownloadedAssets: (options) => {
            assert.equal(refusal, 'verifier');
            assert.equal(options.downloaded, directory);
            assert.equal(options.directory, directory);
            assert.equal(options.draft, true);
            calls.push('full local evidence verifier');
            throw Error(marker);
          },
          verifyIntegratedScannerArchive: () => {
            throw Error('INERT_INTEGRATED_VERIFIER_MUST_REMAIN_UNREACHED');
          },
          publish: async () => {
            calls.push('publication effect');
            throw Error('INERT_PUBLICATION_MUST_REMAIN_UNREACHED');
          },
        };
        const main = vm.runInNewContext('(' + mainSource + '\n)', context);
        await assert.rejects(main(), new RegExp(marker));
        assert(calls.includes('local evidence GET'));
        assert.equal(
          calls.includes('full local evidence verifier'),
          refusal === 'verifier'
        );
        for (const effect of [
          'publication effect',
          'gh effect',
          'remote download directory',
        ])
          assert.equal(
            calls.includes(effect),
            false,
            effect + ' must remain untouched'
          );
      }
    );
  }
});

test('inert JavaScript observation binds the artifact branch for reviewed S1 and final-main S2', async () => {
  // Synthetic API metadata only. No scanner archive, result review or actual
  // authenticated observation is created or claimed by this test.
  for (const [branch, finalSource] of [
    ['fix/processed-codeql-release-proof-20261020', false],
    ['main', true],
  ]) {
    const fixture = scannerApiFixture();
    fixture.producer.headBranch = branch;
    fixture.run.head_branch = branch;
    fixture.artifact.workflow_run.head_branch = branch;
    const observation = await readScannerObservation(
      fixture.api,
      fixture.producer,
      sha,
      finalSource
    );
    assert.equal(observation.artifact.workflow_run.head_branch, branch);
    for (const wrongBranch of [undefined, null, 'other-branch']) {
      // Both direct metadata and the inventory share this same object, so their
      // canonical equality still holds. The branch conjunction must refuse it.
      fixture.artifact.workflow_run.head_branch = wrongBranch;
      await assert.rejects(
        readScannerObservation(fixture.api, fixture.producer, sha, finalSource),
        /Scanner artifact identity differs/
      );
    }
    if (!finalSource) {
      fixture.artifact.workflow_run.head_branch = branch;
      await assert.rejects(
        readScannerObservation(fixture.api, fixture.producer, sha, true),
        /Final scanner producer must be a main push/
      );
    }
  }
});
