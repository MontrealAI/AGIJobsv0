'use strict';
// Actual read-only kit CLI over synthetic report files. No launcher, chain or compiler.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { analyze } = require('../../demo/asi-takeoff/scripts/plan.cjs');
const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/v2/asiTakeoffKit.ts');
const SCENARIOS = [
  'demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/project-plan.json',
  'demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/project-plan.hyperstructure.json',
];
function fixture(t, local = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-plan-kit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (local) {
    for (const name of ['mission', 'deploy', 'governance', 'stake'])
      fs.writeFileSync(path.join(dir, `${name}.json`), '{"fixture":true}\n');
  } else {
    fs.writeFileSync(
      path.join(dir, 'dry-run.json'),
      JSON.stringify({
        status: 'simulated',
        network: 'hardhat-offline',
        scenarios: [],
      })
    );
    fs.writeFileSync(
      path.join(dir, 'thermodynamics.json'),
      '{"offline":true}\n'
    );
    fs.writeFileSync(
      path.join(dir, 'mission-control.md'),
      'Synthetic test input. No checks performed.\n'
    );
  }
  return dir;
}
function run(dir, args = []) {
  return spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      CLI,
      '--report-root',
      dir,
      ...args,
    ],
    {
      cwd: os.tmpdir(), // CLI paths resolve from its checkout, not the invoking cwd.
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'),
        TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}',
        ASI_TAKEOFF_PLAN_PATH: '/deliberately-missing-env-plan.json',
      },
      encoding: 'utf8',
      timeout: 20000,
    }
  );
}
function manifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'governance-kit.json')));
}
function assertBinding(result, selected) {
  const bytes = fs.readFileSync(selected);
  const plan = JSON.parse(bytes);
  const artifact = result.artifacts.find((item) => item.key === 'plan');
  assert.equal(path.resolve(ROOT, artifact.path), path.resolve(selected));
  assert.equal(
    artifact.sha256,
    crypto.createHash('sha256').update(bytes).digest('hex')
  );
  assert.equal(artifact.size, bytes.length);
  assert.equal(result.initiative, plan.initiative ?? plan.title ?? null);
  assert.deepEqual(
    result.jobs.map((job) => job.id),
    plan.jobs.map((job) => job.id ?? job.name ?? 'job')
  );
  assert.equal(result.evidence.productionApproved, false);
  assert.equal(result.evidence.settlementApproved, false);
}
for (const scenario of SCENARIOS) {
  test(`${scenario}: existing schema and explicit CLI binding preserve the selected plan`, (t) => {
    const source = path.join(ROOT, scenario);
    const analysis = analyze(JSON.parse(fs.readFileSync(source)));
    assert.equal(analysis.mode, 'planning-only');
    assert.equal(analysis.transactionsSubmitted, false);
    const dir = fixture(t);
    const result = run(dir, ['--plan', scenario]);
    assert.equal(result.status, 0, result.stderr);
    assertBinding(manifest(dir), source);
    assert.equal(manifest(dir).evidence.mode, 'offline-fixture');
  });
}
test('explicit plan with spaces retains exact bytes independently of the environment override', (t) => {
  const dir = fixture(t);
  const selected = path.join(dir, 'reviewed scenario with spaces.json');
  fs.copyFileSync(path.join(ROOT, SCENARIOS[1]), selected);
  const result = run(dir, ['--plan', selected]);
  assert.equal(result.status, 0, result.stderr);
  assertBinding(manifest(dir), selected);
});
test('ordinary kit retains its national default and does not inherit ASI_TAKEOFF_PLAN_PATH', (t) => {
  const dir = fixture(t);
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assertBinding(
    manifest(dir),
    path.join(ROOT, 'demo/asi-takeoff/project-plan.json')
  );
});
test('local-receipts kit retains the distinct mission-config default', (t) => {
  const dir = fixture(t, true);
  const result = run(dir, ['--local-receipts', dir, '--network', 'localhost']);
  assert.equal(result.status, 0, result.stderr);
  assertBinding(
    manifest(dir),
    path.join(ROOT, 'demo/asi-takeoff/config/mission@v2.json')
  );
  assert.equal(manifest(dir).evidence.mode, 'local-receipts');
  assert.equal(manifest(dir).jobs.length, 3);
});
test('explicit missing plan fails instead of falling back to the national plan', (t) => {
  const dir = fixture(t);
  const result = run(dir, ['--plan', path.join(dir, 'missing.json')]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Missing required project plan/);
  assert.equal(fs.existsSync(path.join(dir, 'governance-kit.json')), false);
});

test('published scenario entrypoints are read-only and disclose the shared fixture boundary', () => {
  const experiences = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'website/demo-experiences.json'))
  );
  for (const name of [
    'OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY',
    'OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE',
  ]) {
    const entry = experiences[name];
    assert.equal(entry.mode, 'node');
    assert.match(entry.expected, /Read-only planning/);
    assert.match(
      entry.steps[2].explanation,
      /do not execute the scenario job list/
    );
    assert.doesNotMatch(entry.command, /demo:asi-takeoff:local|--rehearse/);
  }
  assert.match(
    experiences['OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY'].command,
    / --plan$/
  );
  assert.match(
    experiences['OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE'].command,
    /plan\.cjs/
  );
});
