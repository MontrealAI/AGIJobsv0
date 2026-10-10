import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestObject } from '../src/integrity.mjs';
import {
  generateSigningIdentity,
  trustKey,
  signPayload,
  verifySignedPayload,
  timestamp,
} from '../src/signatures.mjs';
import {
  freezeCandidate,
  validateProtocol,
  evaluateEvidence,
  evaluateOnce,
  issueProof,
  verifyProof,
} from '../src/proof.mjs';
import {
  admitCandidate,
  issueAuthority,
  authorizeAction,
  revokeAuthority,
  impairDependencies,
} from '../src/authority.mjs';
import { openStore } from '../src/store.mjs';
import { createActionBroker } from '../src/runtime.mjs';
import {
  createProofFixture,
  createLeaseFixture,
  runProofRehearsal,
} from '../src/proof-rehearsal.mjs';

const fixture = await createProofFixture();
const assurance = {
  monitoring: true,
  cleanup: true,
  rollback: true,
  freshness: true,
  commissioned: false,
};
const date = (ms) => new Date(ms).toISOString();
const clone = structuredClone;
function storeWithBudget(filename = ':memory:', limitMinor = '10') {
  const store = openStore(filename, { initialState: fixture.registeredState });
  if (!store.read().budgets['formation-budget'])
    store.transact(
      (state) => {
        state.budgets['formation-budget'] = {
          currency: 'SYNTHETIC_MINOR',
          limitMinor,
          reservedMinor: '0',
          spentMinor: '0',
          status: 'active',
        };
      },
      { eventId: 'allocate-fixture-budget' }
    );
  return store;
}
const proofOptions = () => ({
  trustStore: fixture.trustStore,
  context: fixture.context,
  candidate: fixture.candidate,
  protocol: fixture.protocol,
  now: fixture.now,
});
async function resignLease(request, update) {
  const out = clone(request);
  update(out);
  out.lease.payload.actionDigest = await digestObject(
    'successor-action-v1',
    out.action
  );
  out.lease = await signPayload(out.lease.payload, {
    identity: fixture.identities.underwriter,
    purpose: 'successor.job-lease.v1',
    context: fixture.context,
    issuedAt: date(fixture.now - 1000),
  });
  return out;
}
function broker(store, driver, extra = {}) {
  return createActionBroker({
    store,
    trustStore: fixture.trustStore,
    now: () => fixture.now,
    assurance,
    driver: { mode: 'fixture', ...driver },
    ...extra,
  });
}

