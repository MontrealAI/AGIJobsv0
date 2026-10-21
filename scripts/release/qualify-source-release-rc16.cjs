'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { requiredWorkflows } = require('./check-release-ci.js');

const {
  assertPinnedAlphaCheckout,
} = require('../../integrations/alpha-agent/pinned-alpha-checkout.cjs');
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
const ownPath = '.github/workflows/source-release-rc16.yml';
const nativeGate = require('./source-native-gates-rc16.cjs');
const serviceEvidence = require('./source-codeql-service-rc16.cjs');
const {
  profile,
  verifySourceScope: verifySourceProfile,
  verifyPublicationReview,
} = require('./source-profile-rc16.cjs');
const releaseVersion = '2.1.0-rc.17';
const deployedSourceBaseline = 'b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e';
const evidenceBaseline = '9c730e0188594089e27ed0589c2b5ca57eec5cf5';
// Additive reference evidence: this is not an assertion that the deployed
// compiler/source tree equals the source qualified for this release.
const deploymentSnapshot = Object.freeze({
  asset: 'jobs-mainnet-2026-10-18.json',
  localPath: 'website/data/jobs-mainnet-2026-10-18.json',
  repository: 'MontrealAI/AGIJobsv0',
  recordCommit: '284351148d96c5390a655aec1f9db806284f2400',
  recordPath: 'docs/production/mainnet-2026-10-18/deployment-snapshot.json',
  sha256: 'b4335f5763f73e8da664c3cd45ac7ca8fa6f0d3beb2780b209e50fd1e3def23f',
  deployedSourceCommit: '818b3a246871e4cd4dde86558dbb91ef82b15eef',
  deployedSourceTree: 'b1c3bb0f4b8d64e0d23376d6b6ef3722c4c67b0d',
  currentMainEquivalenceNotAssumed: true,
  liveRecheckedByThisRelease: false,
});

