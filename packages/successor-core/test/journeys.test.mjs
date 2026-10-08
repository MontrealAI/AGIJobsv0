import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkbenchMission,
  runMissionJourney,
  packJourney,
  verifyPublicJourney,
} from '../src/journeys.mjs';
import { verifyWorkOrderSeal } from '../src/compiler.mjs';
import { restoreMissionPack, createSuccessor } from '../src/pack.mjs';

for (const name of ['world', 'resources'])
  test(`${name} binds actual study identities and tools to the same sealed compiler contracts`, async () => {
    const journey = await runMissionJourney(name);
    assert.equal(journey.workbench.missionId, journey.mission.missionId);
    assert.equal(
      journey.compilation.graph.missionId,
      journey.mission.missionId
    );
    assert.equal(journey.compilation.graph.nodes.length, 21);
    for (const job of journey.compilation.graph.nodes)
      assert.equal(await verifyWorkOrderSeal(job), true);
    const measured = new Set(
      (name === 'world'
        ? journey.workbench.candidates
        : journey.workbench.comparators
      ).map((item) => item.id)
    );
    assert.ok(measured.has(journey.mission.incumbent.id));
    for (const alternative of journey.mission.alternatives)
      assert.ok(measured.has(alternative.id));
    assert.equal(journey.compilation.authorityCreated, 'NONE');
    assert.equal(journey.authority.externalEffects, false);
    assert.equal(journey.workbench.activeProductionAuthority, false);
    assert.equal(journey.workbench.alpha.status, 'ABSENT');
    assert.ok(
      journey.mission.allowedTools.includes(
        name === 'world'
          ? 'bounded-symbolic-interpreter'
          : 'bounded-resource-scheduler'
      )
    );
  });

test('constituted hard gates and budgets cannot be weakened by workbench run options', async () => {
  await assert.rejects(runMissionJourney('world', { criticalMissBudget: 6 }), {
    code: 'MISSION_POLICY_MISMATCH',
  });
  await assert.rejects(runMissionJourney('resources', { budget: 10001 }), {
    code: 'MISSION_BUDGET_EXCEEDED',
  });
  assert.throws(() => createWorkbenchMission('renamed-alias'), {
    code: 'UNKNOWN_MISSION',
  });
});

test('world export keeps executable programs, real counterexamples and supplier rerun evidence, but no authority', async () => {
  const journey = await runMissionJourney('world');
  const pack = await packJourney(journey);
  assert.equal(
    pack.artifacts.filter((item) => item.kind === 'program').length,
    4
  );
  const failures = pack.artifacts.find(
    (item) => item.path === 'knowledge/failure-boundaries.json'
  ).content;
  assert.equal(failures.counterexamples.length, 6);
  const substitution = pack.artifacts.find(
    (item) => item.path === 'evidence/local-supplier-substitution.json'
  ).content;
  assert.equal(substitution.compatibility.equivalent, true);
  assert.equal(substitution.compatibility.results.length, 60);
  assert.ok(
    pack.chronicle.some((event) => event.type === 'HYPOTHESIS_FALSIFIED')
  );
  assert.match(
    pack.artifacts.find((item) => item.path === 'restore.json').content.command,
    /--mission world$/
  );
  const restored = await restoreMissionPack(JSON.parse(JSON.stringify(pack)));
  const descendant = await createSuccessor(restored, {
    id: 'descendant-world-2',
    supplier: 'residual_fit_supplier',
  });
  assert.equal(restored.executionEnabled, false);
  assert.deepEqual(restored.activeAuthority, []);
  assert.equal(descendant.proofCurrency, 'absent');
  assert.deepEqual(descendant.authority, []);
  assert.ok(
    descendant.knowledge.some(
      (item) => item.path === 'programs/synthesized_challenger.json'
    )
  );
});

