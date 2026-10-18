import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputerMission,
  runComputerMission,
  constructComputerStrategies,
  validateComputerStrategy,
  executeComputerStrategy,
  checkComputerPlan,
  auditComputerPlanOptimality,
  verifyComputerMissionReport,
  exportComputerMissionReport,
  restoreComputerMissionReport,
  reviewObservedAllocation,
  createAlphaComputerTask,
  compileComputerMissionJobs,
} from '../src/computer-mission.mjs';
import { digestBytes, digestObject } from '../src/integrity.mjs';
import { verifyWorkOrderSeal } from '../src/compiler.mjs';

const approval = {
  approved: true,
  ownerLabel: 'Laboratory owner',
  reason:
    'Compare staged delivery while preserving the actual quantities, deadlines and complete landed-cost budget.',
};
const approved = (mission, options = {}) =>
  runComputerMission(mission, { formulationApproval: approval, ...options });
const copy = (value) => JSON.parse(JSON.stringify(value));
const rejects = (operation, code) =>
  assert.rejects(operation, (error) => error.code === code);
const plan = (allocations, costCents) => ({
  schemaVersion: '1.0.0',
  kind: 'SupplierAllocationPlan',
  allocations: Object.entries(allocations).map(([supplierId, units]) => ({
    supplierId,
    units,
  })),
  costCents,
});
const observed = (report, candidate = report.frozen.plan) => {
  const checked = checkComputerPlan(report.mission, candidate, {
    formulation: report.formulation,
  });
  return {
    schemaVersion: '1.0.0',
    kind: 'SupplierDeskResult',
    missionDigest: report.mission.digest,
    reportDigest: report.digest,
    frozenProgramDigest: report.frozen.programDigest,
    plan: candidate,
    check: { valid: checked.valid, totals: checked.totals },
    formulation: report.formulation,
    purchaseExecuted: false,
    executionKind: 'USER_OR_SCRIPTED_BROWSER_INTERACTION',
    actions: [],
  };
};

test('the default public fixture seals every actual requirement and declares illustrative USD prices', async () => {
  const mission = await createComputerMission();
  assert.deepEqual(mission.requirements, {
    earlyUnits: 10,
    earlyDay: 7,
    totalUnits: 40,
    finalDay: 14,
    budgetCents: 51000,
  });
  assert.equal(mission.currency, 'USD');
  assert.equal(mission.evidenceClass, 'SYNTHETIC_PUBLIC_FIXTURE');
  assert.equal(mission.inputRights.verified, false);
  const { digest, ...body } = mission;
  assert.equal(
    digest,
    await digestObject('successor.computer-mission.v1', body)
  );
  assert.ok(Object.isFrozen(mission.requirements));
  assert.throws(() => {
    mission.requirements.earlyUnits = 0;
  }, TypeError);
});

