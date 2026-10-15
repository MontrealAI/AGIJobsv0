import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import {
  artifacts,
  review,
  pack,
  unpack,
  strictJSON,
  bytes,
  digest,
  canonical,
  MAX_BYTES,
} from '../../demo/superintelligent-empowerment/web/model.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const root = path.resolve(import.meta.dirname, '../..'),
  source = path.join(root, 'demo/superintelligent-empowerment');
const raw = fs.readFileSync(path.join(source, 'evidence/example.json'));
const cli = Object.fromEntries(
  ['packet.json', 'ledger.json', 'report.md', 'receipt.json'].map((n) => [
    n,
    new Uint8Array(fs.readFileSync(path.join(source, 'web/cli-example', n))),
  ])
);
const python = `import importlib.util,sys,base64,json\np='demo/superintelligent-empowerment/code/evidence.py'\ns=importlib.util.spec_from_file_location('ledger',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\ntry:\n f=m.artifacts(sys.stdin.buffer.read());print(json.dumps({n:base64.b64encode(b).decode() for n,b in f.items()}))\nexcept Exception as e:\n print(str(e),file=sys.stderr);sys.exit(2)`;
async function parity(input) {
  const p = spawnSync('python3', ['-c', python], {
    cwd: root,
    input,
    encoding: 'utf8',
  });
  let result;
  try {
    result = await artifacts(new Uint8Array(input));
  } catch (e) {
    assert.equal(
      p.status,
      2,
      'browser rejects but Python accepts: ' + e.message
    );
    return;
  }
  assert.equal(p.status, 0, p.stderr);
  const expected = JSON.parse(p.stdout);
  for (const [n, s] of Object.entries(expected))
    assert.deepEqual(Buffer.from(result.files[n]), Buffer.from(s, 'base64'), n);
}
test('actual CLI artifacts verify and roundtrip exact bytes', async () => {
  const r = await review(cli);
  assert.equal(r.accepted, true);
  assert.equal(r.ledger.readyCount, 1);
  assert.deepEqual(unpack(pack(cli)), cli);
  await parity(raw);
});
test('rehashed forged output is rejected; self-consistent replacement accepted with unverified origin', async () => {
  const forged = structuredClone(cli);
  const ledger = JSON.parse(new TextDecoder().decode(forged['ledger.json']));
  ledger.readyCount = 3;
  forged['ledger.json'] = canonical(ledger);
  const receipt = JSON.parse(new TextDecoder().decode(forged['receipt.json']));
  receipt.artifacts['ledger.json'] = await digest(forged['ledger.json']);
  forged['receipt.json'] = canonical(receipt);
  await assert.rejects(() => review(forged), /recomputed/);
  const packet = JSON.parse(raw);
  packet.title = 'Entirely replaced supplied origin';
  const replacement = await artifacts(bytes(JSON.stringify(packet)));
  const accepted = await review(replacement.files);
  assert.equal(accepted.ledger.sourceAuthenticityVerified, false);
  assert.equal(accepted.ledger.realWorldImpactVerified, false);
});
test('lexical integers, malformed UTF-8, BOM, duplicate keys and source bytes agree with Python', async () => {
  const s = raw.toString();
  for (const input of [
    s.replace('"threshold": 8', '"threshold": 8.0'),
    s.replace('"threshold": 8', '"threshold": 8e0'),
    s.replace('"threshold": 8', '"threshold": true'),
    s.replace('"title":', '"title":"duplicate", "title":'),
    '\ufeff' + s,
    s.replace('"threshold": 8', '"threshold": -0'),
    s.replace('"threshold": 8', '"threshold": 1000000001'),
    s.replace('"threshold": 8', '"threshold": NaN'),
    s.replace(
      '"title": "Community project evidence rehearsal"',
      '"title": "\\ud800"'
    ),
  ])
    await parity(bytes(input));
  await parity(new Uint8Array([0xff, 0xfe]));
  for (const token of ['8.0', '8e0', 'true']) {
    const p = JSON.parse(s);
    p.evidence[0].sourceText = p.evidence[0].sourceText.replace(
      ':8}',
      ':' + token + '}'
    );
    p.evidence[0].sha256 = await digest(bytes(p.evidence[0].sourceText));
    await parity(bytes(JSON.stringify(p)));
  }
});
test('DAG order, gte/lte, Unicode lengths, missing and mismatched observations', async () => {
  for (let n = 0; n < 20; n++) {
    const p = JSON.parse(raw);
    p.title = 'Évidence 🧭 ' + n;
    p.initiatives[0].criterion.threshold = n;
    p.initiatives[0].criterion.operator = n % 2 ? 'lte' : 'gte';
    if (n % 3 === 0) p.initiatives.reverse();
    if (n % 4 === 0) p.initiatives[1].evidenceId = null;
    if (n === 17) p.initiatives[0].dependencies = ['expansion'];
    if (n === 18) p.initiatives[0].criterion.unit = 'wrong';
    if (n === 19) p.title = '🧭'.repeat(200);
    await parity(bytes(JSON.stringify(p)));
  }
});
test('exact 256 KiB packet survives envelope without truncation; over cap rejected', async () => {
  const padded = new Uint8Array(MAX_BYTES);
  padded.fill(32);
  padded.set(raw);
  const result = await artifacts(padded);
  assert.deepEqual(unpack(pack(result.files))['packet.json'], padded);
  await parity(padded);
  await assert.rejects(() => artifacts(new Uint8Array(MAX_BYTES + 1)));
  assert.throws(() => strictJSON(bytes('{"x":1,"x":2}')));
});
test('invalid schema, caps, dependency types and payload boundaries fail closed', async () => {
  for (const mutate of [
    (p) => (p.extra = 1),
    (p) => (p.evidence[0].sha256 = '0'.repeat(64)),
    (p) => (p.initiatives[0].dependencies = ['missing']),
    (p) => (p.initiatives[0].dependencies = [true]),
    (p) => (p.initiatives[0].dependencies = ['follow-up', 'follow-up']),
    (p) => (p.initiatives[0].evidenceId = 'missing'),
    (p) => (p.initiatives[0].criterion.threshold = -1),
    (p) => (p.initiatives[0].criterion.operator = 'eq'),
    (p) => (p.initiatives = []),
    (p) => (p.title = ' '.repeat(5)),
    (p) => p.evidence.push(p.evidence[0]),
    (p) => p.initiatives.push(p.initiatives[0]),
  ]) {
    const p = JSON.parse(raw);
    mutate(p);
    await parity(bytes(JSON.stringify(p)));
  }
});

test('source byte cap, exact whitespace, escaped duplicate names and astral DAG ties', async () => {
  for (const length of [16383, 16384, 16385]) {
    const p = JSON.parse(raw);
    p.evidence[0].sourceText += ' '.repeat(
      length - Buffer.byteLength(p.evidence[0].sourceText)
    );
    p.evidence[0].sha256 = await digest(bytes(p.evidence[0].sourceText));
    await parity(bytes(JSON.stringify(p)));
  }
  const p = JSON.parse(raw);
  const template = p.initiatives[0];
  p.initiatives = [
    { ...template, id: 'a', dependencies: ['b'] },
    { ...template, id: 'b', dependencies: [] },
    { ...template, id: 'c', dependencies: [] },
    { ...template, id: 'd', dependencies: ['a'] },
  ];
  const result = await artifacts(bytes(JSON.stringify(p)));
  assert.deepEqual(
    result.ledger.entries.map((i) => i.id),
    ['b', 'c', 'a', 'd']
  );
  await parity(bytes(JSON.stringify(p)));
  await parity(
    bytes(
      raw
        .toString()
        .replace('"threshold": 8', '"threshold": 8, "thresho\\u006cd": 8')
    )
  );
});
