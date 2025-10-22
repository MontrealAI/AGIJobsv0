import test from 'node:test';
import assert from 'node:assert/strict';

import { computeAuthHeaders, parseShortcutExamplesInput } from '../app.mjs';

const { Headers } = globalThis;

test('computeAuthHeaders merges bearer token into plain header objects', () => {
  const headers = computeAuthHeaders({ Accept: 'application/json' }, 'demo-token');
  assert.deepEqual(headers, {
    Accept: 'application/json',
    Authorization: 'Bearer demo-token',
  });
});

test('computeAuthHeaders clones headers when token missing', () => {
  const original = { Accept: 'application/json' };
  const headers = computeAuthHeaders(original, '');
  assert.notStrictEqual(headers, original);
  assert.deepEqual(headers, { Accept: 'application/json' });
});

test('computeAuthHeaders appends authorization to Headers instances', {
  skip: typeof Headers !== 'function',
}, () => {
  const base = new Headers({ Accept: 'application/json' });
  const result = computeAuthHeaders(base, 'abc123');
  assert.equal(result.get('Authorization'), 'Bearer abc123');
  assert.equal(base.get('Authorization'), null);
});

test('computeAuthHeaders replaces existing Authorization entries in arrays', () => {
  const base = [['Authorization', 'Bearer stale'], ['Accept', 'application/json']];
  const result = computeAuthHeaders(base, 'fresh');
  assert.ok(result.some(([key]) => key.toLowerCase() === 'authorization'));
  assert.deepEqual(
    result.filter(([key]) => key.toLowerCase() === 'authorization'),
    [['Authorization', 'Bearer fresh']]
  );
});

test('computeAuthHeaders rejects tokens containing control characters', () => {
  const headers = computeAuthHeaders({ Accept: 'application/json' }, 'abc\r\nInjected: yep');
  assert.deepEqual(headers, { Accept: 'application/json' });
});

test('computeAuthHeaders rejects tokens with invalid symbols', () => {
  const headers = computeAuthHeaders({ Accept: 'application/json' }, 'token<>');
  assert.deepEqual(headers, { Accept: 'application/json' });
});

test('parseShortcutExamplesInput accepts JSON, newline, and pipe separated formats', () => {
  const parsed = parseShortcutExamplesInput('["Launch mission","Finalize job 12"]');
  assert.deepEqual(parsed, ['Launch mission', 'Finalize job 12']);
  const multi = parseShortcutExamplesInput('Investigate agents\nPost research | Finalize job 77');
  assert.deepEqual(multi, ['Investigate agents', 'Post research', 'Finalize job 77']);
});

test('parseShortcutExamplesInput de-duplicates and trims prompts', () => {
  const parsed = parseShortcutExamplesInput(['  Deploy  ', 'Deploy', 'Review report']);
  assert.deepEqual(parsed, ['Deploy', 'Review report']);
});