function verifyDeploymentSnapshot(bytes) {
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== deploymentSnapshot.sha256)
    throw Error('Pinned deployment snapshot hash mismatch');
  return deploymentSnapshot;
}
// Select the genuinely reviewed integrated security/compiler/tooling source
// after its code is frozen. The pending marker deliberately prevents premature
// publication; metadata selection cannot substitute for exact-source review.
// Protected paths, compiler policy and historical evidence remain unchanged.
const scannerReviewPath = 'docs/production/RELEASE_NOTES_SOURCE_RC17.md';
const scannerHistory = Object.freeze({
  configSha256:
    '4b34450e1dcc0b489feea158d642a6b66261d9e935463928782219c8716c0892',
  findingsSha256:
    '3bb26ea360c74550cf8c3561085a742e55d058a03ca6658e74efb7e344bd7b0f',
  originalArchiveSha256:
    'c7dd344ab78de98d423d3294db17c1c7b810afa531df7416271f813096c25ba9',
});
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
function exactFields(value, names) {
  return (
    value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    canonical(Object.keys(value).sort()) === canonical([...names].sort())
  );
}
function parseScannerReview(notes) {
  if (typeof notes !== 'string' || Buffer.byteLength(notes) > 8 * 1024 * 1024)
    throw Error('Bounded rc16 scanner review notes required');
  const marker = /<!-- rc16-scanner-review\n([\s\S]*?)\n-->/g;
  const matches = [...notes.matchAll(marker)];
  if (matches.length !== 1)
    throw Error('Exactly one rc16 scanner review block is required');
  const review = JSON.parse(matches[0][1]);
  // Require a normal JSON serialization (whitespace may differ), rejecting
  // duplicate keys and alternate numeric/string spellings in approval metadata.
  const compact = matches[0][1].replace(/"(?:\\.|[^"\\])*"|\s+/g, (token) =>
    token[0] === '"' ? token : ''
  );
  if (compact !== JSON.stringify(review))
    throw Error('Scanner review must use canonical JSON fields');
  if (review === null) return null;
  if (
    !exactFields(review, [
      'schema',
      'sourceSha',
      'sourceTree',
      'producer',
      'summary',
      'resultReviews',
      'codeqlChecks',
      'history',
      'reviewLinks',
    ]) ||
    review.schema !== 'agijobsv0/rc16-scanner-review/1' ||
    !/^[a-f0-9]{40}$/.test(review.sourceSha || '') ||
    !/^[a-f0-9]{40}$/.test(review.sourceTree || '') ||
    canonical(review.history) !== canonical(scannerHistory) ||
    !exactFields(review.producer, [
      'runId',
      'runAttempt',
      'runNumber',
      'event',
      'headBranch',
      'artifactId',
      'artifactName',
      'githubDigest',
    ]) ||
    !['runId', 'runAttempt', 'runNumber', 'artifactId'].every(
      (key) =>
        Number.isSafeInteger(review.producer[key]) && review.producer[key] > 0
    ) ||
    review.producer.event !== 'push' ||
    typeof review.producer.headBranch !== 'string' ||
    !review.producer.headBranch ||
    review.producer.headBranch.length > 255 ||
    review.producer.artifactName !==
      `codeql-security-report-${review.sourceSha}-${review.producer.runId}-${review.producer.runAttempt}` ||
    !/^sha256:[a-f0-9]{64}$/.test(review.producer.githubDigest || '') ||
    !exactFields(review.summary, [
      'schema',
      'toolSha256',
      'queriesSha256',
      'extractedPaths',
      'results',
      'resultCount',
    ]) ||
    review.summary.schema !== 'agijobsv0/raw-codeql-summary/1' ||
    !['toolSha256', 'queriesSha256'].every((key) =>
      /^[a-f0-9]{64}$/.test(review.summary[key] || '')
    ) ||
    !Array.isArray(review.summary.extractedPaths) ||
    !review.summary.extractedPaths.length ||
    review.summary.extractedPaths.length > 100000 ||
    !review.summary.extractedPaths.every(
      (name) =>
        typeof name === 'string' &&
        name &&
        !/[\\\r\n\0]/.test(name) &&
        !name.startsWith('/') &&
        name.split('/').every((part) => part && part !== '.' && part !== '..')
    ) ||
    canonical([...new Set(review.summary.extractedPaths)].sort()) !==
      canonical(review.summary.extractedPaths) ||
    !Array.isArray(review.summary.results) ||
    review.summary.results.length > 100000 ||
    !review.summary.results.every((digest) => /^[a-f0-9]{64}$/.test(digest)) ||
    canonical([...review.summary.results].sort()) !==
      canonical(review.summary.results) ||
    review.summary.resultCount !== review.summary.results.length ||
    !Array.isArray(review.reviewLinks) ||
    !Array.isArray(review.resultReviews) ||
    review.resultReviews.length !== review.summary.results.length ||
    !review.resultReviews.every(
      (item, index) =>
        exactFields(item, [
          'sha256',
          'disposition',
          'rationale',
          'reviewLink',
        ]) &&
        item.sha256 === review.summary.results[index] &&
        [
          'source-corrected',
          'reviewed-nonsecurity',
          'reviewed-residual-risk',
          'quality-only',
        ].includes(item.disposition) &&
        typeof item.rationale === 'string' &&
        item.rationale.trim().length >= 20 &&
        item.rationale.length <= 4000 &&
        review.reviewLinks.includes(item.reviewLink)
    ) ||
    !review.reviewLinks.length ||
    review.reviewLinks.length > 20 ||
    new Set(review.reviewLinks).size !== review.reviewLinks.length ||
    !review.reviewLinks.every(
      (url) =>
        typeof url === 'string' &&
        /^https:\/\/github\.com\/MontrealAI\/AGIJobsv0\/pull\/[1-9][0-9]*#(?:issuecomment-|discussion_r)[1-9][0-9]*$/.test(
          url
        )
    ) ||
    !Array.isArray(review.codeqlChecks) ||
    !review.codeqlChecks.length ||
    review.codeqlChecks.length > 2000 ||
    new Set(review.codeqlChecks.map((item) => item?.id)).size !==
      review.codeqlChecks.length ||
    !review.codeqlChecks.every(
      (item) =>
        exactFields(item, [
          'id',
          'headSha',
          'name',
          'appId',
          'appSlug',
          'status',
          'conclusion',
          'url',
        ]) &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        item.headSha === review.sourceSha &&
        item.name === 'CodeQL' &&
        item.appId === 57789 &&
        item.appSlug === 'github-advanced-security' &&
        item.status === 'completed' &&
        item.conclusion === 'success' &&
        item.url === `https://github.com/MontrealAI/AGIJobsv0/runs/${item.id}`
    )
  )
    throw Error('Malformed rc16 scanner review record');
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(review);
}
const scannerReview = parseScannerReview(
  fs.readFileSync(
    require('node:path').join(__dirname, '../..', scannerReviewPath),
    'utf8'
  )
);
const compilerSourceBaseline =
  scannerReview?.sourceSha || 'REVIEW_REQUIRED_FOR_RC16';
