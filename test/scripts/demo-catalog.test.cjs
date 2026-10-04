const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  inventory,
  render,
  updateDocument,
} = require('../../scripts/demo/catalog.cjs');
const {
  quorum,
  missionPlan,
} = require('../../demo/aurora/bin/mission-plan.cjs');

test('catalog includes design-only, nested, Unicode and supporting directories without executing commands', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({
      scripts: {
        'demo:alpha': "node demo/'Alpha Ω'/run.cjs",
        'demo:danger': 'touch SHOULD_NOT_EXIST',
      },
    }),
    'demo/Alpha Ω/README.md': '# Alpha',
    'demo/Alpha Ω/run.cjs': '',
    'demo/Alpha Ω/variant/README.md': '# Variant',
    'demo/Design/README.md': '# Design',
    'demo/support/worker.py': '',
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  const data = inventory(root);
  assert.equal(data.demos.length, 3);
  assert.equal(
    data.demos.find((d) => d.name === 'Design').kind,
    'Design guide'
  );
  assert.equal(data.demos.find((d) => d.name === 'support').readme, null);
  assert.deepEqual(data.demos.find((d) => d.name === 'Alpha Ω').commands, [
    'demo:alpha',
  ]);
  const md = render(data);
  assert.ok(md.includes('Alpha%20%CE%A9/variant/README.md'));
  assert.ok(!fs.existsSync(path.join(root, 'SHOULD_NOT_EXIST')));
  const diagram = '\n```mermaid\nflowchart TD\nA --> B\n```\n';
  const document =
    diagram + '<!-- demo-catalog:start -->old<!-- demo-catalog:end -->tail';
  const updated = updateDocument(document, md);
  assert.ok(updated.startsWith(diagram));
  assert.ok(updated.endsWith('tail'));
  assert.throws(() => updateDocument('missing markers', md), /marker/);
  assert.throws(
    () => updateDocument(document + '<!-- demo-catalog:start -->', md),
    /marker/
  );
});

test('mission preflight preserves mixed committees and rejects incomplete or colliding jobs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-mission-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'five.json'),
    JSON.stringify({ validation: { k: 3, n: 5 } })
  );
  fs.writeFileSync(
    path.join(root, 'four.json'),
    JSON.stringify({ validation: { k: 2, n: 4 } })
  );
  const jobs = [
    { name: 'Energy', specPath: 'five.json' },
    { name: 'Resilience', specPath: 'four.json' },
  ];
  const file = path.join(root, 'mission.json');
  fs.writeFileSync(file, JSON.stringify({ jobs }));
  assert.deepEqual(
    missionPlan(file, root).map((job) => [job.k, job.n]),
    [
      [3, 5],
      [2, 4],
    ]
  );
  jobs[1].name = 'energy!';
  fs.writeFileSync(file, JSON.stringify({ jobs }));
  assert.throws(() => missionPlan(file, root), /collide/);
  fs.writeFileSync(file, JSON.stringify({ jobs: [] }));
  assert.throws(() => missionPlan(file, root), /at least one/);
  for (const value of [
    { k: 0, n: 3 },
    { k: 3.5, n: 4 },
    { k: 5, n: 4 },
    { k: 1, n: 2 },
    { k: 4, n: 6 },
    null,
  ])
    assert.throws(() => quorum(value), /validation/);
});
