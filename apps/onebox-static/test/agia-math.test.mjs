import test from 'node:test';
import assert from 'node:assert/strict';

async function loadLib() {
  const url = new URL('../lib.mjs', import.meta.url);
  return import(url);
}

const { toWei, formatAGIA } = await loadLib();

test('toWei converts decimal strings into 18-decimal BigInt values', () => {
  assert.equal(toWei('0'), 0n);
  assert.equal(toWei('1.5'), 1500000000000000000n);
  assert.equal(toWei('42.125'), 42125000000000000000n);
});

test('toWei accepts bigint and number inputs', () => {
  assert.equal(toWei(2n), 2n);
  assert.equal(toWei(3), 3000000000000000000n);
});

test('toWei rejects malformed inputs', () => {
  assert.throws(() => toWei('abc'), /Invalid AGIA amount/);
  assert.throws(() => toWei('1,23'), /Invalid AGIA amount/);
});

test('formatAGIA trims trailing zeros by default', () => {
  const value = 1500000000000000000n;
  assert.equal(formatAGIA(value), '1.5');
});

test('formatAGIA supports maximum and minimum fraction digit hints', () => {
  const value = toWei('1.234567890123456789');
  assert.equal(formatAGIA(value), '1.234567');
  assert.equal(formatAGIA(value, { maximumFractionDigits: 9 }), '1.23456789');
  assert.equal(formatAGIA(value, { maximumFractionDigits: 4, minimumFractionDigits: 4 }), '1.2345');
});

test('formatAGIA preserves sign information', () => {
  const negative = toWei('-2.75');
  assert.equal(formatAGIA(negative), '-2.75');
});
