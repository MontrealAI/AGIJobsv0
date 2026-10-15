import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluate, parseScenario } from '../../demo/zenith-sapience/engine.mjs';
const raw = readFileSync(
  new URL('../../demo/zenith-sapience/scenario.json', import.meta.url),
  'utf8'
);
const scenario = () => JSON.parse(raw);
test('unknown reported cost holds proposals without substituting zero', () => {
  const r = evaluate(scenario());
  assert.equal(r.reported, null);
  assert.equal(r.reportedComplete, false);
  assert.deepEqual(r.unknownJobIds, ['archive']);
  assert.equal(r.regions[2].reportedVarianceUnits, null);
  assert.deepEqual(r.proposals, []);
  assert.deepEqual(r.proposalHoldReasons, ['reported-costs-incomplete']);
});
test('global headroom does not hide regional deficit; exact conserved proposal', () => {
  const s = scenario();
  s.jobs[2].reportedUnits = '20000';
  const r = evaluate(s);
  assert.equal(r.reported.budget.remainingAfterRewards, '10000');
  assert.ok(r.reported.findings.includes('REGION_OVER_BUDGET:north'));
  assert.deepEqual(r.proposals, [
    { fromRegionId: 'central', toRegionId: 'north', units: '5000' },
  ]);
  assert.equal(r.uncoveredDeficitUnits, '0');
  assert.equal(r.fullyFundedAfterProposal, true);
  assert.equal(r.conserved, true);
  assert.equal(r.transfersExecuted, false);
  assert.equal(r.costAttested, false);
});
test('insufficient global funds retain uncovered deficit', () => {
  const s = scenario();
  s.jobs[0].reportedUnits = '80000';
  s.jobs[2].reportedUnits = '20000';
  const r = evaluate(s);
  assert.equal(r.uncoveredDeficitUnits, '25000');
  assert.equal(r.fullyFundedAfterProposal, false);
  assert.equal(
    r.proposals.reduce((n, p) => n + BigInt(p.units), 0n),
    15000n
  );
});
test('unbalanced regional envelope holds all proposals', () => {
  const s = scenario();
  s.jobs[2].reportedUnits = '20000';
  s.totalUnits = '110000';
  const r = evaluate(s);
  assert.equal(r.allocationBalanced, false);
  assert.deepEqual(r.proposals, []);
  assert.equal(r.uncoveredDeficitUnits, null);
});
test('large exact amounts stay strings without floating point loss', () => {
  const s = scenario();
  s.totalUnits = '999999999999999999999999';
  s.regions[0].allocationUnits = '999999999999999999939999';
  s.jobs[2].reportedUnits = '20000';
  const r = evaluate(s);
  assert.equal(r.planned.budget.allocated, s.totalUnits);
  assert.equal(
    r.reported.budget.remainingAfterRewards,
    '999999999999999999909999'
  );
});
test('duplicate keys, nonfinite/numeric amounts, duplicate regions and unknown fields reject', () => {
  for (const text of ['{"x":1,"x":2}', '{"x":NaN}', '{"x":1.5}'])
    assert.throws(() => parseScenario(text));
  for (const mutate of [
    (s) => (s.jobs[0].reportedUnits = 1),
    (s) => (s.jobs[0].reportedUnits = '-1'),
    (s) => (s.regions[1].id = 'north'),
    (s) => (s.regions[1].name = 'North'),
    (s) => (s.extra = true),
    (s) => (s.jobs[0].regionId = 'missing'),
    (s) => (s.jobs[1].id = s.jobs[0].id),
  ]) {
    const s = scenario();
    mutate(s);
    assert.throws(() => evaluate(s));
  }
});
test('reordered input preserves exact values and deterministic region priority', () => {
  const s = scenario();
  s.jobs[2].reportedUnits = '20000';
  const before = structuredClone(s);
  assert.deepEqual(evaluate(s), evaluate(s));
  assert.deepEqual(s, before);
});
test('CLI emits useful incomplete result and friendly errors', () => {
  const run = spawnSync(process.execPath, ['demo/zenith-sapience/run.mjs'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).reportedComplete, false);
  const missing = spawnSync(
    process.execPath,
    ['demo/zenith-sapience/run.mjs', '/does-not-exist'],
    { encoding: 'utf8', timeout: 5000 }
  );
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Cannot reconcile/);
  assert.doesNotMatch(missing.stderr, /at file:/);
});

test('no deficit and held proposals remain distinct outcomes', () => {
  const s = scenario();
  s.jobs[0].reportedUnits = '35000';
  s.jobs[2].reportedUnits = '20000';
  const complete = evaluate(s);
  assert.deepEqual(complete.proposals, []);
  assert.deepEqual(complete.proposalHoldReasons, []);
  assert.equal(complete.fullyFundedAfterProposal, true);
  const unknown = evaluate(scenario());
  assert.deepEqual(unknown.proposals, []);
  assert.equal(unknown.fullyFundedAfterProposal, false);
  assert.equal(unknown.proposalHoldReasons.length, 1);
});

test('CLI rejects BOM and non-UTF8 input bytes without normalization', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'zenith-encoding-'));
  const file = join(directory, 'scenario.json');
  const run = () => spawnSync(process.execPath, ['demo/zenith-sapience/run.mjs', file], { encoding: 'utf8', timeout: 5000 });
  try {
    writeFileSync(file, raw);
    assert.equal(run().status, 1, 'valid fixture reaches incomplete-cost evaluation');
    for (const bytes of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(raw)]), Buffer.from(raw, 'utf16le'), Buffer.from([0xff, 0x7b, 0x7d])]) {
      writeFileSync(file, bytes);
      const result = run();
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Cannot reconcile/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
