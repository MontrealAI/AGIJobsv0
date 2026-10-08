import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnderwriting,
  advanceUnderwriting,
  createPromotionRequest,
  SEIZE_STAGES,
} from '../src/underwriting.mjs';
import { createInvoiceMission } from '../src/invoice.mjs';
import { digestObject } from '../src/integrity.mjs';

async function fixture() {
  const mission = createInvoiceMission();
  const evidenceDigests = [await digestObject('fixture', { observed: true })];
  const record = await createUnderwriting(mission, {
    trigger: 'Investigate invoice discrepancy',
    evidenceDigests,
    now: '2026-10-08T00:00:00Z',
  });
  return { mission, evidenceDigests, record };
}
const decision = (stage, fixture) => ({
  stage,
  actor: fixture.mission.principal,
  timestamp: '2026-10-08T00:00:00Z',
  reason: 'Compare before spending; stop if evidence is insufficient.',
  evidenceDigests: fixture.evidenceDigests,
});

test('SEIZE binds five decisions and ends in a proof request, never authority', async () => {
  const context = await fixture();
  let record = context.record;
  for (const stage of SEIZE_STAGES) {
    const event = decision(stage, context);
    if (stage === 'ZERO_IN')
      event.experiment = {
        question: 'Can source reconciliation change the hold decision?',
        stopCondition: 'Stop at the evidence budget.',
        costBaseUnits: '100',
        unit: context.mission.budget.unit,
      };
    if (stage === 'ELEVATE')
      event.candidateDigest = await digestObject('fixture-candidate', {
        version: 1,
      });
    record = await advanceUnderwriting(record, event, context);
  }
  const request = await createPromotionRequest(record, context);
  assert.equal(request.status, 'REQUESTED_NOT_PROVEN');
  assert.equal(request.authorityCreated, 'NONE');
  assert.equal(record.history.length, 5);
});
test('SEIZE forbids skipped stages and new evidence without renewed review', async () => {
  const context = await fixture();
  await assert.rejects(
    () =>
      advanceUnderwriting(
        context.record,
        decision('ELEVATE', context),
        context
      ),
    (error) => error.code === 'UNDERWRITING_STAGE_INVALID'
  );
  const event = decision('SURFACE', context);
  event.evidenceDigests = [await digestObject('fixture', { changed: true })];
  await assert.rejects(
    () => advanceUnderwriting(context.record, event, context),
    (error) => error.code === 'UNDERWRITING_STALE'
  );
});
test('comparator, objective or evidence changes invalidate underwriting commitments', async () => {
  const context = await fixture();
  context.mission.alternatives[0].description =
    'A stronger comparator is now available';
  await assert.rejects(
    () =>
      advanceUnderwriting(
        context.record,
        decision('SURFACE', context),
        context
      ),
    (error) => error.code === 'UNDERWRITING_STALE'
  );
});
