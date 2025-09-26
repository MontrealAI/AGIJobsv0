import test from 'node:test';
import assert from 'node:assert/strict';
import { drainSSEBuffer } from '../app.mjs';

function collectEvents() {
  const events = [];
  return {
    events,
    drain(buffer) {
      return drainSSEBuffer(buffer, (chunk) => {
        const normalized = chunk.startsWith('data:') ? chunk.slice(5).trim() : chunk;
        if (!normalized) {
          return;
        }
        events.push(JSON.parse(normalized));
      });
    },
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
