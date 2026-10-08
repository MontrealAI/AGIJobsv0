import test from 'node:test';
import assert from 'node:assert/strict';
import { compileJobs } from '../src/compiler.mjs';
import {
  createInvoiceMission,
  createInvoiceJobs,
  createInvoiceEdges,
} from '../src/invoice.mjs';
import { registerCompilation } from '../src/institution.mjs';
import { digestObject } from '../src/integrity.mjs';
import { openStore } from '../src/store.mjs';
import { impairDependencies, authorizeJobLease } from '../src/authority.mjs';
import { createActionBroker } from '../src/runtime.mjs';
import {
  generateSigningIdentity,
  trustKey,
  signPayload,
} from '../src/signatures.mjs';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const date = (value) => new Date(value).toISOString();
const assurance = {
  monitoring: true,
  cleanup: true,
  rollback: true,
  freshness: true,
  commissioned: false,
};
async function compilation(id = 'invoice-integrity-synthetic-v1') {
  const mission = createInvoiceMission();
  mission.missionId = id;
  return compileJobs(mission, {
    jobs: createInvoiceJobs(mission),
    edges: createInvoiceEdges(mission),
    now: date(NOW),
  });
}
async function leaseFixture(compiled, registration) {
  const mission = compiled.constitution;
  const context = {
    institutionId: mission.institutionId,
    missionId: mission.missionId,
    environment: 'registered-invoice-fixture',
    mode: 'fixture',
  };
  const identity = generateSigningIdentity({
    keyId: 'registered-fixture-underwriter',
    organizationId: 'synthetic-owner',
    custodyId: 'fixture-underwriting',
    fixture: true,
  });
  const trustStore = {
    schemaVersion: 1,
    keys: [
      trustKey(identity, {
        roles: ['underwriter'],
        principals: [mission.principal],
        context,
        notBefore: date(NOW - 60000),
        expiresAt: date(NOW + 3600000),
      }),
    ],
  };
  const job = compiled.graph.nodes.find((entry) =>
    entry.covers.includes('match-po')
  );
  const candidateDigest = await digestObject(
    'registered-fixture-candidate-v1',
    { graphDigest: compiled.graph.digest }
  );
  async function request(nonce) {
    const action = {
      missionId: mission.missionId,
      institutionId: mission.institutionId,
      candidateDigest,
      environment: context.environment,
      mode: 'fixture',
      principal: mission.principal,
      level: 'A2',
      tool: job.permittedTools[0],
      workOrderAction: job.permittedActions[0],
      target: 'sandbox:invoice',
      dataClass: 'synthetic',
      effect: 'sandbox-execution',
      costMinor: '100',
      currency: job.budget.unit,
      nonce,
      deadline: date(NOW + job.budget.maxDurationMs),
      workOrderDigest: registration.workOrderDigests[job.jobId],
      taskDigest: 'a'.repeat(64),
      evidenceDigest: await digestObject(
        'registered-source-set-v1',
        job.authorizedInputs
      ),
      deploymentId: 'registered-local-fixture',
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
      scope: {
        tools: [action.tool],
        targets: [action.target],
        dataClasses: ['synthetic'],
        effects: ['sandbox-execution'],
      },
      budget: {
        id: 'invoice-formation-budget',
        currency: action.currency,
        maxMinor: '100',
      },
      maxActions: 1,
      notBefore: date(NOW - 1000),
      expiresAt: action.deadline,
      nonce,
      revocationEpoch: 0,
    };
    return {
      action,
      lease: await signPayload(payload, {
        identity,
        purpose: 'successor.job-lease.v1',
        context,
        issuedAt: date(NOW - 1000),
      }),
      idempotencyKey: nonce,
      actor: mission.principal,
    };
  }
  return { trustStore, request, job, context, identity };
}

test('G04 actual compiled invoice dependencies invalidate only linked proof and authority', async () => {
  const store = openStore(':memory:');
  try {
    const first = await compilation();
    const second = await compilation('another-invoice-mission');
    const one = (
      await registerCompilation(store, first, {
        actor: 'fixture-operator',
        eventId: 'register-one',
        now: NOW,
      })
    ).result;
    const two = (
      await registerCompilation(store, second, {
        actor: 'fixture-operator',
        eventId: 'register-two',
        now: NOW,
      })
    ).result;
    assert.notEqual(
      one.sourceReferences['purchase-order'],
      two.sourceReferences['purchase-order']
    );
    const firstTerminal =
      one.workOrderDigests[
        `${first.constitution.missionId}:human-decision-pack`
      ];
    const secondTerminal =
      two.workOrderDigests[
        `${second.constitution.missionId}:human-decision-pack`
      ];
    store.transact(
      (state) => {
        state.proofs['fixture-proof-dependent'] = {
          status: 'current',
          evidenceMode: 'synthetic-metadata-only',
          dependencies: [firstTerminal],
        };
        state.proofs['fixture-proof-unrelated'] = {
          status: 'current',
          evidenceMode: 'synthetic-metadata-only',
          dependencies: [secondTerminal],
        };
        state.authorities['fixture-authority-dependent'] = {
          status: 'active',
          proofDigest: 'fixture-proof-dependent',
          production: false,
        };
        state.authorities['fixture-authority-unrelated'] = {
          status: 'active',
          proofDigest: 'fixture-proof-unrelated',
          production: false,
        };
      },
      {
        actor: 'fixture-operator',
        eventId: 'link-fixture-only-metadata',
        reason:
          'Exercise invalidation mechanics, not independent proof or real authority.',
      }
    );
    const result = impairDependencies(store, {
      sourceIds: [one.sourceReferences['purchase-order']],
      reason: 'Source rights were revoked by the accountable owner.',
      actor: 'rights-owner',
      eventId: 'revoke-source-rights',
    }).result;
    assert.ok(result.affected.includes(firstTerminal));
    assert.deepEqual(result.impairedProofs, ['fixture-proof-dependent']);
    const state = store.read();
    assert.equal(
      state.authorities['fixture-authority-dependent'].status,
      'suspended'
    );
    assert.equal(
      state.authorities['fixture-authority-unrelated'].status,
      'active'
    );
    assert.equal(state.workOrders[firstTerminal].status, 'impaired');
    assert.equal(state.workOrders[secondTerminal].status, 'current');
    assert.equal(state.revocationEpochs['fixture-authority-dependent'], 1);
    assert.equal(store.verify().valid, true);
    const replayed = (
      await registerCompilation(store, first, {
        actor: 'fixture-operator',
        eventId: 'reregister-cannot-renew',
        now: NOW,
      })
    ).result;
    assert.equal(replayed.status, 'IMPAIRED_NOT_AUTHORIZED');
    assert.equal(store.read().workOrders[firstTerminal].status, 'impaired');
  } finally {
    store.close();
  }
});

