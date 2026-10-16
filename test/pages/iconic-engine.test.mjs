import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  evaluate,
  parsePacket,
} from '../../demo/ICONIC-OPERATING-SYSTEM-DEMO/web/engine.mjs';
import {
  example,
  taskSourceSha256,
  quotes,
} from '../../demo/ICONIC-OPERATING-SYSTEM-DEMO/web/fixtures.mjs';
const copy = () => structuredClone(example);
test('source fixtures remain bound to original task and reviewer quotes', () => {
  assert.equal(
    taskSourceSha256,
    createHash('sha256')
      .update(readFileSync('demo/One-Box/computer-work/task.json'))
      .digest('hex')
  );
  assert.deepEqual(
    quotes,
    JSON.parse(readFileSync('demo/One-Box/computer-work/quotes.json'))
  );
});
test('default artifact passes eleven checks while unknown usage remains incomplete', async () => {
  const r = await evaluate(copy());
  assert.equal(r.artifactReview.accepted, true);
  assert.equal(r.artifactReview.checks.length, 11);
  assert.equal(r.packetComplete, false);
  assert.equal(r.usage.reportedCostMicrousd, null);
  const p = copy();
  p.usage = { inputTokens: 200, outputTokens: 100, reportedCostMicrousd: 500 };
  const complete = await evaluate(p);
  assert.equal(complete.packetComplete, true);
  for (const key of [
    'executionAttested',
    'costAttested',
    'admitted',
    'settlementApproved',
    'productionApproved',
  ])
    assert.equal(complete[key], false);
});
test('strict import rejects unknown/duplicate fields and reopens only recomputable packet', () => {
  for (const text of [
    '{"a":1,"a":2}',
    '{"a":NaN}',
    '{"a":1.0}',
    ' '.repeat(1000001),
  ])
    assert.throws(() => parsePacket(text));
  const p = copy();
  p.receipt.artifacts[1].name = 'comparison.json';
  assert.throws(() => parsePacket(JSON.stringify(p)));
  const recovered = parsePacket(
    JSON.stringify({
      schema: 'agijobs.supplier-browser-evidence.v1',
      packet: example,
      result: { admitted: true },
      downloadedPacketSha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), example);
});
test('full Python and browser evaluator parity for sixty policy/artifact cases', async () => {
  const packets = [];
  for (let i = 0; i < 60; i++) {
    const p = copy();
    if (i % 2)
      p.usage = {
        inputTokens: i * 100,
        outputTokens: i * 25,
        reportedCostMicrousd: i * 10000,
      };
    if (i % 3 === 0) p.policy.maximumCalls = 2;
    if (i % 5 === 0) p.execution.workerTerminated = false;
    if (i % 7 === 0) p.productionApproved = true;
    if (i % 11 === 0)
      p.receipt.artifacts[0].content = p.receipt.artifacts[0].content.replace(
        '49000',
        '49001'
      );
    if (i % 13 === 0) p.taskSourceSha256 = '0'.repeat(64);
    packets.push(p);
  }
  const code =
    "import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('iconic',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nprint(json.dumps([m.evaluate(p) for p in json.load(sys.stdin)]))";
  const r = spawnSync(
    'python3',
    [
      '-c',
      code,
      process.env.ICONIC_PYTHON_SOURCE ||
        'demo/ICONIC-OPERATING-SYSTEM-DEMO/run.py',
    ],
    { input: JSON.stringify(packets), encoding: 'utf8' }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(
    await Promise.all(packets.map(evaluate)),
    JSON.parse(r.stdout)
  );
});

test('near-limit packet and evidence roundtrip preserve strict inner byte cap', () => {
  const p = copy();
  p.receipt.artifacts.find((f) => f.name === 'recommendation.md').content =
    '\u0000'.repeat(166480);
  const compact = JSON.stringify(p);
  assert.ok(Buffer.byteLength(compact) <= 1000000);
  assert.equal(JSON.stringify(parsePacket(compact)), JSON.stringify(p));
  const envelope = JSON.stringify(
    {
      schema: 'agijobs.supplier-browser-evidence.v1',
      packet: p,
      result: { forged: true },
      downloadedPacketSha256: 'ignored',
      hashScope: 'ignored',
    },
    null,
    2
  );
  assert.ok(Buffer.byteLength(envelope) > 1000000);
  assert.equal(JSON.stringify(parsePacket(envelope)), JSON.stringify(p));
  assert.throws(() => parsePacket(compact + ' '.repeat(1000000)));
  p.receipt.artifacts.find((f) => f.name === 'recommendation.md').content +=
    '\u0000'.repeat(10);
  assert.throws(() =>
    parsePacket(
      JSON.stringify({
        schema: 'agijobs.supplier-browser-evidence.v1',
        packet: p,
        result: {},
        downloadedPacketSha256: '',
        hashScope: '',
      })
    )
  );
});
