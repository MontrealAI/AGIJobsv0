import test from 'node:test';
import assert from 'node:assert/strict';

import { formatEvent } from '../lib.mjs';

test('preserves structured advanced payloads for key/value rendering', () => {
  const payload = {
    type: 'receipt',
    text: 'Finalized job 42',
    advanced: {
      txHash: '0xabc123',
      blockNumber: 123456,
      gasUsed: '21000',
    },
  };

  const formatted = formatEvent(payload);
  assert.equal(formatted.text, '✅ Finalized job 42');
  assert.deepEqual(formatted.advanced, payload.advanced);
});

test('trims whitespace in advanced strings while keeping message text', () => {
  const formatted = formatEvent({ type: 'status', text: 'Simulated', advanced: '   {"ok":true}   ' });
  assert.equal(formatted.text, 'Simulated');
  assert.equal(formatted.advanced, '{"ok":true}');
});

test('stringifies non-object advanced payloads safely', () => {
  const formatted = formatEvent({ type: 'guardrail', text: 'Spend cap hit', advanced: 5 });
  assert.equal(formatted.advanced, '5');
});
