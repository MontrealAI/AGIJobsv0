'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { requiredWorkflows } = require('./check-release-ci.js');

const ownPath = '.github/workflows/source-release.yml';
const releaseVersion = '2.1.0-rc.14';
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
// Frozen combined economic source: percentage policy, terminal reputation,
// preserved demos and BigInt dry-run correction. This exact ancestor binds
// the final protected tree; fresh independent review remains a merge gate.
// Compiler policy and historical deployment guards remain unchanged; publication
// additionally requires qualification of the exact merged SHA.
const compilerSourceBaseline = '3c17153942251116ee51163055eb1a25d652454b';
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
].map((name) => `.github/workflows/${name}`);
const requiredChecks = [
  ...new Set(
    [
      ...require('../../ci/required-contexts.json'),
      ...require('../../ci/required-companion-contexts.json'),
    ].map((name) => name.split(' / ').slice(1).join(' / '))
  ),
];

function evaluate(runs, checks, sha) {
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
    if (c.name === 'Publish qualified source prerelease') continue;
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
  return {
    ready: !failures.length && !pending.length,
    failures,
    pending,
    workflows: [...latest.values()],
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

async function main() {
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
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== sha)
    throw Error('Checkout does not match release SHA');
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
  const deadline = Date.now() + 85 * 60000;
  while (Date.now() < deadline) {
    const [runs, checks] = await Promise.all([
      readPages(`actions/runs?head_sha=${sha}`, 'workflow_runs', token),
      readPages(`commits/${sha}/check-runs?filter=latest`, 'check_runs', token),
    ]);
    const state = evaluate(runs, checks, sha);
    if (state.failures.length)
      throw Error(`Source release refused: ${state.failures.join('; ')}`);
    if (state.ready) {
      fs.mkdirSync('reports/source-release', { recursive: true });
      fs.writeFileSync(
        'reports/source-release/provenance.json',
        JSON.stringify(
          {
            schema: 'agijobsv0/source-release-provenance/1',
            repository,
            tag: 'source-v2.1.0-rc.14',
            sha,
            tree: git('rev-parse', 'HEAD^{tree}'),
            recordedAt: new Date().toISOString(),
            productionApproved: false,
            artifactSigning: 'unsigned source and evidence only',
            sourceScope,
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
    console.log(`Waiting for exact merged SHA: ${state.pending.join('; ')}`);
    await delay(30000);
  }
  throw Error('Exact merged SHA qualification timed out; no publication');
}

module.exports = {
  evaluate,
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
