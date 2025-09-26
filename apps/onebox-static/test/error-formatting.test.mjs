import test from 'node:test';
import assert from 'node:assert/strict';

import { formatError, FRIENDLY_ERROR_RULES } from '../lib.mjs';

test('friendly error catalogue exposes at least 20 rules', () => {
  assert.ok(
    FRIENDLY_ERROR_RULES.length >= 20,
    `expected 20+ error rules, received ${FRIENDLY_ERROR_RULES.length}`
  );
});

test('insufficient allowance errors are mapped to actionable guidance', () => {
  const err = new Error('execution reverted: InsufficientAllowance');
  const message = formatError(err);
  assert.match(message, /allowance/i);
  assert.match(message, /Tip:/);
});

test('network failures are detected and translated', () => {
  const err = new Error('TypeError: Failed to fetch');
  const message = formatError(err);
  assert.match(message, /network/i);
  assert.match(message, /Tip:/);
});

test('429 responses surface rate limiting guidance', () => {
  const err = new Error('Too Many Requests');
  err.status = 429;
  const message = formatError(err);
  assert.match(message, /too quickly/i);
  assert.match(message, /Tip:/);
});

test('fallback preserves original message when no rule matches', () => {
  const err = new Error('Subtle custom orchestrator error');
  const message = formatError(err);
  assert.equal(message, 'Subtle custom orchestrator error');
});
