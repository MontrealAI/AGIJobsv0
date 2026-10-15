'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  requireLocal,
  restoreSnapshot,
  validateOptions,
} = require('../../demo/polaris-concordat/run.cjs');
const { review } = require('../../demo/polaris-concordat/review.cjs');
const root = path.resolve(__dirname, '../..');
function run(reveals, approvals) {
  const output = execFileSync(
    process.execPath,
    [
      'demo/polaris-concordat/run.cjs',
      '--initial-reveals',
      String(reveals),
      '--replacement-approvals',
      String(approvals),
    ],
    { cwd: root, timeout: 60000, encoding: 'utf8', env: process.env }
  );
  const summary = JSON.parse(output.trim().split('\n').at(-1));
  return JSON.parse(fs.readFileSync(summary.report, 'utf8'));
}
test('rejects invalid and unknown scenario controls', () => {
  for (const x of [
    null,
    {},
    { initialReveals: 1, replacementApprovals: 4 },
    { initialReveals: true, replacementApprovals: 3 },
    { initialReveals: 1, replacementApprovals: 3, network: 'mainnet' },
  ])
    assert.throws(() => validateOptions(x));
});
test('rejects remote, forked, and impersonated local providers before deployment', async () => {
  for (const network of [
    { name: 'localhost', config: { chainId: 31337 } },
    { name: 'hardhat', config: { chainId: 1 } },
    { name: 'hardhat', config: { chainId: 31337, url: 'http://localhost' } },
    { name: 'hardhat', config: { chainId: 31337, forking: { enabled: true } } },
    {
      name: 'hardhat',
      config: { chainId: 31337 },
      provider: { send: async () => '0x7a69' },
    },
  ])
    await assert.rejects(requireLocal({ network }));
});
test('real EVM penalizes missing reveals and restores availability without changing quorum', () => {
  const result = run(1, 3);
  assert.equal(result.first.observedSuccess, false);
  assert.equal(result.recovery.observedSuccess, true);
  assert.equal(result.review.accepted, true);
  assert.equal(result.employerAfterFirst, '20000000000000000000');
  assert.deepEqual(result.policyBefore, result.policyAfter);
  const reordered = structuredClone(result);
  reordered.policyAfter = Object.fromEntries(
    Object.entries(reordered.policyAfter).reverse()
  );
  assert.equal(review(reordered).accepted, true);
  const recased = structuredClone(result);
  recased.first.committee = recased.first.committee.map((a) => a.toLowerCase());
  recased.recovery.committee = recased.recovery.committee.map((a) =>
    a.toLowerCase()
  );
  assert.equal(review(recased).accepted, true);
  for (const mutate of [
    (x) => (x.first.committee[1] = x.first.committee[0].toLowerCase()),
    (x) => (x.recovery.committee[0] = x.first.committee[0].toLowerCase()),
    (x) => (x.firstStakes[0].address = '0x' + '12'.repeat(20)),
    (x) => {
      x.policyBefore.approvalThresholdPct = '50';
      x.policyAfter.approvalThresholdPct = '50';
    },
    (x) => (x.first.requestedRevealCount = 2),
    (x) => (x.first.extra = 'ignored'),

    (x) => (x.first.receipt.logs[0].transactionHash = '0x' + '00'.repeat(32)),
    (x) => (x.first.receipt.logs[0].index = -1),
    (x) => (x.employerAfterFirst = '0'),
    (x) => (x.firstStakes[1].stake = x.initialStakePerValidator),
    (x) => (x.recovery.observedSuccess = false),
    (x) => (x.policyAfter.revealQuorumPct = '50'),
    (x) => (x.contracts.token.mock = false),
    (x) => (x.recovery.committee[0] = x.first.committee[0]),
  ]) {
    const changed = structuredClone(result);
    mutate(changed);
    assert.equal(review(changed).accepted, false);
  }
});
test('zero initial reveals still requires a full fresh replacement committee', () => {
  const result = run(0, 3);
  assert.equal(result.review.accepted, true);
  assert.equal(result.first.observedSuccess, false);
  assert.equal(result.recovery.observedSuccess, true);
  assert.equal(result.employerAfterFirst, '30000000000000000000');
});
test('full replacement participation cannot bypass approval threshold', () => {
  const result = run(3, 1);
  assert.equal(result.review.accepted, true);
  assert.equal(result.first.observedSuccess, true);
  assert.equal(result.recovery.observedSuccess, false);
  assert.equal(result.employerAfterFirst, '0');
});
test('two approvals with all three reveals satisfies actual two-thirds policy', () => {
  const result = run(2, 2);
  assert.equal(result.review.accepted, true);
  assert.equal(result.first.observedSuccess, false);
  assert.equal(result.recovery.observedSuccess, true);
});
test('malformed evidence is a failed review rather than an uncaught exception', () => {
  for (const x of [null, {}, [], { policyBefore: {} }])
    assert.equal(review(x).accepted, false);
});

test('snapshot cleanup fails closed on false or unavailable revert', async () => {
  await assert.rejects(
    restoreSnapshot({ send: async () => false }, '0x1'),
    /cleanup failed/
  );
  await assert.rejects(
    restoreSnapshot(
      {
        send: async () => {
          throw Error('provider gone');
        },
      },
      '0x1'
    ),
    /provider gone/
  );
  await restoreSnapshot(
    {
      send: async (method, args) => {
        assert.equal(method, 'evm_revert');
        assert.deepEqual(args, ['0x1']);
        return true;
      },
    },
    '0x1'
  );
});
