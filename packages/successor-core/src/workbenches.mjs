import {
  DiscoveryError,
  createEnergyWorld,
  synthesizeWorldCandidates,
  evaluateCandidates,
  planEvidence,
  evaluateEvidencePolicy,
  posteriorProbability,
  planResources,
  stepWorld,
} from './discovery.mjs';

const mode = {
  schemaVersion: '1.0.0',
  mode: 'SYNTHETIC_REHEARSAL',
  evidenceClass: 'PUBLIC_DEVELOPMENT_FIXTURE',
  independentProof: false,
  activeProductionAuthority: false,
  disclosure:
    'Authored synthetic cases and measured local calculations. Public fixtures are neither fresh protected proof nor customer performance.',
};

function seedValue(value = 42) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
    throw new DiscoveryError(
      'INVALID_SEED',
      'seed must be a 32-bit unsigned integer.'
    );
  return value;
}

function shuffled(items, seed) {
  const result = [...items];
  let state = seed || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const target = Math.floor(random() * (i + 1));
    [result[i], result[target]] = [result[target], result[i]];
  }
  return result;
}

export function createWorldFixture({ seed = 42 } = {}) {
  seed = seedValue(seed);
  const make = (id, remaining, hot, draw) => ({
    id,
    state: { charge: remaining + draw, hot },
    action: { draw },
    nextState: { charge: remaining - (hot ? 5 : 0), hot },
    rights: 'SYNTHETIC_REDISTRIBUTABLE',
  });
  const formation = Array.from({ length: 12 }, (_, i) =>
    make(`formation_${i + 1}`, 11 + i, i % 2 === 0, 3 + (i % 4))
  );
  const cases = [
    ...Array.from({ length: 40 }, (_, i) =>
      make(`normal_safe_${i + 1}`, 12 + (i % 8), false, 4 + (i % 3))
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      make(`normal_unsafe_${i + 1}`, 5 + (i % 5), false, 4 + (i % 3))
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      make(`hot_unsafe_${i + 1}`, 12 + (i % 3), true, 4 + (i % 3))
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      make(`hot_safe_${i + 1}`, 18 + (i % 3), true, 4 + (i % 3))
    ),
  ];
  return {
    ...mode,
    seed,
    formation: shuffled(formation, seed),
    cases: shuffled(cases, (seed + 1) >>> 0),
    measuredQuantity: 'next-state charge in kWh',
    objective:
      'Dispatch only when predicted remaining charge meets the 10 kWh safety reserve.',
    oracle:
      'Authored synthetic transition: next charge = current charge - draw - (hot ? 5 kWh : 0).',
    limitation:
      'Formation and development cases have separate IDs but share a public authored generator; this is not independent evidence.',
  };
}

