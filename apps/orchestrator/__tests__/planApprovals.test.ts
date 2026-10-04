import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanApprovalStore } from '../planApprovals';

test('approval binds every intent field and can be consumed only once', () => {
  const store = new PlanApprovalStore();
  const intent = { kind: 'post_job', reward: '5', nested: { title: 'Audit', deadline: 7 } };
  const hash = store.issue(intent);
  assert.throws(() => store.consume(hash, { ...intent, reward: '500' }), /changed/);
  store.consume(hash, { nested: { deadline: 7, title: 'Audit' }, reward: '5', kind: 'post_job' });
  assert.throws(() => store.consume(hash, intent), /already attempted/);
  assert.throws(() => store.consume(undefined, intent), /missing/);
  assert.notEqual(store.issue(intent), store.issue(intent));
});

test('expired plans fail closed and the outstanding plan bound recovers after expiry', () => {
  let now = 0;
  const store = new PlanApprovalStore(() => now, 100, 1);
  const hash = store.issue({ kind: 'finalize', job_id: 1 });
  assert.throws(() => store.issue({}), /Too many/);
  now = 100;
  assert.throws(() => store.consume(hash, { kind: 'finalize', job_id: 1 }), /expired/);
  assert.ok(store.issue({}));
});
