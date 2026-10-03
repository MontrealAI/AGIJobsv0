const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const location = {
  physicalLocation: {
    artifactLocation: { uri: 'contracts/v2/Example.sol' },
    region: { startLine: 10 },
  },
};
const finding = {
  ruleId: '0-0-arbitrary-send-erc20',
  level: 'warning',
  message: {
    text: 'Example.deposit transfers tokens from a caller-selected payer.',
  },
  locations: [location],
};
const rule = {
  id: finding.ruleId,
  name: 'arbitrary-send-erc20',
  properties: { 'security-severity': '8.0' },
};
const approved = {
  ruleId: rule.name,
  relativeUri: 'contracts/v2/Example.sol',
  messageContains: 'Example.deposit',
};

function report(result = finding, metadata = rule) {
  return {
    runs: [{ tool: { driver: { rules: [metadata] } }, results: [result] }],
  };
}

function run(sarif, allowlist = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agi-slither-policy-'));
  try {
    const input = path.join(dir, 'slither.sarif');
    const approvals = path.join(dir, 'allowlist.json');
    writeFileSync(input, JSON.stringify(sarif));
    writeFileSync(approvals, JSON.stringify(allowlist));
    return spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../../tools/security/validate-slither.mjs'),
        input,
        approvals,
      ],
      { encoding: 'utf8' }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('blocks Slither high-security warnings using rule metadata', () => {
  const result = run(report());
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /Total unapproved findings: 1/);
});

test('accepts only an exception matching detector, file, and function', () => {
  assert.equal(run(report(), [approved]).status, 0);
  for (const key of ['ruleId', 'relativeUri', 'messageContains']) {
    assert.equal(
      run(report(), [{ ...approved, [key]: 'different' }]).status,
      3
    );
  }
});

test('resolves severity from ruleIndex and the high-severity boundary', () => {
  const result = { ...finding, ruleId: undefined, ruleIndex: 0 };
  assert.equal(
    run(report(result, { ...rule, properties: { 'security-severity': '7.0' } }))
      .status,
    3
  );
  assert.equal(
    run(report(result, { ...rule, properties: { 'security-severity': '6.9' } }))
      .status,
    0
  );
});

test('still blocks explicit error, high, and critical result levels', () => {
  for (const level of ['error', 'high', 'critical']) {
    assert.equal(
      run(report({ ...finding, level }, { ...rule, properties: {} })).status,
      3
    );
  }
});

test('rejects empty reports, incomplete runs, invalid severities, and broad exceptions', () => {
  for (const invalid of [{}, { runs: [] }, { runs: [{}] }]) {
    assert.equal(run(invalid).status, 2);
  }
  for (const severity of ['', 'NaN', '-1', '11']) {
    assert.equal(
      run(
        report(finding, {
          ...rule,
          properties: { 'security-severity': severity },
        })
      ).status,
      2
    );
  }
  assert.equal(run(report(), [{}]).status, 2);
  assert.equal(run(report(), {}).status, 2);
  assert.equal(
    run(report({ ...finding, level: undefined }, { ...rule, properties: {} }))
      .status,
    2
  );
});

test('accepts a completed analysis with no findings', () => {
  const sarif = report();
  sarif.runs[0].results = [];
  assert.equal(run(sarif).status, 0);
});
