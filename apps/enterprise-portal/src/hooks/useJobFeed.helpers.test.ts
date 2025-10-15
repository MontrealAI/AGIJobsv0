import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeFromBlock } from './useJobFeed.helpers';

test('computeFromBlock returns undefined when querying a specific job', async () => {
  const provider = { getBlockNumber: async () => 10 };
  const result = await computeFromBlock(provider, { jobId: 1n });
  assert.equal(result, undefined);
});

test('computeFromBlock clamps the fromBlock to zero on short chains', async () => {
  const provider = { getBlockNumber: async () => 1000 };
  const result = await computeFromBlock(provider, {});
  assert.equal(result, 0);
});

test('computeFromBlock subtracts the history window when available', async () => {
  const provider = { getBlockNumber: async () => 60_123 };
  const result = await computeFromBlock(provider, {});
  assert.equal(result, 10_123);
});