test('changed formulation cannot execute before explicit attributable comparison approval', async () => {
  const mission = await createComputerMission();
  const report = await runComputerMission(mission);
  assert.equal(report.formulation, 'all_early');
  assert.equal(report.reframing.status, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(report.development.selected.costCents, 49000);
  assert.ok(
    report.development.attempts.every(
      (attempt) => attempt.program.window.formulation === 'all_early'
    )
  );
  await rejects(
    () =>
      runComputerMission(mission, {
        formulationApproval: { ...approval, approved: false },
      }),
    'COMPUTER_APPROVAL_REQUIRED'
  );
  await rejects(
    () =>
      runComputerMission(mission, { formulationApproval: { approved: true } }),
    'COMPUTER_SCHEMA_INVALID'
  );
});

test('a concrete late-cheap failure drives two executable revisions rather than a new strategy label', async () => {
  const report = await approved(await createComputerMission());
  const [failed, split, freight] = report.development.attempts;
  assert.equal(failed.program.allocation.op, 'single_supplier');
  assert.equal(failed.plan.costCents, 28000);
  assert.equal(failed.check.valid, false);
  assert.equal(
    failed.check.checks.find((entry) => entry.id === 'early-units').passed,
    false
  );
  assert.equal(split.lineage.parentDigest, failed.digest);
  assert.equal(split.program.allocation.op, 'early_then_remainder');
  assert.equal(split.plan.costCents, 33000);
  assert.equal(split.check.totals.costCents, 36000);
  assert.equal(split.check.valid, false);
  assert.equal(freight.lineage.parentDigest, split.digest);
  assert.equal(freight.program.objective.costModel, 'landed');
  assert.equal(freight.plan.costCents, 36000);
  assert.equal(freight.check.valid, true);
  assert.notEqual(failed.programDigest, split.programDigest);
  assert.notEqual(split.programDigest, freight.programDigest);
  assert.equal(report.search.grammarPrograms, 24);
  assert.equal(report.search.grammarProgramsExecuted, 24);
  assert.equal(report.development.attempts.length, 26);
});

test('actual staged feasibility costs36000, but the credible conventional alternative matches it and proof remains held', async () => {
  const mission = await createComputerMission();
  const report = await approved(mission);
  assert.deepEqual(report.mission.requirements, mission.requirements);
  assert.equal(report.reframing.changesActualRequirements, false);
  assert.equal(report.reframing.approval.productionAuthority, false);
  assert.equal(report.development.baseline.costCents, 49000);
  assert.equal(report.development.selected.costCents, 36000);
  assert.deepEqual(
    report.development.selected.plan,
    plan({ stellar: 10, laurentian: 30 }, 36000)
  );
  assert.equal(report.development.credibleAlternative.costCents, 36000);
  assert.equal(report.decision.quotedCostDifferenceFromIncumbentCents, 13000);
  assert.equal(
    report.decision.quotedCostDifferenceFromCredibleAlternativeCents,
    0
  );
  assert.equal(report.decision.sameTaskSuperiority, false);
  assert.equal(report.decision.provenExternalAlpha, false);
  assert.equal(
    report.decision.state,
    'INCUMBENT_RETAINED_PENDING_INDEPENDENT_REVIEW'
  );
  assert.deepEqual(report.decision.retainedPlan, plan({ stellar: 40 }, 49000));
  assert.equal(report.independentProof, false);
  assert.equal(report.authorityCreated, 'NONE');
});

test('an immutable hard40-by7 requirement cannot be reframed away', async () => {
  const mission = await createComputerMission({
    requirements: {
      earlyUnits: 40,
      earlyDay: 7,
      totalUnits: 40,
      finalDay: 14,
      budgetCents: 51000,
    },
  });
  const report = await approved(mission);
  assert.equal(report.reframing.hardEarlyRequirement, true);
  assert.equal(report.development.selected.costCents, 49000);
  assert.equal(report.development.credibleAlternative.costCents, 49000);
  assert.equal(report.decision.quotedCostDifferenceFromIncumbentCents, 0);
  assert.equal(
    checkComputerPlan(mission, plan({ stellar: 10, laurentian: 30 }, 36000))
      .valid,
    false
  );
  const forged = copy(mission);
  forged.requirements.earlyUnits = 10;
  await rejects(() => approved(forged), 'COMPUTER_MISSION_TAMPERED');
});

test('separate complete oracle checks all861 integer allocations and agrees with actual feasibility, not solver labels', async () => {
  const mission = await createComputerMission();
  const optimum = auditComputerPlanOptimality(
    mission,
    plan({ stellar: 10, laurentian: 30 }, 36000)
  );
  assert.equal(optimum.exhaustive, true);
  assert.equal(optimum.enumeratedAllocations, 861);
  assert.equal(optimum.optimumCostCents, 36000);
  assert.equal(optimum.candidateOptimal, true);
  assert.equal(optimum.independentImplementation, true);
  assert.equal(optimum.independentProof, false);
  const late = auditComputerPlanOptimality(
    mission,
    plan({ laurentian: 40 }, 30000)
  );
  assert.equal(late.candidateFeasible, false);
  assert.equal(late.candidateOptimal, false);
  const original = auditComputerPlanOptimality(
    mission,
    plan({ stellar: 40 }, 49000),
    { formulation: 'all_early' }
  );
  assert.equal(original.optimumCostCents, 49000);
  assert.equal(original.candidateOptimal, true);
});

test('checker rejects omitted freight, cheap-late delivery, over-budget plans, missing units, unknown suppliers and duplicate freight rows', async () => {
  const mission = await createComputerMission();
  assert.equal(
    checkComputerPlan(mission, plan({ stellar: 10, laurentian: 30 }, 33000))
      .valid,
    false
  );
  assert.equal(
    checkComputerPlan(mission, plan({ laurentian: 40 }, 30000)).valid,
    false
  );
  assert.equal(
    checkComputerPlan(mission, plan({ boreal: 40 }, 56000)).valid,
    false
  );
  assert.equal(
    checkComputerPlan(mission, plan({ stellar: 10, laurentian: 29 }, 35300))
      .valid,
    false
  );
  assert.equal(
    checkComputerPlan(mission, plan({ unavailable: 40 }, 0)).valid,
    false
  );
  const duplicate = plan({ stellar: 10 }, 49000);
  duplicate.allocations.push({ supplierId: 'stellar', units: 30 });
  assert.throws(
    () => checkComputerPlan(mission, duplicate),
    (error) => error.code === 'COMPUTER_PLAN_INVALID'
  );
  const generous = await createComputerMission({
    requirements: { ...mission.requirements, budgetCents: 100000 },
  });
  const mixedEarly = plan({ stellar: 10, boreal: 30 }, 55000);
  assert.equal(checkComputerPlan(generous, mixedEarly).valid, true);
  assert.equal(
    checkComputerPlan(generous, mixedEarly, { formulation: 'all_early' }).valid,
    false
  );
});

test('freight can reverse a cheap-unit ranking and late final delivery cannot hide behind a low price', async () => {
  const original = await createComputerMission();
  const costlyFreight = copy(original.suppliers);
  costlyFreight[0].freightCents = 100000;
  const mission = await createComputerMission({
    suppliers: costlyFreight,
    publicNonPersonal: true,
    rights: 'Public synthetic price variant, permitted for this local test.',
  });
  const report = await approved(mission);
  assert.equal(report.development.selected.costCents, 37000);
  assert.deepEqual(
    new Map(
      report.development.selected.plan.allocations.map((entry) => [
        entry.supplierId,
        entry.units,
      ])
    ),
    new Map([
      ['boreal', 10],
      ['laurentian', 30],
    ])
  );
  assert.equal(report.development.baseline.check.valid, false);
  assert.equal(report.decision.retainedPlan, null);
  assert.equal(report.decision.productionAuthority, false);
  const late = copy(original.suppliers);
  late[1].deliveryDay = 15;
  const lateReport = await approved(
    await createComputerMission({
      suppliers: late,
      publicNonPersonal: true,
      rights: 'Public synthetic quote variant.',
    })
  );
  assert.equal(lateReport.development.selected.costCents, 49000);
  assert.equal(
    lateReport.development.independentPlanCheck.optimumCostCents,
    49000
  );
});

test('only the declared finite operator grammar executes; arbitrary code and modified operators are refused', async () => {
  const mission = await createComputerMission();
  const programs = constructComputerStrategies({
    formulation: 'actual_requirements',
  });
  assert.equal(programs.length, 24);
  assert.equal(
    new Set(programs.map((program) => JSON.stringify(program))).size,
    24
  );
  const injected = copy(programs[0]);
  injected.allocation.op = 'eval';
  assert.throws(
    () => validateComputerStrategy(injected),
    (error) => error.code === 'COMPUTER_PROGRAM_INVALID'
  );
  const extra = copy(programs[0]);
  extra.code = 'fetch("https://example.org")';
  assert.throws(
    () => validateComputerStrategy(extra),
    (error) => error.code === 'COMPUTER_SCHEMA_INVALID'
  );
  const run = await executeComputerStrategy(
    mission,
    programs.find(
      (program) =>
        program.allocation.op === 'enumerate_integer' &&
        program.objective.costModel === 'landed'
    )
  );
  assert.equal(run.costCents, 36000);
  assert.equal(run.check.valid, true);
});

test('program and operation budgets bound real search and retain the incumbent when no revised candidate passes', async () => {
  const mission = await createComputerMission();
  const limited = await approved(mission, { maxPrograms: 1 });
  assert.equal(limited.development.attempts.length, 1);
  assert.equal(limited.search.stoppedAtProgramBudget, true);
  assert.equal(limited.development.selected.lineage.kind, 'INCUMBENT_FALLBACK');
  assert.equal(limited.development.selected.costCents, 49000);
  assert.equal(limited.decision.nomineeForIndependentTest, false);
  const exhausted = await approved(mission, {
    maxLogicalOperations: 1,
    maxPrograms: 2,
  });
  assert.ok(
    exhausted.development.attempts.every(
      (attempt) =>
        attempt.status === 'BUDGET_EXHAUSTED' && attempt.logicalOperations <= 1
    )
  );
  assert.equal(exhausted.development.selected, null);
  assert.equal(exhausted.decision.productionAuthority, false);
  await rejects(
    () => approved(mission, { maxPrograms: 49 }),
    'COMPUTER_LIMIT_INVALID'
  );
  await rejects(
    () => approved(mission, { maxLogicalOperations: 100001 }),
    'COMPUTER_LIMIT_INVALID'
  );
});

test('one exact candidate is frozen before every distinct public confirmation case without implying protected proof', async () => {
  const report = await approved(await createComputerMission());
  const freezeEvent = report.history.find(
    (event) => event.type === 'CANDIDATE_FROZEN'
  );
  const tests = report.history.filter(
    (event) => event.type === 'PUBLIC_FRESH_CASE_TESTED'
  );
  assert.ok(tests.every((event) => event.sequence > freezeEvent.sequence));
  assert.equal(
    new Set([
      report.mission.digest,
      ...report.confirmation.cases.map((record) => record.mission.digest),
    ]).size,
    3
  );
  for (const record of report.confirmation.cases) {
    assert.equal(record.frozenDigest, report.frozen.digest);
    assert.equal(record.candidate.programDigest, report.frozen.programDigest);
    assert.deepEqual(record.mission.requirements, report.mission.requirements);
    assert.equal(record.mission.evidenceClass, 'PUBLIC_GENERATED_VARIANT');
    assert.equal(record.protectedHoldout, false);
    assert.equal(record.independentProof, false);
  }
  assert.equal(report.search.actualBrowserActions, null);
  assert.equal(report.search.actualBrowserTimeMs, null);
  assert.equal(report.search.providerCost, null);
  assert.equal(report.search.humanReviewMinutes, null);
});

test('portable report replay reproduces every attempt and refuses invented prices, lineage, proof, authority and costs', async () => {
  const report = await approved(await createComputerMission());
  assert.deepEqual(await verifyComputerMissionReport(report), report);
  assert.deepEqual(
    await restoreComputerMissionReport(
      await exportComputerMissionReport(report)
    ),
    report
  );
  for (const mutate of [
    (value) => {
      value.development.selected.plan.costCents = 1;
    },
    (value) => {
      value.development.attempts[1].lineage.parentDigest =
        'sha256:' + '0'.repeat(64);
    },
    (value) => {
      value.frozen.program.allocation.op = 'single_supplier';
    },
    (value) => {
      value.confirmation.protectedHoldout = true;
    },
    (value) => {
      value.independentProof = true;
    },
    (value) => {
      value.authorityCreated = 'A4';
    },
    (value) => {
      value.liveProvider = true;
    },
  ]) {
    const forged = copy(report);
    mutate(forged);
    await rejects(
      () => restoreComputerMissionReport(JSON.stringify(forged)),
      'COMPUTER_REPORT_TAMPERED'
    );
  }
  const wrongFacts = copy(report);
  wrongFacts.mission.suppliers[0].unitCents = 1;
  await rejects(
    () => restoreComputerMissionReport(JSON.stringify(wrongFacts)),
    'COMPUTER_MISSION_TAMPERED'
  );
  await rejects(
    () => restoreComputerMissionReport('{"__proto__":{"authority":true}}'),
    'COMPUTER_REPORT_INVALID'
  );
  await rejects(
    () => restoreComputerMissionReport('x'.repeat(4 * 1024 * 1024 + 1)),
    'COMPUTER_REPORT_LIMIT'
  );
});

test('observed browser allocation is independently recomputed and must match the exact frozen plan regardless of row order', async () => {
  const report = await approved(await createComputerMission());
  const result = observed(report);
  result.plan = copy(result.plan);
  result.plan.allocations.reverse();
  const review = await reviewObservedAllocation(report, result);
  assert.equal(review.accepted, true);
  assert.equal(review.frozenAllocationMatch, true);
  assert.equal(review.check.totals.costCents, 36000);
  assert.equal(review.trustedComputerExecution, false);
  assert.equal(
    review.reportedExecution.provenance,
    'SELF_REPORTED_NOT_AUTHENTICATED'
  );
  assert.equal(review.independentProof, false);
  assert.equal(review.productionApproved, false);
  assert.equal(review.settlementApproved, false);
  const otherFeasible = await reviewObservedAllocation(
    report,
    observed(report, plan({ stellar: 40 }, 49000))
  );
  assert.equal(otherFeasible.check.valid, true);
  assert.equal(otherFeasible.frozenAllocationMatch, false);
  assert.equal(otherFeasible.accepted, false);
  const late = await reviewObservedAllocation(
    report,
    observed(report, plan({ laurentian: 40 }, 30000))
  );
  assert.equal(late.accepted, false);
  const fakeTotal = observed(report);
  fakeTotal.check.totals = { totalUnits: 40, earlyUnits: 40, costCents: 1 };
  await rejects(
    () => reviewObservedAllocation(report, fakeTotal),
    'COMPUTER_OBSERVATION_TAMPERED'
  );
  const fakeProof = observed(report);
  fakeProof.check.independentProof = true;
  await rejects(
    () => reviewObservedAllocation(report, fakeProof),
    'COMPUTER_OBSERVATION_TAMPERED'
  );
  const purchase = observed(report);
  purchase.purchaseExecuted = true;
  await rejects(
    () => reviewObservedAllocation(report, purchase),
    'COMPUTER_EFFECT_FORBIDDEN'
  );
});

test('recomputed hashes and self-reported powerful runtime names cannot make a false or unauthenticated execution trusted', async () => {
  const report = await approved(await createComputerMission());
  const forged = observed(report, plan({ laurentian: 40 }, 36000));
  const checkResult = checkComputerPlan(report.mission, forged.plan);
  forged.check = { valid: checkResult.valid, totals: checkResult.totals };
  forged.executionKind =
    'Claimed newest model with an independently qualified browser';
  await digestObject('successor.computer-observation.v1', forged);
  const rejected = await reviewObservedAllocation(report, forged);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.trustedComputerExecution, false);
  const correctlyReported = observed(report);
  correctlyReported.executionKind = forged.executionKind;
  const review = await reviewObservedAllocation(report, correctlyReported);
  assert.equal(review.accepted, true);
  assert.equal(review.trustedComputerExecution, false);
  assert.equal(review.protectedQualification, false);
});

