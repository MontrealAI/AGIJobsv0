/** Node-only bridge from the actual public WORLD journey to frozen, signed examination. */
import { performance } from 'node:perf_hooks';
import { digestObject, canonicalize } from './integrity.mjs';
import { verifyPublicJourney } from './journeys.mjs';
import { createWorldFixture } from './workbenches.mjs';
import { evaluateCandidates, stepWorld } from './discovery.mjs';
import {
  CANDIDATE_BINDINGS,
  COST_CATEGORIES,
  freezeCandidate,
  validateProtocol,
  evaluateEvidence,
  issueProof,
  verifyProof,
} from './proof.mjs';
import {
  generateSigningIdentity,
  trustKey,
  digestShape,
  timestamp,
  requireAssurance,
} from './signatures.mjs';
import { admitCandidate } from './authority.mjs';

const date = (value) => new Date(value).toISOString();
const TARIFF = Object.freeze({
  safeDispatch: 10,
  correctHold: 0,
  unnecessaryHold: -1,
  criticalMiss: -100,
  abstention: 0,
  unit: 'synthetic_utility_units',
  rule: 'Subtract the recorded per-trial execution tariff once, allocated evenly across the fixed cases.',
  limitation:
    'Authored development tariff only. Unmodeled real formation, labor, provider, integration and operating costs are not established as zero.',
});

function utility(prediction, executionCost, count) {
  let gross;
  if (prediction.decision === 'ABSTAIN') gross = TARIFF.abstention;
  else if (prediction.criticalMiss) gross = TARIFF.criticalMiss;
  else if (prediction.decision === 'DISPATCH') gross = TARIFF.safeDispatch;
  else
    gross = prediction.truthSafe ? TARIFF.unnecessaryHold : TARIFF.correctHold;
  return gross - executionCost / count;
}