// Threat-model fixture: fabricated external attestations under ephemeral test
// roots exercise policy mechanics only. No external independence is asserted.
async function authorizationPolicyFixture() {
  const context = {
    ...fixture.context,
    mode: 'live',
    environment: 'isolated-policy-test',
  };
  const evaluator = generateSigningIdentity({
    keyId: 'test-external-evaluator',
    organizationId: 'test-external-org',
    custodyId: 'test-external-vault',
    fixture: false,
  });
  const principal = generateSigningIdentity({
    keyId: 'test-principal',
    organizationId: 'claimant',
    custodyId: 'test-principal-vault',
    fixture: false,
  });
  const trustStore = {
    schemaVersion: 1,
    keys: [
      trustKey(evaluator, {
        roles: ['evaluator'],
        context,
        notBefore: date(fixture.now - 7200000),
        expiresAt: date(fixture.now + 7200000),
        maxIndependence: 'I3',
      }),
      trustKey(principal, {
        roles: ['principal', 'authorityIssuer', 'effectApprover'],
        principals: ['test-accountable-human'],
        context,
        notBefore: date(fixture.now - 7200000),
        expiresAt: date(fixture.now + 7200000),
      }),
    ],
  };
  const scope = {
    ...clone(fixture.protocol.scope),
    effects: ['reversible-write', 'consequential-payment'],
  };
  const candidate = await freezeCandidate({
    ...clone(fixture.candidate.manifest),
    scope,
  });
  const protocol = {
    ...clone(fixture.protocol),
    candidateDigest: candidate.candidateDigest,
    evidenceMode: 'protected',
    requiredIndependence: 'I3',
    custodianOrganizationId: evaluator.organizationId,
    custodianId: evaluator.custodyId,
    scope,
  };
  const { protocolDigest } = await validateProtocol(protocol, candidate);
  const evidence = {
    ...clone(fixture.evidence),
    candidateDigest: candidate.candidateDigest,
    protocolDigest,
  };
  const report = await evaluateEvidence({ protocol, candidate, evidence });
  const proof = await issueProof({
    report,
    identity: evaluator,
    context,
    independence: 'I3',
  });
  const proven = await verifyProof(proof, {
    trustStore,
    context,
    candidate,
    protocol,
    now: fixture.now,
    requireIndependent: true,
  });
  const decision = {
    schemaVersion: 1,
    id: 'test-admission',
    status: 'granted',
    maxLevel: 'A4',
    candidateDigest: candidate.candidateDigest,
    proofDigest: proven.digest,
    scope,
    rationale: 'Test-only assumed evidence',
    accountablePrincipal: 'test-accountable-human',
    operationalAssuranceDigest: await digestObject(
      'test-only-assurance-v1',
      {}
    ),
    expiresAt: date(fixture.now + 1800000),
  };
  const admission = await admitCandidate({
    proof,
    protocol,
    candidate,
    decision,
    identity: principal,
    trustStore,
    context,
    now: fixture.now,
  });
  const admitted = await verifySignedPayload(admission, {
    trustStore,
    context,
    purpose: 'successor.admission.v1',
    role: 'principal',
    now: fixture.now,
  });
  const action = {
    missionId: context.missionId,
    candidateDigest: candidate.candidateDigest,
    environment: context.environment,
    mode: 'live',
    principal: 'test-accountable-human',
    level: 'A3',
    tool: 'fixture-driver',
    target: 'sandbox:mission',
    dataClass: 'synthetic',
    effect: 'reversible-write',
    costMinor: '4',
    currency: 'SYNTHETIC_MINOR',
    nonce: 'policy-test-nonce-1',
    deadline: date(fixture.now + 600000),
  };
  const envelope = {
    schemaVersion: 1,
    id: 'test-authority',
    principal: action.principal,
    candidateDigest: candidate.candidateDigest,
    admissionDigest: admitted.digest,
    proofDigest: proven.digest,
    actionDigest: await digestObject('successor-action-v1', action),
    level: 'A3',
    scope,
    budget: { id: 'test-budget', currency: action.currency, maxMinor: '4' },
    maxActions: 1,
    notBefore: date(fixture.now - 1000),
    expiresAt: action.deadline,
    nonce: action.nonce,
    revocationEpoch: 0,
  };
  const authority = await issueAuthority({
    envelope,
    admission,
    identity: principal,
    trustStore,
    context,
    now: fixture.now,
  });
  const state = {
    stopped: false,
    revocationEpochs: {},
    actions: {},
    proofs: {
      [proven.digest]: {
        status: 'current',
        rightsCurrent: true,
        monitoringCurrent: true,
      },
    },
    admissions: { [admitted.digest]: { status: 'granted' } },
    authorities: { 'test-authority': { status: 'active' } },
  };
  return {
    action,
    authority,
    admission,
    proof,
    candidate,
    protocol,
    trustStore,
    state,
    assurance: { ...assurance, commissioned: true },
    now: fixture.now,
    principal,
    context,
  };
}

