'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { review } = require('../computer-work/review.cjs');
const root = path.join(__dirname, '../computer-work');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const example = () => JSON.parse(read('conversion.example.json'));
const dossier = read('dossier.example.md');
test('independent evaluator accepts reconciled fixture without settlement approval', () => {
  const result = review(example(), dossier);
  assert.equal(result.accepted, true);
  assert.equal(result.accountsChecked, 5);
  assert.equal(result.productionApproved, false);
  assert.equal(result.settlementApproved, false);
  assert.equal(example().totals.aggregateFloorDifferenceRaw, '1');
});
for (const [label, change] of [
  [
    'incorrect conversion',
    (r) => {
      r.accounts[0].targetRaw = '1000001';
    },
  ],
  [
    'discarded dust',
    (r) => {
      r.accounts[2].remainderNumerator = '0';
    },
  ],
  [
    'omitted liability',
    (r) => {
      r.accounts.pop();
    },
  ],
  [
    'duplicate account',
    (r) => {
      r.accounts[1].id = 'alice';
    },
  ],
  [
    'wrong source',
    (r) => {
      r.sourceSha256 = '0'.repeat(64);
    },
  ],
  [
    'aggregate floor substituted for allocations',
    (r) => {
      r.totals.targetRaw = r.totals.floorOfAggregateRaw;
    },
  ],
  [
    'unsafe numeric amount',
    (r) => {
      r.accounts[0].targetRaw = 1000000;
    },
  ],
  [
    'claimed approval',
    (r) => {
      r.productionApproved = true;
    },
  ],
])
  test(`independent evaluator rejects ${label}`, () => {
    const result = example();
    change(result);
    assert.throws(() => review(result, dossier));
  });
test('dossier and exact source identification are required', () => {
  assert.throws(() => review(example(), ''));
  assert.throws(() => review(example(), 'No source hash. '.repeat(20)));
});
test('worker template preserves admission boundary and approved synthetic fixture', () => {
  const task = JSON.parse(read('task.json')),
    profile = JSON.parse(read('worker-profiles.example.json'));
  assert.equal(task.workerProfile, 'redenomination');
  assert.equal(task.dataClass, 'synthetic');
  assert.deepEqual(task.allowedOrigins, ['http://127.0.0.1:4174']);
  assert.deepEqual(profile.redenomination.approvedJobs, []);
  assert.ok(task.inputText.includes(example().sourceSha256));
  const embedded = JSON.parse(task.inputText.split('Ledger: ')[1]);
  assert.deepEqual(embedded, JSON.parse(read('ledger.json')));
});
