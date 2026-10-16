'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(
  __dirname,
  '../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE'
);
const desk = require(path.join(root, 'disruption/index.cjs'));
const { analyze } = require('../../demo/asi-takeoff/scripts/plan.cjs');
const source = fs.readFileSync(
  path.join(root, 'project-plan.hyperstructure.json')
);
const original = JSON.parse(source);
const ids = original.jobs.map((j) => j.id);
const clone = () => JSON.parse(source);
const run = (p, c) => desk.analyzeBytes(JSON.stringify(p), c);
const row = (r, n) => r.scenario.jobs[n];
function oracle(p, controls) {
  // Independent iterative relaxation and reachability, no runtime traversal/canonical helpers.
  const delays = new Map((controls.delays || []).map((x) => [x.id, x.days]));
  const blocked = new Set(controls.blockedJobIds || []),
    done = new Map();
  for (let pass = 0; pass < p.jobs.length; pass++)
    for (const j of p.jobs)
      if (j.dependencies.some((d) => blocked.has(d))) blocked.add(j.id);
  while (done.size + blocked.size < p.jobs.length) {
    let changed = false;
    for (const j of [...p.jobs].reverse())
      if (
        !blocked.has(j.id) &&
        !done.has(j.id) &&
        j.dependencies.every((d) => done.has(d))
      ) {
        done.set(
          j.id,
          j.dependencies.reduce((m, d) => Math.max(m, done.get(d)), 0) +
            j.deadlineDays +
            (delays.get(j.id) || 0)
        );
        changed = true;
      }
    if (!changed) throw Error('Oracle stalled');
  }
  let exposure = 0n;
  for (const j of p.jobs)
    if (blocked.has(j.id)) {
      const parts = j.reward.split('.');
      exposure += BigInt(parts[0] + (parts[1] || '').padEnd(18, '0'));
    }
  return { blocked, done, exposure };
}
test('zero-change exact engine parity and source hash preserve whitespace', () => {
  const r = desk.analyzeBytes(source),
    a = analyze(original);
  for (const key of Object.keys(r.baseline))
    assert.deepEqual(r.baseline[key], a[key]);
  assert.equal(r.baseline.allocatedRewards, '1128000');
  assert.equal(r.baseline.unallocatedBudget, '122000');
  assert.equal(r.baseline.criticalPathDays, 211);
  assert.equal(r.scenario.criticalPathDays, 211);
  assert.equal(r.scenario.criticalPathDeltaDays, 0);
  assert.deepEqual(r.scenario.unaffectedJobIds, ids);
  assert.equal(
    r.sourceSha256,
    crypto.createHash('sha256').update(source).digest('hex')
  );
  const spaced = desk.analyzeBytes(Buffer.concat([source, Buffer.from(' ')]));
  assert.notEqual(spaced.sourceSha256, r.sourceSha256);
  assert.deepEqual(spaced.baseline, r.baseline);
  assert.equal(JSON.stringify(r).includes('annualUsd'), false);
  assert.equal(JSON.stringify(r).includes('governance'), false);
});
test('hand-calculated seven-job delay and horizon cases', () => {
  const rootDelay = desk.analyzeBytes(source, {
    delays: [{ id: ids[0], days: 10 }],
    horizonDays: 220,
  });
  assert.equal(rootDelay.scenario.criticalPathDays, 221);
  assert.equal(rootDelay.scenario.scheduleWithinHorizon, false);
  assert.deepEqual(
    rootDelay.scenario.jobs.map((j) => j.finishDeltaDays),
    [10, 10, 10, 10, 10, 10, 10]
  );
  const slack = desk.analyzeBytes(source, {
    delays: [{ id: ids[2], days: 20 }],
    horizonDays: 211,
  });
  assert.equal(slack.scenario.criticalPathDays, 211);
  assert.equal(row(slack, 2).finishDay, 59);
  assert.equal(row(slack, 5).finishDay, 79);
  assert.equal(slack.scenario.scheduleWithinHorizon, true);
  const overtaken = desk.analyzeBytes(source, {
    delays: [{ id: ids[2], days: 30 }],
  });
  assert.equal(overtaken.scenario.criticalPathDays, 214);
  assert.equal(row(overtaken, 4).criticalPredecessor, ids[2]);
});
test('hand-calculated block, descendants, unaffected graph and causal chains', () => {
  const r = desk.analyzeBytes(source, { blockedJobIds: [ids[1]] });
  assert.equal(r.scenario.completionPossible, false);
  assert.equal(r.scenario.criticalPathDays, null);
  assert.equal(r.scenario.criticalPathDeltaDays, null);
  assert.equal(r.scenario.scheduleWithinHorizon, null);
  assert.equal(r.scenario.finiteSubgraphCriticalPathDays, 71);
  assert.equal(r.scenario.blockedRewardExposure, '590000');
  assert.deepEqual(r.scenario.blockedDescendantIds, [ids[4], ids[6]]);
  assert.deepEqual(r.scenario.unaffectedJobIds, [
    ids[0],
    ids[2],
    ids[3],
    ids[5],
  ]);
  assert.deepEqual(row(r, 6).causalChains, [[ids[1], ids[4], ids[6]]]);
  const all = desk.analyzeBytes(source, { blockedJobIds: [ids[0], ids[1]] });
  assert.equal(all.scenario.blockedRewardExposure, '1128000');
  assert.equal(all.scenario.finiteSubgraphCriticalPathDays, 0);
  assert.deepEqual(row(all, 6).blockedBy, [ids[0], ids[1]]);
  assert.equal(
    all.scenario.jobs.every((j) => j.finishDay === null),
    true
  );
});
test('independent exact integer and graph oracle over every single/pair blocked set and delay origins', () => {
  for (let i = 0; i < ids.length; i++)
    for (let k = -1; k < ids.length; k++) {
      const c = {
        blockedJobIds: k < 0 ? [] : [...new Set([ids[i], ids[k]])],
        delays: [{ id: ids[i], days: 37 }],
      };
      const r = desk.analyzeBytes(source, c),
        o = oracle(original, c);
      for (const j of r.scenario.jobs) {
        assert.equal(j.status === 'blocked', o.blocked.has(j.id));
        assert.equal(j.finishDay, o.done.get(j.id) ?? null);
      }
      assert.equal(
        BigInt(r.scenario.blockedRewardExposure) * 10n ** 18n,
        o.exposure
      );
    }
});
test('exact 18-decimal rewards and uint256 boundary rejection', () => {
  const p = clone();
  p.jobs[0].reward = '145000.000000000000000001';
  const r = run(p, { blockedJobIds: [ids[0]] });
  assert.equal(r.scenario.blockedRewardExposure, '1128000.000000000000000001');
  assert.equal(r.baseline.unallocatedBudget, '121999.999999999999999999');
  p.budget.total = '9'.repeat(79);
  assert.throws(() => run(p), /decimal/);
  p.budget.total = '9'.repeat(78);
  assert.throws(() => run(p), /uint256/);
  const max = ((1n << 256n) - 1n).toString();
  p.budget.total = max;
  assert.throws(() => run(p), /uint256/);
  const q = clone();
  q.jobs[0].reward = '0.0000000000000000001';
  assert.throws(() => run(q), /decimal/);
});
test('strict malformed, duplicate escaped keys, rounding, BOM, UTF-8 and unknown fields', () => {
  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":1e400}',
    '{"a":1.0}',
    '{"a":9007199254740993}',
    '{"a":-0}',
    '{"a":NaN}',
    '{"a":1,}',
    '{"a":"\\ud800"}',
  ])
    assert.throws(() => desk.parseStrict(text));
  assert.throws(
    () =>
      desk.analyzeBytes(Buffer.concat([Buffer.from([239, 187, 191]), source])),
    /BOM/
  );
  assert.throws(() => desk.analyzeBytes(new Uint8Array([255])), /UTF-8/);
  assert.throws(
    () => desk.analyzeBytes('x'.repeat(desk.LIMITS.planBytes + 1)),
    /exceeds/
  );
  for (const mutate of [
    (p) => (p.extra = true),
    (p) => (p.jobs[0].extra = true),
    (p) => (p.budget.extra = true),
    (p) => (p.governance.thermostat.extra = true),
    (p) => (p.participants.agents[0].extra = true),
    (p) => (p.reporting.artifacts.extra = true),
  ]) {
    const p = clone();
    mutate(p);
    assert.throws(() => run(p), /Unknown/);
  }
  assert.throws(() => desk.analyzeBytes(source, { delays: null }), /lists/);
  assert.throws(() => desk.analyzeBytes(source, { typo: 1 }), /Unknown/);
});
test('DAG, duplicate, unknown job and bounded arithmetic negatives', () => {
  for (const mutate of [
    (p) => p.jobs.push(p.jobs[0]),
    (p) => p.jobs[0].dependencies.push(ids[6]),
    (p) => p.jobs[0].dependencies.push('missing'),
    (p) => p.jobs[1].dependencies.push(ids[0]),
    (p) => (p.jobs[0].deadlineDays = 365001),
    (p) => (p.jobs[0].deadlineDays = 1.1),
  ]) {
    const p = clone();
    mutate(p);
    assert.throws(() => run(p));
  }
  for (const c of [
    { blockedJobIds: ['missing'] },
    { blockedJobIds: [ids[0], ids[0]] },
    { delays: [{ id: ids[0], days: 365000 }] },
    { delays: [{ id: ids[0], days: -1 }] },
    {
      delays: [
        { id: ids[0], days: 1 },
        { id: ids[0], days: 2 },
      ],
    },
    { horizonDays: 0 },
    { horizonDays: Infinity },
  ])
    assert.throws(() => desk.analyzeBytes(source, c));
});
test('recovery recomputes rather than trusting results or hashes', () => {
  const e = desk.exportRecovery(source, { delays: [{ id: ids[0], days: 2 }] });
  assert.deepEqual(desk.importRecovery(JSON.stringify(e)).report, e.report);
  assert.equal(e.sourceText, source.toString());
  for (const mutate of [
    (e) => e.report.scenario.criticalPathDays++,
    (e) => (e.report.reportSha256 = '0'.repeat(64)),
    (e) => (e.sourceText += ' '),
    (e) => e.controls.delays[0].days++,
    (e) => (e.report.extra = true),
    (e) => (e.extra = true),
  ]) {
    const copy = structuredClone(e);
    mutate(copy);
    assert.throws(() => desk.importRecovery(JSON.stringify(copy)));
  }
});
test('maximum job chain roundtrip and expansion guard', () => {
  const p = {
    initiative: 'Test',
    objective: 'Bounded chain',
    budget: { currency: 'TEST', total: '100' },
    jobs: Array.from({ length: 100 }, (_, i) => ({
      id: 'J' + i,
      title: 'Test',
      reward: '1',
      deadlineDays: 1,
      dependencies: i ? ['J' + (i - 1)] : [],
    })),
  };
  const controls = { delays: p.jobs.map((j) => ({ id: j.id, days: 1 })) };
  // 100 origins on a chain expands materially: either accepted and reopenable, or explicit budget error.
  try {
    const e = desk.exportRecovery(JSON.stringify(p), controls);
    assert.ok(
      Buffer.byteLength(JSON.stringify(e)) <= desk.LIMITS.recoveryBytes
    );
    assert.deepEqual(desk.importRecovery(JSON.stringify(e)).report, e.report);
  } catch (e) {
    assert.match(e.message, /Causal chain output exceeds/);
  }
  const long = structuredClone(p);
  long.jobs.forEach((j, i) => {
    j.id = 'X'.repeat(900) + i;
    j.dependencies = i ? ['X'.repeat(900) + (i - 1)] : [];
  });
  assert.throws(
    () => run(long, { delays: long.jobs.map((j) => ({ id: j.id, days: 1 })) }),
    /Causal chain output exceeds/
  );
  const accepted = desk.exportRecovery(JSON.stringify(p), {
    blockedJobIds: ['J0'],
  });
  assert.deepEqual(
    desk.importRecovery(JSON.stringify(accepted)).report,
    accepted.report
  );
});
test('CLI help/default effect-free; explicit new-directory export, recovery and alias refusal', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omniphoenix-'));
  const cli = path.join(root, 'disruption/cli.cjs');
  const call = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { cwd: tmp, encoding: 'utf8' });
  try {
    assert.equal(call('--help').status, 0);
    assert.equal(call().status, 0);
    assert.deepEqual(fs.readdirSync(tmp), []);
    const out = path.join(tmp, 'out');
    assert.equal(call('--output-dir', out).status, 0);
    const before = fs.readFileSync(path.join(out, 'recovery.json'));
    assert.equal(call('--output-dir', out).status, 1);
    assert.deepEqual(fs.readFileSync(path.join(out, 'recovery.json')), before);
    assert.equal(
      call('--import', path.join(out, 'recovery.json'), '--json').status,
      0
    );
    fs.symlinkSync(out, path.join(tmp, 'alias'), 'dir');
    assert.equal(
      call('--output-dir', path.join(tmp, 'alias', 'nested')).status,
      1
    );
    assert.equal(fs.existsSync(path.join(out, 'nested')), false);
    assert.equal(
      call('--plan', path.join(out, 'recovery.json'), '--plan', 'other').status,
      1
    );
    assert.equal(
      call('--help', '--output-dir', path.join(tmp, 'bad')).status,
      1
    );
    assert.equal(fs.existsSync(path.join(tmp, 'bad')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('exact uint256 scaled boundary, aggregate overflow and independent report hash', () => {
  const max = (1n << 256n) - 1n,
    scale = 10n ** 18n;
  const amount =
    String(max / scale) + '.' + String(max % scale).padStart(18, '0');
  const p = {
    initiative: 'Boundary',
    objective: 'Exactness',
    budget: { currency: 'TEST', total: amount },
    jobs: [
      {
        id: 'a',
        title: 'A',
        reward: amount,
        deadlineDays: 1,
        dependencies: [],
      },
    ],
  };
  const r = run(p, { blockedJobIds: ['a'] });
  assert.equal(r.scenario.blockedRewardExposure, amount);
  assert.equal(r.baseline.unallocatedBudget, '0');
  p.jobs.push({
    id: 'b',
    title: 'B',
    reward: '0.000000000000000001',
    deadlineDays: 1,
    dependencies: [],
  });
  assert.throws(() => run(p), /Total rewards exceed/);
  function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, sorted(value[k])])
      );
    return value;
  }
  const { reportSha256, ...body } = r;
  assert.equal(
    reportSha256,
    crypto
      .createHash('sha256')
      .update(JSON.stringify(sorted(body)))
      .digest('hex')
  );
});
test('disconnected unaffected subgraph and deterministic tie break', () => {
  const p = {
    initiative: 'Branches',
    objective: 'Ties',
    budget: { currency: 'TEST', total: '4' },
    jobs: [
      { id: 'b', title: 'B', reward: '1', deadlineDays: 3, dependencies: [] },
      { id: 'a', title: 'A', reward: '1', deadlineDays: 3, dependencies: [] },
      {
        id: 'c',
        title: 'C',
        reward: '1',
        deadlineDays: 2,
        dependencies: ['a', 'b'],
      },
      { id: 'd', title: 'D', reward: '1', deadlineDays: 7, dependencies: [] },
    ],
  };
  const r = run(p, { blockedJobIds: ['d'] });
  assert.deepEqual(r.scenario.unaffectedJobIds, ['b', 'a', 'c']);
  assert.deepEqual(r.scenario.criticalPath, ['b', 'c']);
  assert.equal(r.scenario.finiteSubgraphCriticalPathDays, 5);
  assert.equal(r.scenario.criticalPathDays, null);
});
test('CLI rejects FIFO and character-device inputs promptly before reading', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omniphoenix-special-'));
  const cli = path.join(root, 'disruption/cli.cjs');
  try {
    const fifo = path.join(tmp, 'input.fifo');
    const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    for (const file of [fifo, '/dev/null'])
      for (const option of ['--plan', '--controls', '--import']) {
        const result = spawnSync(process.execPath, [cli, option, file], {
          cwd: tmp,
          encoding: 'utf8',
          timeout: 2000,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /regular file/);
      }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('caught partial export failures clean only owned files and allow retry; completion marker is required', () => {
  const { writeNewDirectory, readExportDirectory } = require(path.join(
    root,
    'disruption/cli.cjs'
  ));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omniphoenix-partial-'));
  const recovery = desk.exportRecovery(source);
  const actualWrite = fs.writeFileSync;
  try {
    for (const failAt of [1, 2, 3]) {
      const output = path.join(tmp, 'attempt-' + failAt);
      let writes = 0;
      fs.writeFileSync = function (file, content, ...rest) {
        writes++;
        if (writes === failAt) {
          fs.writeSync(file, 'partial');
          throw Error('Injected disk failure');
        }
        return actualWrite.call(fs, file, content, ...rest);
      };
      try {
        assert.throws(
          () => writeNewDirectory(output, recovery),
          /Owned partial output removed/
        );
      } finally {
        fs.writeFileSync = actualWrite;
      }
      assert.equal(fs.existsSync(output), false);
      writeNewDirectory(output, recovery);
      assert.deepEqual(readExportDirectory(output).report, recovery.report);
      fs.unlinkSync(path.join(output, 'completion.json'));
      assert.throws(() => readExportDirectory(output), /ENOENT/);
      assert.throws(
        () => writeNewDirectory(output, recovery),
        /existing paths/
      );
    }
    const output = path.join(tmp, 'tamper');
    writeNewDirectory(output, recovery);
    fs.appendFileSync(path.join(output, 'report.json'), ' ');
    assert.throws(() => readExportDirectory(output), /completion marker/);
  } finally {
    fs.writeFileSync = actualWrite;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('cleanup preserves an unrelated file created inside a failing export', () => {
  const { writeNewDirectory } = require(path.join(root, 'disruption/cli.cjs'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omniphoenix-owned-')),
    output = path.join(tmp, 'out');
  const actualWrite = fs.writeFileSync;
  try {
    let count = 0;
    fs.writeFileSync = function (file, content, ...rest) {
      if (++count === 2) {
        actualWrite(path.join(output, 'unrelated.txt'), 'keep');
        throw Error('Injected failure');
      }
      return actualWrite.call(fs, file, content, ...rest);
    };
    try {
      assert.throws(
        () => writeNewDirectory(output, desk.exportRecovery(source)),
        /Cleanup could not remove/
      );
    } finally {
      fs.writeFileSync = actualWrite;
    }
    assert.equal(
      fs.readFileSync(path.join(output, 'unrelated.txt'), 'utf8'),
      'keep'
    );
    assert.equal(fs.existsSync(path.join(output, 'report.json')), false);
    assert.equal(fs.existsSync(path.join(output, 'completion.json')), false);
  } finally {
    fs.writeFileSync = actualWrite;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
