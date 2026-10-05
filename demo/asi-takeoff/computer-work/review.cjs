'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const SOURCE = path.resolve(__dirname, '../project-plan.planetary.json');
function read(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const limit = 1024 * 1024,
      stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit)
      throw new Error('Evidence must be a regular file of at most 1 MiB');
    const bytes = Buffer.alloc(limit + 1);
    let size = 0,
      count;
    while (
      size < bytes.length &&
      (count = fs.readSync(fd, bytes, size, bytes.length - size, null))
    )
      size += count;
    if (size > limit) throw new Error('Evidence exceeds 1 MiB');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, size)
    );
  } finally {
    fs.closeSync(fd);
  }
}
function review(candidate, dossier, bytes = fs.readFileSync(SOURCE)) {
  // Independent evaluator: no import from the studio planner or example output.
  const plan = JSON.parse(bytes),
    digest = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(candidate.schemaVersion, 1);
  assert.equal(candidate.sourceSha256, digest, 'Source digest mismatch');
  assert.equal(candidate.mode, 'planning-only');
  assert.equal(candidate.productionApproved, false);
  assert.equal(candidate.settlementApproved, false);
  assert.equal(candidate.currency, plan.budget.currency);
  assert.equal(
    candidate.scheduleBasis,
    'deadlineDays-as-duration-after-dependencies'
  );
  assert.equal(candidate.horizonDays, 30);
  const decimal = (value) => {
    assert.equal(typeof value, 'string', 'Amounts must be decimal strings');
    assert.match(value, /^\d+(?:\.\d{1,18})?$/);
    const parts = value.split('.');
    return (
      BigInt(parts[0]) * 10n ** 18n + BigInt((parts[1] || '').padEnd(18, '0'))
    );
  };
  assert.equal(decimal(candidate.budget), decimal(plan.budget.total));
  const allocation = plan.jobs.reduce((n, job) => n + decimal(job.reward), 0n);
  assert.equal(
    decimal(candidate.allocatedRewards),
    allocation,
    'Incorrect allocation'
  );
  assert.equal(
    decimal(candidate.unallocatedBudget),
    decimal(plan.budget.total) - allocation,
    'Incorrect reserve'
  );
  assert.ok(Array.isArray(candidate.jobs));
  assert.equal(
    candidate.jobs.length,
    plan.jobs.length,
    'Every job is required'
  );
  const expected = new Map(),
    pending = new Map(plan.jobs.map((j) => [j.id, j]));
  while (pending.size) {
    let progressed = false;
    for (const [id, job] of pending) {
      if (!job.dependencies.every((d) => expected.has(d))) continue;
      const startDay = Math.max(
        0,
        ...job.dependencies.map((d) => expected.get(d).finishDay)
      );
      expected.set(id, { startDay, finishDay: startDay + job.deadlineDays });
      pending.delete(id);
      progressed = true;
    }
    assert.ok(progressed, 'Invalid approved dependency graph');
  }
  const seen = new Set();
  for (const row of candidate.jobs) {
    assert.ok(
      expected.has(row.id) && !seen.has(row.id),
      'Unknown or duplicate job'
    );
    seen.add(row.id);
    const source = plan.jobs.find((j) => j.id === row.id),
      schedule = expected.get(row.id);
    assert.equal(decimal(row.reward), decimal(source.reward));
    assert.deepEqual(row.dependencies, source.dependencies);
    assert.equal(row.startDay, schedule.startDay);
    assert.equal(row.finishDay, schedule.finishDay);
  }
  const criticalPath = Math.max(
    ...[...expected.values()].map((j) => j.finishDay)
  );
  assert.equal(candidate.criticalPathDays, criticalPath);
  assert.equal(
    candidate.horizonExceeded,
    criticalPath > 30,
    'The planning-horizon conflict must be disclosed'
  );
  assert.equal(typeof dossier, 'string');
  assert.ok(
    dossier.length >= 150 && dossier.includes(digest),
    'Dossier must identify the source'
  );
  assert.match(
    dossier,
    /duration/i,
    'Dossier must name the schedule assumption'
  );
  assert.match(dossier, /41/);
  assert.match(dossier, /30/);
  return {
    accepted: true,
    jobsChecked: seen.size,
    sourceSha256: digest,
    scope:
      'Synthetic budget, dependencies and dossier structure only; substantive review remains required.',
    productionApproved: false,
    settlementApproved: false,
    providerExecution: 'not assessed',
  };
}
function reviewReceipt(receipt, expectedJobId, expectedDeploymentId) {
  assert.match(
    expectedJobId,
    /^[1-9][0-9]{0,79}$/,
    'Specify the expected job ID'
  );
  assert.ok(
    typeof expectedDeploymentId === 'string' &&
      expectedDeploymentId.trim() &&
      expectedDeploymentId.length <= 200,
    'Specify the expected deployment ID'
  );
  assert.ok(
    receipt && typeof receipt === 'object' && !Array.isArray(receipt),
    'Invalid receipt'
  );
  const task = JSON.parse(read(path.join(__dirname, 'task.json')));
  // Fixed task only. Match the adapter's canonical field order without loading a worker runtime.
  const keys = [
    'schemaVersion',
    'workerProfile',
    'goal',
    'inputText',
    'dataClass',
    'allowedOrigins',
    'acceptanceCriteria',
    'deliverables',
  ];
  assert.ok(
    Object.keys(task).length === keys.length &&
      keys.every((key) => Object.hasOwn(task, key)),
    'Unsupported approved task'
  );
  const hash = (value) =>
    crypto.createHash('sha256').update(value).digest('hex');
  const taskSha256 = hash(
    JSON.stringify(Object.fromEntries(keys.map((key) => [key, task[key]])))
  );
  assert.ok(
    receipt.schemaVersion === 1 &&
      receipt.status === 'evidence-ready' &&
      receipt.provider === 'openclaw-responses',
    'Receipt is not completed adapter evidence'
  );
  assert.ok(
    receipt.jobId === expectedJobId &&
      receipt.deploymentId === expectedDeploymentId,
    'Receipt job or deployment does not match the operator expectation'
  );
  assert.ok(
    receipt.workerProfile === task.workerProfile &&
      receipt.taskSha256 === taskSha256 &&
      isDeepStrictEqual(receipt.task, task),
    'Receipt does not match the approved ASI Takeoff task'
  );
  assert.ok(
    typeof receipt.simulated === 'boolean',
    'Receipt must declare fixture or live mode'
  );
  assert.ok(
    receipt.productionApproved === false &&
      receipt.settlementApproved === false &&
      receipt.review?.status === 'required',
    'Receipt must require independent approval'
  );
  assert.match(
    receipt.attemptId,
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
    'Invalid attempt ID'
  );
  assert.ok(
    typeof receipt.startedAt === 'string' &&
      typeof receipt.completedAt === 'string',
    'Receipt timestamps must be strings'
  );
  const started = Date.parse(receipt.startedAt),
    completed = Date.parse(receipt.completedAt);
  assert.ok(
    Number.isFinite(started) &&
      Number.isFinite(completed) &&
      completed >= started,
    'Invalid receipt timestamps'
  );
  assert.ok(
    Array.isArray(receipt.artifacts) &&
      receipt.artifacts.length === task.deliverables.length,
    'Both deliverables are required'
  );
  const artifacts = new Map();
  for (const artifact of receipt.artifacts) {
    assert.ok(
      artifact &&
        task.deliverables.some(
          (item) =>
            item.name === artifact.name && item.mediaType === artifact.mediaType
        ) &&
        !artifacts.has(artifact.name),
      'Unexpected or duplicate artifact'
    );
    assert.ok(
      typeof artifact.content === 'string' &&
        artifact.content.length > 0 &&
        artifact.content.length <= 128000,
      'Invalid artifact content'
    );
    const bytes = Buffer.from(artifact.content, 'utf8');
    assert.ok(
      bytes.toString('utf8') === artifact.content &&
        artifact.bytes === bytes.length &&
        artifact.sha256 === hash(bytes),
      'Artifact byte count or SHA-256 does not match'
    );
    artifacts.set(artifact.name, artifact.content);
  }
  return {
    ...review(
      JSON.parse(artifacts.get('analysis.json')),
      artifacts.get('dossier.md')
    ),
    receiptChecked: true,
    jobId: expectedJobId,
    deploymentId: expectedDeploymentId,
    attemptId: receipt.attemptId,
    taskSha256,
    declaredWorkerMode: receipt.simulated ? 'fixture' : 'live',
    workerProvenance:
      'Unverified: an unsigned receipt and matching hashes do not authenticate a worker or prove execution. Reconcile with the protected dispatch journal and actual effects.',
  };
}
module.exports = { review, reviewReceipt };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const usage =
      'Usage: node review.cjs analysis.json dossier.md\n       node review.cjs --receipt receipt.json EXPECTED_JOB_ID EXPECTED_DEPLOYMENT_ID';
    if (args.length === 1 && args[0] === '--help') {
      console.log(usage);
    } else if (args[0] === '--receipt') {
      if (args.length !== 4) throw new Error(usage);
      console.log(
        JSON.stringify(
          reviewReceipt(JSON.parse(read(args[1])), args[2], args[3]),
          null,
          2
        )
      );
    } else {
      const [analysis, dossier] = args;
      if (args.length !== 2 || !analysis || !dossier) throw new Error(usage);
      console.log(
        JSON.stringify(
          review(JSON.parse(read(analysis)), read(dossier)),
          null,
          2
        )
      );
    }
  } catch (error) {
    console.error(`Review rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
