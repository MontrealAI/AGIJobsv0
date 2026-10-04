import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewSession } from '../preview-model.mjs';
import { normalizeJobIntentPlan } from '../app.mjs';
const run = (session, text) => { const plan = session.plan(text); return session.execute(plan.intent, plan.planHash); };

test('preview completes a coherent lifecycle and exports explicitly simulated evidence', () => {
  const session = createPreviewSession();
  assert.equal(run(session, 'Post a software audit for 5 AGIALPHA').jobId, 1);
  assert.throws(() => run(session, 'Finalize job 1'), /while it is created/);
  for (const text of ['Apply job 1','Submit job 1 with reproducible evidence','Validate job 1','Finalize job 1']) run(session,text);
  const evidence = session.evidence();
  assert.equal(evidence.jobs[0].status,'finalized');
  assert.equal(evidence.events.length,5);
  assert.equal(evidence.chainTransactions,0);
  assert.equal(evidence.productionApproved,false);
  evidence.jobs[0].status='corrupted';
  assert.equal(session.jobs()[0].status,'finalized');
});

test('rejected review, dispute, confirmation binding and independent sessions', () => {
  const session = createPreviewSession();
  const plan = session.plan('Post an audit');
  assert.throws(() => session.execute({ ...plan.intent, reward_agialpha:'500' },plan.planHash), /changed/);
  session.execute(plan.intent,plan.planHash);
  assert.throws(() => session.execute(plan.intent,plan.planHash), /already used/);
  for (const text of ['Apply job 1','Submit job 1','Validate job 1 reject','Dispute job 1']) run(session,text);
  assert.equal(session.jobs()[0].status,'disputed');
  assert.throws(() => run(session,'Finalize job 1'), /disputed/);
  assert.throws(() => run(createPreviewSession(),'Apply job 1'), /does not exist/);
  assert.throws(() => session.plan('Finalize'), /job number/);
});

test('real backend intent.kind and planHash survive frontend normalization', () => {
  const plan = normalizeJobIntentPlan({ intent:{kind:'post_job',title:'Audit'},summary:'Review',planHash:'0xabc',createdAt:'2026-10-04T00:00:00Z',requiresConfirmation:true });
  assert.equal(plan.kind,'job-intent');
  assert.equal(plan.intent.kind,'post_job');
  assert.equal(plan.planHash,'0xabc');
});
