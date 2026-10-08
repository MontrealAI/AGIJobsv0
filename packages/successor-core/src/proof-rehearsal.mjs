import { digestObject } from './integrity.mjs';
import {
  generateSigningIdentity,
  trustKey,
  signPayload,
} from './signatures.mjs';
import {
  CANDIDATE_BINDINGS,
  COST_CATEGORIES,
  freezeCandidate,
  validateProtocol,
  evaluateEvidence,
  issueProof,
  verifyProof,
} from './proof.mjs';
import { authorizeJobLease, revokeAuthority } from './authority.mjs';
import { openStore } from './store.mjs';
import { createActionBroker } from './runtime.mjs';
import {
  createInvoiceMission,
  createInvoiceJobs,
  createInvoiceEdges,
} from './invoice.mjs';
import { compileJobs } from './compiler.mjs';
import { registerCompilation } from './institution.mjs';

export const REHEARSAL_NOW = Date.parse('2026-10-08T12:00:00.000Z');
export const REHEARSAL_CONTEXT = Object.freeze({
  institutionId: 'synthetic-owner',
  missionId: 'synthetic-proof',
  environment: 'local-rehearsal',
  mode: 'fixture',
});
const date = (ms) => new Date(ms).toISOString();

/** Public deterministic observations and ephemeral fixture keys only. */
export async function createProofFixture({
  criticalMisses = 0,
  strongAlternativeUtility = 7,
  sampleSize = 400,
} = {}) {
  const context = { ...REHEARSAL_CONTEXT };
  const now = REHEARSAL_NOW;
  const mission = createInvoiceMission();
  mission.missionId = context.missionId;
  mission.institutionId = context.institutionId;
  mission.principal = 'synthetic-principal';
  mission.allowedTools = ['fixture-driver'];
  mission.budget.unit = 'SYNTHETIC_MINOR';
  const compilation = await compileJobs(mission, {
    jobs: createInvoiceJobs(mission),
    edges: createInvoiceEdges(mission),
    now: date(now),
  });
  const registrationStore = openStore(':memory:');
  await registerCompilation(registrationStore, compilation, {
    actor: mission.principal,
    eventId: 'register-fixture-compilation',
    now: date(now),
  });
  const registeredState = registrationStore.read();
  registrationStore.close();
  const evaluator = generateSigningIdentity({
    keyId: 'fixture-evaluator',
    organizationId: 'claimant',
    custodyId: 'internal-evaluation',
  });
  const underwriter = generateSigningIdentity({
    keyId: 'fixture-underwriter',
    organizationId: 'claimant',
    custodyId: 'formation-owner',
  });
  const scope = {
    tools: ['fixture-driver'],
    targets: ['sandbox:mission'],
    dataClasses: ['synthetic'],
    effects: ['sandbox-execution'],
  };
  const comparators = [
    {
      id: 'incumbent',
      kind: 'incumbent',
      digest: await digestObject('rehearsal-component-v1', {
        id: 'incumbent',
        version: 1,
      }),
    },
    {
      id: 'conventional',
      kind: 'strongest-credible-alternative',
      digest: await digestObject('rehearsal-component-v1', {
        id: 'conventional',
        version: 1,
      }),
    },
  ];
  const bindings = {};
  for (const name of CANDIDATE_BINDINGS)
    bindings[name] = await digestObject('rehearsal-component-v1', {
      name,
      version: 1,
    });
  bindings.comparators = await digestObject(
    'successor-comparator-roster-v1',
    comparators
  );
  bindings.constitution = compilation.digest;
  const candidate = await freezeCandidate({
    schemaVersion: 1,
    id: 'synthetic-candidate',
    missionId: context.missionId,
    claimantOrganizationId: 'claimant',
    claimantCustodyId: 'formation-owner',
    bindings,
    parentDigests: [],
    providerGuarantees: [],
    scope,
    adaptation: { enabled: false },
  });
  const protocol = {
    schemaVersion: 1,
    id: 'public-rehearsal-protocol',
    candidateDigest: candidate.candidateDigest,
    constitutionDigest: bindings.constitution,
    comparatorsDigest: bindings.comparators,
    comparators,
    protectedSetCommitment: await digestObject('rehearsal-component-v1', {
      publicSynthetic: true,
      sampleSize,
    }),
    scorerDigest: await digestObject('rehearsal-component-v1', {
      scorer: 'hoeffding-fixed-sample-v1',
    }),
    custodianOrganizationId: 'claimant',
    custodianId: 'internal-evaluation',
    evidenceMode: 'synthetic-public',
    requiredIndependence: 'I0',
    sampleSize,
    stoppingRule: 'fixed-sample',
    maxAttempts: 1,
    confidence: { method: 'hoeffding-union-bound', alpha: 0.05 },
    metric: {
      name: 'paired-net-mission-gain',
      unit: 'synthetic-utility-per-case',
      horizon: 'one bounded decision',
      netOfAllCosts: true,
      minimum: -10,
      maximum: 10,
    },
    requiredMargin: 0.1,
    basisRiskReserve: 0.1,
    proofDebtReserve: 0.1,
    hardGates: { maxCriticalMisses: 0, maxCriticalRiskUpperBound: 0.1 },
    requiredAssurances: [
      'reliability',
      'sovereignty',
      'governance',
      'transfer',
    ],
    scope,
    registeredAt: date(now - 3600000),
    expiresAt: date(now + 3600000),
    exclusions: [],
  };
  protocol.sampling = {
    method: 'independent-case-groups',
    unit: 'one-case-per-independent-group',
    assuranceDigest: await digestObject('rehearsal-sampling-assumption-v1', {
      publicSynthetic: true,
      conditionalOnly: true,
    }),
  };
  const { protocolDigest } = await validateProtocol(protocol, candidate);
  const costs = {};
  for (const category of COST_CATEGORIES)
    costs[category] = {
      amountMinor: category === 'compute' ? '400' : '0',
      basis: 'measured',
    };
  const cases = [];
  for (let i = 0; i < sampleSize; i++)
    cases.push({
      caseCommitment: await digestObject('rehearsal-case-v1', { i }),
      correlationGroup: `synthetic-group-${i}`,
      subgroup: i % 2 ? 'ordinary' : 'adversarial',
      candidate: {
        netUtility: 10,
        criticalMiss: i < criticalMisses,
        abstained: false,
        humanMinutes: 0,
        retries: 0,
        latencyMs: 1,
      },
      comparators: {
        incumbent: { digest: comparators[0].digest, netUtility: 6 },
        conventional: {
          digest: comparators[1].digest,
          netUtility: strongAlternativeUtility,
        },
      },
    });
  const evidence = {
    protocolDigest,
    candidateDigest: candidate.candidateDigest,
    protectedSetCommitment: protocol.protectedSetCommitment,
    scorerDigest: protocol.scorerDigest,
    startedAt: date(now - 1800000),
    completedAt: date(now - 1000),
    costs,
    costCurrency: 'SYNTHETIC_MINOR',
    cases,
    contaminated: false,
    undeclaredAdaptation: false,
    crossCaseLeakage: false,
    materialProviderChange: false,
    assurances: {},
    unmetConditions: [],
  };
  evidence.samplingAssuranceDigest = protocol.sampling.assuranceDigest;
  for (const name of protocol.requiredAssurances)
    evidence.assurances[name] = {
      status: 'pass',
      evidenceDigest: await digestObject('rehearsal-assurance-v1', {
        name,
        synthetic: true,
      }),
    };
  const report = await evaluateEvidence({ protocol, candidate, evidence });
  const proof = await issueProof({
    report,
    identity: evaluator,
    context,
    independence: 'I0',
  });
  const trustStore = {
    schemaVersion: 1,
    keys: [
      trustKey(evaluator, {
        roles: ['evaluator'],
        context,
        notBefore: date(now - 7200000),
        expiresAt: date(now + 7200000),
        maxIndependence: 'I0',
      }),
      trustKey(underwriter, {
        roles: ['underwriter'],
        principals: ['synthetic-principal'],
        context,
        notBefore: date(now - 7200000),
        expiresAt: date(now + 7200000),
      }),
    ],
  };
  return {
    context,
    now,
    candidate,
    protocol,
    evidence,
    report,
    proof,
    trustStore,
    compilation,
    registeredState,
    identities: { evaluator, underwriter },
  };
}