function verifyScannerReviewSource({ git, sha, review = scannerReview }) {
  if (!review) throw Error('rc16 scanner review is pending; no publication');
  const role = profile.scannerPolicy.reviewedProducer;
  if (
    role?.event !== 'push' ||
    role.ref !== 'refs/heads/' + role.headBranch ||
    review.producer?.event !== role.event ||
    review.producer?.headBranch !== role.headBranch
  )
    throw Error(
      'Reviewed scanner source differs from its exact finite producer role'
    );
  require('./source-scanner-review-bindings-rc16.cjs').verifyThreeSlotReviewBinding(
    {
      sourceSha: review.sourceSha,
      sha,
      review,
      field: 'notesReview',
      git,
      parseNotes: parseScannerReview,
      notesPath: scannerReviewPath,
    }
  );
  return review;
}
function verifyScannerReviewInstallBinding(options) {
  const { sha, review, git, field = 'scannerReview' } = options;
  const {
    validateScannerReviewMetadata,
    verifyThreeSlotReviewBinding,
  } = require('./source-scanner-review-bindings-rc16.cjs');
  validateScannerReviewMetadata(field, review, { git, target: sha });
  // An S1 raw archive is checked against its separately installed review on S2.
  // Its same-source parser stage still requires independent authenticated S1
  // ZIP/run/artifact checks; installed production admission is always strict.
  if (review.sourceCommit === sha) return;
  if (typeof git !== 'function')
    throw Error('Scanner review does not bind this source');
  return verifyThreeSlotReviewBinding({
    sourceSha: review.sourceCommit,
    sha,
    review,
    field,
    git,
    parseNotes: parseScannerReview,
    notesPath: scannerReviewPath,
  });
}
function verifyScannerReviewBinding(options) {
  return verifyScannerReviewInstallBinding({
    ...options,
    field: 'scannerReview',
  });
}

const preservedEvidencePaths = [
  'docs/deployments/',
  'docs/deployment-addresses.json',
  'docs/deployment-addresses.mainnet.json',
  'docs/production/mainnet-deployment-2026-10-12.md',
  'docs/production/escrow-verification-2026-10-12.md',
  'docs/production/RELEASE_NOTES_SOURCE_RC5.md',
  'scripts/verification/',
];
const reviewedCompilerPaths = [
  'contracts/',
  'scripts/deploy/',
  'scripts/v2/',
  'scripts/generate-constants.ts',
  'scripts/generate-constants-impl.ts',
  'scripts/ci/',
  'hardhat.config.js',
  'hardhat.coverage.config.js',
  'foundry.toml',
  'truffle-config.js',
  'config/solidity-compiler.json',
  'config/implementation-modules.json',
  'config/foundry-toolchain.json',
  'scripts/production/commissioning.cjs',
  'scripts/production/rehearse.cjs',
  'demo/',
  '.github/workflows/release.yml',
  'scripts/release/',
  ':(exclude)scripts/release/qualify-source-release.cjs',
  ':(exclude)scripts/release/publish-source-release.cjs',
  'ci/',
];

