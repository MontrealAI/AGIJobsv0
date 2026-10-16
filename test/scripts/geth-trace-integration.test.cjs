'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateCreationTraces,
} = require('../../scripts/verification/trace-evidence.cjs');
// These are unmodified callTracer/structLogs RPC result objects captured by the
// adjacent local-only harness. No fixture is synthesized from the other trace.
const evidence = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/geth-creation-traces.json'),
    'utf8'
  )
);
const provenance = require('./fixtures/geth-client-provenance.json');
const fixtureBytes = fs.readFileSync(
  path.join(__dirname, 'fixtures/geth-creation-traces.json')
);
assert.equal(
  require('node:crypto')
    .createHash('sha256')
    .update(fixtureBytes)
    .digest('hex'),
  provenance.fixtureSha256
);
assert.equal(provenance.signature_valid, true);
assert.equal(
  provenance.signer_fingerprint,
  provenance.official_linux_builder_fingerprint
);
const get = (name) =>
  structuredClone(evidence.cases.find((f) => f.name === name));
test('genuine isolated Geth call/opcode traces support direct, internal, nested and reverted creation cases', () => {
  assert.equal(evidence.localOnly, true);
  assert.equal(evidence.chainId, '0x539');
  assert.equal(evidence.peers, 0);
  assert.match(evidence.clientVersion, /^Geth\//);
  const expected = {
    'direct-root-with-constructor-child': 2,
    success: 1,
    salted: 1,
    nested: 2,
    failed: 0,
    revertedAncestor: 0,
  };
  for (const [name, count] of Object.entries(expected)) {
    const f = get(name);
    assert.equal(f.validation.canonicalRuntimeMatches, true, name);
    const creations = validateCreationTraces(f);
    assert.equal(creations.length, count, name);
    assert.deepEqual(creations, f.validation.creations, name);
  }
});
test('genuine code-deposit failure and no-entry CREATE2 collision stay conservatively blocked', () => {
  for (const name of ['codeDeposit', 'collision'])
    assert.throws(() => validateCreationTraces(get(name)), undefined, name);
});
test('corrupt genuine outcomes, ancestry, depth, stack, memory or omitted children cannot hide creation', () => {
  const mutations = {
    falseRevert: (f) => {
      f.callTrace.calls[0].error = 'execution reverted';
    },
    omittedChild: (f) => {
      delete f.callTrace.calls;
    },
    depthJump: (f) => {
      f.opcodeTrace.structLogs.find((l) => l.depth === 2).depth = 9;
    },
    absentStack: (f) => {
      delete f.opcodeTrace.structLogs[0].stack;
    },
    absentMemory: (f) => {
      delete f.opcodeTrace.structLogs.find((l) => l.memory?.length).memory;
    },
    parentResult: (f) => {
      const end = f.opcodeTrace.structLogs.findIndex(
        (l) => l.depth === 2 && l.op === 'RETURN'
      );
      const resume = f.opcodeTrace.structLogs[end + 1];
      resume.stack[resume.stack.length - 1] = '0';
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const f = get('success');
    mutate(f);
    assert.throws(() => validateCreationTraces(f), undefined, name);
  }
  const f = get('revertedAncestor');
  delete f.callTrace.calls[0].error;
  assert.throws(() => validateCreationTraces(f));
});