export async function createLeaseFixture(
  fixture,
  {
    nonce = 'fixture-nonce-0001',
    costMinor = '4',
    budgetId = 'formation-budget',
    candidateDigest = fixture.candidate.candidateDigest,
  } = {}
) {
  const action = {
    missionId: fixture.context.missionId,
    candidateDigest,
    environment: fixture.context.environment,
    mode: 'fixture',
    principal: 'synthetic-principal',
    level: 'A2',
    tool: 'fixture-driver',
    target: 'sandbox:mission',
    dataClass: 'synthetic',
    effect: 'sandbox-execution',
    workOrderAction: 'read-synthetic',
    costMinor,
    currency: 'SYNTHETIC_MINOR',
    nonce,
    deadline: date(fixture.now + 1000),
    workOrderDigest: fixture.compilation.graph.nodes[0].digest,
    taskDigest: 'a'.repeat(64),
    evidenceDigest: await digestObject('rehearsal-evidence-v1', {}),
    deploymentId: 'local-fixture',
  };
  const payload = {
    schemaVersion: 1,
    id: `lease-${nonce}`,
    kind: 'rehearsal',
    principal: action.principal,
    candidateDigest,
    workOrderDigest: action.workOrderDigest,
    taskDigest: action.taskDigest,
    evidenceDigest: action.evidenceDigest,
    deploymentId: action.deploymentId,
    actionDigest: await digestObject('successor-action-v1', action),
    level: 'A2',
    scope: fixture.protocol.scope,
    budget: { id: budgetId, currency: action.currency, maxMinor: costMinor },
    maxActions: 1,
    notBefore: date(fixture.now - 60000),
    expiresAt: action.deadline,
    nonce,
    revocationEpoch: 0,
  };
  const lease = await signPayload(payload, {
    identity: fixture.identities.underwriter,
    purpose: 'successor.job-lease.v1',
    context: fixture.context,
    issuedAt: date(fixture.now - 1000),
  });
  return { action, lease, idempotencyKey: nonce, actor: 'synthetic-principal' };
}