export function runWorldWorkbench(options = {}) {
  const seed = seedValue(options.seed);
  const fixture = createWorldFixture({ seed });
  const search = synthesizeWorldCandidates(
    fixture.formation,
    { leakValues: [0, 2, 5, 8], conditionalValues: [false, true] },
    {
      maxCandidates: options.maxCandidates ?? 16,
      maxSteps: options.maxSteps ?? 200000,
    }
  );
  if (!search.selected)
    throw new DiscoveryError(
      'INSUFFICIENT_SEARCH_BUDGET',
      'No complete candidate was evaluated within the search budget.'
    );
  const candidates = evaluateCandidates(
    [
      {
        id: 'incumbent_conservative',
        name: 'Conservative fixed-loss incumbent',
        architecture: 'Deterministic fixed safety allowance',
        program: createEnergyWorld({
          id: 'incumbent_world',
          leak: 8,
          conditional: false,
        }),
        executionCost: 1,
      },
      {
        id: 'patch_average_score',
        name: 'Patch with better average prediction',
        architecture: 'Simplified zero-loss transition',
        program: createEnergyWorld({
          id: 'unsafe_patch_world',
          leak: 0,
          conditional: true,
        }),
        executionCost: 1,
      },
      {
        id: 'strong_conventional',
        name: 'Equally informed conventional alternative',
        architecture: 'Explicit hot-condition engineering model',
        program: createEnergyWorld({
          id: 'conventional_world',
          leak: 5,
          conditional: true,
        }),
        executionCost: 1,
      },
      {
        id: 'synthesized_challenger',
        name: 'Bounded synthesized challenger',
        architecture: 'Enumerated coefficient and conditional guard',
        program: search.selected.program,
        executionCost: 1,
      },
    ],
    fixture.cases,
    { reserve: 10, criticalMissBudget: options.criticalMissBudget ?? 0 }
  );
  for (const candidate of candidates)
    candidate.policy = {
      kind: 'ReserveDecision',
      reserveKWh: 10,
      unknownDecision: 'ABSTAIN',
      effect: 'LOCAL_PROPOSAL_ONLY',
    };
  const eligible = candidates
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.metrics.utility - a.metrics.utility);
  const incumbent = candidates.find(
    (candidate) => candidate.id === 'incumbent_conservative'
  );
  const patch = candidates.find(
    (candidate) => candidate.id === 'patch_average_score'
  );
  const challenger = candidates.find(
    (candidate) => candidate.id === 'synthesized_challenger'
  );
  const comparator = candidates.find(
    (candidate) => candidate.id === 'strong_conventional'
  );
  const counterexamples = patch.predictions
    .filter((item) => item.criticalMiss)
    .map((item) => ({
      candidateId: patch.id,
      caseId: item.caseId,
      predicted: item.predicted,
      observed: item.observed,
      unit: 'kWh',
      predictedDecision: item.decision,
      requiredDecision: 'HOLD',
      falsifiedClaim:
        'Zero modeled loss is sufficient for safe dispatch on every declared hot case.',
      reason:
        'Predicted reserve permits dispatch while the observed reserve violates the hard boundary.',
    }));
  const margin =
    challenger.metrics.utility -
    Math.max(incumbent.metrics.utility, comparator.metrics.utility);
  return {
    ...mode,
    kind: 'WorldWorkbenchReport',
    missionId: 'symbolic-energy-discovery-synthetic-v1',
    seed,
    objective: fixture.objective,
    formationCount: fixture.formation.length,
    developmentCount: fixture.cases.length,
    candidates,
    selectedCandidateId: eligible[0]?.id ?? null,
    strongestComparatorId: comparator.id,
    search: {
      evaluated: search.evaluated,
      steps: search.steps,
      budget: search.budget,
      stopped: search.stopped,
      selectedSettings: search.selected.settings,
      formationMSE: search.selected.formationMSE,
      archive: search.candidates.map(({ id, settings, formationMSE }) => ({
        id,
        settings,
        formationMSE,
      })),
    },
    unsafeImprovement: {
      accuracyImproved: patch.metrics.accuracy > incumbent.metrics.accuracy,
      averagePredictionErrorImproved:
        patch.metrics.meanAbsoluteError < incumbent.metrics.meanAbsoluteError,
      criticalMissesIncreased:
        patch.metrics.criticalMisses > incumbent.metrics.criticalMisses,
      rejected: !patch.eligible,
    },
    alpha: {
      status: 'ABSENT',
      margin,
      unit: 'synthetic_utility_units',
      reason:
        margin <= 0
          ? 'The strongest feasible conventional alternative matches or exceeds the challenger.'
          : 'Development advantage alone does not establish fresh independent proof.',
      independence: 'I0',
      uncertainty:
        'Exact authored fixture counts; no population confidence or external validity claim.',
    },
    counterexamples,
    supplierSubstitution: runSupplierSubstitutionWorkbench({ seed }),
    chronicleEvents: [
      {
        type: 'HYPOTHESIS_TESTED',
        candidateId: patch.id,
        evidenceClass: mode.evidenceClass,
      },
      {
        type: 'HYPOTHESIS_FALSIFIED',
        candidateId: patch.id,
        counterexampleIds: counterexamples.map((item) => item.caseId),
      },
      {
        type: 'CANDIDATE_MANUFACTURED',
        candidateId: challenger.id,
        selectedSettings: search.selected.settings,
      },
      {
        type: 'NO_UNIQUE_ADVANTAGE',
        candidateId: challenger.id,
        comparatorId: comparator.id,
        margin,
      },
    ],
    limitations: [
      'No neural model is downloaded or called by this offline run.',
      'Public development cases cannot certify their own synthesized candidate.',
      'No fitted program controls a physical battery.',
      'Candidate proposals and failure knowledge carry no permission.',
    ],
  };
}

