import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExpression,
  stepWorld,
  createEnergyWorld,
  synthesizeWorldCandidates,
  evaluateCandidates,
  planEvidence,
  evaluateEvidencePolicy,
  posteriorProbability,
  planResources,
  validateProposedWorld,
} from '../src/discovery.mjs';
import {
  createWorldFixture,
  runWorldWorkbench,
  createEvidenceFixture,
  createResourceFixture,
  runResourceWorkbench,
  runSupplierSubstitutionWorkbench,
} from '../src/workbenches.mjs';

const lit = (value, unit) => ({
  op: 'literal',
  value,
  ...(unit ? { unit } : {}),
});
const op = (name, ...args) => ({ op: name, args });
const errorCode = (code) => (error) => error.code === code;

test('restricted expressions enforce operations, units, finite values, unknowns and budgets', () => {
  assert.equal(
    evaluateExpression(op('add', lit(3, 'kWh'), lit(4, 'kWh'))).value,
    7
  );
  assert.throws(
    () => evaluateExpression(op('add', lit(3, 'kWh'), lit(4, 'USD'))),
    errorCode('UNIT_MISMATCH')
  );
  assert.throws(
    () => evaluateExpression({ op: 'eval', args: [lit('process.exit()')] }),
    errorCode('UNSUPPORTED_OPERATION')
  );
  assert.throws(
    () => evaluateExpression({ op: 'var', name: 'constructor' }, {}),
    errorCode('INVALID_IDENTIFIER')
  );
  assert.throws(
    () => evaluateExpression({ op: '__proto__', args: [] }),
    errorCode('UNSUPPORTED_OPERATION')
  );
  assert.throws(
    () => evaluateExpression({ op: 'literal', value: Infinity }),
    errorCode('INVALID_NUMBER')
  );
  assert.throws(
    () => evaluateExpression(op('div', lit(1), lit(0))),
    errorCode('DIVISION_BY_ZERO')
  );
  assert.throws(
    () => evaluateExpression(op('add', lit(1), lit(2)), {}, { maxSteps: 2 }),
    errorCode('EXPRESSION_BUDGET_EXHAUSTED')
  );
  assert.equal(
    evaluateExpression(
      op('add', { op: 'unknown', type: 'number', unit: 'kWh' }, lit(4, 'kWh'))
    ).known,
    false
  );
  assert.throws(
    () =>
      evaluateExpression(
        op('if', lit(true), lit(1), { op: 'execute', args: [] })
      ),
    errorCode('UNSUPPORTED_OPERATION')
  );
});

test('world programs use typed declared state, isolated transition evaluation and explicit falsifiers', () => {
  const program = createEnergyWorld({ leak: 5, conditional: true });
  assert.deepEqual(
    stepWorld(program, { charge: 20, hot: true }, { draw: 7 }).nextState,
    { charge: 8, hot: true }
  );
  assert.equal(
    stepWorld(program, { charge: 20, hot: false }, { draw: 7 }).nextState
      .charge,
    13
  );
  assert.equal(
    stepWorld(program, { charge: null, hot: true }, { draw: 7 }).known,
    false
  );
  assert.throws(
    () => stepWorld(program, { charge: 20, hot: true, secret: 1 }, { draw: 7 }),
    errorCode('UNKNOWN_VARIABLE')
  );
  assert.throws(
    () => stepWorld(program, { charge: 20 }, { draw: 7 }),
    errorCode('MISSING_VARIABLE')
  );
  assert.throws(
    () => stepWorld(program, { charge: 20, hot: true }, { draw: -1 }),
    errorCode('VARIABLE_OUT_OF_SCOPE')
  );
  assert.throws(
    () => stepWorld(program, { charge: -1000, hot: true }, { draw: 10 }),
    errorCode('TRANSITION_OUT_OF_SCOPE')
  );
  assert.throws(
    () =>
      stepWorld(
        {
          ...program,
          transitions: { ...program.transitions, charge: lit(3, 'USD') },
        },
        { charge: 20, hot: true },
        { draw: 7 }
      ),
    errorCode('TRANSITION_TYPE_MISMATCH')
  );
  assert.match(program.falsifier, /observed/);
});

test('finite synthesis discovers the actual guarded mechanism and respects candidate budget', () => {
  const { formation } = createWorldFixture();
  const result = synthesizeWorldCandidates(formation);
  assert.equal(result.evaluated, 8);
  assert.deepEqual(result.selected.settings, { leak: 5, conditional: true });
  assert.equal(result.selected.formationMSE, 0);
  const bounded = synthesizeWorldCandidates(
    formation,
    {},
    { maxCandidates: 2 }
  );
  assert.equal(bounded.evaluated, 2);
  assert.equal(bounded.stopped, 'BUDGET_EXHAUSTED');
  assert.equal(bounded.evidenceClass, 'FORMATION_ONLY');
  const stepsBounded = synthesizeWorldCandidates(
    formation,
    {},
    { maxSteps: 3 }
  );
  assert.equal(stepsBounded.selected, null);
  assert.equal(stepsBounded.steps, 3);
  assert.equal(stepsBounded.stopped, 'BUDGET_EXHAUSTED');
});