export async function runProofRehearsal() {
  const base = await createProofFixture();
  const verified = await verifyProof(base.proof, {
    trustStore: base.trustStore,
    context: base.context,
    candidate: base.candidate,
    protocol: base.protocol,
    now: base.now,
  });
  let independentAdmissionCode;
  try {
    await verifyProof(base.proof, {
      trustStore: base.trustStore,
      context: base.context,
      candidate: base.candidate,
      protocol: base.protocol,
      now: base.now,
      requireIndependent: true,
    });
  } catch (error) {
    independentAdmissionCode = error.code;
  }
  const strong = await createProofFixture({ strongAlternativeUtility: 10 });
  const unsafe = await createProofFixture({ criticalMisses: 22 });
  const store = openStore(':memory:', { initialState: base.registeredState });
  store.transact(
    (state) => {
      state.budgets['formation-budget'] = {
        currency: 'SYNTHETIC_MINOR',
        limitMinor: '10',
        reservedMinor: '0',
        spentMinor: '0',
        status: 'active',
      };
    },
    {
      actor: 'synthetic-principal',
      reason: 'allocate fixture-only rehearsal budget',
    }
  );
  const assurance = {
    monitoring: true,
    cleanup: true,
    rollback: true,
    freshness: true,
    commissioned: false,
  };
  const request = await createLeaseFixture(base);
  let calls = 0;
  const broker = createActionBroker({
    store,
    trustStore: base.trustStore,
    now: () => base.now,
    assurance,
    driver: {
      mode: 'fixture',
      execute: async ({ effectId }) => {
        calls++;
        return {
          status: 'completed',
          effectId,
          costMinor: '4',
          cleanup: true,
          monitoring: true,
        };
      },
    },
  });
  const executed = await broker.execute(request);
  const replay = await broker.execute(request);
  const revokedRequest = await createLeaseFixture(base, {
    nonce: 'fixture-nonce-0002',
  });
  revokeAuthority(store, revokedRequest.lease.payload.id, {
    actor: 'synthetic-principal',
    reason: 'rehearsal stop',
    eventId: 'rehearsal-revoke',
  });
  const revoked = await authorizeJobLease({
    ...revokedRequest,
    trustStore: base.trustStore,
    state: store.read(),
    assurance,
    now: base.now,
  });
  const state = store.read();
  store.close();
  return {
    schemaVersion: 1,
    label: 'Synthetic rehearsal — no independent proof or production authority',
    candidateDigest: base.candidate.candidateDigest,
    internalVerdict: verified.payload.verdict,
    independence: 'I0',
    independentAdmission: { allowed: false, code: independentAdmissionCode },
    strongerAlternative: {
      verdict: strong.report.verdict,
      failures: strong.report.failures,
      comparisons: strong.report.comparisons,
    },
    unsafePatch: {
      verdict: unsafe.report.verdict,
      criticalMisses: unsafe.report.criticalMisses,
      failures: unsafe.report.failures,
    },
    runtime: {
      status: executed.status,
      replayed: replay.replayed,
      driverCalls: calls,
      revocationCode: revoked.code,
      budget: state.budgets['formation-budget'],
    },
    costs: base.report.costs,
    limitations: base.report.limitations,
  };
}
