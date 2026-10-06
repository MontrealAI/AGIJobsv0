'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const {
  computerTaskDigest,
} = require('../../../apps/orchestrator/computerWork.ts');
const task = require('./task.json');
function reviewReceipt(receipt, expected) {
  const checks = [];
  const add = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  add(
    'Expected job and deployment',
    /^[1-9][0-9]{0,79}$/.test(expected?.jobId ?? '') &&
      typeof expected?.deploymentId === 'string' &&
      expected.deploymentId.length > 0 &&
      receipt?.jobId === expected.jobId &&
      receipt?.deploymentId === expected.deploymentId
  );
  add(
    'Evidence-ready boundary',
    receipt?.schemaVersion === 1 &&
      receipt.status === 'evidence-ready' &&
      receipt.provider === 'openclaw-responses' &&
      receipt.workerProfile === 'synthesis' &&
      typeof receipt.simulated === 'boolean' &&
      receipt.productionApproved === false &&
      receipt.settlementApproved === false &&
      receipt.review?.status === 'required'
  );
  add(
    'Exact admitted task',
    isDeepStrictEqual(receipt?.task, task) &&
      receipt?.taskSha256 === computerTaskDigest(task)
  );
  const artifacts = Array.isArray(receipt?.artifacts) ? receipt.artifacts : [];
  add(
    'Exactly two deliverables',
    artifacts.length === 2 && new Set(artifacts.map((a) => a?.name)).size === 2
  );
  for (const wanted of task.deliverables) {
    const artifact = artifacts.find((a) => a?.name === wanted.name);
    add(
      'Integrity: ' + wanted.name,
      artifact &&
        artifact.mediaType === wanted.mediaType &&
        typeof artifact.content === 'string' &&
        Buffer.byteLength(artifact.content) <= 128000 &&
        artifact.bytes === Buffer.byteLength(artifact.content) &&
        artifact.sha256 ===
          createHash('sha256').update(artifact.content).digest('hex')
    );
  }
  if (checks.every((c) => c.passed)) {
    const candidate = artifacts.find((a) => a.name === 'candidate.json');
    const result = spawnSync(
      process.env.PYTHON_BIN || 'python3',
      [path.join(__dirname, 'review.py'), '-', '--task', 'normalize'],
      {
        input: candidate.content,
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1048576,
      }
    );
    add('Separate Python semantic acceptance', result.status === 0);
  }
  return {
    schemaVersion: 1,
    status: checks.every((c) => c.passed) ? 'passed' : 'rejected',
    reviewScope:
      'Receipt binding, file integrity and bounded candidate semantics only',
    checks,
    providerAuthenticated: false,
    evidenceNarrativeReviewed: false,
    externalIndependentReviewRequired: true,
    buyerAcceptanceRequired: true,
    productionApproved: false,
    settlementApproved: false,
  };
}
if (require.main === module) {
  try {
    const [file, jobId, deploymentId, ...extra] = process.argv.slice(2);
    if (!file || !jobId || !deploymentId || extra.length)
      throw new Error(
        'Usage: node --import tsx review-receipt.cjs RECEIPT.json JOB_ID DEPLOYMENT_ID'
      );
    if (fs.statSync(file).size > 1048576)
      throw new Error('Receipt exceeds 1 MiB');
    const verdict = reviewReceipt(JSON.parse(fs.readFileSync(file, 'utf8')), {
      jobId,
      deploymentId,
    });
    console.log(JSON.stringify(verdict, null, 2));
    if (verdict.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { reviewReceipt };
