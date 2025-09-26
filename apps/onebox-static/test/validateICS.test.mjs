import test from 'node:test';
import assert from 'node:assert/strict';
import { validateICS } from '../lib.mjs';

const BASE_INTENT = {
  intent: 'submit_work',
  params: {},
};

test('accepts confirmationText and normalises it to summary', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: '   Send 5 AGIALPHA   ',
  };
  const normalized = validateICS(payload);
  assert.equal(normalized.summary, 'Send 5 AGIALPHA');
  assert.equal(normalized.confirm, true);
});

test('accepts legacy summary field when confirmationText missing', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    summary: 'Legacy summary',
  };
  const normalized = validateICS(payload);
  assert.equal(normalized.summary, 'Legacy summary');
});

test('enforces 140 character limit when confirmation is required', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: 'x'.repeat(141),
  };
  assert.throws(() => validateICS(payload), /140/);
});

test('generates a fallback traceId when missing', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    summary: 'Needs trace',
  };
  const normalized = validateICS(payload);
  assert.ok(normalized.meta?.traceId);
  assert.equal(typeof normalized.meta.traceId, 'string');
  assert.ok(normalized.meta.traceId.trim().length > 0);
});

function renderConfirmPrompt(payload) {
  const normalized = validateICS(payload);
  const messages = [];
  if (normalized.confirm) {
    const summary = normalized.summary || 'Please confirm to continue.';
    messages.push(summary);
    messages.push('Type YES to confirm or NO to cancel.');
  }
  return messages;
}

test('confirmationText prompts appear before confirmation instructions', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: 'Pay validator',
  };
  const messages = renderConfirmPrompt(payload);
  assert.deepEqual(messages, [
    'Pay validator',
    'Type YES to confirm or NO to cancel.',
  ]);
});

test('legacy summary prompts still render correctly', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    summary: 'Legacy prompt',
  };
  const messages = renderConfirmPrompt(payload);
  assert.deepEqual(messages, [
    'Legacy prompt',
    'Type YES to confirm or NO to cancel.',
  ]);
});
