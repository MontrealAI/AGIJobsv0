'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  policy,
  checkCompiler,
  checkDiagnostics,
} = require('../../scripts/ci/solidity-policy.cjs');

function build() {
  return {
    solcVersion: '0.8.37',
    solcLongVersion: '0.8.37+commit.f401782d',
    input: {
      sources: {},
      settings: {
        viaIR: true,
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'cancun',
      },
    },
    output: {},
  };
}

test('production compiler identity rejects old, falsely labelled and altered builds', () => {
  checkCompiler(build());
  for (const alter of [
    (b) => {
      b.solcVersion = '0.8.25';
    },
    (b) => {
      b.solcVersion = '0.8.36';
    },
    (b) => {
      b.solcLongVersion = '0.8.37+commit.fake';
    },
    (b) => {
      delete b.solcLongVersion;
    },
    (b) => {
      b.input.settings.viaIR = false;
    },
    (b) => {
      b.input.settings.optimizer.enabled = false;
    },
    (b) => {
      b.input.settings.optimizer.runs = 50;
    },
    (b) => {
      b.input.settings.evmVersion = 'prague';
    },
    (b) => {
      b.input.settings.metadata = { bytecodeHash: 'none' };
    },
    (b) => {
      b.input.settings.metadata = { appendCBOR: false };
    },
    (b) => {
      b.input.settings.optimizer.details = { yul: false };
    },
  ]) {
    const candidate = build();
    alter(candidate);
    assert.throws(() => checkCompiler(candidate), /Production artifacts/);
  }
});

test('compiler errors, project warnings and truncated diagnostic streams fail closed', () => {
  assert.deepEqual(checkDiagnostics(build()), []);
  for (const diagnostic of [
    { severity: 'error', errorCode: '1234', message: 'error' },
    {
      severity: 'warning',
      errorCode: '5667',
      sourceLocation: { file: 'contracts/C.sol' },
      message: 'unused',
    },
    {
      severity: 'warning',
      errorCode: '4591',
      message: 'There are more than 256 warnings',
    },
  ]) {
    const candidate = build();
    candidate.output.errors = [diagnostic];
    assert.throws(
      () => checkDiagnostics(candidate),
      /Unreviewed compiler diagnostic/
    );
  }
  const malformed = build();
  malformed.output.errors = {};
  assert.throws(() => checkDiagnostics(malformed), /Malformed/);
});

test('reviewed upstream deprecations are visible, bounded and bound to exact source bytes', () => {
  const entry = policy.reviewedUpstreamWarnings[0];
  const candidate = build();
  candidate.input.sources[entry.file] = {
    content: fs.readFileSync(
      path.join(__dirname, '../../node_modules', entry.file),
      'utf8'
    ),
  };
  const warning = {
    severity: 'warning',
    errorCode: entry.errorCode,
    sourceLocation: { file: entry.file },
    message: 'Future keyword deprecation',
  };
  candidate.output.errors = [warning];
  assert.equal(checkDiagnostics(candidate).length, 1);
  candidate.input.sources[entry.file].content += '\n';
  assert.throws(() => checkDiagnostics(candidate), /Unreviewed/);
  candidate.input.sources[entry.file].content = fs.readFileSync(
    path.join(__dirname, '../../node_modules', entry.file),
    'utf8'
  );
  candidate.output.errors = Array(entry.maximumCount + 1).fill(warning);
  assert.throws(() => checkDiagnostics(candidate), /Unreviewed/);
  candidate.output.errors = [{ ...warning, severity: 'error' }];
  assert.throws(() => checkDiagnostics(candidate), /Unreviewed/);
  candidate.output.errors = [{ ...warning, errorCode: '5667' }];
  assert.throws(() => checkDiagnostics(candidate), /Unreviewed/);
});
