import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  candidates,
  matches,
  execute,
  candidate,
  plan,
  market,
} from '../workbench/model.mjs';
const require = createRequire(import.meta.url);
const {
  parseComputerWorkTask,
  computerTaskDigest,
} = require('../../../apps/orchestrator/computerWork.ts');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = fs.readFileSync(path.join(root, 'workbench/cases.json'));
const source = JSON.parse(bytes),
  digest = createHash('sha256').update(bytes).digest('hex');
const python = process.env.PYTHON_BIN || 'python3';
function check(payload, taskId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthesis-check-'));
  try {
    const file = path.join(dir, 'candidate.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    return spawnSync(
      python,
      [path.join(root, 'computer-work/review.py'), file, '--task', taskId],
      { encoding: 'utf8' }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
for (const task of source.cases)
  test(`exact candidate passes separate Python cases: ${task.id}`, () => {
    let tested = 0,
      result;
    for (const program of candidates()) {
      tested++;
      if (matches(task, program)) {
        result = candidate(task, program, tested, digest);
        break;
      }
    }
    assert.ok(result);
    assert.equal(result.settlementApproved, false);
    assert.equal(check(result, task.id).status, 0);
    assert.equal(
      check({ ...result, operations: ['reverse'] }, task.id).status,
      1
    );
    assert.equal(
      check({ ...result, sourceSha256: '0'.repeat(64) }, task.id).status,
      1
    );
    assert.equal(
      check({ ...result, settlementApproved: true }, task.id).status,
      1
    );
    assert.equal(
      check(result, task.id === 'ledger' ? 'normalize' : 'ledger').status,
      1
    );
  });
test('bounded DSL never accepts arbitrary code or numeric overflow', () => {
  for (const program of [['eval'], ['sort', 'sort', 'sort', 'sort'], [{}]])
    assert.throws(() => execute([1], program));
  assert.throws(() => execute([Number.MAX_SAFE_INTEGER], ['times3']));
  assert.throws(() => execute([Number.MAX_SAFE_INTEGER, 1], ['sum']));
  assert.deepEqual(
    execute([Number.MAX_SAFE_INTEGER, 2, -Number.MAX_SAFE_INTEGER], ['sum']),
    [2]
  );
  assert.throws(() => execute([NaN], []));
  assert.equal([...candidates()].length, 400);
});
const inputs = {
  budget: '0.300001',
  workerCost: '0.1',
  reviewerCost: '0.2',
  reviewMinutes: 1,
  reviewCapacity: 1,
  lawful: true,
  rights: true,
  independent: true,
};
test('six-decimal planning conserves budget without floating-point rounding', () => {
  const result = plan(inputs);
  assert.equal(result.estimatedCostUsdc, '0.300000');
  assert.equal(result.unallocatedUsdc, '0.000001');
  assert.equal(result.status, 'ready-for-operator-review');
  assert.equal(result.dispatched, false);
});
test('budget, review and authorization failures stay held', () => {
  for (const patch of [
    { budget: '0.29' },
    { reviewCapacity: 0 },
    { lawful: false },
    { rights: false },
    { independent: false },
    { reviewMinutes: 0 },
  ])
    assert.equal(plan({ ...inputs, ...patch }).status, 'held');
  for (const budget of ['-1', 'NaN', '1e3', '0.0000001', ''])
    assert.throws(() => plan({ ...inputs, budget }));
});
test('economics applies all filters and distinguishes revenue', () => {
  const args = {
    addressable: 50,
    licensed: 20,
    reliable: 25,
    adoption: 0.01,
    fee: 5,
  };
  const result = market(args);
  assert.equal(result.annualWorkValue, 100000000);
  assert.equal(result.annualPlatformRevenue, 5000000);
  assert.equal(market({ ...args, adoption: 0 }).annualWorkValue, 0);
  assert.throws(() => market({ ...args, reliable: 101 }));
});
test('worker task is normalized, source-bound and unadmitted by default', () => {
  const task = require('../computer-work/task.json');
  const profiles = require('../computer-work/worker-profiles.example.json');
  assert.ok(task.inputText.includes(digest));
  assert.deepEqual(parseComputerWorkTask(task), task);
  assert.match(computerTaskDigest(task), /^[a-f0-9]{64}$/);
  assert.deepEqual(profiles.synthesis.approvedJobs, []);
});

test('receipt checker binds expected job, deployment, bytes and semantics', () => {
  const { reviewReceipt } = require('../computer-work/review-receipt.cjs');
  const task = require('../computer-work/task.json');
  const payload = candidate(source.cases[0], ['times3', 'add2'], 16, digest);
  const artifact = (name, mediaType, content) => ({
    name,
    mediaType,
    content,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  });
  const receipt = {
    schemaVersion: 1,
    jobId: '1',
    deploymentId: 'fixture',
    status: 'evidence-ready',
    provider: 'openclaw-responses',
    workerProfile: 'synthesis',
    simulated: true,
    productionApproved: false,
    settlementApproved: false,
    review: { status: 'required' },
    task,
    taskSha256: computerTaskDigest(task),
    artifacts: [
      artifact('candidate.json', 'application/json', JSON.stringify(payload)),
      artifact(
        'evidence.md',
        'text/markdown',
        'Synthetic transport fixture; no provider call.'
      ),
    ],
  };
  const expected = { jobId: '1', deploymentId: 'fixture' };
  assert.equal(reviewReceipt(receipt, expected).status, 'passed');
  assert.equal(
    reviewReceipt(receipt, { ...expected, jobId: '2' }).status,
    'rejected'
  );
  assert.equal(
    reviewReceipt({ ...receipt, settlementApproved: true }, expected).status,
    'rejected'
  );
  const bad = structuredClone(receipt);
  bad.artifacts[0] = artifact(
    'candidate.json',
    'application/json',
    JSON.stringify({ ...payload, operations: ['reverse'] })
  );
  assert.equal(reviewReceipt(bad, expected).status, 'rejected');
  const tampered = structuredClone(receipt);
  tampered.artifacts[0].content += ' ';
  assert.equal(reviewReceipt(tampered, expected).status, 'rejected');
});
