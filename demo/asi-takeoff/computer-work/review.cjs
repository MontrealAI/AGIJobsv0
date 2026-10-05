'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const SOURCE = path.resolve(__dirname, '../project-plan.planetary.json');
function read(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024)
    throw new Error('Deliverable must be a file of at most 1 MiB');
  return fs.readFileSync(file, 'utf8');
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
module.exports = { review };
if (require.main === module) {
  try {
    const [analysis, dossier, ...extra] = process.argv.slice(2);
    if (!analysis || !dossier || extra.length)
      throw new Error('Usage: node review.cjs analysis.json dossier.md');
    console.log(
      JSON.stringify(review(JSON.parse(read(analysis)), read(dossier)), null, 2)
    );
  } catch (error) {
    console.error(`Review rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
