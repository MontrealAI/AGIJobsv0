import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, recordKnowledge, queryKnowledge } from '../src/store.mjs';
import {
  createMissionPack,
  verifyMissionPack,
  restoreMissionPack,
  createSuccessor,
} from '../src/pack.mjs';

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'successor-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'institution.sqlite');
}
const artifact = () => ({
  path: 'knowledge/failed-hypothesis.json',
  kind: 'negative-knowledge',
  rights: 'owned',
  license: 'Synthetic fixture; MIT',
  content: {
    id: 'h1',
    prediction: 'approval is safe',
    observed: 'critical failure',
    status: 'rejected',
  },
});
const pack = () =>
  createMissionPack({
    institutionId: 'test',
    missionId: 'invoice',
    artifacts: [artifact()],
    exclusions: ['protected cases', 'credentials', 'active authority'],
  });

test('K01 durable Chronicle replay, expected-version conflicts and event replay fail closed', (t) => {
  const path = temporary(t);
  let store = openStore(path);
  store.transact(
    (state) => {
      state.stopped = true;
    },
    {
      eventId: 'stop-1',
      expectedVersion: 0,
      actor: 'principal',
      reason: 'emergency stop',
    }
  );
  assert.throws(() => store.transact(() => {}, { expectedVersion: 0 }), {
    code: 'VERSION_CONFLICT',
  });
  assert.throws(() => store.transact(() => {}, { eventId: 'stop-1' }), {
    code: 'EVENT_REPLAY',
  });
  assert.throws(
    () =>
      store.transact((state) => {
        state.stopped = false;
        throw new Error('failure');
      }),
    /failure/
  );
  const checkpoint = store.head();
  const state = store.read();
  store.close();
  store = openStore(path, { expectedCheckpoint: checkpoint });
  assert.deepEqual(store.verify().state, state);
  assert.equal(store.read().stopped, true);
  store.close();
});

test('K01 independently retained head detects suffix truncation even with a rewritten local state', (t) => {
  const path = temporary(t);
  const store = openStore(path);
  store.transact(
    (state) => {
      state.stopped = true;
    },
    { eventId: 'stop' }
  );
  const checkpoint = store.head();
  store.close();
  const db = new DatabaseSync(path);
  const genesis = db.prepare('SELECT state FROM genesis').get().state;
  db.exec('DELETE FROM chronicle');
  db.prepare('UPDATE institution SET version=0,head=?,state=?').run(
    'sha256:' + '0'.repeat(64),
    genesis
  );
  db.close();
  assert.throws(() => openStore(path, { expectedCheckpoint: checkpoint }), {
    code: 'CHECKPOINT_MISMATCH',
  });
});

test('K01 database writers serialize changes and observe the latest version', (t) => {
  const path = temporary(t);
  const a = openStore(path);
  const b = openStore(path);
  a.transact(
    (state) => {
      state.budgets.shared = '5';
    },
    { expectedVersion: 0 }
  );
  assert.throws(
    () =>
      b.transact(
        (state) => {
          state.budgets.shared = '100';
        },
        { expectedVersion: 0 }
      ),
    { code: 'VERSION_CONFLICT' }
  );
  b.transact((state) => {
    state.budgets.shared = String(BigInt(state.budgets.shared) - 3n);
  });
  assert.equal(a.read().budgets.shared, '2');
  a.close();
  b.close();
});

test('Knowledge storage does not imply admission; amendments preserve negative knowledge', (t) => {
  const store = openStore(temporary(t));
  const entry = {
    id: 'failure-1',
    kind: 'negative-knowledge',
    status: 'proposed',
    scope: 'invoice',
    rights: 'synthetic',
    sources: ['receipt-1'],
    producer: 'producer',
  };
  recordKnowledge(store, entry, { actor: 'producer', role: 'producer' });
  assert.deepEqual(queryKnowledge(store, { scope: 'invoice' }), []);
  assert.throws(
    () =>
      recordKnowledge(
        store,
        { ...entry, status: 'admitted' },
        { actor: 'producer', role: 'knowledge-custodian' }
      ),
    { code: 'ROLE_CONFLICT' }
  );
  recordKnowledge(
    store,
    { ...entry, status: 'admitted' },
    { actor: 'custodian', role: 'knowledge-custodian' }
  );
  assert.equal(queryKnowledge(store, { scope: 'invoice' }).length, 1);
  assert.equal(
    store.read().knowledge['failure-1'].amendments[0].status,
    'proposed'
  );
  store.close();
});