/** Replace a declared local WORLD proposer, then rerun the actual supplied programs. */
export function runSupplierSubstitutionWorkbench({
  seed = 42,
  toleranceKWh = 1e-9,
} = {}) {
  if (
    typeof toleranceKWh !== 'number' ||
    !Number.isFinite(toleranceKWh) ||
    toleranceKWh < 0 ||
    toleranceKWh > 0.01
  ) {
    throw new DiscoveryError(
      'INVALID_TOLERANCE',
      'Compatibility tolerance must be a finite value in [0, 0.01] kWh.'
    );
  }
  const fixture = createWorldFixture({ seed });
  const enumerated = synthesizeWorldCandidates(fixture.formation).selected;
  // This second supplier estimates the residual directly; it does not read the enumeration result.
  const hotResiduals = fixture.formation
    .filter((item) => item.state.hot)
    .map((item) => item.state.charge - item.action.draw - item.nextState.charge)
    .sort((a, b) => a - b);
  const normalResiduals = fixture.formation
    .filter((item) => !item.state.hot)
    .map(
      (item) => item.state.charge - item.action.draw - item.nextState.charge
    );
  if (
    !hotResiduals.length ||
    !normalResiduals.length ||
    normalResiduals.some((loss) => Math.abs(loss) > toleranceKWh)
  ) {
    throw new DiscoveryError(
      'SUPPLIER_SCOPE_MISMATCH',
      'Residual-fit supplier requires hot and normal observations with no normal-state loss.'
    );
  }
  const index = Math.floor(hotResiduals.length / 2);
  const loss =
    hotResiduals.length % 2
      ? hotResiduals[index]
      : (hotResiduals[index - 1] + hotResiduals[index]) / 2;
  const alternative = createEnergyWorld({
    id: 'residual_fit_world',
    leak: loss,
    conditional: true,
  });
  let maximumPredictionDifferenceKWh = 0;
  let decisionMismatches = 0;
  const results = fixture.cases.map((item) => {
    const original = stepWorld(enumerated.program, item.state, item.action)
      .nextState.charge;
    const substituted = stepWorld(alternative, item.state, item.action)
      .nextState.charge;
    maximumPredictionDifferenceKWh = Math.max(
      maximumPredictionDifferenceKWh,
      Math.abs(original - substituted)
    );
    if (original >= 10 !== substituted >= 10) decisionMismatches++;
    return { caseId: item.id, original, substituted };
  });
  return {
    ...mode,
    kind: 'SupplierSubstitutionReport',
    role: 'LOCAL_WORLD_HYPOTHESIS_PROPOSER',
    suppliers: [
      {
        id: 'enumerative_program_supplier',
        version: '1',
        method:
          'Finite guard/coefficient enumeration on formation observations',
        program: enumerated.program,
      },
      {
        id: 'residual_fit_supplier',
        version: '1',
        method:
          'Independent direct residual median estimator on formation observations',
        program: alternative,
      },
    ],
    compatibility: {
      cases: fixture.cases.length,
      toleranceKWh,
      maximumPredictionDifferenceKWh,
      decisionMismatches,
      equivalent:
        maximumPredictionDifferenceKWh <= toleranceKWh &&
        decisionMismatches === 0,
      results,
    },
    policyBoundary: {
      allowedEffect: 'LOCAL_PROPOSAL_ONLY',
      reserveKWh: 10,
      productionAuthority: false,
    },
    newReleaseRequired: true,
    inheritedCurrentProof: false,
    inheritedAuthority: false,
    limitation:
      'Actual local algorithm substitution and reexecution; not external model portability, a clean-machine restore, or fresh independent proof.',
  };
}

