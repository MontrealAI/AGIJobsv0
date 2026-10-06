import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  analyze,
  parseSource,
  runAnalysis,
  makeWorkOrder,
  digest,
  workTypes,
  capacity,
  json,
  reportCsv,
} from '../core.mjs';
import { reviewEvidence } from '../review.mjs';
const base = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const source = fs.readFileSync(path.join(base, 'project-plan.json'), 'utf8');
const legacy = fs.readFileSync(
  path.join(base, 'fixtures/legacy-project-plan.json'),
  'utf8'
);
const copy = () => JSON.parse(source);
test('corrected allocation ledger and dependency path match known totals', () => {
  const a = analyze(parseSource(source));
  assert.deepEqual(a.budget, {
    total: '1250000000',
    allocated: '1250000000',
    unallocated: '0',
    rewards: '1128000000',
    remainingAfterRewards: '122000000',
  });
  assert.equal(a.regions.length, 6);
  assert.equal(a.timeline.length, 11);
  assert.equal(a.criticalPathDays, 286);
  assert.deepEqual(a.findings, []);
  assert.equal(
    a.timeline.find((j) => j.id === 'EARTH-SYSTEMS-INTEGRATION').startDay,
    228
  );
});
test('legacy fixture reproduces all original accounting and timing defects', () => {
  const a = analyze(parseSource(legacy));
  assert.equal(a.budget.unallocated, '77000000');
  assert.deepEqual(a.findings, [
    'ALLOCATION_TOTAL_MISMATCH',
    'REGION_OVER_BUDGET:AFRICA',
    'REGION_OVER_BUDGET:MENA',
    'REGION_OVER_BUDGET:EARTH',
    'TIMING_POLICY_UNSPECIFIED',
  ]);
  assert.deepEqual(copy().jobs, JSON.parse(legacy).jobs);
  assert.deepEqual(copy().participants, JSON.parse(legacy).participants);
});
test('exact integer arithmetic survives amounts above Number safe range', () => {
  const p = copy();
  p.budget.total = '999999999999999999999';
  p.budget.allocations['Global Governance Reserve'] = '999999999998827999999';
  const a = analyze(parseSource(json(p)));
  assert.equal(a.budget.unallocated, '0');
});
test('cycles, unknown edges, duplicate IDs and malformed budgets fail closed', () => {
  for (const mutate of [
    (p) => p.jobs[0].dependencies.push(p.jobs.at(-1).id),
    (p) => p.jobs[0].dependencies.push('missing'),
    (p) => (p.jobs[1].id = p.jobs[0].id),
    (p) => (p.jobs[0].reward = 1),
    (p) => (p.budget.total = '-1'),
    (p) => (p.jobs[0].deadlineDays = 0),
    (p) => (p.regions[1].name = p.regions[0].name),
    (p) => p.jobs[1].dependencies.push(p.jobs[1].dependencies[0]),
  ]) {
    const p = copy();
    mutate(p);
    assert.throws(() => parseSource(json(p)));
  }
});
test('independent checker handles jobs listed in reverse dependency order', async () => {
  const p = copy();
  p.jobs.reverse();
  const bytes = json(p);
  const bundle = await runAnalysis(bytes);
  assert.equal((await reviewEvidence(bundle, bytes)).passed, true);
});
test('fresh evidence passes and exact input byte changes are rejected', async () => {
  const b = await runAnalysis(source);
  assert.equal((await reviewEvidence(b, source)).passed, true);
  assert.equal((await reviewEvidence(b, source + '\n')).passed, false);
});
test('rehashed arithmetic, schedule, CSV and report tampering are rejected', async () => {
  for (const name of ['analysis.json', 'allocations.csv', 'report.md']) {
    const b = await runAnalysis(source),
      a = b.artifacts.find((x) => x.name === name);
    if (name === 'analysis.json') {
      const v = JSON.parse(a.content);
      v.budget.rewards = '1';
      v.criticalPathDays = 1;
      a.content = json(v);
    } else a.content += 'forged result';
    a.sha256 = await digest(a.content);
    const review = await reviewEvidence(b, source);
    assert.equal(review.passed, false);
    assert.ok(
      review.checks.some((c) => !c.passed && /calculations/.test(c.name))
    );
  }
});
test('missing artifacts, duplicates, oversize and fabricated live claims cannot pass', async () => {
  for (const mutate of [
    (b) => b.artifacts.pop(),
    (b) => (b.artifacts[0] = b.artifacts[1]),
    (b) => (b.providerCalls = 1),
    (b) => (b.independentReviewerAuthenticated = true),
    (b) => (b.buyerAccepted = true),
    (b) => (b.artifacts[0].content = ' '.repeat(1048577)),
  ]) {
    const b = await runAnalysis(source);
    mutate(b);
    assert.equal((await reviewEvidence(b, source)).passed, false);
  }
  assert.equal((await reviewEvidence(null, source)).passed, false);
});
test('all sixty proposals bind approved source, exact USDC, roles and default-deny authority', async () => {
  for (const type of workTypes)
    for (const region of copy().regions) {
      const task = await makeWorkOrder(source, type.id, region.id, {
        budgetUSDC: '1500.123456',
      });
      assert.equal(task.sourceSha256, await digest(source));
      assert.equal(task.budget.maxRewardBaseUnits, '1500123456');
      assert.equal(task.budget.escrowFunded, false);
      assert.equal(task.acceptanceCriteria.length, 3);
      assert.equal(Object.values(task.authorization).some(Boolean), false);
      assert.equal(task.roles.independentReviewer, 'unassigned');
    }
});
test('proposal budget and limits reject invalid precision, ranges and nonfinite values', async () => {
  for (const budgetUSDC of [
    '0',
    '-1',
    '1e3',
    '0.0000001',
    '100001',
    'Infinity',
    'NaN',
  ])
    await assert.rejects(
      makeWorkOrder(source, undefined, undefined, { budgetUSDC })
    );
  for (const reviewerMinutes of [0, -1, 1.5, Infinity, NaN, '15'])
    await assert.rejects(
      makeWorkOrder(source, undefined, undefined, { reviewerMinutes })
    );
  await assert.rejects(makeWorkOrder(source, 'unknown'));
});
test('capacity respects reviewer, worker and demand bottlenecks including zero', () => {
  const c = capacity();
  assert.equal(c.workerCapacity, 50000);
  assert.equal(c.reviewCapacity, 20000);
  assert.equal(c.accepted, 16000);
  assert.equal(c.illustrativeRewardVolumeUSDC, 24000000);
  assert.equal(capacity({ reviewHoursPerDay: 0 }).accepted, 0);
  assert.equal(capacity({ workers: 0 }).accepted, 0);
  assert.equal(capacity({ annualDemand: 10 }).accepted, 8);
  assert.equal(capacity({ acceptancePercent: 0 }).accepted, 0);
  for (const input of [
    { reviewMinutes: 0 },
    { days: NaN },
    { workers: '100' },
    { annualDemand: -1 },
    { acceptancePercent: 101 },
  ])
    assert.throws(() => capacity(input));
});
test('CSV escapes spreadsheet formulas and quotes in untrusted labels', () => {
  const a = analyze(parseSource(source));
  a.regions[0].name = '=SUM(1,2)"';
  assert.match(reportCsv(a), /"'=SUM\(1,2\)"""/);
});
test('CLI generates evidence, checks it and refuses overwrite or unknown flags', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hypernova-cli-')),
    out = path.join(dir, 'run');
  const cli = path.join(base, 'workbench/cli.mjs');
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  try {
    assert.equal(run('run', '--out', out).status, 0);
    assert.equal(
      run(
        'review',
        '--source',
        path.join(out, 'source-plan.json'),
        '--evidence',
        path.join(out, 'evidence.json')
      ).status,
      0
    );
    assert.equal(run('run', '--out', out).status, 1);
    assert.equal(run('run', '--execute').status, 1);
    const b = JSON.parse(fs.readFileSync(path.join(out, 'evidence.json')));
    b.buyerAccepted = true;
    fs.writeFileSync(path.join(dir, 'bad.json'), json(b));
    assert.equal(
      run('review', '--evidence', path.join(dir, 'bad.json')).status,
      2
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('report preparation preserves existing evidence and refuses symlink roots', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hypernova-path-')),
    bin = path.join(temp, 'demo/hypernova/bin');
  fs.mkdirSync(bin, { recursive: true });
  const helper = path.join(bin, 'prepare-reports.cjs');
  fs.copyFileSync(path.join(base, 'bin/prepare-reports.cjs'), helper);
  const run = () =>
    spawnSync(process.execPath, [helper, 'kit'], { encoding: 'utf8' });
  try {
    assert.equal(run().status, 0);
    fs.writeFileSync(
      path.join(temp, 'reports/zenith-hypernova/old.txt'),
      'evidence'
    );
    assert.equal(run().status, 0);
    const archive = fs
      .readdirSync(path.join(temp, 'reports'))
      .find((s) => s.startsWith('zenith-hypernova-previous-'));
    assert.equal(
      fs.readFileSync(
        path.join(temp, 'reports', archive, 'reports/old.txt'),
        'utf8'
      ),
      'evidence'
    );
    fs.renameSync(path.join(temp, 'reports'), path.join(temp, 'real-reports'));
    fs.symlinkSync(path.join(temp, 'real-reports'), path.join(temp, 'reports'));
    assert.notEqual(run().status, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test('wrappers reject nonlocal and traversal network names before touching reports', () => {
  for (const NETWORK of ['mainnet', '../../sentinel', '']) {
    const args = NETWORK === '' ? ['--execute'] : [];
    const r = spawnSync(
      'bash',
      [path.join(base, 'bin/zenith-hypernova-local.sh'), ...args],
      { env: { ...process.env, NETWORK }, encoding: 'utf8' }
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /requires NETWORK=localhost/);
  }
  const r = spawnSync('bash', [path.join(base, 'bin/zenith-hypernova.sh')], {
    env: { ...process.env, HARDHAT_NETWORK: 'mainnet' },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
});