test('K02/K04 clean JSON restore retains negative knowledge but restores no permission', async () => {
  const original = await pack();
  const transported = JSON.parse(JSON.stringify(original));
  assert.equal((await verifyMissionPack(transported)).authenticated, false);
  const restored = await restoreMissionPack(transported);
  assert.deepEqual(restored.activeAuthority, []);
  assert.equal(restored.proofCurrency, 'absent');
  assert.equal(restored.executionEnabled, false);
  const descendant = await createSuccessor(restored, {
    id: 'successor-2',
    supplier: 'deterministic-rule-engine-b',
  });
  assert.equal(descendant.knowledge[0].digest, original.artifacts[0].digest);
  assert.equal(descendant.proofCurrency, 'absent');
  assert.deepEqual(descendant.authority, []);
});

test('K03 pack rejects tampering, traversal, secrets, permissions and unexpected fields', async () => {
  const p = await pack();
  p.artifacts[0].content.observed = 'passed';
  await assert.rejects(verifyMissionPack(p), { code: 'PACK_DIGEST' });
  for (const path of [
    '../escape',
    '/absolute',
    'https://example.com/payload',
    'a//b',
    'a/./b',
  ])
    await assert.rejects(
      createMissionPack({
        institutionId: 'i',
        missionId: 'm',
        artifacts: [{ ...artifact(), path }],
      }),
      { code: 'PACK_PATH' }
    );
  for (const content of [
    { privateKey: 'secret' },
    { activeAuthority: [] },
    { protectedLabels: [1] },
    { data: '-----BEGIN PRIVATE KEY-----' },
  ])
    await assert.rejects(
      createMissionPack({
        institutionId: 'i',
        missionId: 'm',
        artifacts: [{ ...artifact(), content }],
      }),
      { code: 'PACK_SECRET' }
    );
  await assert.rejects(
    verifyMissionPack({ ...(await pack()), execute: 'payload' }),
    { code: 'PACK_SCHEMA' }
  );
  await assert.rejects(
    createMissionPack({
      institutionId: 'i',
      missionId: 'm',
      artifacts: [{ ...artifact(), rights: 'reference-only' }],
    }),
    { code: 'PACK_RIGHTS' }
  );
});

test('K01 state rejects symlinks and knowledge rejects malformed expiry', (t) => {
  const path = temporary(t);
  const linked = path + '.link';
  symlinkSync(path, linked);
  assert.throws(() => openStore(linked), { code: 'STORE_PATH_UNSAFE' });
  const store = openStore(path);
  assert.throws(
    () =>
      recordKnowledge(
        store,
        {
          id: 'k',
          status: 'admitted',
          scope: 'm',
          rights: 'synthetic',
          sources: [],
          producer: 'p',
          expiresAt: 'zzz',
        },
        { actor: 'custodian', role: 'knowledge-custodian' }
      ),
    { code: 'KNOWLEDGE_EXPIRY_INVALID' }
  );
  store.close();
});
test('K03 known credential aliases and modified restored lineage fail', async () => {
  for (const key of [
    'authorization',
    'seedPhrase',
    'secretKey',
    'access_token',
  ])
    await assert.rejects(
      createMissionPack({
        institutionId: 'i',
        missionId: 'm',
        artifacts: [
          { ...artifact(), content: { [key]: 'synthetic-sentinel' } },
        ],
      }),
      { code: 'PACK_SECRET' }
    );
  const restored = await restoreMissionPack(await pack());
  restored.artifacts[0].content.status = 'accepted';
  await assert.rejects(
    createSuccessor(restored, { id: 'child', supplier: 'b' }),
    { code: 'PACK_DIGEST' }
  );
});
