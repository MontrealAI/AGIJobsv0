import test from 'node:test';
import assert from 'node:assert/strict';
import { drainSSEBuffer, sanitizeSSEChunk } from '../sse-parser.mjs';

function collectEvents() {
  const events = [];
  const consume = (chunk) => {
    const normalized = sanitizeSSEChunk(chunk);
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
  buffer = drain(buffer);
  assert.equal(events.length, 0);

  buffer += '\r\n';
  buffer = drain(buffer);
  assert.equal(buffer, '');

  assert.deepEqual(events, [{ text: 'hello' }]);
});

test('drainSSEBuffer handles mixed line endings across multiple events', () => {
  const { events, drain } = collectEvents();
  let buffer = '';

  buffer += 'data: {"text":"first"}\r\n\r\n';
  buffer = drain(buffer);

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
test('sanitizeSSEChunk strips data prefixes and whitespace', () => {
  assert.equal(sanitizeSSEChunk('data: {"foo":1}\r\n'), '{"foo":1}');
  assert.equal(sanitizeSSEChunk('   {"foo":2}  '), '{"foo":2}');
  assert.equal(sanitizeSSEChunk('data:   '), '');
});
