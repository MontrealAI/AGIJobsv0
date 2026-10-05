'use strict';
require('ts-node/register');
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  generateAsiTakeoffKit,
} = require('../../../scripts/v2/lib/asiTakeoffKit.ts');
const ROOT = path.resolve(__dirname, '../../..');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'takeoff-kit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function inputs(dir) {
  for (const [name, data] of Object.entries({
    'dry-run.json': { status: 'simulated', network: 'hardhat-offline' },
    'thermodynamics.json': { offline: true },
  }))
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  fs.writeFileSync(
    path.join(dir, 'mission-control.md'),
    'Offline fixture, no execution'
  );
  return {
    planPath: path.join(ROOT, 'demo/asi-takeoff/project-plan.planetary.json'),
    reportRoot: dir,
  };
}
test('kit labels offline evidence, hashes exact bytes and generates valid explicit execution commands', async (t) => {
  const dir = temp(t),
    opts = inputs(dir);
  const result = await generateAsiTakeoffKit(opts);
  assert.equal(result.manifest.evidence.mode, 'offline-fixture');
  assert.equal(result.manifest.evidence.productionApproved, false);
  for (const artifact of result.manifest.artifacts)
    assert.equal(
      artifact.sha256,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.resolve(ROOT, artifact.path)))
        .digest('hex')
    );
  const execute = result.manifest.checklist.find(
    (c) => c.title === 'Thermostat parameter execute'
  );
  assert.match(execute.command, /HARDHAT_NETWORK=hardhat npx ts-node/);
  assert.match(execute.command, /--execute$/);
  assert.match(execute.purpose, /Broadcasts transactions/);
});
test('kit rejects output traversal, unsafe network names and missing required evidence', async (t) => {
  const opts = inputs(temp(t));
  await assert.rejects(() =>
    generateAsiTakeoffKit({ ...opts, outputBasename: '../escape' })
  );
  await assert.rejects(() =>
    generateAsiTakeoffKit({ ...opts, networkHint: 'localhost; whoami' })
  );
  fs.unlinkSync(path.join(opts.reportRoot, 'dry-run.json'));
  await assert.rejects(
    () => generateAsiTakeoffKit(opts),
    /Missing required dryRun/
  );
});
test('local receipt kit uses actual local files instead of nonexistent pipeline reports', async (t) => {
  const dir = temp(t);
  for (const name of ['mission', 'deploy', 'governance', 'stake'])
    fs.writeFileSync(path.join(dir, `${name}.json`), '{}');
  const r = await generateAsiTakeoffKit({
    reportRoot: dir,
    planPath: path.join(ROOT, 'demo/asi-takeoff/config/mission@v2.json'),
    localReceiptsDir: dir,
    networkHint: 'localhost',
  });
  assert.equal(r.manifest.evidence.mode, 'local-receipts');
  assert.equal(r.manifest.jobs.length, 3);
  assert.ok(r.manifest.artifacts.some((a) => a.key === 'deployment'));
  assert.ok(!r.manifest.artifacts.some((a) => a.key === 'dryRun'));
});
test('offline planetary pipeline never reports performed governance checks', (t) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'reports', 'takeoff-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register', path.join(ROOT, 'scripts/v2/asiTakeoffDemo.ts')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        AGIJOBS_FLAGSHIP_SKIP_ONCHAIN: 'true',
        ASI_TAKEOFF_PLAN_PATH: 'demo/asi-takeoff/project-plan.planetary.json',
        ASI_TAKEOFF_REPORT_ROOT: dir,
      },
      encoding: 'utf8',
      timeout: 30000,
    }
  );
  assert.equal(r.status, 0, r.stderr);
  const dry = JSON.parse(fs.readFileSync(path.join(dir, 'dry-run.json')));
  assert.equal(dry.status, 'simulated');
  assert.equal(dry.scenarios[0].status, 'not-run');
  const summary = fs.readFileSync(path.join(dir, 'summary.md'), 'utf8');
  assert.match(summary, /Planetary Grid/);
  assert.doesNotMatch(summary, /Planned High-Speed Rail/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'run-status.json'))).mode,
    'offline-fixture'
  );
});
test('live adapter schema accepts the exact task without dispatch', () => {
  const {
    parseComputerWorkTask,
    computerTaskDigest,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const task = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'demo/asi-takeoff/computer-work/task.json'))
  );
  assert.equal(parseComputerWorkTask(task).workerProfile, 'asi-takeoff');
  assert.match(computerTaskDigest(task), /^[0-9a-f]{64}$/);
});

test('kit refuses to overwrite required inputs', async (t) => {
  const opts = inputs(temp(t));
  await assert.rejects(
    () => generateAsiTakeoffKit({ ...opts, outputBasename: 'dry-run' }),
    /overwrite/
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(opts.reportRoot, 'dry-run.json')))
      .status,
    'simulated'
  );
});
test('pipeline subprocesses have bounded output, time and signal failures', async (t) => {
  const { runCommand } = require('../../../scripts/v2/asiTakeoffDemo.ts');
  const dir = temp(t);
  const step = (code) => ({
    key: 'bounded-test',
    title: 'bounded child',
    command: [process.execPath, '-e', code],
    timeoutMs: 3000,
    maxOutputBytes: 1024,
  });
  const success = await runCommand(step('console.log("ok")'), dir);
  assert.equal(success.exitCode, 0);
  await assert.rejects(
    () =>
      runCommand({ ...step('setInterval(()=>{},1000)'), timeoutMs: 100 }, dir),
    /timed out/
  );
  await assert.rejects(
    () => runCommand(step('process.stdout.write("x".repeat(100000))'), dir),
    /output limit/
  );
  await assert.rejects(
    () => runCommand(step('process.kill(process.pid,"SIGTERM")'), dir),
    /terminated/
  );
});
