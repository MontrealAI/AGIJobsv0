import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  evaluate,
  parseScenario,
} from '../../demo/OMNI-CONCORD-ASCENSION-ATLAS/web/engine.mjs';
import example from '../../demo/OMNI-CONCORD-ASCENSION-ATLAS/web/example.mjs';
const copy = () => structuredClone(example);
test('bounded recovery retains successes and charges failed attempts and retries', () => {
  const r = evaluate(copy());
  assert.equal(r.firstPass.spentCents, 9000);
  assert.equal(r.spentCents, 19000);
  assert.equal(r.completionMinute, 95);
  assert.equal(r.attempts.filter((a) => a.id === 'inspect').length, 1);
  assert.equal(r.executedExternalWork, false);
  const s = copy();
  s.budgetCents = 15000;
  assert.equal(evaluate(s).accepted, false);
  s.recoveredIds = [];
  assert.equal(evaluate(s).spentCents, 9000);
});
test('strict schema, graph, integer and recovery validation', () => {
  for (const change of [
    (s) => (s.jobs[0].dependsOn = ['report']),
    (s) => (s.jobs[0].costCents = true),
    (s) => (s.budgetCents = 1.2),
    (s) => (s.jobs[0].extra = 1),
    (s) => (s.recoveredIds = ['inspect']),
    (s) => (s.jobs[0].dependsOn = ['unknown']),
    (s) => (s.jobs[1].id = 'inspect'),
    (s) => (s.jobs = []),
  ]) {
    const s = copy();
    change(s);
    assert.throws(() => evaluate(s));
  }
  for (const raw of [
    '{"a":1,"a":2}',
    '{"a":1.0}',
    '{"a":NaN}',
    ' '.repeat(1000001),
  ])
    assert.throws(() => parseScenario(raw));
});
test('own evidence reopens input and never trusts result', () => {
  const s = copy();
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        parseScenario(
          JSON.stringify({
            schema: 'agijobs.atlas-browser-evidence.v1',
            scenario: s,
            result: { accepted: 'forged' },
            downloadedScenarioSha256: 'forged',
            hashScope: 'forged',
          })
        )
      )
    ),
    s
  );
});
test('full Python/JavaScript parity across 100 dependency/recovery scenarios', () => {
  const scenarios = [];
  let seed = 42;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let k = 0; k < 100; k++) {
    const jobs = [];
    for (let i = 0; i < 1 + random(9); i++)
      jobs.push({
        id: `j${i}`,
        label: `Task ${i}`,
        costCents: 1 + random(3000),
        durationMinutes: 1 + random(50),
        dependsOn: jobs.filter(() => random(3) === 0).map((j) => j.id),
        outcome: random(3) ? 'success' : 'fail',
      });
    if (k % 2) jobs.reverse();
    scenarios.push({
      schema: 'agijobs.atlas-recovery.v1',
      title: 'Parity',
      budgetCents: random(16000),
      jobs,
      recoveredIds: jobs
        .filter((j) => j.outcome === 'fail' && random(2))
        .map((j) => j.id),
    });
  }
  const runtime =
    process.env.ATLAS_PYTHON_SOURCE ||
    'demo/OMNI-CONCORD-ASCENSION-ATLAS/run.py';
  const code = `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('atlas',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nprint(json.dumps([m.evaluate(s) for s in json.load(sys.stdin)]))`;
  const p = spawnSync('python3', ['-c', code, runtime], {
    input: JSON.stringify(scenarios),
    encoding: 'utf8',
  });
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(scenarios.map(evaluate), JSON.parse(p.stdout));
});
