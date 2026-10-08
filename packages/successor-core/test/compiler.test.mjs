import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileJobs,
  diagnoseMission,
  invalidationClosure,
  sealWorkOrder,
  verifyWorkOrderSeal,
  transitionSealedJob,
} from '../src/compiler.mjs';
import {
  createInvoiceMission,
  createInvoiceJobs,
  createInvoiceEdges,
} from '../src/invoice.mjs';

const setup = () => {
  const mission = createInvoiceMission();
  return {
    mission,
    jobs: createInvoiceJobs(mission),
    edges: createInvoiceEdges(mission),
    now: '2026-10-08T00:00:00Z',
  };
};
const compile = ({ mission, ...options }) => compileJobs(mission, options);
const rejects = (fixture, code) =>
  assert.rejects(
    () => compile(fixture),
    (error) => error.code === code
  );

test('compiler seals bounded unsigned work without acceptance or authority', async () => {
  const result = await compile(setup());
  assert.equal(result.status, 'SEALED');
  assert.equal(result.authorityCreated, 'NONE');
  assert.equal(result.graph.nodes.length, 10);
  assert.equal(result.budgetReservations.reservedBaseUnits, '5000');
  assert.ok(
    result.coverage.every((item) => item.status === 'PLANNED_NOT_ACCEPTED')
  );
  assert.ok(
    result.graph.nodes.every(
      (job) =>
        job.state === 'DRAFT' && job.signatureStatus === 'UNSIGNED_COMMITMENT'
    )
  );
  assert.ok(
    (await Promise.all(result.graph.nodes.map(verifyWorkOrderSeal))).every(
      Boolean
    )
  );
});
test('seal protects terms but permits separately authorized lifecycle state', async () => {
  const sealed = await sealWorkOrder(setup().jobs[0]);
  assert.equal(
    await verifyWorkOrderSeal({
      ...sealed,
      objective: 'Silently changed task',
    }),
    false
  );
  assert.equal(
    await verifyWorkOrderSeal({ ...sealed, state: 'UNDERWRITTEN' }),
    true
  );
});
test('compiler refuses collapsed roles and unauthorized verifier substitutions', async () => {
  const one = setup();
  one.mission.roles.verifier = one.mission.roles.producer;
  await rejects(one, 'ROLE_CONFLICT');
  const two = setup();
  two.jobs[0].verifier.identity = 'claimant-chosen-verifier';
  await rejects(two, 'VERIFIER_UNAUTHORIZED');
  const three = setup();
  three.mission.proofProtocol.custodian =
    three.mission.proofProtocol.formationOwner;
  await rejects(three, 'PROOF_CUSTODY_CONFLICT');
  const four = setup();
  four.mission.roles.acceptor = four.mission.roles.producer;
  await rejects(four, 'ROLE_CONFLICT');
});
test('sealed transition wrapper refuses tampered terms before the pure state reducer', async () => {
  const sealed = await sealWorkOrder(setup().jobs[0]);
  sealed.objective = 'Changed after seal';
  await assert.rejects(
    () =>
      transitionSealedJob(sealed, {
        eventId: 'attempt',
        expectedState: 'DRAFT',
        to: 'UNDERWRITTEN',
        actor: sealed.principal,
        timestamp: '2026-10-08T00:00:00Z',
        evidence: [sealed.digest],
        reason: 'Try changed terms',
      }),
    (error) => error.code === 'JOB_SEAL_INVALID'
  );
});
test('compiler refuses cycles, unknown edges and missing critical functions', async () => {
  const cycle = setup();
  cycle.edges.push({
    from: cycle.jobs.at(-1).jobId,
    to: cycle.jobs[0].jobId,
    kind: 'control',
  });
  await rejects(cycle, 'GRAPH_CYCLE');
  const missing = setup();
  missing.jobs[0].covers = [];
  await rejects(missing, 'CRITICAL_COVERAGE_MISSING');
  const unknown = setup();
  unknown.edges.push({
    from: 'unknown-job',
    to: unknown.jobs[0].jobId,
    kind: 'evidence',
  });
  await rejects(unknown, 'REFERENCE_UNRESOLVED');
});
test('compiler refuses expired rights, unavailable rollback and ungrounded acceptance', async () => {
  const rights = setup();
  rights.mission.rights[0].expiresAt = '2025-01-01T00:00:00Z';
  await rejects(rights, 'RIGHTS_EXPIRED');
  const rollback = setup();
  rollback.jobs[0].rollback.available = false;
  await rejects(rollback, 'ROLLBACK_UNAVAILABLE');
  const evidence = setup();
  evidence.jobs[0].acceptance.evidenceSources = ['producer-secret'];
  await rejects(evidence, 'ACCEPTANCE_EVIDENCE_UNAVAILABLE');
  const input = setup();
  input.jobs[0].authorizedInputs = ['unlicensed-source'];
  await rejects(input, 'EVIDENCE_PATH_MISSING');
});
test('compiler reserves cumulative budgets and refuses permission expansion', async () => {
  const budget = setup();
  budget.mission.budget.limitBaseUnits = '4999';
  await rejects(budget, 'BUDGET_EXCEEDED');
  const unit = setup();
  unit.jobs[0].budget.unit = 'USDC';
  await rejects(unit, 'BUDGET_UNIT_MISMATCH');
  const action = setup();
  action.jobs[0].permittedActions.push('release-payment');
  await rejects(action, 'ACTION_PROHIBITED');
  const tool = setup();
  tool.jobs[0].permittedTools.push('ambient-shell');
  await rejects(tool, 'TOOL_UNSUPPORTED');
  const retries = setup();
  retries.jobs[0].budget.maxRetries = 10;
  await rejects(retries, 'BUDGET_LIMIT_EXCEEDED');
});
test('evidence and challenge impairment reaches downstream claims without unrelated sources', async () => {
  const result = await compile(setup());
  const affected = invalidationClosure(result, ['purchase-order']);
  assert.ok(affected.includes(`${result.constitution.missionId}:match-po`));
  assert.ok(
    affected.includes(`${result.constitution.missionId}:human-decision-pack`)
  );
  assert.ok(!affected.includes('contract-record'));
  assert.ok(
    !affected.includes(`${result.constitution.missionId}:contract-warranty`)
  );
});
test('typed diagnostic never turns an invalid mission into a success', async () => {
  const fixture = setup();
  fixture.mission.roles.verifier = fixture.mission.roles.producer;
  const result = await diagnoseMission(fixture.mission, fixture);
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.diagnostics[0].code, 'ROLE_CONFLICT');
  assert.equal(result.authorityCreated, 'NONE');
});