test('Alpha70 task uses the real bounded native wire and binds mission, program, plan, report and exact HTML bytes', async () => {
  const report = await approved(await createComputerMission());
  const html =
    '<!doctype html><html><body><p>Reviewed local desk.</p></body></html>';
  const task = await createAlphaComputerTask(report, { html });
  assert.deepEqual(
    Object.keys(task).sort(),
    [
      'schema_version',
      'kind',
      'goal',
      'html',
      'allowed_urls',
      'input_rights',
      'license',
      'max_turns',
      'max_actions',
      'max_seconds',
      'review_minutes',
    ].sort()
  );
  assert.equal(task.schema_version, 1);
  assert.equal(task.kind, 'successor-computer');
  assert.equal(task.html, html);
  assert.deepEqual(task.allowed_urls, []);
  assert.equal(task.max_turns, 10);
  assert.equal(task.max_actions, 30);
  assert.equal(task.max_seconds, 180);
  for (const value of [
    report.mission.digest,
    report.digest,
    report.frozen.programDigest,
    report.frozen.planDigest,
    await digestBytes(html),
  ])
    assert.ok(task.goal.includes(value));
  assert.match(task.goal, /do not purchase/);
  await rejects(
    () => createAlphaComputerTask(report, { html, maxActions: 101 }),
    'COMPUTER_LIMIT_INVALID'
  );
  await rejects(
    () => createAlphaComputerTask(report, { html: 'a'.repeat(200001) }),
    'COMPUTER_TEXT_INVALID'
  );
});