test('G04 stale compiled work order cannot dispatch a newly signed formation lease', async () => {
  const store = openStore(':memory:');
  let driverCalls = 0;
  try {
    const compiled = await compilation();
    const registered = (
      await registerCompilation(store, compiled, {
        actor: 'fixture-operator',
        eventId: 'register-invoice',
        now: NOW,
      })
    ).result;
    const fixture = await leaseFixture(compiled, registered);
    store.transact(
      (state) => {
        state.budgets['invoice-formation-budget'] = {
          currency: fixture.job.budget.unit,
          limitMinor: '1000',
          reservedMinor: '0',
          spentMinor: '0',
          status: 'active',
        };
      },
      {
        actor: compiled.constitution.principal,
        eventId: 'allocate-bounded-fixture-budget',
      }
    );
    const runtime = createActionBroker({
      store,
      trustStore: fixture.trustStore,
      now: () => NOW,
      assurance,
      driver: {
        mode: 'fixture',
        execute: async ({ effectId }) => {
          driverCalls++;
          return {
            status: 'completed',
            effectId,
            costMinor: '100',
            cleanup: true,
            monitoring: true,
          };
        },
      },
    });
    const first = await runtime.execute(
      await fixture.request('registered-before-revocation')
    );
    assert.equal(first.status, 'completed');
    assert.equal(driverCalls, 1);
    impairDependencies(store, {
      sourceIds: [registered.sourceReferences['purchase-order']],
      reason: 'License revoked.',
      actor: 'rights-owner',
      eventId: 'rights-revocation',
    });
    const retry = await fixture.request('registered-after-revocation');
    assert.equal(
      (
        await authorizeJobLease({
          ...retry,
          trustStore: fixture.trustStore,
          state: store.read(),
          assurance,
          now: NOW,
        })
      ).code,
      'DEPENDENCY_IMPAIRED'
    );
    await assert.rejects(() => runtime.execute(retry), {
      code: 'DEPENDENCY_IMPAIRED',
    });
    assert.equal(driverCalls, 1);
  } finally {
    store.close();
  }
});

test('registration refuses modified compiler maps and graph bytes without partial mutation', async () => {
  const store = openStore(':memory:');
  try {
    const compiled = await compilation();
    const mapTamper = structuredClone(compiled);
    mapTamper.invalidationMap['purchase-order'] = [];
    await assert.rejects(
      () =>
        registerCompilation(store, mapTamper, {
          actor: 'operator',
          eventId: 'tampered-map',
          now: NOW,
        }),
      { code: 'DEPENDENCY_MAP_MISMATCH' }
    );
    const graphTamper = structuredClone(compiled);
    graphTamper.graph.nodes[0].objective = 'Silently altered objective';
    await assert.rejects(
      () =>
        registerCompilation(store, graphTamper, {
          actor: 'operator',
          eventId: 'tampered-job',
          now: NOW,
        }),
      { code: 'GRAPH_DIGEST_MISMATCH' }
    );
    assert.equal(store.head().version, 0);
  } finally {
    store.close();
  }
});

test('a newly sealed descendant cannot reset rights revoked for its source', async () => {
  const store = openStore(':memory:');
  try {
    const compiled = await compilation();
    const registered = (
      await registerCompilation(store, compiled, {
        actor: 'operator',
        eventId: 'register-parent',
        now: NOW,
      })
    ).result;
    impairDependencies(store, {
      sourceIds: [registered.sourceReferences['purchase-order']],
      reason: 'Rights revoked.',
      actor: 'owner',
      eventId: 'revoke-before-descendant',
    });
    const mission = createInvoiceMission();
    const jobs = createInvoiceJobs(mission);
    jobs.forEach((job) => {
      job.version = '2';
    });
    const descendant = await compileJobs(mission, {
      jobs,
      edges: createInvoiceEdges(mission),
      now: date(NOW),
    });
    const result = (
      await registerCompilation(store, descendant, {
        actor: 'operator',
        eventId: 'register-descendant',
        now: NOW,
      })
    ).result;
    assert.equal(result.status, 'IMPAIRED_NOT_AUTHORIZED');
    const dependent = result.workOrderDigests[`${mission.missionId}:match-po`];
    assert.equal(store.read().workOrders[dependent].status, 'impaired');
  } finally {
    store.close();
  }
});
