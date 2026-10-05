'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { reviewReceipt } = require('../computer-work/review.cjs');
const root = path.resolve(__dirname, '../computer-work');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const task = JSON.parse(fs.readFileSync(path.join(root, 'task.json')));
  return {
    schemaVersion: 1,
    status: 'evidence-ready',
    provider: 'openclaw-responses',
    jobId: '73',
    deploymentId: 'synthetic-acceptance',
    workerProfile: 'asi-takeoff',
    attemptId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    startedAt: '2026-10-05T12:00:00.000Z',
    completedAt: '2026-10-05T12:01:00.000Z',
    simulated: true,
    productionApproved: false,
    settlementApproved: false,
    review: { status: 'required' },
    task,
    taskSha256: hash(JSON.stringify(task)),
    artifacts: task.deliverables.map((item) => {
      const content = fs.readFileSync(
        path.join(root, item.name.replace('.', '.example.')),
        'utf8'
      );
      return {
        ...item,
        content,
        bytes: Buffer.byteLength(content),
        sha256: hash(content),
      };
    }),
  };
}
test('receipt review binds inline bytes and task to operator-supplied job and deployment', () => {
  const result = reviewReceipt(fixture(), '73', 'synthetic-acceptance');
  assert.equal(result.accepted, true);
  assert.equal(result.receiptChecked, true);
  assert.equal(result.declaredWorkerMode, 'fixture');
  assert.match(result.workerProvenance, /Unverified/);
  assert.equal(result.providerExecution, 'not assessed');
  assert.equal(result.settlementApproved, false);
  const candidate = fixture();
  candidate.task = Object.fromEntries(Object.entries(candidate.task).reverse());
  assert.equal(
    reviewReceipt(candidate, '73', 'synthetic-acceptance').accepted,
    true
  );
});
for (const [name, change] of [
  ['wrong job', (r) => (r.jobId = '74')],
  ['wrong deployment', (r) => (r.deploymentId = 'another-deployment')],
  [
    'changed task with a recomputed hash',
    (r) => {
      r.task.allowedOrigins = ['https://example.org'];
      r.taskSha256 = hash(JSON.stringify(r.task));
    },
  ],
  ['wrong task hash', (r) => (r.taskSha256 = '0'.repeat(64))],
  ['altered content', (r) => (r.artifacts[0].content += ' ')],
  ['wrong byte count', (r) => (r.artifacts[0].bytes += 1)],
  ['wrong artifact hash', (r) => (r.artifacts[0].sha256 = '0'.repeat(64))],
  ['duplicate deliverable', (r) => (r.artifacts[1] = r.artifacts[0])],
  ['missing deliverable', (r) => r.artifacts.pop()],
  ['changed media type', (r) => (r.artifacts[0].mediaType = 'text/plain')],
  ['approval claim', (r) => (r.settlementApproved = true)],
  ['incomplete attempt', (r) => (r.status = 'dispatched')],
  ['missing mode', (r) => delete r.simulated],
  ['backwards timestamps', (r) => (r.completedAt = '2026-10-04T12:01:00.000Z')],
  [
    'incorrect analysis with recomputed integrity fields',
    (r) => {
      const artifact = r.artifacts[0],
        analysis = JSON.parse(artifact.content);
      analysis.allocatedRewards = '1';
      artifact.content = JSON.stringify(analysis);
      artifact.bytes = Buffer.byteLength(artifact.content);
      artifact.sha256 = hash(artifact.content);
    },
  ],
])
  test(`receipt review rejects ${name}`, () => {
    const candidate = fixture();
    change(candidate);
    assert.throws(() => reviewReceipt(candidate, '73', 'synthetic-acceptance'));
  });
test('review CLI accepts a receipt without extracting files and rejects malformed or oversized input', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'takeoff-receipt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'receipt.json'),
    script = path.join(root, 'review.cjs');
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      timeout: 5000,
    });
  fs.writeFileSync(file, JSON.stringify(fixture()));
  const args = ['--receipt', file, '73', 'synthetic-acceptance'];
  assert.equal(JSON.parse(run(...args).stdout).receiptChecked, true);
  assert.deepEqual(fs.readdirSync(dir), ['receipt.json']);
  assert.notEqual(run('--receipt', file).status, 0);
  fs.writeFileSync(file, Buffer.from([0xff]));
  assert.notEqual(run(...args).status, 0);
  fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1));
  assert.notEqual(run(...args).status, 0);
  assert.notEqual(
    run('--receipt', dir, '73', 'synthetic-acceptance').status,
    0
  );
});