/** No record returned by this function includes either ephemeral private key. */
export async function examineWorldJourney(
  input,
  { sourceDigest, now = Date.now() } = {}
) {
  requireAssurance(
    digestShape(sourceDigest),
    'SOURCE_COMMITMENT_REQUIRED',
    'Bind the actual executable source manifest before examining a world journey.'
  );
  const instant = timestamp(now);
  const { journey, name } = await verifyPublicJourney(input);
  requireAssurance(
    name === 'world',
    'WORLD_JOURNEY_REQUIRED',
    'This examiner supports the actual public WORLD mission only.'
  );
  const world = journey.workbench;
  const fixture = createWorldFixture({ seed: world.seed });
  const selectedIds = [
    'synthesized_challenger',
    journey.mission.incumbent.id,
    world.strongestComparatorId,
  ];
  requireAssurance(
    new Set(selectedIds).size === 3,
    'COMPARATOR_BINDING_MISMATCH',
    'The challenger and both constituted comparators must have distinct identities.'
  );
  const selected = selectedIds.map((id) =>
    world.candidates.find((candidate) => candidate.id === id)
  );
  requireAssurance(
    selected.every(Boolean),
    'COMPARATOR_BINDING_MISMATCH',
    'Actual evaluated challenger and comparators are required.'
  );
  const [challenger, incumbent, strongest] = selected;
  const system = (item) => ({
    id: item.id,
    name: item.name,
    architecture: item.architecture,
    program: item.program,
    policy: item.policy,
    executionCost: item.executionCost,
  });
  const comparatorSystems = await Promise.all(
    [incumbent, strongest].map(async (item, index) => {
      const content = system(item);
      const domain = 'successor.world-comparator-system.v1';
      return {
        id: item.id,
        kind: index === 0 ? 'incumbent' : 'strongest-credible-alternative',
        domain,
        content,
        digest: await digestObject(domain, content),
      };
    })
  );
  const comparators = comparatorSystems.map(({ id, kind, digest }) => ({
    id,
    kind,
    digest,
  }));
  const scope = {
    tools: ['bounded-symbolic-interpreter'],
    targets: ['sandbox:synthetic-energy-world'],
    dataClasses: ['synthetic'],
    effects: ['recommend'],
  };
  const samplingAssumption = {
    kind: 'AUTHORED_CONDITIONAL_SAMPLING_ASSUMPTION',
    source: 'createWorldFixture',
    seed: world.seed,
    empiricalIndependenceEstablished: false,
    units: 'One nominal group per authored case identifier.',
    limitation:
      'The generator is public and deterministic. Unique labels do not establish independent empirical samples; intervals are conditional teaching calculations, not qualification evidence.',
  };
  const samplingAssuranceDigest = await digestObject(
    'successor.world-sampling-assumption.v1',
    samplingAssumption
  );
  const scorer = {
    version: 'world-decision-tariff-v1',
    sourceDigest,
    tariff: TARIFF,
    reserveKWh: 10,
    unknownDecision: 'ABSTAIN',
    criticalMiss: 'DISPATCH when observed next charge is below 10 kWh',
    candidateIds: selectedIds,
    scope:
      'Actual frozen programs are rerun on the same public development cases.',
  };
  const protectedSetCommitment = await digestObject(
    'successor.world-public-case-set.v1',
    { mode: 'synthetic-public', cases: fixture.cases }
  );
  const components = {
    constitution: {
      domain: 'successor.constitution.v1',
      content: journey.mission,
    },
    objectives: {
      content: {
        objective: journey.mission.objective,
        hardGates: journey.mission.hardGates,
        tariff: TARIFF,
        minimumMeaningfulMargin: journey.mission.proofProtocol.minimumMargin,
      },
    },
    comparators: {
      domain: 'successor-comparator-roster-v1',
      content: comparators,
    },
    programs: { content: system(challenger) },
    models: {
      content: {
        representation: 'bounded-ast-v1',
        worldProgram: challenger.program,
        hostedModels: [],
        neuralModelUsed: false,
      },
    },
    prompts: {
      content: {
        livePrompts: [],
        reason:
          'Offline deterministic bounded program synthesis; no frontier call was made.',
      },
    },
    routing: {
      content: {
        mode: 'local-only',
        selectedCandidateId: challenger.id,
        retainedAlternativeId: world.selectedCandidateId,
        externalEndpoints: [],
      },
    },
    tools: {
      content: {
        interpreter: 'bounded-symbolic-interpreter',
        allowlist: journey.mission.allowedTools,
        externalEffects: false,
      },
    },
    dependencies: {
      content: {
        sourceDigest,
        package: 'successor-core',
        thirdPartyRuntimeDependencies: [],
        formationDigest: await digestObject(
          'successor.world-formation.v1',
          fixture.formation
        ),
      },
    },
    runtime: {
      content: {
        sourceDigest,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        representation: 'bounded-ast-v1',
      },
    },
    memory: {
      content: {
        seed: world.seed,
        formation: fixture.formation,
        knownFailureHistory: world.counterexamples,
        chronicle: world.chronicleEvents,
        publicDevelopmentPreviouslyVisible: true,
        writableDuringTrial: false,
      },
    },
    workflows: {
      content: {
        graph: journey.compilation.graph,
        executionOrder: journey.compilation.executionOrder,
        status: 'PLANNED_PORTFOLIO_NOT_INDEPENDENTLY_COMPLETED',
      },
    },
    policies: {
      content: {
        decisionPolicy: challenger.policy,
        authorityCeiling: journey.mission.authorityCeiling,
        activeProductionAuthority: false,
      },
    },
    humanInterventions: {
      content: {
        duringAutomatedReevaluation: [],
        humanMinutesDuringTrial: 0,
        productionAdmission: 'UNAVAILABLE',
      },
    },
    resourceLimits: {
      content: {
        missionBudget: journey.mission.budget,
        formationSearch: world.search.budget,
        caseCount: fixture.cases.length,
        maxEvaluationSteps: 2000000,
      },
    },
    proofInterface: {
      content: {
        version: 'successor-proof.v1',
        evidenceMode: 'synthetic-public',
        requiredIndependence: 'I0',
        sourceDigest,
        scorer,
        samplingAssumption,
      },
    },
  };
  const bindings = {};
  for (const key of CANDIDATE_BINDINGS) {
    requireAssurance(
      components[key],
      'INCOMPLETE_CANDIDATE',
      'Actual component material is missing.'
    );
    components[key].domain ??= `successor.world-component.${key}.v1`;
    components[key].digest = await digestObject(
      components[key].domain,
      components[key].content
    );
    bindings[key] = components[key].digest;
  }
  requireAssurance(
    bindings.constitution === journey.compilation.digest,
    'CONSTITUTION_BINDING_MISMATCH',
    'Examiner constitution must equal the sealed journey constitution.'
  );
  const candidate = await freezeCandidate({
    schemaVersion: 1,
    id: `${challenger.id}-frozen`,
    missionId: journey.mission.missionId,
    claimantOrganizationId: 'public-fixture-author',
    claimantCustodyId: 'local-formation',
    bindings,
    parentDigests: [],
    providerGuarantees: [],
    scope,
    adaptation: { enabled: false },
  });
  const context = {
    institutionId: journey.mission.institutionId,
    missionId: journey.mission.missionId,
    environment: 'local-world-fixture-examination',
    mode: 'fixture',
  };
  const protocol = {
    schemaVersion: 1,
    id: 'actual-world-public-examination-v1',
    candidateDigest: candidate.candidateDigest,
    constitutionDigest: bindings.constitution,
    comparatorsDigest: bindings.comparators,
    comparators,
    protectedSetCommitment,
    scorerDigest: await digestObject('successor.world-scorer.v1', scorer),
    custodianOrganizationId: 'public-fixture-author',
    custodianId: 'local-internal-examination',
    evidenceMode: 'synthetic-public',
    requiredIndependence: 'I0',
    sampleSize: fixture.cases.length,
    stoppingRule: 'fixed-sample',
    maxAttempts: 1,
    sampling: {
      method: 'independent-case-groups',
      unit: 'one-case-per-independent-group',
      assuranceDigest: samplingAssuranceDigest,
    },
    confidence: { method: 'hoeffding-union-bound', alpha: 0.05 },
    metric: {
      name: 'paired-net-mission-gain',
      unit: 'synthetic-utility-per-authored-case',
      horizon: 'one local energy-reserve decision',
      netOfAllCosts: true,
      minimum: -110,
      maximum: 110,
    },
    requiredMargin: journey.mission.proofProtocol.minimumMargin,
    basisRiskReserve: 0,
    proofDebtReserve: 0,
    hardGates: {
      maxCriticalMisses: journey.mission.proofProtocol.criticalErrorCeiling,
      maxCriticalRiskUpperBound: 0.2,
    },
    requiredAssurances: [
      'reliability',
      'sovereignty',
      'governance',
      'transfer',
    ],
    scope,
    registeredAt: date(instant),
    expiresAt: date(instant + 3600000),
    exclusions: [],
  };
  const { protocolDigest } = await validateProtocol(protocol, candidate);
  // The trial starts only after complete candidate and evaluator protocol identities exist.
  const replayed = evaluateCandidates(
    [
      components.programs.content,
      ...comparatorSystems.map((item) => item.content),
    ],
    fixture.cases,
    {
      reserve: 10,
      criticalMissBudget: journey.mission.proofProtocol.criticalErrorCeiling,
      maxSteps: 2000000,
    }
  );
  for (let i = 0; i < selected.length; i++)
    requireAssurance(
      canonicalize(replayed[i].predictions) ===
        canonicalize(selected[i].predictions),
      'FROZEN_REPLAY_MISMATCH',
      'Frozen program did not reproduce the recorded actual development decisions.'
    );
  const cases = await Promise.all(
    fixture.cases.map(async (item, index) => {
      const started = performance.now();
      const prediction = stepWorld(
        components.programs.content.program,
        item.state,
        item.action
      );
      const latencyMs = Math.max(0, performance.now() - started);
      requireAssurance(
        prediction.nextState.charge ===
          replayed[0].predictions[index].predicted,
        'FROZEN_REPLAY_MISMATCH',
        'Timed frozen prediction changed during the trial.'
      );
      return {
        caseCommitment: await digestObject(
          'successor.world-exam-case.v1',
          item
        ),
        correlationGroup: `authored-case:${item.id}`,
        subgroup: item.state.hot ? 'hot-condition' : 'normal-condition',
        candidate: {
          netUtility: utility(
            replayed[0].predictions[index],
            challenger.executionCost,
            fixture.cases.length
          ),
          criticalMiss: replayed[0].predictions[index].criticalMiss,
          abstained: replayed[0].predictions[index].decision === 'ABSTAIN',
          humanMinutes: 0,
          retries: 0,
          latencyMs,
          latencyBasis:
            'Measured local WORLD-interpreter elapsed time for this case; excludes human or production service latency.',
        },
        comparators: Object.fromEntries(
          comparators.map((comparator, i) => [
            comparator.id,
            {
              digest: comparator.digest,
              netUtility: utility(
                replayed[i + 1].predictions[index],
                selected[i + 1].executionCost,
                fixture.cases.length
              ),
            },
          ])
        ),
      };
    })
  );
  const costs = Object.fromEntries(
    COST_CATEGORIES.map((category) => [
      category,
      {
        amountMinor:
          category === 'compute' ? String(challenger.executionCost) : '0',
        basis: 'estimated',
        scope:
          category === 'compute'
            ? 'Recorded synthetic execution tariff, not an invoiced real cost.'
            : 'Defined as zero only within this teaching tariff; actual deployment cost is unknown.',
      },
    ])
  );
  const evidence = {
    protocolDigest,
    candidateDigest: candidate.candidateDigest,
    protectedSetCommitment,
    scorerDigest: protocol.scorerDigest,
    samplingAssuranceDigest,
    cases,
    costs,
    costCurrency: TARIFF.unit,
    startedAt: date(instant),
    completedAt: date(instant),
    contaminated: false,
    undeclaredAdaptation: false,
    crossCaseLeakage: false,
    materialProviderChange: false,
    assurances: {},
    unmetConditions: [],
  };
  // External assurances are unavailable. Record that absence; the comparative FAIL is still informative.
  const report = await evaluateEvidence({ protocol, candidate, evidence });
  report.limitations.push(
    'Actual 60 public world-workbench cases, not substituted generic utility rows.',
    TARIFF.limitation,
    samplingAssumption.limitation,
    'Development data was visible before freeze. This is an I0 examination-protocol rehearsal, not fresh protected proof.',
    'Reliability, sovereignty, governance and transfer assurances for production remain unavailable.',
    'The supplied logical fixture time and ephemeral self-provisioned trust do not authenticate historical execution.'
  );
  const evaluator = generateSigningIdentity({
    keyId: 'world-fixture-evaluator',
    organizationId: 'public-fixture-author',
    custodyId: 'local-internal-examination',
  });
  const principal = generateSigningIdentity({
    keyId: 'world-fixture-principal',
    organizationId: 'public-fixture-author',
    custodyId: 'local-fixture-governance',
  });
  const trustStore = {
    schemaVersion: 1,
    keys: [
      trustKey(evaluator, {
        roles: ['evaluator'],
        context,
        notBefore: date(instant),
        expiresAt: date(instant + 7200000),
        maxIndependence: 'I0',
      }),
      trustKey(principal, {
        roles: ['principal'],
        principals: [journey.mission.principal],
        context,
        notBefore: date(instant),
        expiresAt: date(instant + 7200000),
        maxIndependence: 'I0',
      }),
    ],
  };
  const proof = await issueProof({
    report,
    identity: evaluator,
    context,
    independence: 'I0',
    conflicts: [
      'Same local process and authoring organization; explicitly not independent.',
    ],
  });
  const verified = await verifyProof(proof, {
    trustStore,
    context,
    candidate,
    protocol,
    now: instant,
  });
  let admission;
  try {
    await admitCandidate({
      proof,
      protocol,
      candidate,
      identity: principal,
      trustStore,
      context,
      now: instant,
      decision: {
        schemaVersion: 1,
        status: 'granted',
        candidateDigest: candidate.candidateDigest,
        proofDigest: verified.digest,
        expiresAt: protocol.expiresAt,
        scope,
        rationale: 'Negative admission-path test only.',
        accountablePrincipal: journey.mission.principal,
        operationalAssuranceDigest: await digestObject(
          'successor.absent-production-assurance.v1',
          { available: false }
        ),
      },
    });
    admission = { allowed: true, code: 'UNEXPECTED_ADMISSION' };
  } catch (error) {
    admission = { allowed: false, code: error.code ?? 'ADMISSION_DENIED' };
  }
  requireAssurance(
    !admission.allowed,
    'FIXTURE_ADMISSION_BYPASS',
    'A public I0 FAIL must never receive independent admission.'
  );
  return {
    schemaVersion: '1.0.0',
    mode: 'SYNTHETIC_REHEARSAL',
    candidate,
    components,
    comparatorSystems,
    scorer,
    samplingAssumption,
    protocol,
    evidence,
    report,
    proof,
    trustStore,
    context,
    now: instant,
    internalVerification: {
      valid: true,
      digest: verified.digest,
      verdict: verified.payload.verdict,
    },
    independentAdmission: admission,
    productionAuthority: false,
    publicCaseCount: fixture.cases.length,
    sourceDigest,
    limitations: report.limitations,
  };
}
