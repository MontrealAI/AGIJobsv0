'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const task = require('./task.json');
const source = fs.readFileSync(path.join(__dirname, 'board.json'));
const sourceSha256 = sha(source);
const decisions = [
  ['planned', 'eligible', 'earth-code', 'reviewer-a'],
  ['planned', 'eligible', 'earth-code', 'reviewer-a'],
  ['held', 'worker-capacity', null, null],
  ['held', 'worker-capacity', null, null],
  ['held', 'review-capacity', null, null],
  ['planned', 'eligible', 'mars-data', 'reviewer-a'],
  ['held', 'data-rights', null, null],
  ['planned', 'eligible', 'luna-browser', 'reviewer-b'],
  ['planned', 'eligible', 'luna-browser', 'reviewer-b'],
  ['held', 'review-capacity', null, null],
];
// Hand-reviewed baseline, independent of the planner implementation.
const expected = {
  schemaVersion: 1,
  sourceSha256,
  evidenceMode: 'planning-only',
  policy: 'source-order-first-fit-v1',
  inputs: { budgetUsdc: '15000.000000', reviewMinutes: 60, offline: [] },
  jobs: decisions.map(([status, reason, worker, reviewer], i) => ({
    jobId: `work-${String(i + 1).padStart(2, '0')}`,
    status,
    reason,
    worker,
    reviewer,
    rewardUsdc:
      [
        '1500',
        '3000',
        '1000',
        '1500',
        '2500',
        '5000',
        '1000',
        '100',
        '1000',
        '10000',
      ][i] + '.000000',
  })),
  totals: {
    planned: 5,
    held: 5,
    reservedUsdc: '10600.000000',
    remainingUsdc: '4400.000000',
    estimatedCostUsdc: '2980.000000',
    estimatedMarginUsdc: '7620.000000',
    reviewMinutes: 50,
  },
  dispatched: false,
  settlementApproved: false,
  productionApproved: false,
};
function expectedBrief() {
  return (
    `# Planetary work allocation\n\nSource SHA-256: ${sourceSha256}\n\n5 planned; 5 held.\nReserved: 10600.000000 USDC.\nEstimated cost: 2980.000000 USDC.\nReview: 50 minutes.\n\nPlanning only. No dispatch. No settlement. No production approval.\n\n` +
    expected.jobs
      .map(
        (j) =>
          `- ${j.jobId}: ${j.status} (${j.reason}); worker ${
            j.worker ?? 'none'
          }; reviewer ${j.reviewer ?? 'none'}.`
      )
      .join('\n') +
    '\n'
  );
}
function review(allocation, brief) {
  const checks = [];
  const add = (name, pass) => checks.push({ name, passed: Boolean(pass) });
  add(
    'Source pinned by the worker task',
    task.inputText.includes(sourceSha256)
  );
  add(
    'All ten decisions, independent assignments and exact accounting match the reviewed baseline',
    isDeepStrictEqual(allocation, expected)
  );
  add(
    'Brief contains the exact baseline handoff without contradictory claims',
    typeof brief === 'string' && brief === expectedBrief()
  );
  return verdict(checks, 'exported-files');
}
function verdict(checks, mode) {
  return {
    status: checks.every((c) => c.passed) ? 'passed' : 'rejected',
    scope:
      'Pinned baseline allocation only; not completion of the ten proposed jobs',
    evidenceMode: mode,
    checks,
    providerAuthenticated: false,
    independentHumanReviewRequired: true,
    productionApproved: false,
    settlementApproved: false,
  };
}
function reviewReceipt(receipt, context) {
  const {
    computerTaskDigest,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const checks = [];
  const add = (name, pass) => checks.push({ name, passed: Boolean(pass) });
  add(
    'Explicit expected job and deployment',
    /^[1-9][0-9]{0,79}$/.test(context?.jobId ?? '') &&
      Boolean(context?.deploymentId) &&
      receipt?.jobId === context.jobId &&
      receipt?.deploymentId === context.deploymentId
  );
  add(
    'Evidence-ready receipt still requires review',
    receipt?.schemaVersion === 1 &&
      receipt.status === 'evidence-ready' &&
      receipt.provider === 'openclaw-responses' &&
      receipt.workerProfile === 'planetary' &&
      receipt.productionApproved === false &&
      receipt.settlementApproved === false &&
      receipt.review?.status === 'required' &&
      typeof receipt.simulated === 'boolean'
  );
  try {
    add(
      'Exact task and normalized task digest',
      isDeepStrictEqual(receipt.task, task) &&
        receipt.taskSha256 === computerTaskDigest(task)
    );
  } catch {
    add('Exact task and normalized task digest', false);
  }
  const files = Array.isArray(receipt?.artifacts) ? receipt.artifacts : [];
  add(
    'Exactly two unique deliverables',
    files.length === 2 && new Set(files.map((f) => f?.name)).size === 2
  );
  for (const wanted of task.deliverables) {
    const f = files.find((f) => f?.name === wanted.name);
    add(
      `Integrity and type: ${wanted.name}`,
      f &&
        f.mediaType === wanted.mediaType &&
        typeof f.content === 'string' &&
        Buffer.byteLength(f.content) <= 128000 &&
        f.bytes === Buffer.byteLength(f.content) &&
        f.sha256 === sha(f.content)
    );
  }
  if (checks.every((c) => c.passed)) {
    try {
      const result = review(
        JSON.parse(files.find((f) => f.name === 'allocation.json').content),
        files.find((f) => f.name === 'brief.md').content
      );
      checks.push(...result.checks);
    } catch {
      add('Parse allocation', false);
    }
  }
  return verdict(
    checks,
    receipt?.simulated ? 'fixture-receipt' : 'unverified-provider-receipt'
  );
}
function read(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > 1048576)
      throw new Error('Expected a regular file under 1 MiB');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      fs.readFileSync(fd)
    );
  } finally {
    fs.closeSync(fd);
  }
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (
      args.length === 4 &&
      args[0] === '--allocation' &&
      args[2] === '--brief'
    )
      result = review(JSON.parse(read(args[1])), read(args[3]));
    else if (
      args.length === 6 &&
      args[0] === '--receipt' &&
      args[2] === '--job-id' &&
      args[4] === '--deployment-id'
    )
      result = reviewReceipt(JSON.parse(read(args[1])), {
        jobId: args[3],
        deploymentId: args[5],
      });
    else
      throw new Error(
        'Usage: node --import tsx review.cjs --allocation FILE --brief FILE | --receipt FILE --job-id ID --deployment-id ID'
      );
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error('Review failed:', error.message);
    process.exitCode = 1;
  }
}
module.exports = { review, reviewReceipt };
