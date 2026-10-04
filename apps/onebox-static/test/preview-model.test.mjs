import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewSession } from '../preview-model.mjs';
import { normalizeJobIntentPlan } from '../app.mjs';
const run = (session, text) => {
  const plan = session.plan(text);
  return session.execute(plan.intent, plan.planHash);
};

test('preview completes a coherent lifecycle and exports explicitly simulated evidence', () => {
  const session = createPreviewSession();
  assert.equal(run(session, 'Post a software audit for 5 AGIALPHA').jobId, 1);
  assert.throws(() => run(session, 'Finalize job 1'), /while it is created/);
  for (const text of [
    'Apply job 1',
    'Submit job 1 with reproducible evidence',
    'Validate job 1',
    'Finalize job 1',
  ])
    run(session, text);
  const evidence = session.evidence();
  assert.equal(evidence.jobs[0].status, 'finalized');
  assert.equal(evidence.events.length, 5);
  assert.equal(evidence.chainTransactions, 0);
  assert.equal(evidence.productionApproved, false);
  evidence.jobs[0].status = 'corrupted';
  assert.equal(session.jobs()[0].status, 'finalized');
});

test('rejected review, dispute, confirmation binding and independent sessions', () => {
  const session = createPreviewSession();
  const plan = session.plan('Post an audit');
  assert.throws(
    () =>
      session.execute(
        { ...plan.intent, reward_agialpha: '500' },
        plan.planHash
      ),
    /changed/
  );
  session.execute(plan.intent, plan.planHash);
  assert.throws(
    () => session.execute(plan.intent, plan.planHash),
    /already used/
  );
  for (const text of [
    'Apply job 1',
    'Submit job 1',
    'Validate job 1 reject',
    'Dispute job 1',
  ])
    run(session, text);
  assert.equal(session.jobs()[0].status, 'disputed');
  assert.throws(() => run(session, 'Finalize job 1'), /disputed/);
  assert.throws(
    () => run(createPreviewSession(), 'Apply job 1'),
    /does not exist/
  );
  assert.throws(() => session.plan('Finalize'), /job number/);
});

test('real backend intent.kind and planHash survive frontend normalization', () => {
  const plan = normalizeJobIntentPlan({
    intent: { kind: 'post_job', title: 'Audit' },
    summary: 'Review',
    planHash: '0xabc',
    createdAt: '2026-10-04T00:00:00Z',
    requiresConfirmation: true,
  });
  assert.equal(plan.kind, 'job-intent');
  assert.equal(plan.intent.kind, 'post_job');
  assert.equal(plan.planHash, '0xabc');
});

test('guided evidence fails on missing citations, supports correction and retains both submissions', async () => {
  const { sampleMissionReport } = await import('../mission-fixture.mjs');
  const session = createPreviewSession();
  run(session, 'Post a release readiness brief for 5 AGIALPHA over 7 days');
  run(session, 'Apply job 1');
  const report = JSON.parse(sampleMissionReport());
  report.findings[0].source = '';
  const submit = session.plan('Submit job 1', {
    artifact: JSON.stringify(report),
  });
  assert.throws(
    () =>
      session.execute(
        { ...submit.intent, artifact: sampleMissionReport() },
        submit.planHash
      ),
    /changed/
  );
  session.execute(submit.intent, submit.planHash);
  run(session, 'Validate job 1');
  let job = session.jobs()[0];
  assert.equal(job.status, 'rejected');
  assert.ok(job.review.checks.some((check) => !check.passed));
  assert.throws(() => run(session, 'Finalize job 1'), /rejected/);
  run(session, 'Submit job 1');
  run(session, 'Validate job 1');
  run(session, 'Finalize job 1');
  job = session.jobs()[0];
  assert.equal(job.status, 'finalized');
  assert.equal(job.review.checks.length, 11);
  assert.ok(job.review.checks.every((check) => check.passed));
  assert.equal(JSON.parse(job.artifact).recommendation, 'hold');
  const submissions = session
    .evidence()
    .events.filter((event) => event.action === 'submit');
  assert.equal(submissions.length, 2);
  assert.equal(JSON.parse(submissions[0].artifact).findings[0].source, '');
  assert.equal(
    JSON.parse(submissions[1].artifact).findings[0].source,
    'fixture/tests'
  );
});

test('mechanical review rejects malformed reports and dishonest release recommendations', async () => {
  const { sampleMissionReport, reviewMissionReport } = await import(
    '../mission-fixture.mjs'
  );
  for (const artifact of ['not json', 'null', '[]', '{}'])
    assert.equal(reviewMissionReport(artifact).approved, false);
  for (const mutate of [
    (r) => (r.recommendation = 'ship'),
    (r) => (r.simulated = false),
    (r) => (r.findings[2].result = 'pass'),
    (r) => (r.findings[1].source = 'fixture/tests'),
    (r) => (r.findings[0].explanation = ''),
    (r) => (r.nextAction = ''),
  ]) {
    const report = JSON.parse(sampleMissionReport());
    mutate(report);
    assert.equal(reviewMissionReport(JSON.stringify(report)).approved, false);
  }
});

test('preview requires explicit commands and rejects misleading numerical input', () => {
  const session = createPreviewSession();
  for (const text of [
    'hello',
    'help',
    'Finalise job 1',
    'Post work for -5 AGIALPHA',
    'Post work for 1e5 AGIALPHA',
    'Post work over 1.5 days',
    'Post work over -1 days',
    'Post work for 0 AGIALPHA',
    'Apply job 1.5',
    'Apply job 1e2',
  ])
    assert.throws(() => session.plan(text), undefined, text);
  assert.equal(session.jobs().length, 0);
  assert.equal(
    session.plan('Post work for 0.5 AGIALPHA over 2 days').intent
      .reward_agialpha,
    '0.5'
  );
});

test('cancelled and expired approvals cannot execute and capacities stay bounded', () => {
  let now = 0;
  const session = createPreviewSession({ now: () => now });
  const cancelled = session.plan('Post a cancelled job');
  session.cancel(cancelled.planHash);
  assert.throws(
    () => session.execute(cancelled.intent, cancelled.planHash),
    /already used/
  );
  const expired = session.plan('Post an expired job');
  now = 900000;
  assert.throws(
    () => session.execute(expired.intent, expired.planHash),
    /expired/
  );
  for (let i = 0; i < 1000; i++) session.plan('Post a pending job');
  assert.throws(() => session.plan('Post one more job'), /Too many/);
  now += 900000;
  assert.ok(session.plan('Post after expiration').planHash);
  assert.equal(session.jobs().length, 0);
});

test('execution uncertainty preserves reconciliation guidance through the error formatter', async () => {
  const { formatError } = await import('../lib.mjs');
  const error = new Error(
    'Execution outcome is unknown: the connection timed out. Inspect chain receipts before creating another plan.'
  );
  error.code = 'EXECUTION_OUTCOME_UNKNOWN';
  assert.equal(formatError(error), error.message);
});
