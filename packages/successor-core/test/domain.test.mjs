import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, digestObject } from '../src/integrity.mjs';
import { validateMission, transitionJob } from '../src/domain.mjs';
import { sealWorkOrder, transitionSealedJob } from '../src/compiler.mjs';
import { createInvoiceMission, createInvoiceJobs } from '../src/invoice.mjs';
import { JOB_TEMPLATES } from '../src/templates.mjs';

test('canonical commitments are stable across key order and separated by domain', async () => {
  assert.equal(
    canonicalize({ z: 1, a: [true, null] }),
    '{"a":[true,null],"z":1}'
  );
  assert.equal(
    await digestObject('one', { a: 1, b: 2 }),
    await digestObject('one', { b: 2, a: 1 })
  );
  assert.notEqual(
    await digestObject('one', { a: 1 }),
    await digestObject('two', { a: 1 })
  );
});
test('canonicalization refuses ambiguous JSON, Unicode and prototype payloads', () => {
  for (const value of [
    NaN,
    Infinity,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
    undefined,
    { x: undefined },
    [, ,],
    new Date(),
    'e\u0301',
    '\ud800',
    JSON.parse('{"__proto__":1}'),
  ])
    assert.throws(() => canonicalize(value));
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalize(cycle), /NON_JSON_VALUE/);
  const getterArray = [];
  let getterInvoked = false;
  Object.defineProperty(getterArray, '0', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 'unsafe';
    },
  });
  assert.throws(() => canonicalize(getterArray), /ACCESSOR_OR_SPARSE_ARRAY/);
  assert.equal(getterInvoked, false);
  const extendedArray = [1];
  Object.defineProperty(extendedArray, 'hidden', { value: 2 });
  assert.throws(() => canonicalize(extendedArray), /SPARSE_OR_EXTENDED_ARRAY/);
});
test('mission validation refuses unknown fields, unsupported versions and numeric amounts', () => {
  const mission = createInvoiceMission();
  assert.deepEqual(validateMission(mission), mission);
  assert.throws(
    () => validateMission({ ...mission, production: true }),
    (error) => error.code === 'SCHEMA_INVALID'
  );
  assert.throws(
    () => validateMission({ ...mission, schemaVersion: '2' }),
    (error) => error.code === 'SCHEMA_VERSION_UNSUPPORTED'
  );
  assert.throws(
    () =>
      validateMission({
        ...mission,
        budget: { ...mission.budget, limitBaseUnits: 100 },
      }),
    (error) => error.code === 'SCHEMA_INVALID'
  );
  assert.throws(
    () => validateMission({ ...mission, expiresAt: '2026-02-31T00:00:00Z' }),
    (error) => error.code === 'SCHEMA_INVALID'
  );
});
test('job state path requires named actors, current preconditions and verified evidence', async () => {
  let job = await sealWorkOrder(createInvoiceJobs()[0]);
  const event = (to, actor) => ({
    eventId: `event:${to}`,
    expectedState: job.state,
    to,
    actor,
    timestamp: '2026-10-08T00:00:00Z',
    evidence: [job.digest],
    reason: 'Fixture transition test',
  });
  assert.throws(
    () => transitionJob(job, event('UNDERWRITTEN', job.actor)),
    (error) => error.code === 'ROLE_CONFLICT'
  );
  job = transitionJob(job, event('UNDERWRITTEN', job.principal));
  assert.throws(
    () =>
      transitionJob(job, event('AUTHORIZED', job.principal), {
        sealValid: true,
      }),
    (error) => error.code === 'PRECONDITION_UNAVAILABLE'
  );
  job = transitionJob(job, event('AUTHORIZED', job.principal), {
    sealValid: true,
    preconditionsValid: true,
  });
  job = transitionJob(job, event('EXECUTING', job.actor), {
    sealValid: true,
    preconditionsValid: true,
  });
  assert.throws(
    () =>
      transitionJob(job, event('VERIFIED', job.actor), {
        receiptValid: true,
        verifierVerdict: 'PASS',
      }),
    (error) => error.code === 'ROLE_CONFLICT'
  );
  assert.throws(
    () =>
      transitionJob(job, event('VERIFIED', job.verifier.identity), {
        receiptValid: true,
        verifierVerdict: 'FAIL',
      }),
    (error) => error.code === 'VERIFICATION_REQUIRED'
  );
  job = transitionJob(job, event('VERIFIED', job.verifier.identity), {
    receiptValid: true,
    verifierVerdict: 'PASS',
  });
  assert.equal(job.state, 'VERIFIED');
  assert.throws(
    () => transitionJob(job, event('ACCEPTED', job.acceptance.owner)),
    (error) => error.code === 'ACCEPTANCE_CRITERIA_UNMET'
  );
  job = transitionJob(job, event('ACCEPTED', job.acceptance.owner), {
    acceptanceSatisfied: true,
  });
  assert.throws(
    () =>
      transitionJob(job, event('CHRONICLE_ELIGIBLE', job.acceptance.owner), {
        rightsCurrent: true,
      }),
    (error) => error.code === 'CHRONICLE_INELIGIBLE'
  );
});
test('E02 an accurate FAIL evaluation can be verified and accepted without candidate promotion', async () => {
  const draft = createInvoiceJobs()[8];
  draft.objective =
    'Deliver an accurate comparison report regardless of whether the candidate wins.';
  draft.acceptance.predicate =
    'Report matches independently recomputed evidence, includes failures and complete costs; a favorable candidate verdict is not required.';
  let job = await sealWorkOrder(draft);
  const report = {
    evaluationVerdict: 'FAIL',
    accuracyVerified: true,
    candidateStatus: 'FAILED_UNADMITTED',
    authorityCreated: 'NONE',
  };
  const reportDigest = await digestObject(
    'test-accurate-negative-report-v1',
    report
  );
  for (const to of [
    'UNDERWRITTEN',
    'AUTHORIZED',
    'EXECUTING',
    'VERIFIED',
    'ACCEPTED',
  ]) {
    const actor =
      to === 'VERIFIED'
        ? job.verifier.identity
        : to === 'ACCEPTED'
        ? job.acceptance.owner
        : to === 'EXECUTING'
        ? job.actor
        : job.principal;
    const event = {
      eventId: `negative-evaluation:${to}`,
      expectedState: job.state,
      to,
      actor,
      timestamp: '2026-10-08T00:00:00Z',
      evidence: [reportDigest],
      reason:
        'Accept rigorously completed evaluation work, irrespective of candidate failure.',
    };
    job = await transitionSealedJob(job, event, {
      preconditionsValid: true,
      verifierVerdict: 'PASS',
      receiptValid: true,
      acceptanceSatisfied: report.accuracyVerified,
    });
  }
  assert.equal(job.state, 'ACCEPTED');
  assert.equal(report.evaluationVerdict, 'FAIL');
  assert.equal(report.candidateStatus, 'FAILED_UNADMITTED');
  assert.equal(report.authorityCreated, 'NONE');
  const tampered = {
    ...job,
    acceptance: {
      ...job.acceptance,
      predicate: 'Pay only for a favorable candidate verdict.',
    },
  };
  await assert.rejects(
    () => transitionSealedJob(tampered, {}),
    (error) => error.code === 'JOB_SEAL_INVALID'
  );
  assert.notEqual(
    reportDigest,
    await digestObject('test-accurate-negative-report-v1', {
      ...report,
      evaluationVerdict: 'PASS',
    })
  );
});
test('the twenty-one templates preserve separate validation and acceptance', () => {
  assert.equal(JOB_TEMPLATES.length, 21);
  assert.equal(new Set(JOB_TEMPLATES.map((item) => item.id)).size, 21);
  assert.match(
    JOB_TEMPLATES.find((item) => item.id === 'mission-gym').title,
    /Benchmark/
  );
  assert.ok(JOB_TEMPLATES.some((item) => item.id === 'independent-validation'));
  assert.ok(JOB_TEMPLATES.some((item) => item.id === 'accountable-acceptance'));
});
