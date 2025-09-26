import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadStaticLib() {
  const url = new URL('../lib.js', import.meta.url);
  const source = await readFile(url, 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

const { validateICS } = await loadStaticLib();

const BASE_INTENT = {
  intent: 'submit_work',
  params: {},
};

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

test('trims confirmationText and stores it as summary', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: '   Send 5 AGIALPHA   ',
  };

  const normalized = validateICS(payload);

  assert.equal(normalized.summary, 'Send 5 AGIALPHA');
});

test('rejects confirm payloads missing a usable summary', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: '   ',
  };

  assert.throws(() => validateICS(payload), /Planner confirmation summary missing/);
});

test('rejects confirm payloads with summaries longer than 140 characters', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    confirmationText: 'x'.repeat(141),
  };

  assert.throws(
    () => validateICS(payload),
    /Confirmation summary must be 140 characters or fewer/,
  );
});

test('generates a fallback traceId when none provided', () => {
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

test('uses summary fallback when confirmationText missing', () => {
  const payload = {
    ...BASE_INTENT,
    confirm: true,
    summary: 'Legacy summary',
  };

  const normalized = validateICS(payload);

  assert.equal(normalized.summary, 'Legacy summary');
});

test('confirmation prompt shows trimmed summary before instructions', () => {
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
