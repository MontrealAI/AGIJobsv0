'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { analyze, loadScenario, ROOT } = require('../scripts/plan.cjs');
const { review } = require('../computer-work/review.cjs');
const plan = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'project-plan.planetary.json')));
const candidate = () =>
  JSON.parse(
    fs.readFileSync(path.join(ROOT, 'computer-work/analysis.example.json'))
  );
const dossier = fs.readFileSync(
  path.join(ROOT, 'computer-work/dossier.example.md'),
  'utf8'
);
test('both original plans reconcile with explicit scheduling assumptions', () => {
  const national = loadScenario('national'),
    planetary = loadScenario('planetary');
  assert.equal(national.allocatedRewards, '500000');
  assert.equal(national.unallocatedBudget, '0');
  assert.equal(national.criticalPathDays, 300);
  assert.equal(planetary.allocatedRewards, '680000');
  assert.equal(planetary.unallocatedBudget, '100000');
  assert.equal(planetary.criticalPathDays, 41);
  assert.equal(planetary.scheduleWithinHorizon, false);
  assert.match(planetary.scheduleAssumption, /assumption/);
  assert.equal(planetary.productionApproved, false);
});
test('large and fractional budget values retain exact decimal precision', () => {
  const p = plan();
  p.budget.total = '900719925474099312345.000000000000000001';
  p.jobs[0].reward = '900719925474099312345';
  p.jobs.slice(1).forEach((j) => {
    j.reward = '0';
  });
  const result = analyze(p);
  assert.equal(result.unallocatedBudget, '0.000000000000000001');
  p.budget.total = '1';
  assert.equal(analyze(p).budgetWithinLimit, false);
});
for (const [name, mutate] of [
  [
    'duplicate jobs',
    (p) => {
      p.jobs[1].id = p.jobs[0].id;
    },
  ],
  [
    'missing dependency',
    (p) => {
      p.jobs[0].dependencies = ['MISSING'];
    },
  ],
  [
    'cycles',
    (p) => {
      p.jobs[0].dependencies = ['EXECUTE-LIQUIDITY'];
    },
  ],
  [
    'duplicate dependency',
    (p) => {
      p.jobs[1].dependencies = ['SURPLUS-ASIA', 'SURPLUS-ASIA'];
    },
  ],
  [
    'fractional days',
    (p) => {
      p.jobs[0].deadlineDays = 0.5;
    },
  ],
  [
    'unsafe numeric money',
    (p) => {
      p.jobs[0].reward = 9007199254740992;
    },
  ],
  [
    'negative money',
    (p) => {
      p.jobs[0].reward = '-1';
    },
  ],
  [
    'precision loss',
    (p) => {
      p.jobs[0].reward = '0.0000000000000000001';
    },
  ],
  [
    'uint256 overflow',
    (p) => {
      p.jobs[0].reward = '1'.repeat(90);
    },
  ],
])
  test(`planner rejects ${name}`, () => {
    const p = plan();
    mutate(p);
    assert.throws(() => analyze(p));
  });
test('dependency evaluation is independent of source order and scenario keys are allowlisted', () => {
  const p = plan();
  p.jobs.reverse();
  assert.equal(analyze(p).criticalPathDays, 41);
  for (const name of ['__proto__', 'constructor', '../national', 'unknown'])
    assert.throws(() => loadScenario(name));
});
test('independent review accepts the fixed synthetic example without approving production', () => {
  const result = review(candidate(), dossier);
  assert.equal(result.accepted, true);
  assert.equal(result.jobsChecked, 5);
  assert.equal(result.settlementApproved, false);
});
for (const [name, mutate] of [
  [
    'omitted job',
    (c) => {
      c.jobs.pop();
    },
  ],
  [
    'duplicate job',
    (c) => {
      c.jobs[1] = c.jobs[0];
    },
  ],
  [
    'wrong reward',
    (c) => {
      c.jobs[0].reward = '1';
    },
  ],
  [
    'wrong reserve',
    (c) => {
      c.unallocatedBudget = '100001';
    },
  ],
  [
    'wrong schedule',
    (c) => {
      c.jobs[4].startDay = 0;
    },
  ],
  [
    'omitted dependency',
    (c) => {
      c.jobs[4].dependencies = [];
    },
  ],
  [
    'wrong source',
    (c) => {
      c.sourceSha256 = '0'.repeat(64);
    },
  ],
  [
    'hidden horizon conflict',
    (c) => {
      c.horizonExceeded = false;
    },
  ],
  [
    'claimed production approval',
    (c) => {
      c.productionApproved = true;
    },
  ],
  [
    'numeric amount',
    (c) => {
      c.allocatedRewards = 680000;
    },
  ],
])
  test(`independent review rejects ${name}`, () => {
    const c = candidate();
    mutate(c);
    assert.throws(() => review(c, dossier));
  });
test('task pins the complete source and admits no live jobs by default', () => {
  const task = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'computer-work/task.json'))
  );
  assert.equal(task.dataClass, 'synthetic');
  assert.deepEqual(task.allowedOrigins, ['http://127.0.0.1:4176']);
  assert.ok(task.inputText.includes(loadScenario('planetary').sourceSha256));
  const embedded = task.inputText.split('Approved plan JSON:\n')[1];
  assert.deepEqual(JSON.parse(embedded), plan());
  const profiles = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'computer-work/worker-profiles.example.json')
    )
  );
  assert.deepEqual(profiles['asi-takeoff'].approvedJobs, []);
  assert.throws(() => review(candidate(), 'No dossier'));
});
test('original systems flowchart is preserved with valid Mermaid quoting', () => {
  const original =
    'flowchart LR\n    Operators((Mission Owners)) --> demo_asi_takeoff[[Demo → ASI Takeoff]]\n    demo_asi_takeoff --> Core[["AGI Jobs v0 (v2) Core Intelligence"]]\n    Core --> Observability[[Unified CI / CD & Observability]]\n    Core --> Governance[[Owner Control Plane]]';
  assert.ok(
    fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').includes(original)
  );
});
