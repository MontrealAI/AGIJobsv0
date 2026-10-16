import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptExecutionSpec } from '../../integrations/alpha-agent/project-name.mjs';
import { canonical, parseBounded } from '../../integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs';
import { example, validate, plan, run } from '../../integrations/alpha-agent/vendor/alpha/examples/successor-workbench/engine.mjs';
import { createRecord, startRun, completeRun, validateRecord } from '../../integrations/alpha-agent/vendor/alpha/examples/successor-workbench/mission-record.mjs';

const sourceHash = 'a'.repeat(64), compiledAt = '2026-10-16T00:00:00.000Z';
const cases = [
  ['49 ASCII units', 'A'.repeat(49), 'A'.repeat(48)],
  ['64 ASCII units', 'B'.repeat(64), 'B'.repeat(48)],
  ['astral scalar crossing the prefix boundary', 'N'.repeat(47) + '🧠' + 'Z'.repeat(15), 'N'.repeat(47)],
  ['blank prefix followed by a valid name character', ' '.repeat(48) + 'Z', 'SUCCESSOR Ω'],
  ['short Unicode name', 'Énergie 🧠 Ω', 'Énergie 🧠 Ω'],
];
for (const [label, originalName, compiledName] of cases) test(label + ': display-only mapping supports native planning, execution and record replay', async () => {
  const original = example('public-data'); original.name = originalName;
  original.inputs.csv = 'group,amount\nSame,3\nSame,3\nOther,-2\n';
  const before = canonical(original);
  assert.equal(canonical(validate(original)), before);
  const adapted = adaptExecutionSpec(original);
  assert.deepEqual(adapted.mapping, { policy: 'unicode-scalar-prefix-48-or-successor-label/v1', originalName, compiledName, maximumUtf16Units: 48 });
  assert.equal(adapted.spec.name, compiledName);
  assert.ok(adapted.spec.name.length <= 48);
  assert.equal(canonical(adapted.spec), canonical({ ...original, name: compiledName }));
  assert.notEqual(adapted.spec, original); assert.notEqual(adapted.spec.inputs, original.inputs);
  assert.equal(canonical(original), before);
  assert.deepEqual(validate(adapted.spec), adapted.spec);
  const graph = await plan(adapted.spec, compiledAt);
  assert.equal(graph.constitution.title, compiledName);
  const draft = await createRecord({ missionId: 'adapted-display-name', sourceHash, spec: adapted.spec });
  const started = await startRun(draft, { expectedRevision: draft.revision, runId: 'actual-local-run' });
  const pack = await run(adapted.spec, { sourceHash });
  const completed = await completeRun(started, pack, { expectedRevision: started.revision, runId: 'actual-local-run' });
  const replayed = await validateRecord(parseBounded(canonical(completed)));
  assert.equal(replayed.state, 'result');
  assert.deepEqual(replayed.spec, adapted.spec);
  assert.equal(replayed.result.pack.result.summary.rows, 3);
  assert.equal(replayed.result.pack.result.summary.total, 4);
  assert.deepEqual(replayed.result.pack.spec.inputs, original.inputs);
  assert.equal(replayed.review, null);
  assert.equal(replayed.result.pack.evaluation.independentProof, false);
  assert.deepEqual(replayed.result.pack.frozen.authority, []);
  assert.equal(canonical(original), before);
});

test('different originals sharing a compiled display label retain their exact data and separate native computation', async () => {
  const originals = ['A', 'B'].map((suffix, index) => {
    const spec = example('public-data'); spec.name = 'Q'.repeat(48) + suffix;
    spec.inputs.csv = index === 0 ? 'group,amount\nFirst,3\nFirst,4\n' : 'group,amount\nSecond,5\nSecond,6\n';
    return spec;
  });
  const before = originals.map(canonical), adapted = originals.map(adaptExecutionSpec);
  assert.equal(adapted[0].mapping.compiledName, adapted[1].mapping.compiledName);
  assert.notEqual(adapted[0].mapping.originalName, adapted[1].mapping.originalName);
  assert.notDeepEqual(adapted[0].spec.inputs, adapted[1].spec.inputs);
  const packs = await Promise.all(adapted.map(({ spec }) => run(spec, { sourceHash })));
  assert.deepEqual(packs.map(pack => pack.result.summary.total), [7, 11]);
  assert.notEqual(packs[0].frozen.missionDigest, packs[1].frozen.missionDigest);
  assert.notEqual(packs[0].compilation.constitution.missionId, packs[1].compilation.constitution.missionId);
  for (let index = 0; index < originals.length; index++) {
    assert.deepEqual(packs[index].spec.inputs, originals[index].inputs);
    assert.equal(canonical(originals[index]), before[index]);
  }
});
