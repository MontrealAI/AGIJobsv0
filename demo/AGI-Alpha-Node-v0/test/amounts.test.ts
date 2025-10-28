import test from 'node:test';
import assert from 'node:assert/strict';
import { ratioFromWei, weiToEtherNumber } from '../src/utils/amounts';

const ONE = 1_000_000_000_000_000_000n;

test('weiToEtherNumber converts safely for very large values', () => {
  const value = 25_000_000n * ONE; // 25 million ether equivalent
  const converted = weiToEtherNumber(value);
  assert.equal(converted, 25_000_000);
});

test('ratioFromWei handles zero denominator and clamps infinities', () => {
  assert.equal(ratioFromWei(ONE, 0n), 0);
  assert.equal(ratioFromWei(ONE, -ONE), 0);
});

test('ratioFromWei computes floating ratios using token precision', () => {
  const numerator = 5n * ONE;
  const denominator = 2n * ONE;
  const ratio = ratioFromWei(numerator, denominator);
  assert.ok(Math.abs(ratio - 2.5) < 1e-9);
});
