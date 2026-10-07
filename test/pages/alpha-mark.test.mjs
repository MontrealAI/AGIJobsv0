import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  modelCapacity,
  createAlphaMarkPlan,
  formatUsdc,
} from '../../website/assets/alpha-mark-model.mjs';
import { workTypes } from '../../website/assets/work-model.mjs';
import { renderAlphaMarkPage } from '../../scripts/pages/alpha-mark.mjs';

const input = (extra = {}) => ({
  type: 'science',
  goal: 'Reproduce the specified public numerical result.',
  scope:
    'Reproduce every reported total with tolerance 0.001 and document units.',
  sources: 'https://example.org/public-data',
  runtime: 'openclaw',
  workerProfile: 'research',
  dataClass: 'public',
  reward: '1500',
  dailyBudget: '15000',
  runMinutes: '60',
  reviewerMinutes: '30',
  workers: '8',
  jobsPerWorker: '2',
  reviewers: '2',
  minutesPerReviewer: '120',
  ...extra,
});

test('review capacity bounds work even when worker supply grows', () => {
  const model = modelCapacity(input());
  assert.deepEqual(model.slots, { worker: 16, reviewer: 8, rewardBudget: 10 });
  assert.equal(model.candidateJobs, 8);
  assert.deepEqual(model.bottlenecks, ['reviewer']);
  assert.equal(model.reservedRewardsBaseUnits, '12000000000');
  assert.equal(model.unallocatedRewardsBaseUnits, '3000000000');
  assert.equal(model.reviewMinutesReserved, 240);
  assert.equal(modelCapacity(input({ workers: '10000' })).candidateJobs, 8);
  assert.equal(model.forecast, false);
});

test('micro-USDC arithmetic stays exact at budget boundaries', () => {
  const model = modelCapacity(
    input({ reward: '0.333333', dailyBudget: '0.999998' })
  );
  assert.equal(model.candidateJobs, 2);
  assert.equal(model.reservedRewardsBaseUnits, '666666');
  assert.equal(model.unallocatedRewardsBaseUnits, '333332');
  assert.equal(
    modelCapacity(input({ reward: '0.000001', dailyBudget: '0.000001' }))
      .candidateJobs,
    1
  );
  assert.equal(
    modelCapacity(input({ reward: '2', dailyBudget: '1' })).candidateJobs,
    0
  );
  assert.equal(formatUsdc('1000001'), '1.000001');
  assert.equal(formatUsdc('15000000000'), '15,000');
});

test('fractional review slots are rounded down and every limiting resource is reported', () => {
  const model = modelCapacity(
    input({
      workers: '1',
      jobsPerWorker: '2',
      reviewers: '1',
      minutesPerReviewer: '89',
      reward: '1500',
      dailyBudget: '3000',
    })
  );
  assert.equal(model.candidateJobs, 2);
  assert.deepEqual(model.bottlenecks, ['worker', 'reviewer', 'rewardBudget']);
  assert.equal(
    modelCapacity(input({ minutesPerReviewer: '1' })).candidateJobs,
    0
  );
});

test('invalid and out-of-bounds numeric fields cannot enter the model', () => {
  for (const field of [
    'workers',
    'jobsPerWorker',
    'reviewers',
    'minutesPerReviewer',
    'reviewerMinutes',
  ]) {
    for (const value of [
      '',
      '0',
      '-1',
      '1.5',
      'NaN',
      'Infinity',
      '1e2',
      '999999999999999999',
      2,
    ])
      assert.throws(
        () => modelCapacity(input({ [field]: value })),
        /whole number/
      );
  }
  for (const field of ['reward', 'dailyBudget']) {
    for (const value of ['0', '-1', '1.0000001', '1000001', '1e3', 'NaN', ''])
      assert.throws(() => modelCapacity(input({ [field]: value })));
  }
});

test('preparation acknowledgments never grant authority or fabricate evidence', () => {
  const incomplete = createAlphaMarkPlan(input());
  assert.equal(incomplete.status, 'preparation-incomplete');
  assert.equal(incomplete.missing.length, 3);
  assert.equal(
    createAlphaMarkPlan(input({ reviewPlanned: 'true' })).preparation
      .reviewPlanned,
    false
  );
  for (const type of workTypes) {
    const draft = createAlphaMarkPlan(
      input({
        type: type.id,
        authorityPlanned: true,
        inputsPlanned: true,
        reviewPlanned: true,
      })
    );
    assert.equal(draft.status, 'draft-for-operator-review');
    assert.equal(draft.productionApproved, false);
    assert.equal(draft.simulation, true);
    assert.equal(draft.proposal.commercialProposal.currency, 'USDC');
    assert.equal(draft.proposal.commercialProposal.escrowFunded, false);
    assert.ok(
      Object.values(draft.proposal.authorization).every(
        (value) => value === false
      )
    );
    assert.equal(draft.proposal.evidence.providerCalls, 0);
    assert.equal(draft.proposal.evidence.chainTransactions, 0);
    assert.equal(draft.proposal.task.schemaVersion, 1);
    assert.equal(draft.proposal.task.deliverables.at(-1).name, 'evidence.json');
  }
});

test('task creation reuses source boundaries and preserves entered content as data', () => {
  for (const sources of [
    'http://example.org',
    'https://user:secret@example.org',
    'https://example.org?secret=1',
  ])
    assert.throws(() => createAlphaMarkPlan(input({ sources })));
  const draft = createAlphaMarkPlan(
    input({ goal: '<img src=x onerror=alert(1)>' })
  );
  assert.equal(draft.proposal.task.goal, '<img src=x onerror=alert(1)>');
  assert.deepEqual(draft.proposal.task.allowedOrigins, ['https://example.org']);
});

test('page has a readable no-JavaScript path and every initial action is disabled', () => {
  const document = new JSDOM(
    renderAlphaMarkPage('/AGIJobsv0/', (file) => '/guides/' + file)
  ).window.document;
  assert.equal(document.querySelectorAll('main#main').length, 1);
  assert.equal(document.querySelectorAll('#mark-type option').length, 10);
  assert.match(
    document.querySelector('noscript').textContent,
    /needs JavaScript/
  );
  for (const button of document.querySelectorAll('button'))
    assert.equal(button.disabled, true);
  assert.equal(document.querySelector('#alpha-mark-result').hidden, true);
  const original = fs.readFileSync('scripts/pages/featured.mjs', 'utf8');
  assert.match(original, /experiments\/alpha-agi-mark\//);
});