test('higher accuracy and lower prediction error never compensate for critical misses', () => {
  const report = runWorldWorkbench();
  const incumbent = report.candidates.find(
    (candidate) => candidate.id === 'incumbent_conservative'
  );
  const patch = report.candidates.find(
    (candidate) => candidate.id === 'patch_average_score'
  );
  const challenger = report.candidates.find(
    (candidate) => candidate.id === 'synthesized_challenger'
  );
  assert.equal(report.developmentCount, 60);
  assert.equal(patch.metrics.correct, 54);
  assert.equal(patch.metrics.criticalMisses, 6);
  assert.ok(patch.metrics.accuracy > incumbent.metrics.accuracy);
  assert.ok(
    patch.metrics.meanAbsoluteError < incumbent.metrics.meanAbsoluteError
  );
  assert.equal(patch.eligible, false);
  assert.equal(challenger.metrics.correct, 60);
  assert.equal(challenger.metrics.criticalMisses, 0);
  assert.equal(report.alpha.margin, 0);
  assert.equal(report.alpha.status, 'ABSENT');
  assert.equal(report.selectedCandidateId, 'strong_conventional');
  assert.equal(report.counterexamples.length, 6);
  assert.equal(report.independentProof, false);
  assert.equal(report.activeProductionAuthority, false);
  assert.deepEqual(report, runWorldWorkbench());
});

test('unknown predictions abstain and cannot be silently counted as safe passes', () => {
  const program = createEnergyWorld();
  program.transitions.charge = { op: 'unknown', type: 'number', unit: 'kWh' };
  const [result] = evaluateCandidates(
    [{ id: 'unknown', program }],
    [
      {
        id: 'case',
        state: { charge: 20, hot: false },
        action: { draw: 3 },
        nextState: { charge: 17 },
      },
    ]
  );
  assert.equal(result.metrics.abstentions, 1);
  assert.equal(result.eligible, false);
  assert.equal(result.metrics.meanAbsoluteError, null);
  assert.equal(result.predictions[0].decision, 'ABSTAIN');
  assert.throws(
    () =>
      evaluateCandidates(
        [{ id: 'bounded', program }],
        [
          {
            id: 'case',
            state: { charge: 20, hot: false },
            action: { draw: 3 },
            nextState: { charge: 17 },
          },
        ],
        { maxSteps: 1 }
      ),
    errorCode('EVALUATION_BUDGET_EXHAUSTED')
  );
});

test('joint-world conditioning does not count correlated measurements twice', () => {
  const problem = createEvidenceFixture();
  const one = posteriorProbability(
    problem,
    { screen_a: 'positive' },
    { field: 'quality', equals: 'good' }
  );
  const two = posteriorProbability(
    problem,
    { screen_a: 'positive', screen_b: 'positive' },
    { field: 'quality', equals: 'good' }
  );
  assert.ok(Math.abs(one - 5 / 6) < 1e-12);
  assert.equal(one, two);
  assert.throws(
    () =>
      posteriorProbability(
        problem,
        { screen_a: 'negative', screen_b: 'positive' },
        { field: 'quality', equals: 'good' }
      ),
    errorCode('IMPOSSIBLE_EVIDENCE')
  );
});

test('sequential evidence planner buys decision-changing tests and accounts for every path cost', () => {
  const problem = createEvidenceFixture();
  const result = planEvidence(problem);
  assert.ok(Math.abs(result.expectedUtility - 30) < 1e-9);
  assert.ok(Math.abs(result.expectedTestCost - 20) < 1e-9);
  assert.equal(result.maxPathCost, 30);
  assert.equal(result.policy.experimentId, 'screen_a');
  const positive = result.policy.branches.find(
    (branch) => branch.outcome === 'positive'
  );
  const negative = result.policy.branches.find(
    (branch) => branch.outcome === 'negative'
  );
  assert.equal(positive.policy.experimentId, 'independent_assay');
  assert.equal(negative.policy.decisionId, 'retain');
  const evaluated = evaluateEvidencePolicy(result.policy, problem);
  assert.ok(
    Math.abs(evaluated.expectedUtility - result.expectedUtility) < 1e-9
  );
  assert.ok(
    Math.abs(evaluated.expectedTestCost - result.expectedTestCost) < 1e-9
  );
  assert.equal(
    planEvidence({ ...problem, horizon: 0 }).policy.decisionId,
    'retain'
  );
  assert.equal(
    planEvidence({ ...problem, budget: 0 }).policy.decisionId,
    'retain'
  );
  assert.throws(
    () => planEvidence({ ...problem, maxStates: 1 }),
    errorCode('SEARCH_BUDGET_EXHAUSTED')
  );
});

