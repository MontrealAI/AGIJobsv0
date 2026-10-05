'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const planner = require('./playbook.cjs');
function verifyArtifacts(root = planner.DEMO, inputs = planner.loadInputs()) {
  const read = (file) =>
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const report = read('ui/export/latest.json');
  const expected = planner.buildPlaybook(inputs, {
    ratio: report.token.redenominationFactor,
    newDecimals: report.token.targetDecimals,
    newSymbol: report.token.targetSymbol,
    newName: report.token.targetName,
    scenario: report.meta.scenario,
    rounding: report.token.rounding,
    currentSupplyTokens: report.token.supplyBefore?.tokens,
  });
  // Round-trip removes optional undefined fields, as the persisted JSON does.
  const comparable = (value) => JSON.parse(JSON.stringify(value));
  for (const key of [
    'token',
    'modules',
    'governance',
    'configSnapshots',
    'timeline',
    'invariants',
    'verification',
    'references',
    'computerWork',
  ]) {
    assert.deepEqual(
      report[key],
      comparable(expected[key]),
      `Saved ${key} differs from source configuration and conversion`
    );
  }
  const { generatedAt, ...meta } = report.meta;
  const { generatedAt: ignored, ...expectedMeta } = expected.meta;
  assert.ok(
    typeof generatedAt === 'string' && Number.isFinite(Date.parse(generatedAt)),
    'Invalid generation timestamp'
  );
  assert.deepEqual(
    meta,
    expectedMeta,
    'Source hashes or execution status differ'
  );
  assert.deepEqual(
    read('config/stake-manager-redenominated.json'),
    report.configSnapshots.stakeManager,
    'Stake draft differs from saved plan'
  );
  assert.deepEqual(
    read('config/job-registry-redenominated.json'),
    report.configSnapshots.jobRegistry,
    'Job draft differs from saved plan'
  );
  return report;
}
module.exports = { verifyArtifacts };
