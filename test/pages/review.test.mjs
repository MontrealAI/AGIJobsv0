import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewFixture } from './review-fixture.mjs';
import {
  inspectEvidence,
  createAssessment,
  normalizeReviewTask,
  reviewLimits,
} from '../../website/assets/review-model.mjs';

const fixture = reviewFixture();
const encode = (value) =>
  new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value)
  );
const taskBytes = encode(fixture.task);
const receiptBytes = encode(fixture.receiptText);
const expected = { jobId: '42', deploymentId: 'review-fixture' };
const inspect = (
  receipt = fixture.receipt,
  task = fixture.task,
  identity = expected
) => inspectEvidence(encode(task), encode(receipt), identity);

test('real adapter receipt and persistent journal verify with independent SHA-256', async () => {
  const result = await inspectEvidence(taskBytes, receiptBytes, expected);
  assert.equal(result.fingerprints.taskSha256, fixture.receipt.taskSha256);
  assert.equal(
    result.fingerprints.receiptFileSha256,
    createHash('sha256').update(receiptBytes).digest('hex')
  );
  assert.equal(
    result.fingerprints.taskFileSha256,
    createHash('sha256').update(taskBytes).digest('hex')
  );
  assert.equal(result.simulated, true);
  assert.equal(result.providerAuthenticated, false);
  assert.equal(result.contentAccepted, false);
  assert.equal(result.settlementApproved, false);
  assert.equal(result.productionApproved, false);
  assert.deepEqual(result.artifacts, fixture.receipt.artifacts);
});

test('formatting and key ordering preserve admission digest but change exact-file fingerprint', async () => {
  const reordered = Object.fromEntries(Object.entries(fixture.task).reverse());
  const result = await inspect(
    fixture.receipt,
    JSON.stringify(reordered, null, 4)
  );
  const original = await inspect();
  assert.equal(
    result.fingerprints.taskSha256,
    original.fingerprints.taskSha256
  );
  assert.notEqual(
    result.fingerprints.taskFileSha256,
    original.fingerprints.taskFileSha256
  );
  assert.deepEqual(normalizeReviewTask(reordered), fixture.task);
});

test('task substitution, artifact tampering and cross-job replay fail inspection', async () => {
  for (const change of [
    (r) => {
      r.task.goal = 'A substituted task';
    },
    (r) => {
      r.taskSha256 = '0'.repeat(64);
    },
    (r) => {
      r.jobId = '43';
    },
    (r) => {
      r.deploymentId = 'another-deployment';
    },
    (r) => {
      r.workerProfile = 'another-worker';
    },
    (r) => {
      r.artifacts[0].content += 'tampered';
    },
    (r) => {
      r.artifacts[0].bytes += 1;
    },
    (r) => {
      r.artifacts[0].sha256 = '0'.repeat(64);
    },
    (r) => {
      r.artifacts.pop();
    },
    (r) => {
      r.artifacts[1] = r.artifacts[0];
    },
    (r) => {
      r.artifacts[0].name = '../run.sh';
    },
    (r) => {
      r.artifacts[0].mediaType = 'text/html';
    },
    (r) => {
      r.artifacts[0].content = '\ud800';
    },
    (r) => {
      r.productionApproved = true;
    },
    (r) => {
      r.settlementApproved = true;
    },
    (r) => {
      r.review.status = 'approved';
    },
    (r) => {
      r.status = 'dispatched';
    },
    (r) => {
      r.simulated = 'false';
    },
    (r) => {
      r.attemptId = '<script>';
    },
    (r) => {
      r.completedAt = '2000-01-01T00:00:00.000Z';
    },
    (r) => {
      r.startedAt = '2026-02-30T00:00:00.000Z';
    },
    (r) => {
      r.unrecognizedAuthority = true;
    },
  ]) {
    const changed = structuredClone(fixture.receipt);
    change(changed);
    await assert.rejects(inspect(changed));
  }
  await assert.rejects(
    inspect(fixture.receipt, { ...fixture.task, goal: 'Another goal' })
  );
  await assert.rejects(
    inspect(fixture.receipt, fixture.task, { ...expected, jobId: '042' })
  );
});

test('bounded strict file parsing rejects invalid UTF-8, BOMs, invalid JSON and excess bytes', async () => {
  for (const bad of [
    new Uint8Array([0xc3, 0x28]),
    encode('{'),
    encode('\ufeff' + JSON.stringify(fixture.task)),
    new Uint8Array(reviewLimits.task + 1),
  ])
    await assert.rejects(inspectEvidence(bad, receiptBytes, expected));
  await assert.rejects(
    inspectEvidence(
      taskBytes,
      new Uint8Array(reviewLimits.receipt + 1),
      expected
    )
  );
  const r = structuredClone(fixture.receipt);
  r.artifacts[0].content = 'α'.repeat(64_001);
  r.artifacts[0].bytes = Buffer.byteLength(r.artifacts[0].content);
  r.artifacts[0].sha256 = createHash('sha256')
    .update(r.artifacts[0].content)
    .digest('hex');
  await assert.rejects(inspect(r), /byte count/);
});

test('a fabricated but consistent receipt can pass integrity without authenticating provenance', async () => {
  const fabricated = structuredClone(fixture.receipt);
  fabricated.simulated = false;
  fabricated.artifacts[0].content = 'A fabricated claim';
  fabricated.artifacts[0].bytes = Buffer.byteLength(
    fabricated.artifacts[0].content
  );
  fabricated.artifacts[0].sha256 = createHash('sha256')
    .update(fabricated.artifacts[0].content)
    .digest('hex');
  const result = await inspect(fabricated);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.providerAuthenticated, false);
  assert.equal(result.contentAccepted, false);
});

test('review assessment binds exact evidence and never grants execution or settlement authority', async () => {
  const result = await inspect();
  const input = {
    reviewer: 'fixture-reviewer',
    conflicts: 'Fixture author; not an independent reviewer.',
    notes: 'Synthetic checks only.',
    recommendation: 'accept',
    criteria: result.task.acceptanceCriteria.map(() => ({
      status: 'pass',
      evidence: 'Reproduced in the local test fixture.',
    })),
  };
  const assessment = createAssessment(result, input);
  assert.deepEqual(assessment.fingerprints, result.fingerprints);
  assert.equal(assessment.recommendation, 'accept');
  assert.equal(assessment.simulated, true);
  assert.equal(assessment.status, 'unsigned-reviewer-assessment');
  assert.equal(assessment.reviewer.identityVerified, false);
  for (const key of [
    'providerAuthenticated',
    'buyerAccepted',
    'settlementApproved',
    'productionApproved',
  ])
    assert.equal(assessment[key], false);
  for (const status of ['fail', 'not-checked']) {
    const criteria = input.criteria.map((finding, index) =>
      index ? finding : { ...finding, status }
    );
    assert.throws(
      () => createAssessment(result, { ...input, criteria }),
      /every criterion/
    );
    assert.equal(
      createAssessment(result, { ...input, criteria, recommendation: 'revise' })
        .recommendation,
      'revise'
    );
  }
  assert.throws(() => createAssessment(result, { ...input, criteria: [] }));
  assert.throws(() => createAssessment(result, { ...input, conflicts: '' }));
  assert.throws(() => createAssessment(result, { ...input, notes: '' }));
  assert.throws(() => createAssessment(null, input));
});
