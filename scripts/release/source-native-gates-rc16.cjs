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

function verifyScannerReviewBinding({ sha, review, git }) {
  assert(
    /^[a-f0-9]{40}$/.test(sha || '') &&
      /^[a-f0-9]{40}$/.test(review?.sourceCommit || ''),
    'Scanner review requires exact source identities'
  );
  if (review.sourceCommit === sha) return;
  // A review record cannot contain its own commit hash. Permit only the
  // subsequent installation of that record, with every executable byte fixed.
  assert.equal(
    typeof git,
    'function',
    'Scanner review does not bind this source'
  );
  git('merge-base', '--is-ancestor', review.sourceCommit, sha);
  const changed = git('diff', '--name-only', '-z', review.sourceCommit, sha)
    .split('\0')
    .filter(Boolean);
  assert.deepEqual(
    changed,
    ['scripts/release/source-profile-rc16.json'],
    'Source changed after scanner review beyond its record'
  );
  const before = JSON.parse(
    git(
      'show',
      `${review.sourceCommit}:scripts/release/source-profile-rc16.json`
    )
  );
  const after = JSON.parse(
    git('show', `${sha}:scripts/release/source-profile-rc16.json`)
  );
  assert.equal(
    canonical(after.scannerReview),
    canonical(review),
    'Installed scanner review differs'
  );
  after.scannerReview = before.scannerReview;
  after.qualification = before.qualification;
  assert.equal(
    canonical(after),
    canonical(before),
    'Scanner review installation changed source/profile pins'
  );
}

function verifyScannerArchive(
  files,
  read,
  {
    baseline,
    review = profile.scannerReview,
    requiredSources = profile.scannerRequiredPaths,
    sha,
    git,
  } = {}
) {
  assert.deepEqual(
    [...files].sort(),
    ['javascript.sarif'],
    'Scanner archive inventory mismatch'
  );
  const document = JSON.parse(read('javascript.sarif'));
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
  assert(
    review &&
      Array.isArray(review.results) &&
      review.reviewEvidence &&
      /^[a-f0-9]{40}$/.test(review.sourceCommit || ''),
    'Current scanner results require explicit source-bound review'
  );
  verifyScannerReviewBinding({ sha, review, git });
  const actual = (run.results || [])
    .map(resultIdentity)
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
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
  verifyScannerReviewBinding,
  resultIdentity,
  extracted,
  readPages,
  sha256,
  canonical,
};
