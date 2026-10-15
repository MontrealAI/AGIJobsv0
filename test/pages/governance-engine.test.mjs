import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluate } from '../../demo/solving-alpha-agi-governance/web/engine.mjs';
const sourceRoot = process.env.GOVERNANCE_SOURCE_ROOT || process.cwd();
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(sourceRoot, 'demo/solving-alpha-agi-governance/scenario.json')
  )
);
test('default proposal and independent policy rejections', () => {
  const result = evaluate(fixture);
  assert.equal(result.accepted, true);
  assert.equal(result.approvedWeight, 70);
  assert.equal(result.remainingCentsIfApproved, 80000);
  assert.equal(result.enacted, false);
  for (const [field, edit] of [
    ['quorum', (s) => (s.policy.quorumPercent = 95)],
    ['approval', (s) => (s.policy.approvalPercent = 90)],
    ['budget', (s) => (s.proposal.availableCents = 1)],
    ['ownerControls', (s) => (s.controls = ['budget', 'review'])],
  ]) {
    const s = structuredClone(fixture);
    edit(s);
    const r = evaluate(s);
    assert.equal(r.accepted, false);
    assert.deepEqual(r.reasons, [field]);
    assert.equal(r.settlementApproved, false);
  }
});
test('abstentions remain in approval denominator and invalid inputs reject', () => {
  const s = structuredClone(fixture);
  s.votes[1].choice = 'abstain';
  assert.equal(evaluate(s).checks.approval, false);
  for (const edit of [
    (s) => (s.policy.eligibleWeight = true),
    (s) => (s.proposal.requestedCents = 0.1),
    (s) => (s.extra = 1),
    (s) => (s.controls = []),
    (s) => s.votes.push({ ...s.votes[0] }),
    (s) => (s.policy.eligibleWeight = 1),
  ]) {
    const invalid = structuredClone(fixture);
    edit(invalid);
    assert.throws(() => evaluate(invalid));
  }
});
test('80 scenarios match independent Python full-result output', () => {
  const cases = [];
  for (let i = 0; i < 80; i++) {
    const s = structuredClone(fixture);
    s.policy.quorumPercent = 1 + ((i * 17) % 100);
    s.policy.approvalPercent = 1 + ((i * 31) % 100);
    s.proposal.availableCents = (i * 18731) % 700000;
    if (i % 3 === 0) s.controls = ['budget', 'review'];
    if (i % 4 === 0) s.votes[1].choice = 'abstain';
    cases.push(s);
  }
  const script =
    "import importlib.util,json,sys;spec=importlib.util.spec_from_file_location('rehearsal',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps([m.evaluate(s) for s in json.load(sys.stdin)]))";
  const child = spawnSync(
    'python3',
    [
      '-c',
      script,
      path.join(sourceRoot, 'demo/solving-alpha-agi-governance/run.py'),
    ],
    { input: JSON.stringify(cases), encoding: 'utf8' }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(cases.map(evaluate), JSON.parse(child.stdout));
});
test('bounded import rejects duplicates and numeric ambiguity, ignores evidence results', async () => {
  const { parseScenario } = await import(
    '../../demo/solving-alpha-agi-governance/web/engine.mjs'
  );
  const text = JSON.stringify(fixture);
  for (const bad of [
    text.replace('"eligibleWeight":100', '"eligibleWeight":100.0'),
    text.replace('"eligibleWeight":100', '"eligibleWeight":1e2'),
    text.replace(
      '"eligibleWeight":100',
      '"eligibleWeight":100,"eligibleWeight":100'
    ),
    text.replace('"eligibleWeight":100', '"eligibleWeight":NaN'),
    text + 'x',
  ])
    assert.throws(() => parseScenario(bad));
  const imported = parseScenario(
    JSON.stringify({
      schema: 'agijobs.governance-browser-evidence.v1',
      scenario: fixture,
      result: { accepted: false },
      downloadedScenarioSha256: 'untrusted',
      hashScope: 'untrusted',
    })
  );
  assert.deepEqual(evaluate(imported), evaluate(fixture));
});
