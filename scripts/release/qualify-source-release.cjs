'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { requiredWorkflows } = require('./check-release-ci.js');

const ownPath = '.github/workflows/source-release.yml';
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
            tag: 'source-v2.1.0-rc.5',
            sha,
            tree: git('rev-parse', 'HEAD^{tree}'),
            recordedAt: new Date().toISOString(),
            productionApproved: false,
            artifactSigning: 'unsigned source and evidence only',
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

module.exports = { evaluate, requiredPaths, requiredChecks };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