test('custom quotes require public nonpersonal rights attestation and all numeric and structural limits remain bounded', async () => {
  const mission = await createComputerMission();
  await rejects(
    () => createComputerMission({ suppliers: copy(mission.suppliers) }),
    'COMPUTER_RIGHTS_REQUIRED'
  );
  await rejects(
    () => createComputerMission({ currency: 'ETH' }),
    'COMPUTER_CURRENCY_INVALID'
  );
  await rejects(
    () =>
      createComputerMission({
        requirements: { ...mission.requirements, totalUnits: 41 },
      }),
    'COMPUTER_LIMIT_INVALID'
  );
  await rejects(
    () =>
      createComputerMission({
        requirements: { ...mission.requirements, budgetCents: 1.1 },
      }),
    'COMPUTER_LIMIT_INVALID'
  );
  await rejects(
    () =>
      createComputerMission({
        suppliers: [...copy(mission.suppliers), copy(mission.suppliers[0])],
        publicNonPersonal: true,
        rights: 'Public quotes.',
      }),
    'COMPUTER_SUPPLIER_LIMIT'
  );
  const quotes = copy(mission.suppliers);
  quotes[0].name = '<img src=x onerror=alert(1)>';
  const custom = await createComputerMission({
    suppliers: quotes,
    publicNonPersonal: true,
    rights:
      'These public nonpersonal illustrative USD quotes may be used and exported.',
  });
  assert.equal(custom.suppliers[0].name, quotes[0].name);
  assert.equal(custom.evidenceClass, 'USER_ATTESTED_PUBLIC_NONPERSONAL');
  assert.equal(custom.inputRights.verified, false);
});