function verifySourceScope({
  git,
  sha,
  policy,
  version,
  compilerBaseline = compilerSourceBaseline,
  review = scannerReview,
}) {
  if (!/^[a-f0-9]{40}$/.test(compilerBaseline))
    throw Error('A reviewed compiler source SHA is required');
  if (
    version !== releaseVersion ||
    policy?.version !== '0.8.37' ||
    policy.longVersion !== '0.8.37+commit.f401782d' ||
    policy.evmVersion !== 'cancun' ||
    policy.optimizerRuns !== 200 ||
    policy.viaIR !== true
  )
    throw Error('Source release version or compiler policy mismatch');
  for (const baseline of [
    deployedSourceBaseline,
    evidenceBaseline,
    compilerBaseline,
  ])
    git('merge-base', '--is-ancestor', baseline, sha);
  git(
    'diff',
    '--exit-code',
    evidenceBaseline,
    sha,
    '--',
    ...preservedEvidencePaths
  );
  const compilerChanges = String(
    git(
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--name-only',
      '-z',
      compilerBaseline,
      sha,
      '--',
      ...reviewedCompilerPaths
    )
  )
    .split('\0')
    .filter(Boolean);
  if (compilerChanges.length) {
    if (
      compilerChanges.length !== 1 ||
      compilerChanges[0] !== 'scripts/release/source-profile-rc17.json' ||
      review?.sourceSha !== compilerBaseline
    )
      throw Error(
        'Reviewed compiler source changed beyond validated review slots'
      );
    // The common relation proves exact two-value-span normalization, regular
    // modes and every intermediate source byte; no whole-file exemption.
    verifyScannerReviewSource({ git, sha, review });
    const {
      projectThreeSlotProfile,
    } = require('./source-scanner-review-bindings-rc16.cjs');
    const profilePath = 'scripts/release/source-profile-rc17.json';
    if (
      projectThreeSlotProfile(
        String(git('show', `${compilerBaseline}:${profilePath}`))
      ).projection !==
      projectThreeSlotProfile(String(git('show', `${sha}:${profilePath}`)))
        .projection
    )
      throw Error(
        'Reviewed compiler profile changed beyond its exact validated review value spans'
      );
  } else
    git(
      'diff',
      '--exit-code',
      compilerBaseline,
      sha,
      '--',
      ...reviewedCompilerPaths
    );
  return {
    deployedSourceBaseline,
    evidenceBaseline,
    compilerSourceBaseline: compilerBaseline,
    preservedEvidencePaths,
    reviewedCompilerPaths,
    compiler: policy.longVersion,
  };
}
const requiredPaths = [
  ...requiredWorkflows,
  'pages.yml',
  'escrow-replay-regression.yml',
  'actionlint.yml',
  'successor-computer.yml',
]
  .map((name) => `.github/workflows/${name}`)
  .concat(nativeGate.requiredPaths)
  .concat('.github/workflows/static-analysis-python-integrations.yml')
  .filter((name, index, all) => all.indexOf(name) === index);
const requiredChecks = [
  ...new Set(
    [
      ...require('../../ci/required-contexts.json'),
      ...require('../../ci/required-companion-contexts.json'),
    ]
      .map((name) => name.split(' / ').slice(1).join(' / '))
      .concat(nativeGate.requiredChecks)
      .concat('Python integration CodeQL analysis')
  ),
];

// Code scanning's result check is a separate GitHub App from the Actions job.
// Main pushes may not create it, so the reviewed PR source must supply its
// successful result; any result observed on the final SHA also remains binding.
function evaluateCodeql(checks, sha, required = true) {
  const results = checks.filter(
    (check) =>
      check.head_sha === sha &&
      check.name === 'CodeQL' &&
      check.app?.id === 57789 &&
      check.app?.slug === 'github-advanced-security'
  );
  const failures = [];
  const pending = [];
  if (required && !results.length)
    pending.push('CodeQL (GitHub Advanced Security): missing');
  for (const check of results) {
    if (
      !Number.isSafeInteger(check.id) ||
      check.id < 1 ||
      check.html_url !==
        `https://github.com/MontrealAI/AGIJobsv0/runs/${check.id}`
    )
      failures.push('CodeQL (GitHub Advanced Security): malformed identity');
    else if (check.status !== 'completed')
      pending.push(`CodeQL (GitHub Advanced Security): ${check.status}`);
    else if (check.conclusion !== 'success')
      failures.push(`CodeQL (GitHub Advanced Security): ${check.conclusion}`);
  }
  return {
    ready: !failures.length && !pending.length,
    failures,
    pending,
    checks: results.map((check) => ({
      id: check.id,
      headSha: check.head_sha,
      name: check.name,
      appId: check.app.id,
      appSlug: check.app.slug,
      status: check.status,
      conclusion: check.conclusion,
      url: check.html_url,
    })),
  };
}