test('P01 complete frozen candidate and signed proof verify; any byte of report fails', async () => {
  assert.equal(
    (await verifyProof(fixture.proof, proofOptions())).payload.verdict,
    'PASS'
  );
  const proof = clone(fixture.proof);
  proof.payload.criticalMisses = 9;
  await assert.rejects(verifyProof(proof, proofOptions()), {
    code: 'INVALID_SIGNATURE',
  });
  const candidate = clone(fixture.candidate);
  candidate.manifest.bindings.memory = 'sha256:' + 'f'.repeat(64);
  await assert.rejects(
    verifyProof(fixture.proof, { ...proofOptions(), candidate }),
    { code: 'CANDIDATE_TAMPERED' }
  );
});
test('P01 missing complete-system memory binding and changed comparator roster fail', async () => {
  const manifest = clone(fixture.candidate.manifest);
  delete manifest.bindings.memory;
  await assert.rejects(freezeCandidate(manifest), {
    code: 'INCOMPLETE_CANDIDATE',
  });
  const protocol = clone(fixture.protocol);
  protocol.comparators[1].digest = 'sha256:' + 'f'.repeat(64);
  await assert.rejects(validateProtocol(protocol, fixture.candidate), {
    code: 'COMPARATOR_ROSTER_MISMATCH',
  });
});
test('P01 trusted signatures cannot make contradictory PASS measurements valid', async () => {
  const changes = [
    (r) => {
      r.comparisons = [];
    },
    (r) => {
      r.comparisons[0].robustMargin = 999;
    },
    (r) => {
      r.criticalMisses = 10;
    },
    (r) => {
      delete r.costs.maintenance;
    },
    (r) => {
      r.costsAlreadyInNetGain = false;
    },
  ];
  for (const mutate of changes) {
    const report = clone(fixture.report);
    mutate(report);
    const proof = await issueProof({
      report,
      identity: fixture.identities.evaluator,
      context: fixture.context,
    });
    await assert.rejects(verifyProof(proof, proofOptions()), {
      code: 'INVALID_PROOF_MEASUREMENTS',
    });
  }
});
test('P01 signed proof context cannot attest a different frozen mission', async () => {
  const context = { ...fixture.context, missionId: 'different-mission' };
  const trustStore = clone(fixture.trustStore);
  for (const key of trustStore.keys) key.context = context;
  const proof = await issueProof({
    report: fixture.report,
    identity: fixture.identities.evaluator,
    context,
  });
  await assert.rejects(
    verifyProof(proof, { ...proofOptions(), context, trustStore }),
    { code: 'CONTEXT_MISMATCH' }
  );
});
test('P04 correlated cases cannot inflate independently sampled proof counts', async () => {
  const evidence = clone(fixture.evidence);
  evidence.cases[1].correlationGroup = evidence.cases[0].correlationGroup;
  await assert.rejects(
    evaluateEvidence({
      protocol: fixture.protocol,
      candidate: fixture.candidate,
      evidence,
    }),
    { code: 'CORRELATED_SAMPLE_UNSUPPORTED' }
  );
});
test('Signature time rejects normalized impossible dates and noncanonical time zones', () => {
  for (const value of [
    '2026-02-30T12:00:00.000Z',
    '2026-10-08T12:00:00Z',
    '2026-10-08T12:00:00.000+00:00',
    1.5,
  ])
    assert.throws(() => timestamp(value), { code: 'INVALID_TIME' });
  assert.equal(timestamp('2026-10-08T12:00:00.000Z'), fixture.now);
});
test('R01 unknown signer, wrong purpose and wrong role fail', async () => {
  await assert.rejects(
    verifyProof(fixture.proof, {
      ...proofOptions(),
      trustStore: { schemaVersion: 1, keys: [] },
    }),
    { code: 'UNKNOWN_SIGNER' }
  );
  await assert.rejects(
    verifySignedPayload(fixture.proof, {
      ...proofOptions(),
      purpose: 'successor.authority.v1',
      role: 'evaluator',
    }),
    { code: 'SIGNATURE_PURPOSE_MISMATCH' }
  );
  const trustStore = clone(fixture.trustStore);
  trustStore.keys[0].roles = ['producer'];
  await assert.rejects(
    verifyProof(fixture.proof, { ...proofOptions(), trustStore }),
    { code: 'WRONG_SIGNER_ROLE' }
  );
});
test('R02 relabeling one key as different organization/custody cannot establish independence', async () => {
  const trustStore = clone(fixture.trustStore);
  trustStore.keys.push({
    ...trustStore.keys[0],
    keyId: 'another-name',
    organizationId: 'pretend-independent',
    custodyId: 'pretend-other-vault',
  });
  await assert.rejects(
    verifyProof(fixture.proof, { ...proofOptions(), trustStore }),
    { code: 'ROLE_CONFLICT' }
  );
});
test('P02 signed fixture passing metrics never become independent qualification', async () => {
  await assert.rejects(
    verifyProof(fixture.proof, { ...proofOptions(), requireIndependent: true }),
    { code: 'INDEPENDENCE_REQUIRED' }
  );
  await assert.rejects(
    issueProof({
      report: fixture.report,
      identity: fixture.identities.evaluator,
      context: fixture.context,
      independence: 'I3',
    }),
    { code: 'FIXTURE_INDEPENDENCE_DENIED' }
  );
  await assert.rejects(
    signPayload(
      {},
      {
        identity: fixture.identities.evaluator,
        purpose: 'successor.proof.v1',
        context: { ...fixture.context, mode: 'live' },
      }
    ),
    { code: 'FIXTURE_LIVE_DENIED' }
  );
});
test('P02 externally signed public fixtures cannot promote their independence label', async () => {
  const trustStore = clone(fixture.trustStore);
  trustStore.keys[0].maxIndependence = 'I4';
  for (const independence of ['I2', 'I3', 'I4']) {
    const proof = await signPayload(
      { ...fixture.proof.payload, independence },
      {
        identity: fixture.identities.evaluator,
        purpose: 'successor.proof.v1',
        context: fixture.context,
        issuedAt: fixture.proof.issuedAt,
      }
    );
    await assert.rejects(
      verifyProof(proof, { ...proofOptions(), trustStore }),
      { code: 'FIXTURE_INDEPENDENCE_DENIED' }
    );
  }
  for (const independence of ['I0', 'I1']) {
    const proof = await signPayload(
      { ...fixture.proof.payload, independence },
      {
        identity: fixture.identities.evaluator,
        purpose: 'successor.proof.v1',
        context: fixture.context,
        issuedAt: fixture.proof.issuedAt,
      }
    );
    const verified = await verifyProof(proof, {
      ...proofOptions(),
      trustStore,
    });
    assert.equal(verified.payload.independence, independence);
  }
});
test('P02 stale, conditional and undersampled evidence cannot yield independent proof', async () => {
  await assert.rejects(
    verifyProof(fixture.proof, {
      ...proofOptions(),
      now: fixture.now + 3600001,
    }),
    { code: 'STALE_PROOF' }
  );
  const evidence = clone(fixture.evidence);
  evidence.cases.pop();
  assert.equal(
    (
      await evaluateEvidence({
        protocol: fixture.protocol,
        candidate: fixture.candidate,
        evidence,
      })
    ).verdict,
    'INSUFFICIENT_EVIDENCE'
  );
  const conditional = clone(fixture.evidence);
  conditional.unmetConditions = ['unresolved operational assumption'];
  assert.equal(
    (
      await evaluateEvidence({
        protocol: fixture.protocol,
        candidate: fixture.candidate,
        evidence: conditional,
      })
    ).verdict,
    'CONDITIONAL_PASS'
  );
});
test('R03/P03 contamination, cross-case leakage, adaptation and provider changes impair proof', async () => {
  for (const flag of [
    'contaminated',
    'undeclaredAdaptation',
    'crossCaseLeakage',
    'materialProviderChange',
  ]) {
    const evidence = clone(fixture.evidence);
    evidence[flag] = true;
    const report = await evaluateEvidence({
      protocol: fixture.protocol,
      candidate: fixture.candidate,
      evidence,
    });
    assert.equal(report.currency, 'impaired');
    assert.equal(report.verdict, 'INSUFFICIENT_EVIDENCE');
    const proof = await issueProof({
      report,
      identity: fixture.identities.evaluator,
      context: fixture.context,
    });
    await assert.rejects(verifyProof(proof, proofOptions()), {
      code: 'IMPAIRED_PROOF',
    });
  }
});
test('P04 bounded simultaneous intervals, full costs and nonzero critical-risk upper bound are retained', () => {
  assert.equal(fixture.report.comparisons.length, 2);
  assert.ok(
    fixture.report.comparisons.every(
      (c) => c.interval.lower < c.mean && c.interval.upper > c.mean
    )
  );
  assert.ok(fixture.report.criticalRiskUpperBound > 0);
  assert.equal(Object.keys(fixture.report.costs).length, 12);
  assert.equal(fixture.report.attempts.length, 1);
  assert.equal(fixture.report.costsAlreadyInNetGain, true);
});
test('P04 failed and abandoned attempts remain durable and cannot be retried until favorable', async () => {
  const store = openStore(':memory:');
  try {
    const evidence = clone(fixture.evidence);
    evidence.cases[0].comparators = {};
    await assert.rejects(
      evaluateOnce({
        store,
        protocol: fixture.protocol,
        candidate: fixture.candidate,
        evidence,
        actor: 'evaluator',
        eventId: 'attempt-1',
      }),
      { code: 'MISSING_COMPARATOR' }
    );
    await assert.rejects(
      evaluateOnce({
        store,
        protocol: fixture.protocol,
        candidate: fixture.candidate,
        evidence: fixture.evidence,
        actor: 'evaluator',
        eventId: 'attempt-2',
      }),
      { code: 'PROTOCOL_ATTEMPT_EXHAUSTED' }
    );
    assert.equal(
      Object.values(store.read().examinations)[0].status,
      'abandoned'
    );
  } finally {
    store.close();
  }
});
test('D03 stronger conventional comparator removes Alpha and critical misses defeat mean utility', async () => {
  const evidence = clone(fixture.evidence);
  for (const row of evidence.cases)
    row.comparators.conventional.netUtility = 10;
  const noAlpha = await evaluateEvidence({
    protocol: fixture.protocol,
    candidate: fixture.candidate,
    evidence,
  });
  assert.equal(noAlpha.verdict, 'FAIL');
  assert.ok(noAlpha.failures.includes('NO_DEMONSTRATED_ADVANTAGE'));
  const unsafe = clone(fixture.evidence);
  unsafe.cases[0].candidate.criticalMiss = true;
  const report = await evaluateEvidence({
    protocol: fixture.protocol,
    candidate: fixture.candidate,
    evidence: unsafe,
  });
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.failures.includes('CRITICAL_MISS_CEILING'));
});
test('A01 expired, revoked, wrong-release and wrong-target leases are denied at driver boundary', async () => {
  const cases = [
    [
      (r) => {
        r.lease.payload.expiresAt = date(fixture.now - 1);
      },
      'AUTHORITY_EXPIRED',
    ],
    [
      (r) => {
        r.action.candidateDigest = 'sha256:' + 'f'.repeat(64);
      },
      'RELEASE_MISMATCH',
    ],
    [
      (r) => {
        r.action.target = 'https://unapproved.example';
      },
      'SCOPE_DENIED',
    ],
  ];
  for (const [change, code] of cases) {
    const store = storeWithBudget();
    let calls = 0;
    try {
      const request = await resignLease(
        await createLeaseFixture(fixture),
        change
      );
      await assert.rejects(
        broker(store, {
          execute: async () => {
            calls++;
          },
        }).execute(request),
        { code }
      );
      assert.equal(calls, 0);
    } finally {
      store.close();
    }
  }
});
test('R01 formation underwriter must be scoped to the exact principal', async () => {
  const store = storeWithBudget();
  try {
    const request = await resignLease(
      await createLeaseFixture(fixture),
      (r) => {
        r.action.principal = 'unapproved-principal';
        r.lease.payload.principal = 'unapproved-principal';
      }
    );
    await assert.rejects(
      broker(store, {
        execute: async () => assert.fail('unauthorized principal'),
      }).execute(request),
      { code: 'PRINCIPAL_MISMATCH' }
    );
  } finally {
    store.close();
  }
});
test('G02 unresolved sealed references and signed scope expansions cannot bypass compiler bounds', async () => {
  for (const [mutate, code] of [
    [
      (state, request) => {
        delete state.workOrders[request.action.workOrderDigest];
      },
      'WORK_ORDER_UNREGISTERED',
    ],
    [
      (state, request) => {
        state.workOrders[request.action.workOrderDigest].missionId =
          'different-mission';
      },
      'WORK_ORDER_BINDING_MISMATCH',
    ],
    [
      (state, request) => {
        state.workOrders[request.action.workOrderDigest].permittedTools = [];
      },
      'WORK_ORDER_SCOPE_DENIED',
    ],
    [
      (state, request) => {
        state.workOrders[request.action.workOrderDigest].budget.unit =
          'OTHER_UNIT';
      },
      'WORK_ORDER_BUDGET_DENIED',
    ],
    [
      (state, request) => {
        state.workOrders[
          request.action.workOrderDigest
        ].budget.maxDurationMs = 1;
      },
      'WORK_ORDER_TIME_DENIED',
    ],
    [
      (state, request) => {
        state.workOrders[request.action.workOrderDigest].expiresAt = date(
          fixture.now - 1
        );
      },
      'RIGHTS_OR_WORK_ORDER_EXPIRED',
    ],
  ]) {
    const store = storeWithBudget();
    const request = await createLeaseFixture(fixture);
    try {
      store.transact((state) => mutate(state, request));
      await assert.rejects(
        broker(store, {
          execute: async () => assert.fail('sealed bound must stop dispatch'),
        }).execute(request),
        { code }
      );
    } finally {
      store.close();
    }
  }
});
test('A03 fresh leases cannot multiply a registered job budget across aggregate allocations', async () => {
  const store = storeWithBudget();
  let calls = 0;
  const request = await createLeaseFixture(fixture);
  try {
    store.transact((state) => {
      state.workOrders[request.action.workOrderDigest].budget.limitBaseUnits =
        '6';
      state.budgets.other = {
        currency: 'SYNTHETIC_MINOR',
        limitMinor: '100',
        reservedMinor: '0',
        spentMinor: '0',
        status: 'active',
      };
    });
    const runtime = broker(store, {
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
    });
    await runtime.execute(request);
    const another = await createLeaseFixture(fixture, {
      nonce: 'another-job-lease',
      budgetId: 'other',
    });
    await assert.rejects(runtime.execute(another), {
      code: 'WORK_ORDER_BUDGET_DENIED',
    });
    assert.equal(calls, 1);
  } finally {
    store.close();
  }
});
test('A02 revocation after proposal but before dispatch prevents the effect and releases reservation', async () => {
  const store = storeWithBudget();
  let calls = 0;
  const request = await createLeaseFixture(fixture);
  try {
    const runtime = broker(
      store,
      {
        execute: async () => {
          calls++;
        },
      },
      {
        beforeDispatch: () =>
          revokeAuthority(store, request.lease.payload.id, {
            actor: 'principal',
            reason: 'urgent revocation',
            eventId: 'revoke-at-boundary',
          }),
      }
    );
    const result = await runtime.execute(request);
    assert.equal(result.status, 'denied');
    assert.equal(result.code, 'AUTHORITY_REVOKED');
    assert.equal(calls, 0);
    assert.equal(store.read().budgets['formation-budget'].reservedMinor, '0');
  } finally {
    store.close();
  }
});
test('A03 concurrent actions cannot exceed aggregate budget, including outstanding liabilities', async () => {
  const store = storeWithBudget();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const runtime = broker(store, {
      execute: async ({ effectId }) => {
        calls++;
        await gate;
        return {
          status: 'completed',
          effectId,
          costMinor: '6',
          cleanup: true,
          monitoring: true,
        };
      },
    });
    const one = await createLeaseFixture(fixture, {
      nonce: 'concurrent-nonce-1',
      costMinor: '6',
    });
    const two = await createLeaseFixture(fixture, {
      nonce: 'concurrent-nonce-2',
      costMinor: '6',
    });
    const first = runtime.execute(one);
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(runtime.execute(two), { code: 'BUDGET_EXHAUSTED' });
    release();
    await first;
    assert.equal(calls, 1);
    assert.equal(store.read().budgets['formation-budget'].spentMinor, '6');
  } finally {
    release?.();
    store.close();
  }
});
test('A03 duplicate and cross-job nonce reuse cannot execute another effect', async () => {
  const store = storeWithBudget();
  let calls = 0;
  try {
    const runtime = broker(store, {
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
    });
    const request = await createLeaseFixture(fixture);
    await runtime.execute(request);
    assert.equal((await runtime.execute(request)).replayed, true);
    assert.equal(calls, 1);
    await assert.rejects(
      runtime.execute({ ...request, idempotencyKey: 'a-different-job' }),
      { code: 'REPLAYED_NONCE' }
    );
    await assert.rejects(
      runtime.execute({ ...request, actor: 'different-request-content' }),
      { code: 'IDEMPOTENCY_CONFLICT' }
    );
  } finally {
    store.close();
  }
});
test('A02/O01 unknown effects survive restart without blind replay and reconcile by stable effect id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'successor-runtime-'));
  const path = join(directory, 'state.sqlite');
  let calls = 0;
  let store = storeWithBudget(path);
  const request = await createLeaseFixture(fixture);
  try {
    const driver = {
      execute: async () => {
        calls++;
        throw new Error('connection lost after possible effect');
      },
      reconcile: async ({ effectId }) => ({
        status: 'completed',
        effectId,
        costMinor: '4',
        cleanup: true,
        monitoring: true,
      }),
    };
    const unknown = await broker(store, driver).execute(request);
    assert.equal(unknown.status, 'unknown');
    assert.equal(store.read().stopped, true);
    assert.equal(store.read().budgets['formation-budget'].reservedMinor, '4');
    store.close();
    store = storeWithBudget(path);
    const runtime = broker(store, driver);
    const replay = await runtime.execute(request);
    assert.equal(replay.replayed, true);
    assert.equal(replay.reconciliationRequired, true);
    assert.equal(calls, 1);
    const reconciled = await runtime.reconcile(unknown.id, {
      actor: 'incident-owner',
    });
    assert.equal(reconciled.status, 'completed');
    assert.equal(calls, 1);
    assert.equal(store.read().stopped, true);
    assert.equal(store.read().budgets['formation-budget'].reservedMinor, '0');
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('A04 missing monitoring before dispatch and failed cleanup after dispatch stop progression', async () => {
  const store = storeWithBudget();
  const request = await createLeaseFixture(fixture);
  try {
    await assert.rejects(
      broker(
        store,
        { execute: async () => assert.fail('must not execute') },
        { assurance: { ...assurance, monitoring: false } }
      ).execute(request),
      { code: 'ASSURANCE_UNAVAILABLE' }
    );
    await broker(store, {
      execute: async ({ effectId }) => ({
        status: 'completed',
        effectId,
        costMinor: '4',
        cleanup: false,
        monitoring: true,
      }),
    }).execute(request);
    assert.equal(store.read().stopped, true);
    assert.equal(store.read().incidents[0].code, 'CLEANUP_FAILED');
  } finally {
    store.close();
  }
});
test('O01 a hung driver is aborted at the bounded deadline and remains an unknown liability', async () => {
  const store = storeWithBudget();
  let aborted = false;
  try {
    const request = await resignLease(
      await createLeaseFixture(fixture),
      (r) => {
        r.action.deadline = date(fixture.now + 10);
        r.lease.payload.expiresAt = r.action.deadline;
      }
    );
    const result = await broker(store, {
      execute: ({ signal }) =>
        new Promise(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    }).execute(request);
    assert.equal(result.status, 'unknown');
    assert.equal(aborted, true);
    assert.equal(store.read().stopped, true);
    assert.equal(store.read().budgets['formation-budget'].reservedMinor, '4');
  } finally {
    store.close();
  }
});
test('G04 rights/expiry/verifier impairment cascades only through dependent proof and authority', () => {
  const store = openStore(':memory:');
  try {
    store.transact((state) => {
      state.dependencies = { claim: ['evidence-1'], policy: ['claim'] };
      state.proofs = {
        affected: { status: 'current', dependencies: ['policy'] },
        unrelated: { status: 'current', dependencies: ['evidence-2'] },
      };
      state.authorities = {
        a: { status: 'active', proofDigest: 'affected' },
        b: { status: 'active', proofDigest: 'unrelated' },
      };
    });
    const result = impairDependencies(store, {
      sourceIds: ['evidence-1'],
      reason: 'license expired',
      actor: 'rights-owner',
      eventId: 'rights-expired',
    });
    assert.deepEqual(result.result.impairedProofs, ['affected']);
    assert.equal(store.read().authorities.a.status, 'suspended');
    assert.equal(store.read().revocationEpochs.a, 1);
    assert.equal(store.read().authorities.b.status, 'active');
    assert.equal(store.read().incidents[0].reason, 'license expired');
  } finally {
    store.close();
  }
});
test('O02 live effect dispatch is unavailable even if a request claims commissioned status', async () => {
  const store = storeWithBudget();
  try {
    const request = await createLeaseFixture(fixture);
    request.action.mode = 'live';
    await assert.rejects(
      broker(
        store,
        { execute: async () => assert.fail('live driver must not execute') },
        { assurance: { ...assurance, commissioned: true } }
      ).execute(request),
      { code: 'UNCOMMISSIONED_RUNTIME' }
    );
  } finally {
    store.close();
  }
});
test('A3 mechanics require current registered assurance and named accountable principal', async () => {
  const input = await authorizationPolicyFixture();
  assert.equal((await authorizeAction(input)).allowed, true);
  input.state.proofs[Object.keys(input.state.proofs)[0]].rightsCurrent = false;
  assert.equal((await authorizeAction(input)).code, 'IMPAIRED_PROOF');
  input.state.proofs[Object.keys(input.state.proofs)[0]].rightsCurrent = true;
  input.action.principal = 'self-promoting-candidate';
  assert.equal((await authorizeAction(input)).code, 'PRINCIPAL_MISMATCH');
});
test('A4 consequential policy denies missing and same-custody dual approval', async () => {
  const input = await authorizationPolicyFixture();
  input.action.level = 'A4';
  input.action.effect = 'consequential-payment';
  const envelope = {
    ...input.authority.payload,
    level: 'A4',
    actionDigest: await digestObject('successor-action-v1', input.action),
  };
  input.authority = await signPayload(envelope, {
    identity: input.principal,
    purpose: 'successor.authority.v1',
    context: input.context,
    issuedAt: date(fixture.now),
  });
  assert.equal((await authorizeAction(input)).code, 'DUAL_CONTROL_REQUIRED');
  const approval = await signPayload(
    {
      actionDigest: envelope.actionDigest,
      expiresAt: date(fixture.now + 600000),
    },
    {
      identity: input.principal,
      purpose: 'successor.effect-approval.v1',
      context: input.context,
      issuedAt: date(fixture.now),
    }
  );
  envelope.approvals = [approval, approval];
  input.authority = await signPayload(envelope, {
    identity: input.principal,
    purpose: 'successor.authority.v1',
    context: input.context,
    issuedAt: date(fixture.now),
  });
  assert.equal((await authorizeAction(input)).code, 'ROLE_CONFLICT');
});
test('A3 cannot relabel a consequential effect to bypass its A4 dual controls', async () => {
  const input = await authorizationPolicyFixture();
  input.action.effect = 'consequential-payment';
  const envelope = {
    ...input.authority.payload,
    actionDigest: await digestObject('successor-action-v1', input.action),
  };
  input.authority = await signPayload(envelope, {
    identity: input.principal,
    purpose: 'successor.authority.v1',
    context: input.context,
    issuedAt: date(fixture.now),
  });
  assert.equal(
    (await authorizeAction(input)).code,
    'EFFECT_CLASSIFICATION_DENIED'
  );
});
test('Public rehearsal exposes failures, correct boundaries and no private keys', async () => {
  const result = await runProofRehearsal();
  assert.equal(result.independence, 'I0');
  assert.equal(result.strongerAlternative.verdict, 'FAIL');
  assert.equal(result.independentAdmission.allowed, false);
  assert.equal(result.runtime.driverCalls, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE KEY'), false);
});
