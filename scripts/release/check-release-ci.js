#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const requiredWorkflows = [
  'ci.yml',
  'contracts.yml',
  'static-analysis.yml',
  'fuzz.yml',
  'webapp.yml',
  'containers.yml',
  'apps-images.yml',
  'e2e.yml',
  'culture-ci.yml',
  'torch-tests.yml',
  'production-rehearsal.yml',
];

function checkRuns(runs, sha, required = requiredWorkflows) {
  const failures = [];
  for (const file of required) {
    const matches = runs.filter(
      (run) =>
        run.head_sha === sha &&
        run.head_branch === 'main' &&
        ['push', 'workflow_dispatch'].includes(run.event) &&
        run.path === `.github/workflows/${file}`
    );
    matches.sort(
      (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt
    );
    const latest = matches[0];
    if (!latest) {
      failures.push(`${file}: no main-branch CI evidence for ${sha}`);
    } else if (
      latest.status !== 'completed' ||
      latest.conclusion !== 'success'
    ) {
      failures.push(
        `${file}: ${latest.conclusion || latest.status} (${
          latest.html_url || latest.id
        })`
      );
    }
  }
  return failures;
}

async function readRuns({ repository, sha, token, fetchImpl = fetch }) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository || '') ||
    !/^[a-f0-9]{40}$/.test(sha || '')
  ) {
    throw new Error(
      'A valid GITHUB_REPOSITORY and full commit SHA are required'
    );
  }
  if (!token)
    throw new Error('GH_TOKEN is required to read release CI evidence');
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/runs?head_sha=${sha}&per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      }
    );
    if (!response.ok)
      throw new Error(
        `Cannot read CI evidence: GitHub HTTP ${response.status}`
      );
    const data = await response.json();
    if (!Array.isArray(data.workflow_runs))
      throw new Error('Malformed GitHub workflow-run response');
    runs.push(...data.workflow_runs);
    if (data.workflow_runs.length < 100) return runs;
  }
  throw new Error(
    'CI evidence exceeds the pagination limit; refusing a partial check'
  );
}

async function main() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const runs = await readRuns({
    repository: process.env.GITHUB_REPOSITORY,
    sha,
    token: process.env.GH_TOKEN,
  });
  const failures = checkRuns(runs, sha);
  if (failures.length)
    throw new Error(`Release CI is incomplete:\n${failures.join('\n')}`);
  console.log(
    `All ${requiredWorkflows.length} release workflows passed for ${sha}.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { requiredWorkflows, checkRuns, readRuns };
