import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluate } from '../../demo/CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION/web/engine.mjs';
import { parseJSON } from '../../demo/CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION/web/json.mjs';
const source = 'demo/CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION',
  fixture = JSON.parse(fs.readFileSync(source + '/web/scenario.json'));
test('bounded allocation preserves resources, priority and protected reserve', () => {
  const r = evaluate(fixture);
  assert.deepEqual(r.displacedIds, ['indexing', 'archive']);
  assert.equal(r.outage.conserved, true);
  const s = structuredClone(fixture);
  s.outageCapacity.energyUnits = 9;
  const paused = evaluate(s);
  assert.equal(paused.outage.dispatchPaused, true);
  assert.equal(paused.outage.allocated.energyUnits, 0);
  assert.equal(paused.outage.reserveShortfall.energyUnits, 1);
  assert.equal(r.executionAttested, false);
});
test('strict scenario rejects invalid bounds, unknown keys and duplicate IDs', () => {
  for (const mutate of [
    (s) => (s.jobs[0].priority = true),
    (s) => (s.jobs[0].energyUnits = -1),
    (s) => (s.outageCapacity.computeUnits = 101),
    (s) => (s.protectedReserve.energyUnits = 101),
    (s) => (s.jobs[1].id = s.jobs[0].id),
    (s) => (s.jobs[0].extra = 1),
    (s) => (s.jobs = []),
    (s) => (s.jobs[0].id = 'bad id'),
  ]) {
    const s = structuredClone(fixture);
    mutate(s);
    assert.throws(() => evaluate(s));
  }
  for (const raw of ['{"a":1,"a":2}', '{"a":NaN}', '{"a":1.0}'])
    assert.throws(() => parseJSON(raw));
});
test('full results match original Python reservation-engine wrapper for 100 bounded scenarios', () => {
  let seed = 41;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const cases = [fixture];
  for (let i = 0; i < 99; i++) {
    const s = structuredClone(fixture);
    s.outageCapacity = { energyUnits: random(101), computeUnits: random(101) };
    s.protectedReserve = {
      energyUnits: random(101),
      computeUnits: random(101),
    };
    s.jobs = Array.from({ length: 1 + random(12) }, (_, j) => ({
      id: 'job-' + j,
      label: 'Request ' + j,
      priority: random(101),
      energyUnits: 1 + random(60),
      computeUnits: random(61),
    }));
    cases.push(s);
  }
  const run = spawnSync(
    'python3',
    [
      '-c',
      `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('celestial',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nprint(json.dumps([m.evaluate(s) for s in json.load(sys.stdin)]))`,
      source + '/run.py',
    ],
    {
      input: JSON.stringify(cases),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(cases.map(evaluate), JSON.parse(run.stdout));
});