const historicalReviewedCodeql = Object.freeze({
  sourceSha: 'f2a8d2382b9a40814579f7a8be44046f247e0fd7',
  checkId: 118411754521,
});

// Retained f2 evidence remains a separate historical prerequisite. It never
// approves changed producer, verifier or installation bytes.
function verifyHistoricalReviewedCodeql(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check))
    throw Error(
      'Historical f2 Advanced Security prerequisite is not authenticated'
    );
  const observed = evaluateCodeql([check], historicalReviewedCodeql.sourceSha);
  if (
    check?.id !== historicalReviewedCodeql.checkId ||
    check?.head_sha !== historicalReviewedCodeql.sourceSha ||
    !observed.ready ||
    observed.checks.length !== 1
  )
    throw Error(
      'Historical f2 Advanced Security prerequisite is not authenticated'
    );
  return {
    sourceSha: historicalReviewedCodeql.sourceSha,
    check: observed.checks[0],
  };
}

function evaluate(runs, checks, sha, processedCodeql) {
  const latest = new Map();
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
  const failures = [],
    pending = [];
  for (const path of requiredPaths)
    if (!latest.has(path)) pending.push(`${path}: missing`);
  for (const run of latest.values()) {
    if (run.status !== 'completed') pending.push(`${run.path}: ${run.status}`);
    else if (run.conclusion !== 'success')
      failures.push(`${run.path}: ${run.conclusion}`);
  }
  const trusted = checks.filter(
    (c) => c.head_sha === sha && c.app?.slug === 'github-actions'
  );
  for (const c of trusted) {
    if (c.name === 'Publish qualified rc.17 source prerelease') continue;
    if (c.status !== 'completed') pending.push(`${c.name}: ${c.status}`);
    else if (!['success', 'skipped', 'neutral'].includes(c.conclusion))
      failures.push(`${c.name}: ${c.conclusion}`);
  }
  for (const name of requiredChecks) {
    const matching = trusted.filter((c) => c.name === name);
    if (!matching.length) pending.push(`${name}: missing`);
    for (const c of matching) {
      if (c.status !== 'completed') pending.push(`${name}: ${c.status}`);
      else if (c.conclusion !== 'success')
        failures.push(`${name}: ${c.conclusion}`);
    }
  }
  const nativeState = nativeGate.evaluate(runs, checks, sha, processedCodeql);
  failures.push(...nativeState.failures);
  pending.push(...nativeState.pending);
  const codeql = evaluateCodeql(checks, sha, false);
  failures.push(...codeql.failures);
  pending.push(...codeql.pending);
  return {
    ready: !failures.length && !pending.length,
    failures,
    pending,
    workflows: [...latest.values()],
    codeql: nativeState.codeql,
    processedCodeql: nativeState.processedCodeql,
  };
}

