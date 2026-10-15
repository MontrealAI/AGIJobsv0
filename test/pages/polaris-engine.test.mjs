import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPolarisSite } from '../../scripts/pages/polaris-build.mjs';
import { calculate } from '../../demo/polaris-concordat/web/calculator.mjs';
import { parseJSON } from '../../demo/polaris-concordat/web/json.mjs';
const require = createRequire(import.meta.url),
  original = require('../../demo/polaris-concordat/review.cjs'),
  fixture = JSON.parse(
    fs.readFileSync('demo/polaris-concordat/local-fixture.json')
  );
test('calculator remains a separate fixed-policy hypothesis', () => {
  assert.equal(fixture.policyBefore.requiredApprovals, '2');
  assert.equal(fixture.policyBefore.approvalThresholdPct, '66');
  assert.equal(fixture.policyBefore.revealQuorumPct, '100');
  assert.equal(fixture.policyBefore.nonRevealPenaltyBps, '100');
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      const r = calculate(a, b);
      assert.equal(r.firstExpectedSuccess, a === 3);
      assert.equal(r.replacementExpectedSuccess, b >= 2);
      assert.equal(r.executed, false);
      assert.equal(r.chainAttested, false);
    }
  for (const n of [-1, 4, 1.2, true]) assert.throws(() => calculate(n, 3));
});
test('strict bounded parser rejects duplicates, nonfinite and oversized evidence', () => {
  for (const raw of [
    '{"a":1,"a":2}',
    '{"a":NaN}',
    '{"a":1.0}',
    ' '.repeat(262145),
  ])
    assert.throws(() => parseJSON(raw));
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseJSON(JSON.stringify(fixture)))),
    fixture
  );
});
test('browser bundle reuses original receipt reviewer for exact fixture and tamper parity', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-browser-'));
  try {
    await buildPolarisSite(temp);
    const bundled = await import(
      pathToFileURL(path.join(temp, 'reviewer.mjs'))
    );
    assert.equal(bundled.review(fixture).accepted, true);
    const mutations = [
      (p) => (p.first.observedSuccess = true),
      (p) => (p.recovery.receipt.status = 0),
      (p) => (p.first.receipt.logs[0].transactionHash = '0x' + '0'.repeat(64)),
      (p) => (p.policyAfter.requiredApprovals = '1'),
      (p) => (p.contracts.token.mock = false),
      (p) => (p.employerAfterFirst = '0'),
      (p) => (p.firstStakes[0].stake = '0'),
      (p) => (p.recovery.committee[0] = p.first.committee[0]),
      (p) => (p.first.committee[1] = p.first.committee[0]),
      (p) =>
        (p.first.committee[1] =
          '0x' + p.first.committee[0].slice(2).toUpperCase()),
      (p) => (p.recovery.requestedApprovalCount = 0),
      (p) => (p.first.receipt.logs = []),
      (p) => (p.liveAssets = true),
    ];
    for (const change of mutations) {
      const p = structuredClone(fixture);
      change(p);
      const expected = original.review(p);
      assert.equal(expected.accepted, false);
      assert.deepEqual(bundled.review(p), expected);
    }
    const forged = structuredClone(fixture);
    forged.review = { accepted: false, chainAttested: true };
    assert.deepEqual(bundled.review(forged), original.review(fixture));
    assert.equal(bundled.review(forged).chainAttested, false);
    assert.equal(
      fs.readFileSync(path.join(temp, 'fixture.json'), 'utf8'),
      fs.readFileSync('demo/polaris-concordat/local-fixture.json', 'utf8')
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