test('public export rejects relabeled custom sources, nonfixture evidence and arbitrary imported metadata', async () => {
  const invoice = await runMissionJourney('invoice');
  const changedSources = structuredClone(invoice);
  changedSources.sources[0].text =
    'An unrelated customer document does not become an owned synthetic fixture by changing a label.';
  await assert.rejects(packJourney(changedSources), {
    code: 'JOURNEY_SOURCE_MISMATCH',
  });
  const world = await runMissionJourney('world');
  const cases = [
    [
      (value) => {
        value.mode = 'LIVE';
      },
      'JOURNEY_MODE_MISMATCH',
    ],
    [
      (value) => {
        value.mission.rights[0].license = 'Claimed customer ownership';
      },
      'JOURNEY_PRESET_MISMATCH',
    ],
    [
      (value) => {
        value.workbench.missionId = 'different-mission';
      },
      'JOURNEY_EVIDENCE_MISMATCH',
    ],
    [
      (value) => {
        value.workbench.evidenceClass = 'PROTECTED_INDEPENDENT_PROOF';
      },
      'JOURNEY_EVIDENCE_MISMATCH',
    ],
    [
      (value) => {
        value.workbench.independentProof = true;
      },
      'JOURNEY_EVIDENCE_MISMATCH',
    ],
    [
      (value) => {
        value.extraMetadata = {
          unrelatedDocument:
            'Private text cannot be laundered through a known mission ID.',
        };
      },
      'JOURNEY_REPLAY_MISMATCH',
    ],
    [
      (value) => {
        value.workbench.candidates[0].program.externalText =
          'Unrelated licensed text';
      },
      'JOURNEY_REPLAY_MISMATCH',
    ],
  ];
  for (const [change, code] of cases) {
    const input = structuredClone(world);
    change(input);
    await assert.rejects(packJourney(input), { code });
  }
});

test('public export validates source receipts, constitution bindings, graph seals and measured results', async () => {
  const world = await runMissionJourney('world');
  const cases = [
    [
      (value) => {
        value.compilation.constitution.objective = 'Different mission';
      },
      'JOURNEY_CONSTITUTION_MISMATCH',
    ],
    [
      (value) => {
        value.compilation.digest = 'sha256:' + '0'.repeat(64);
      },
      'JOURNEY_CONSTITUTION_MISMATCH',
    ],
    [
      (value) => {
        value.compilation.graph.nodes[0].objective = 'Changed sealed job';
      },
      'JOB_SEAL_INVALID',
    ],
    [
      (value) => {
        value.compilation.graph.digest = 'sha256:' + '0'.repeat(64);
      },
      'JOURNEY_GRAPH_MISMATCH',
    ],
    [
      (value) => {
        value.workbench.candidates[0].metrics.correct++;
      },
      'JOURNEY_REPLAY_MISMATCH',
    ],
  ];
  for (const [change, code] of cases) {
    const input = structuredClone(world);
    change(input);
    await assert.rejects(packJourney(input), { code });
  }
  const invoice = await runMissionJourney('invoice');
  invoice.receipts[0].inputs[0].digest = 'sha256:' + '0'.repeat(64);
  await assert.rejects(packJourney(invoice), {
    code: 'JOURNEY_REPLAY_MISMATCH',
  });
});

test('public export verifies supported recorded parameters without replacing the supplied results', async () => {
  for (const [name, options] of [
    ['invoice', { now: '2026-10-09T09:30:00Z' }],
    ['world', { seed: 17, maxCandidates: 5, maxSteps: 50000 }],
    [
      'resources',
      {
        goodProbability: 0.4,
        stressGoodProbability: 0.2,
        budget: 25,
        horizon: 1,
      },
    ],
  ]) {
    const journey = await runMissionJourney(name, options);
    const before = JSON.stringify(journey);
    const verified = await verifyPublicJourney(journey);
    const pack = await packJourney(journey);
    assert.equal(verified.provenance, 'AUTHORED_PUBLIC_FIXTURE_CONTENT_MATCH');
    assert.deepEqual(
      pack.artifacts.find((item) => item.path === 'evidence/rehearsal.json')
        .content,
      journey
    );
    assert.equal(JSON.stringify(journey), before);
  }
});
