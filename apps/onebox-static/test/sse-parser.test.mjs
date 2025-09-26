import test from 'node:test';
import assert from 'node:assert/strict';
import { drainSSEBuffer } from '../app.mjs';

function collectEvents() {
  const events = [];
  const consume = (chunk) => {
    const normalized = chunk.startsWith('data:') ? chunk.slice(5).trim() : chunk.trim();
    if (!normalized) {
      return;
    }
    events.push(JSON.parse(normalized));
  };
  return {
    events,
    drain(buffer) {
      return drainSSEBuffer(buffer, consume);
    },
    consume,
  };
}

test('drainSSEBuffer parses CRLF-delimited events', () => {
  const { events, drain } = collectEvents();
  let buffer = '';

  buffer += 'data: {"text":"hello"}\r\n';
  buffer = drain(buffer.replace(/\r\n/g, '\n'));
  assert.equal(events.length, 0);

  buffer += '\r\n';
  buffer = drain(buffer.replace(/\r\n/g, '\n'));
  assert.equal(buffer, '');

  assert.deepEqual(events, [{ text: 'hello' }]);
});

test('drainSSEBuffer handles mixed line endings across multiple events', () => {
  const { events, drain } = collectEvents();
  let buffer = '';

  buffer += 'data: {"text":"first"}\r\n\r\n';
  buffer = drain(buffer.replace(/\r\n/g, '\n'));

  buffer += 'data: {"text":"second"}\n\n';
  buffer = drain(buffer);

  assert.equal(buffer, '');
  assert.deepEqual(events, [{ text: 'first' }, { text: 'second' }]);
});

test('executor-style parser surfaces final event without trailing blank line', () => {
  const { events, drain, consume } = collectEvents();
  let buffer = '';
  const chunks = [
    'data: {"text":"crlf"}\r\n',
    '\r\n',
    'data: {"text":"lf"}\n\n',
    'data: {"text":"tail"}\r\n',
  ];

  for (const chunk of chunks) {
    buffer += chunk;
    buffer = buffer.replace(/\r\n/g, '\n');
    buffer = drain(buffer);
  }

  const finalChunk = buffer.trim();
  if (finalChunk) {
    consume(finalChunk);
  }

  assert.deepEqual(events, [
    { text: 'crlf' },
    { text: 'lf' },
    { text: 'tail' },
  ]);
});