export function createEvidenceFixture({
  goodProbability = 0.5,
  budget = 30,
  horizon = 2,
} = {}) {
  if (
    typeof goodProbability !== 'number' ||
    !Number.isFinite(goodProbability) ||
    goodProbability <= 0 ||
    goodProbability >= 1
  ) {
    throw new DiscoveryError(
      'INVALID_PROBABILITY',
      'goodProbability must be strictly between 0 and 1.'
    );
  }
  const worlds = [];
  for (const quality of ['good', 'bad'])
    for (const calibration of ['honest', 'positive_bias']) {
      const good = quality === 'good';
      const positive = good || calibration === 'positive_bias';
      worlds.push({
        id: `${quality}_${calibration}`,
        quality,
        calibration,
        probability:
          (good ? goodProbability : 1 - goodProbability) *
          (calibration === 'honest' ? 0.8 : 0.2),
        observations: {
          screen_a: positive ? 'positive' : 'negative',
          screen_b: positive ? 'positive' : 'negative',
          independent_assay: good ? 'good' : 'bad',
        },
        utilities: { retain: 0, build: good ? 100 : -300 },
      });
    }
  return {
    worlds,
    experiments: [
      { id: 'screen_a', cost: 5, correlationGroup: 'shared_calibration' },
      { id: 'screen_b', cost: 5, correlationGroup: 'shared_calibration' },
      {
        id: 'independent_assay',
        cost: 25,
        correlationGroup: 'independent_quality_measurement',
      },
    ],
    decisions: [{ id: 'retain' }, { id: 'build' }],
    budget,
    horizon,
    maxStates: 10000,
    utilityUnit: 'synthetic_utility_units',
    probabilityModel:
      'Authored joint distribution, including a shared calibration cause.',
  };
}

export function createResourceFixture() {
  return {
    periods: [
      { renewableKWh: 3, computeSlots: 2 },
      { renewableKWh: 2, computeSlots: 2 },
      { renewableKWh: 0, computeSlots: 1 },
    ],
    battery: { initialKWh: 3, capacityKWh: 6, maxDischargeKWh: 5 },
    jobs: [
      {
        id: 'research_a',
        energyKWh: 4,
        computeSlots: 1,
        value: 34,
        releasePeriod: 0,
        deadlinePeriod: 1,
      },
      {
        id: 'research_b',
        energyKWh: 3,
        computeSlots: 1,
        value: 30,
        releasePeriod: 0,
        deadlinePeriod: 1,
      },
      {
        id: 'verification',
        energyKWh: 1,
        computeSlots: 1,
        value: 15,
        releasePeriod: 1,
        deadlinePeriod: 2,
      },
      {
        id: 'optional_batch',
        energyKWh: 5,
        computeSlots: 2,
        value: 31,
        releasePeriod: 0,
        deadlinePeriod: 1,
      },
    ],
    maxStates: 50000,
  };
}

