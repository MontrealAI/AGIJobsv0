const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectOwnerAssignments,
  collectPausedContracts,
} = require('../lib/diagnostics.js');

test('collectOwnerAssignments groups contracts by owner address', () => {
  const surface = {
    jobRegistry: { owner: { status: 'ok', owner: '0xabc' } },
    stakeManager: { owner: { status: 'ok', owner: '0xdef' } },
    systemPause: { owner: { status: 'ok', owner: '0xabc' } },
  };
  const assignments = collectOwnerAssignments(surface);
  assert.deepEqual(assignments, [
    { owner: '0xabc', contracts: ['Job registry', 'System pause'] },
    { owner: '0xdef', contracts: ['Stake manager'] },
  ]);
});

test('collectOwnerAssignments ignores missing or non-ok statuses', () => {
  const surface = {
    jobRegistry: { owner: { status: 'error' } },
    stakeManager: { owner: { status: 'ok', owner: '' } },
    systemPause: { owner: { status: 'missing' } },
  };
  const assignments = collectOwnerAssignments(surface);
  assert.deepEqual(assignments, []);
});

test('collectPausedContracts lists paused subsystems', () => {
  const surface = {
    jobRegistry: { paused: { status: 'ok', paused: true } },
    stakeManager: { paused: { status: 'ok', paused: false } },
    systemPause: { paused: { status: 'unsupported' } },
  };
  const paused = collectPausedContracts(surface);
  assert.deepEqual(paused, ['Job registry']);
});

test('collectPausedContracts ignores unresolved pause states', () => {
  const surface = {
    jobRegistry: { paused: { status: 'error' } },
    stakeManager: { paused: { status: 'missing' } },
    systemPause: { paused: { status: 'unsupported' } },
  };
  const paused = collectPausedContracts(surface);
  assert.deepEqual(paused, []);
});