async function readPages(path, key, token) {
  const values = [];
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(
      `https://api.github.com/repos/MontrealAI/AGIJobsv0/${path}&per_page=100&page=${page}`,
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
    if (!response.ok)
      throw Error(`GitHub qualification HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data[key]))
      throw Error('Malformed qualification response');
    values.push(...data[key]);
    if (data[key].length < 100) return values;
  }
  throw Error('Refusing truncated qualification evidence');
}

function verifyQualificationIdentity(environment = process.env) {
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
    GITHUB_EVENT_NAME: event,
    GITHUB_REF: ref,
  } = environment;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    !token ||
    event !== 'push' ||
    ref !== 'refs/heads/main'
  )
    throw Error('Invalid exact-main qualification identity');
  return { sha, repository };
}

async function main() {
  const { sha: qualificationSha } = verifyQualificationIdentity();
  verifyPublicationReview(profile, {
    git: gitSource,
    target: qualificationSha,
  });
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
  } = process.env;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    !token
  )
    throw Error('Invalid release identity or credentials');
  const git = (...args) => gitSource(...args);
  if (git('rev-parse', 'HEAD').trim() !== sha)
    throw Error('Checkout does not match release SHA');
  assertPinnedAlphaCheckout(process.cwd(), sha);
  const sourceProfile = verifySourceProfile({
    git,
    sha,
    policy: JSON.parse(fs.readFileSync('config/solidity-compiler.json')),
    version: JSON.parse(fs.readFileSync('package.json')).version,
    lock: JSON.parse(fs.readFileSync('package-lock.json')),
  });
  verifyScannerReviewSource({ git, sha });
  const sourceScope = verifySourceScope({
    git,
    sha,
    policy: JSON.parse(
      fs.readFileSync('config/solidity-compiler.json', 'utf8')
    ),
    version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  });
  const deploymentSnapshots = [
    verifyDeploymentSnapshot(fs.readFileSync(deploymentSnapshot.localPath)),
  ];
  verifyDeploymentSnapshot(fs.readFileSync(deploymentSnapshot.recordPath));
  const tree = git('rev-parse', 'HEAD^{tree}').trim();
  const publisher = require('./publish-source-release-rc16.cjs');
  const qualificationApi = async (method, resource) => {
    const response = await fetch(
      publisher.sourceApiUrl(method, resource, sha),
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!response.ok)
      throw Error(
        `Cannot authenticate CodeQL service evidence: HTTP ${response.status}`
      );
    return response.json();
  };
  const downloadServiceReceipt = async (artifactId) => {
    try {
      return execFileSync(
        'gh',
        [
          'api',
          '--hostname',
          'github.com',
          `repos/${repository}/actions/artifacts/${publisher.producerId(
            artifactId
          )}/zip`,
        ],
        {
          maxBuffer: 4 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000,
        }
      );
    } catch {
      throw Error('Cannot retrieve authenticated CodeQL service receipt');
    }
  };
  let retainedServiceEvidence;
  const deadline = Date.now() + 85 * 60000;
  while (Date.now() < deadline) {
    const [runs, checks, reviewedChecks, historicalCodeqlCheck] =
      await Promise.all([
        readPages(`actions/runs?head_sha=${sha}`, 'workflow_runs', token),
        readPages(
          `commits/${sha}/check-runs?filter=latest`,
          'check_runs',
          token
        ),
        readPages(
          `commits/${compilerSourceBaseline}/check-runs?filter=latest`,
          'check_runs',
          token
        ),
        qualificationApi(
          'GET',
          `check-runs/${historicalReviewedCodeql.checkId}`
        ),
      ]);
    const historicalReviewedSourceCodeql = verifyHistoricalReviewedCodeql(
      historicalCodeqlCheck
    );
    const preliminary = evaluate(runs, checks, sha);
    const serviceProducerPaths = [
      profile.scannerPolicy.workflowPath,
      profile.pythonScannerPolicy.workflowPath,
    ];
    let processedCodeql;
    if (
      serviceProducerPaths.every((path) =>
        preliminary.workflows.some(
          (run) =>
            run.path === path &&
            run.status === 'completed' &&
            run.conclusion === 'success'
        )
      )
    ) {
      processedCodeql = await serviceEvidence.observeFinalServices({
        api: qualificationApi,
        download: downloadServiceReceipt,
        git,
        sha,
        tree,
        runs,
        retained: retainedServiceEvidence,
      });
      retainedServiceEvidence = processedCodeql;
    }
    const state = evaluate(runs, checks, sha, processedCodeql);
    const reviewedCodeql = evaluateCodeql(
      reviewedChecks,
      compilerSourceBaseline
    );
    const failures = [...state.failures, ...reviewedCodeql.failures];
    if (failures.length)
      throw Error(`Source release refused: ${failures.join('; ')}`);
    if (state.ready && reviewedCodeql.ready) {
      assertPinnedAlphaCheckout(process.cwd(), sha);
      serviceEvidence.assertFinalServices(processedCodeql, { sha, tree });
      const pythonScannerEvidence =
        await require('./source-native-evidence-rc16.cjs').qualifyPythonEvidence(
          {
            sha,
            tree,
            provenance: { workflows: state.workflows },
            api: async (method, resource) => {
              const response = await fetch(
                publisher.sourceApiUrl(method, resource, sha),
                {
                  method,
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                  },
                  redirect: 'error',
                  signal: AbortSignal.timeout(30000),
                }
              );
              if (!response.ok)
                throw Error(
                  `Cannot authenticate Python producer: HTTP ${response.status}`
                );
              return response.json();
            },
            download: async (artifactId) =>
              execFileSync(
                'gh',
                [
                  'api',
                  '--hostname',
                  'github.com',
                  `repos/${repository}/actions/artifacts/${publisher.producerId(
                    artifactId
                  )}/zip`,
                ],
                {
                  maxBuffer: 128 * 1024 * 1024,
                  stdio: ['ignore', 'pipe', 'pipe'],
                  timeout: 30000,
                }
              ),
          }
        );
      assertPinnedAlphaCheckout(process.cwd(), sha);
      const directory = nativeGate.releaseOutputDirectory();
      fs.mkdirSync(directory, { recursive: true });
      const serviceBytes = JSON.stringify(processedCodeql, null, 2) + '\n';
      fs.writeFileSync(
        path.join(directory, 'codeql-service-evidence.json'),
        serviceBytes,
        { flag: 'wx', mode: 0o600 }
      );
      fs.writeFileSync(
        path.join(directory, 'provenance.json'),
        JSON.stringify(
          {
            schema: 'agijobsv0/source-release-provenance/1',
            repository,
            tag: 'source-v2.1.0-rc.17',
            sha,
            tree: git('rev-parse', 'HEAD^{tree}').trim(),
            recordedAt: new Date().toISOString(),
            productionApproved: false,
            artifactSigning: 'unsigned source and evidence only',
            sourceScope,
            sourceProfile,
            pythonScannerEvidence,
            processedCodeqlServiceEvidence: {
              schema: 'agijobsv0/codeql-service-asset/1',
              source: sha,
              tree,
              file: 'codeql-service-evidence.json',
              sha256: crypto
                .createHash('sha256')
                .update(serviceBytes)
                .digest('hex'),
            },
            historicalReviewedSourceCodeql,
            reviewedSourceCodeql: {
              sourceSha: compilerSourceBaseline,
              checks: scannerReview.codeqlChecks,
            },
            scannerReview,
            deploymentSnapshots,
            producer: {
              runId: process.env.GITHUB_RUN_ID,
              runAttempt: process.env.GITHUB_RUN_ATTEMPT,
              workflow: ownPath,
            },
            requiredPaths,
            requiredChecks,
            workflows: state.workflows.map(
              ({ id, path, head_sha, run_attempt, conclusion, html_url }) => ({
                id,
                path,
                head_sha,
                run_attempt,
                conclusion,
                html_url,
              })
            ),
            checks: checks.map(
              ({ id, name, head_sha, status, conclusion, details_url }) => ({
                id,
                name,
                head_sha,
                status,
                conclusion,
                details_url,
              })
            ),
          },
          null,
          2
        ) + '\n'
      );
      console.log(
        `Exact merged SHA qualified: ${sha}; ${state.workflows.length} workflows; ${requiredChecks.length} required contexts`
      );
      return;
    }
    console.log(
      `Waiting for exact merged SHA and reviewed source: ${[
        ...state.pending,
        ...reviewedCodeql.pending,
      ].join('; ')}`
    );
    await delay(30000);
  }
  throw Error('Exact merged SHA qualification timed out; no publication');
}

module.exports = {
  ...nativeGate,
  verifySourceProfile,
  verifyQualificationIdentity,
  scannerReview,
  scannerReviewPath,
  scannerHistory,
  canonical,
  exactFields,
  parseScannerReview,
  verifyScannerReviewSource,
  verifyScannerReviewInstallBinding,
  verifyScannerReviewBinding,
  evaluate,
  evaluateCodeql,
  historicalReviewedCodeql,
  verifyHistoricalReviewedCodeql,
  requiredPaths,
  requiredChecks,
  verifySourceScope,
  verifyDeploymentSnapshot,
  deploymentSnapshot,
  compilerSourceBaseline,
  evidenceBaseline,
  deployedSourceBaseline,
  preservedEvidencePaths,
  reviewedCompilerPaths,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