export function runResourceWorkbench(options = {}) {
  const goodProbability = options.goodProbability ?? 0.5;
  const stressGoodProbability = options.stressGoodProbability ?? 0.3;
  const problem = createEvidenceFixture({
    goodProbability,
    budget: options.budget ?? 30,
    horizon: options.horizon ?? 2,
  });
  const shiftedProblem = createEvidenceFixture({
    goodProbability: stressGoodProbability,
    budget: options.budget ?? 30,
    horizon: options.horizon ?? 2,
  });
  const nominal = planEvidence(problem);
  const stress = evaluateEvidencePolicy(nominal.policy, shiftedProblem);
  const reoptimized = planEvidence(shiftedProblem);
  const noResearch = planEvidence({ ...problem, horizon: 0 });
  const oneStep = planEvidence({
    ...problem,
    horizon: Math.min(1, problem.horizon),
  });
  // The conventional comparator uses the same information and exact decision problem, not a weakened reference.
  const conventional = planEvidence({
    ...problem,
    experiments: [...problem.experiments].reverse(),
  });
  const onePositive = posteriorProbability(
    problem,
    { screen_a: 'positive' },
    { field: 'quality', equals: 'good' }
  );
  const twoCorrelatedPositives = posteriorProbability(
    problem,
    { screen_a: 'positive', screen_b: 'positive' },
    { field: 'quality', equals: 'good' }
  );
  const naiveIndependentTwoPositives =
    goodProbability / (goodProbability + (1 - goodProbability) * 0.2 ** 2);
  const resourcePlan = planResources(createResourceFixture());
  return {
    ...mode,
    kind: 'ResourceWorkbenchReport',
    missionId: 'evidence-and-resource-planning-synthetic-v1',
    objective:
      'Buy evidence only when it can improve the bounded decision, then respect shared energy and compute capacity.',
    nominal: { ...nominal, goodProbability },
    stress: {
      ...stress,
      goodProbability: stressGoodProbability,
      policyUnchanged: true,
    },
    reoptimized: { ...reoptimized, goodProbability: stressGoodProbability },
    comparators: [
      {
        id: 'no_research',
        name: 'No research / retain option',
        expectedUtility: noResearch.expectedUtility,
        expectedTestCost: noResearch.expectedTestCost,
      },
      {
        id: 'one_step',
        name: 'At most one experiment',
        expectedUtility: oneStep.expectedUtility,
        expectedTestCost: oneStep.expectedTestCost,
      },
      {
        id: 'conventional',
        name: 'Equally informed conventional finite planner',
        expectedUtility: conventional.expectedUtility,
        expectedTestCost: conventional.expectedTestCost,
      },
    ],
    correlation: {
      onePositive,
      twoCorrelatedPositives,
      naiveIndependentTwoPositives,
      sharedCause:
        'The same positive calibration bias affects both screens; repeated agreement adds no evidence in this fixture.',
      warning:
        'The independent calculation is deliberately incorrect for these correlated screens, shown only for contrast.',
    },
    resourcePlan,
    alpha: {
      status: 'ABSENT',
      margin: nominal.expectedUtility - conventional.expectedUtility,
      unit: 'synthetic_utility_units',
      reason:
        'An equally informed conventional method matches the decisions. Useful investigation does not establish proprietary advantage.',
    },
    chronicleEvents: [
      {
        type: 'CORRELATED_EVIDENCE_RECOGNIZED',
        experiments: ['screen_a', 'screen_b'],
      },
      {
        type: 'RESEARCH_POLICY_COMPUTED',
        expectedUtility: nominal.expectedUtility,
        expectedCost: nominal.expectedTestCost,
      },
      {
        type: 'DISTRIBUTION_SHIFT_TESTED',
        policyUnchanged: true,
        nominalValue: nominal.expectedUtility,
        shiftedValue: stress.expectedUtility,
      },
      { type: 'NO_UNIQUE_ADVANTAGE', comparatorId: 'conventional' },
    ],
    assumptions: [
      'Synthetic finite probabilities and utility units, not money or investment advice.',
      'The independent assay reveals quality exactly only in this authored teaching model.',
      'Evidence and resource planning are separate experiments using the same bounded core.',
      'Expected utility is not realized, collected or reinvestable surplus.',
    ],
  };
}