test('native compiler output has four actual sealed A0 unsigned unfunded drafts with placeholder roles and no token conversion', async () => {
  const report = await approved(await createComputerMission());
  const result = await compileComputerMissionJobs(report, {
    now: '2026-10-18T20:00:00Z',
  });
  assert.equal(result.status, 'SEALED');
  assert.equal(result.constitution.authorityCeiling.level, 'A0');
  assert.equal(result.constitution.authorityCeiling.externalEffects, false);
  assert.equal(result.graph.nodes.length, 4);
  assert.equal(result.budgetReservations.unit, 'AGIALPHA');
  assert.equal(result.budgetReservations.reservedBaseUnits, '0');
  assert.equal(result.fundingStatus, 'UNFUNDED');
  assert.equal(result.signatureStatus, 'UNSIGNED_COMMITMENT');
  assert.equal(result.authorityCreated, 'NONE');
  assert.equal(result.identityStatus, 'PLACEHOLDERS_REQUIRE_OWNER_ASSIGNMENT');
  assert.equal(
    result.computerRuntimeStatus,
    'SEPARATE_EXACT_TASK_ADMISSION_REQUIRED'
  );
  assert.equal(result.computerMission.mission.digest, report.mission.digest);
  assert.ok(
    result.graph.nodes.every(
      (job) => job.state === 'DRAFT' && job.chronicle.eligible === false
    )
  );
  assert.ok(
    (await Promise.all(result.graph.nodes.map(verifyWorkOrderSeal))).every(
      Boolean
    )
  );
});
