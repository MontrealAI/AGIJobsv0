import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export function requiredNames() {
  const files = [
    'ci/required-contexts.json',
    'ci/required-companion-contexts.json',
  ];
  const names = [];
  for (const path of files) {
    const labels = JSON.parse(readFileSync(path, 'utf8'));
    names.push(...labels.map((label) => label.split(' / ').slice(1).join(' / ')));
  }
  names.push(
    'rehearsal',
    'actionlint',
    'Build and verify demo website',
    'compile-and-test'
  );
  return [...new Set(names)];
}

export function evaluateCheckRuns(runs, required) {
  const completed = runs.filter(
    (run) => run.status === 'completed' && run.conclusion === 'success'
  );
  const successfulNames = new Set(completed.map((run) => run.name));
  const failures = runs.filter(
    (run) =>
      run.status === 'completed' &&
      !['success', 'skipped', 'neutral'].includes(run.conclusion)
  );
  const missing = required.filter(
    (name) => !runs.some((run) => run.name === name)
  );
  const pending = required.filter(
    (name) => !successfulNames.has(name) && !missing.includes(name)
  );
  const ready =
    failures.length === 0 && missing.length === 0 && pending.length === 0;
  return { failures, missing, pending, ready };
}

async function readChecks(repository, sha, token) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const url =
      `https://api.github.com/repos/${repository}/commits/${sha}/check-runs` +
      `?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw Error(`GitHub checks API HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data.check_runs)) {
      throw Error('GitHub checks response malformed');
    }
    runs.push(...data.check_runs);
    if (data.check_runs.length < 100) break;
    if (page === 10) throw Error('Too many check runs: fail closed');
  }
  return runs;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const token = process.env.GH_TOKEN;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[0-9a-f]{40}$/.test(sha || '') ||
    !token
  ) {
    throw Error('Missing or unexpected exact source identity/authorization');
  }
  const required = requiredNames();
  const deadline = Date.now() + 75 * 60_000;
  while (Date.now() < deadline) {
    const runs = await readChecks(repository, sha, token);
    const state = evaluateCheckRuns(
      runs.filter((run) => run.name !== 'Publish source evidence (not production)'),
      required
    );
    if (state.failures.length) {
      const details = state.failures
        .map((run) => run.name + ': ' + run.conclusion)
        .join(', ');
      throw Error('Failed checks; refusing release: ' + details);
    }
    if (state.ready) {
      const summary =
        `REQUIRED_EXACT_SHA_CI_PASS: ${required.length} successful contexts; ` +
        `${runs.length} observed checks; SHA ${sha}`;
      console.log(summary);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
      }
      return;
    }
    console.log(
      `WAITING_FOR_CI: ${state.missing.length} missing, ` +
        `${state.pending.length} unfinished required contexts`
    );
    await delay(30_000);
  }
  throw Error('Exact-SHA required checks did not all pass within 75 minutes');
}

if (process.argv[1]?.endsWith('/wait-source-evidence-checks.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
