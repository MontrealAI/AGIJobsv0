import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { defaults, plan, workOrder } from '../model.mjs';
import { run } from '../cli.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasks = JSON.parse(fs.readFileSync(path.join(root, 'tasks.json')));
test('budget is fully reserved before admission and all attempts pay for review', () => {
  const p = plan(defaults);
  assert.equal(p.admitted, 54);
  assert.equal(p.accepted, 43);
  assert.equal(p.spentUSDC, 24200);
  assert.equal(p.reserveUSDC, 29700);
  assert.equal(p.reviewHours, 27);
  assert.equal(p.spentUSDC + p.remainingUSDC, defaults.budgetUSDC);
});
test('review capacity, interruption, zero acceptance and zero budget fail closed', () => {
  assert.equal(plan({ reviewerHours: 4 }).admitted, 8);
  assert.equal(plan({ outagePercent: 100 }).admitted, 0);
  const p = plan({ acceptancePercent: 0 });
  assert.equal(p.payoutUSDC, 0);
  assert.equal(p.spentUSDC, 2700);
  assert.equal(p.costPerAcceptedUSDC, null);
  assert.equal(plan({ budgetUSDC: 0 }).admitted, 0);
});
test('invalid scenarios cannot produce a plausible-looking output', () => {
  for (const bad of [
    null,
    [],
    { workers: -1 },
    { workers: '8' },
    { offers: Infinity },
    { days: 1.5 },
    { reviewMinutes: 0 },
    { acceptancePercent: 101 },
    { settlementApproved: true },
  ])
    assert.throws(() => plan(bad));
});
test('accounting invariants across deterministic stress combinations', () => {
  for (const workers of [0, 1, 8, 500000])
    for (const reviewerHours of [0, 1, 40, 1000000])
      for (const acceptancePercent of [0, 1, 80, 100]) {
        const p = plan({ workers, reviewerHours, acceptancePercent });
        assert.ok(p.reserveUSDC <= p.settings.budgetUSDC);
        assert.ok(p.spentUSDC <= p.reserveUSDC);
        assert.ok(p.accepted <= p.admitted);
        assert.ok(p.reviewHours <= reviewerHours);
        assert.equal(p.spentUSDC + p.remainingUSDC, p.settings.budgetUSDC);
      }
});
test('all ten work orders remain drafts with independent review and settlement gates', () => {
  assert.equal(tasks.length, 10);
  assert.equal(new Set(tasks.map((t) => t.id)).size, 10);
  for (const task of tasks) {
    const order = workOrder(task);
    assert.equal(order.status, 'draft');
    assert.equal(order.settlement.currency, 'USDC');
    assert.equal(order.settlement.approved, false);
    assert.equal(order.review.identityVerified, false);
    assert.equal(order.runtime.configured, false);
  }
});
test('separate Python arithmetic checker rejects corruption even after hashes are rewritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-check-'));
  const verify = () =>
    spawnSync(
      process.env.PYTHON_BIN || 'python3',
      [path.join(root, 'verify.py'), dir],
      { encoding: 'utf8' }
    );
  try {
    run(dir);
    assert.equal(verify().status, 0);
    assert.throws(() => run(dir), /already contains/);
    const file = path.join(dir, 'plan.json');
    const p = JSON.parse(fs.readFileSync(file));
    p.accepted++;
    fs.writeFileSync(file, JSON.stringify(p));
    assert.notEqual(verify().status, 0);
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json')));
    receipt.artifacts.find((x) => x.name === 'plan.json').sha256 = createHash(
      'sha256'
    )
      .update(fs.readFileSync(file))
      .digest('hex');
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
    assert.match(verify().stderr, /arithmetic mismatch/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('checker rejects every corrupted accounting field even with coherent hashes and embedded scenarios', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-complete-check-'));
  const verify = () => spawnSync(process.env.PYTHON_BIN || 'python3', [path.join(root, 'verify.py'), dir], { encoding: 'utf8' });
  try {
    run(dir);
    const original = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json')));
    const orders = JSON.parse(fs.readFileSync(path.join(dir, 'work-orders.json')));
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json')));
    for (const key of Object.keys(original).filter((key) => key !== 'settings')) {
      const corrupt = structuredClone(original);
      const value = corrupt[key];
      corrupt[key] = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : typeof value === 'string' ? value + '-corrupted' : Array.isArray(value) ? ['corrupted'] : { ...value, workers: value.workers + 1 };
      fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(corrupt));
      fs.writeFileSync(path.join(dir, 'work-orders.json'), JSON.stringify(orders.map((order) => ({ ...order, scenario: corrupt }))));
      for (const item of receipt.artifacts) item.sha256 = createHash('sha256').update(fs.readFileSync(path.join(dir, item.name))).digest('hex');
      fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
      const result = verify();
      assert.notEqual(result.status, 0, key);
      assert.match(result.stderr, /arithmetic mismatch/, key);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('checker agrees on zero acceptance, zero admission, fractional review and tied capacity', () => {
  for (const settings of [{ acceptancePercent: 0 }, { budgetUSDC: 0 }, { reviewMinutes: 7, offers: 11 }, { offers: 80, budgetUSDC: 44000 }]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-boundary-check-'));
    try {
      run(dir, settings);
      const result = spawnSync(process.env.PYTHON_BIN || 'python3', [path.join(root, 'verify.py'), dir], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('checker rejects rehashed changes to every authorization, runtime, review and settlement gate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-gates-'));
  const verify = () => spawnSync(process.env.PYTHON_BIN || 'python3', [path.join(root, 'verify.py'), dir], { encoding: 'utf8' });
  try {
    run(dir);
    const original = JSON.parse(fs.readFileSync(path.join(dir, 'work-orders.json')));
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json')));
    const mutations = [
      (o) => { o.authorization.externalActionsApproved = true; },
      (o) => { o.authorization.scope = 'All actions authorized'; },
      (o) => { o.runtime.configured = true; },
      (o) => { o.review.independentReviewerRequired = false; },
      (o) => { o.review.buyerAcceptanceRequired = false; },
      (o) => { o.review.identityVerified = true; },
      (o) => { o.settlement.approved = true; },
      (o) => { o.settlement.currency = 'ETH'; },
      (o) => { o.status = 'accepted'; },
      (o) => { o.productionApproved = true; },
      (o) => { delete o.review; },
      (o) => { o.taskId = 'unrecognized'; },
    ];
    for (const change of mutations) {
      const orders = structuredClone(original);
      change(orders[0]);
      const file = path.join(dir, 'work-orders.json');
      fs.writeFileSync(file, JSON.stringify(orders));
      receipt.artifacts.find((item) => item.name === 'work-orders.json').sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
      assert.notEqual(verify().status, 0, change.toString());
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checker rejects unsupported receipt execution and approval claims', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-receipt-gates-'));
  try {
    const receipt = run(dir);
    for (const key of Object.keys(receipt).filter((key) => key !== 'artifacts')) {
      const changed = structuredClone(receipt);
      changed[key] = typeof changed[key] === 'number' ? changed[key] + 1 : typeof changed[key] === 'boolean' ? !changed[key] : 'live';
      fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(changed));
      const result = spawnSync(process.env.PYTHON_BIN || 'python3', [path.join(root, 'verify.py'), dir], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, key);
      assert.match(result.stderr, /Unsupported receipt claim/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
