import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export function requiredNames() {
  const manifest = [
    'ci/required-contexts.json',
    'ci/required-companion-contexts.json',
  ].flatMap((path) => JSON.parse(readFileSync(path, 'utf8')));
  return [...new Set([
    ...manifest.map((x) => x.split(' / ').slice(1).join(' / ')),
    'rehearsal',
    'actionlint',
    'Build and verify demo website',
    'compile-and-test',
  ])];
}

export function evaluateCheckRuns(runs, required) {
  const failures = runs.filter(
    (r) =>
      r.status === 'completed' &&
      !['success', 'skipped', 'neutral'].includes(r.conclusion),
  );
  const missing = required.filter((n) => !runs.some((r) => r.name === n));
  const pending = required.filter(
    (n) => runs.some((r) => r.name === n) &&
      !runs.some((r) => r.name === n && r.status === 'completed' && r.conclusion === 'success'),
  );
  return { failures, missing, pending, ready: failures.length === 0 && missing.length === 0 && pending.length === 0 };
}

async function readChecks(repository, sha, token) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) throw Error(`GitHub checks API HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.check_runs)) throw Error('GitHub checks response malformed');
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
  ) throw Error('Missing or unexpected exact source identity/authorization');
  const required = requiredNames();
  const deadline = Date.now() + 75 * 60_000;
  while (Date.now() < deadline) {
    const runs = await readChecks(repository, sha, token);
    const state = evaluateCheckRuns(
      runs.filter((r) => r.name !== 'Publish source evidence (not production)'),
      required,
    );
    if (state.failures.length) {
      throw Error('Failed checks; refusing release: ' +
        state.failures.map((r) => r.name + ': ' + r.conclusion).join(', '));
    }
    if (state.ready) {
      console.log(`REQUIRED_EXACT_SHA_CI_PASS: ${required.length} required check contexts; ${runs.length} observed checks; SHA ${sha}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        const fs = await import('node:fs');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
          `Required exact-SHA CI: **${required.length} successful check contexts** on \`${sha}\`. Nonrequired workflows may run separately.\n`);
      }
      return;
    }
    console.log(`WAITING_FOR_CI: ${state.missing.length} missing, ${state.pending.length} unfinished required check contexts`);
    await delay(30_000);
  }
  throw Error('Exact-SHA required checks did not all pass within 75 minutes');
}

if (process.argv[1]?.endsWith('/wait-source-evidence-checks.mjs')) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