test('unfavorable population shift weakens an unchanged policy and conventional comparison removes unique advantage', () => {
  const report = runResourceWorkbench();
  assert.ok(Math.abs(report.nominal.expectedUtility - 30) < 1e-9);
  assert.ok(Math.abs(report.stress.expectedUtility - 14) < 1e-9);
  assert.equal(report.stress.policyUnchanged, true);
  assert.ok(
    Math.abs(
      report.comparators.find((item) => item.id === 'one_step')
        .expectedUtility - 25
    ) < 1e-9
  );
  assert.ok(Math.abs(report.alpha.margin) < 1e-9);
  assert.equal(report.alpha.status, 'ABSENT');
  assert.ok(
    report.correlation.naiveIndependentTwoPositives >
      report.correlation.twoCorrelatedPositives
  );
});

test('resource planner conserves energy and respects simultaneous bottlenecks and deadlines', () => {
  const result = planResources(createResourceFixture());
  assert.equal(result.utility, 79);
  assert.equal(result.totalUsedKWh, 8);
  assert.equal(result.energyConserved, true);
  assert.equal(
    result.allocations.find((item) => item.jobId === 'optional_batch').decision,
    'DEFER'
  );
  assert.ok(
    result.periods.every(
      (period) =>
        period.endingKWh >= 0 &&
        period.usedKWh <= 5 &&
        period.computeSlotsUsed <= period.computeSlotsAvailable
    )
  );
  const empty = planResources({
    periods: [{ renewableKWh: 0, computeSlots: 0 }],
    jobs: [],
    battery: { initialKWh: 0, capacityKWh: 0, maxDischargeKWh: 0 },
  });
  assert.equal(empty.utility, 0);
  assert.equal(empty.energyConserved, true);
  assert.throws(
    () => planResources({ ...createResourceFixture(), maxStates: 1 }),
    errorCode('SEARCH_BUDGET_EXHAUSTED')
  );
});

test('proposed programs are structurally checked, not certified, and never execute arbitrary host code', () => {
  const sample = { state: { charge: 20, hot: true }, action: { draw: 5 } };
  const result = validateProposedWorld(createEnergyWorld({ leak: 5 }), sample);
  assert.equal(result.evidenceClass, 'STRUCTURAL_VALIDATION_ONLY');
  const malicious = createEnergyWorld();
  malicious.transitions.charge = { op: 'import', args: [lit('node:fs')] };
  assert.throws(
    () => validateProposedWorld(malicious, sample),
    errorCode('UNSUPPORTED_OPERATION')
  );
  assert.throws(
    () =>
      validateProposedWorld(createEnergyWorld(), sample, { maximumBytes: 10 }),
    errorCode('PROPOSAL_TOO_LARGE')
  );
  let executed = false;
  const withFunction = createEnergyWorld();
  withFunction.toJSON = () => {
    executed = true;
    return {};
  };
  assert.throws(
    () => validateProposedWorld(withFunction, sample),
    errorCode('INVALID_PROPOSAL')
  );
  assert.equal(executed, false);
});

test('supplier substitution actually reconstructs and executes a different local proposer without inherited claims', () => {
  const result = runSupplierSubstitutionWorkbench();
  assert.notEqual(result.suppliers[0].id, result.suppliers[1].id);
  assert.notEqual(result.suppliers[0].method, result.suppliers[1].method);
  assert.notEqual(
    result.suppliers[0].program.id,
    result.suppliers[1].program.id
  );
  assert.equal(result.compatibility.results.length, 60);
  assert.equal(result.compatibility.equivalent, true);
  assert.equal(result.compatibility.decisionMismatches, 0);
  assert.equal(result.newReleaseRequired, true);
  assert.equal(result.inheritedCurrentProof, false);
  assert.equal(result.inheritedAuthority, false);
});

test('malformed financial/probability inputs fail rather than inventing value', () => {
  const problem = createEvidenceFixture();
  assert.throws(
    () =>
      planEvidence({
        ...problem,
        worlds: problem.worlds.map((world) => ({
          ...world,
          probability: world.probability * 2,
        })),
      }),
    errorCode('INVALID_PROBABILITY')
  );
  assert.throws(
    () =>
      planEvidence({
        ...problem,
        experiments: [{ ...problem.experiments[0], cost: -1 }],
      }),
    errorCode('INVALID_COST')
  );
  assert.throws(
    () => runResourceWorkbench({ goodProbability: 1.1 }),
    errorCode('INVALID_PROBABILITY')
  );
  assert.throws(
    () => runWorldWorkbench({ seed: -1 }),
    errorCode('INVALID_SEED')
  );
});
