import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { examineWorldJourney } from '../src/examination.mjs';
import { runMissionJourney } from '../src/journeys.mjs';
import { CANDIDATE_BINDINGS, verifyProof } from '../src/proof.mjs';
import { digestObject } from '../src/integrity.mjs';

const sourceDigest = await digestObject(
  'test-examination-source.v1',
  await readFile(new URL('../src/examination.mjs', import.meta.url), 'utf8')
);
const now = Date.parse('2026-10-08T15:30:00.000Z');
const journey = await runMissionJourney('world');
const bundle = await examineWorldJourney(journey, { sourceDigest, now });
const verification = () => ({
  trustStore: bundle.trustStore,
  context: bundle.context,
  candidate: bundle.candidate,
  protocol: bundle.protocol,
  now,
});

test('actual world decisions flow through exact complete candidate freeze to a signed no-advantage FAIL', async () => {
  assert.equal(bundle.publicCaseCount, 60);
  assert.equal(bundle.evidence.cases.length, 60);
  assert.equal(bundle.report.sampleSize, 60);
  assert.equal(bundle.report.criticalMisses, 0);
  assert.equal(bundle.report.verdict, 'FAIL');
  assert.ok(bundle.report.failures.includes('NO_DEMONSTRATED_ADVANTAGE'));
  const strongest = bundle.report.comparisons.find(
    (row) => row.comparatorId === 'strong_conventional'
  );
  assert.equal(strongest.mean, 0);
  assert.ok(strongest.robustMargin < 0);
  assert.equal(bundle.candidate.manifest.missionId, journey.mission.missionId);
  assert.deepEqual(
    bundle.components.programs.content.program,
    journey.workbench.candidates.find(
      (item) => item.id === 'synthesized_challenger'
    ).program
  );
  assert.equal(
    bundle.candidate.manifest.bindings.constitution,
    journey.compilation.digest
  );
  for (const key of CANDIDATE_BINDINGS) {
    assert.equal(
      bundle.candidate.manifest.bindings[key],
      await digestObject(
        bundle.components[key].domain,
        bundle.components[key].content
      )
    );
  }
  assert.equal(bundle.components.runtime.content.sourceDigest, sourceDigest);
  assert.equal(bundle.components.memory.content.formation.length, 12);
  assert.equal(bundle.components.memory.content.knownFailureHistory.length, 6);
  const actualTotal = bundle.evidence.cases.reduce(
    (sum, item) => sum + item.candidate.netUtility,
    0
  );
  const original = journey.workbench.candidates.find(
    (item) => item.id === 'synthesized_challenger'
  ).metrics.utility;
  assert.ok(Math.abs(actualTotal - original) < 1e-9);
  assert.equal(
    (await verifyProof(bundle.proof, verification())).payload.verdict,
    'FAIL'
  );
});

test('signed internal failure has no independent admission or private signing material', async () => {
  assert.equal(bundle.proof.payload.independence, 'I0');
  assert.equal(bundle.protocol.evidenceMode, 'synthetic-public');
  assert.equal(
    bundle.samplingAssumption.empiricalIndependenceEstablished,
    false
  );
  assert.equal(bundle.independentAdmission.allowed, false);
  assert.equal(bundle.independentAdmission.code, 'INDEPENDENCE_REQUIRED');
  assert.equal(bundle.productionAuthority, false);
  assert.equal(
    bundle.trustStore.keys.every((key) => key.fixture === true),
    true
  );
  const serialized = JSON.stringify(bundle);
  assert.equal(serialized.includes('PRIVATE KEY'), false);
  assert.equal(serialized.includes('privateKey'), false);
  await assert.rejects(
    verifyProof(bundle.proof, { ...verification(), requireIndependent: true }),
    { code: 'INDEPENDENCE_REQUIRED' }
  );
});

test('changed signed measurements, frozen programs and invented input records cannot pass examination', async () => {
  const proof = structuredClone(bundle.proof);
  proof.payload.comparisons[0].mean++;
  await assert.rejects(verifyProof(proof, verification()), {
    code: 'INVALID_SIGNATURE',
  });
  const candidate = structuredClone(bundle.candidate);
  candidate.manifest.bindings.programs = 'sha256:' + '0'.repeat(64);
  await assert.rejects(
    verifyProof(bundle.proof, { ...verification(), candidate }),
    { code: 'CANDIDATE_TAMPERED' }
  );
  const altered = structuredClone(journey);
  altered.workbench.candidates[0].predictions[0].observed++;
  await assert.rejects(examineWorldJourney(altered, { sourceDigest, now }), {
    code: 'JOURNEY_REPLAY_MISMATCH',
  });
  await assert.rejects(examineWorldJourney(journey, { now }), {
    code: 'SOURCE_COMMITMENT_REQUIRED',
  });
});
