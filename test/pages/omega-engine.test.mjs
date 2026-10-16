import { createHash as browserHash } from '../../demo/zenith-sapience-initiative-omega-omni-operating-system/web/crypto-shim.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { buildOmegaSite } from '../../scripts/pages/omega-build.mjs';
const require = createRequire(import.meta.url),
  original = require('../../demo/zenith-sapience-initiative-omega-omni-operating-system/engine.cjs');
test('exact stage engine and hash adapter match Node; replay rejects rehashed forged stage data', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-browser-'));
  try {
    await buildOmegaSite(temp);
    const browser = await import(pathToFileURL(path.join(temp, 'engine.mjs'))),
      replay = await import(pathToFileURL(path.join(temp, 'replay.mjs'))),
      pins = JSON.parse(fs.readFileSync(path.join(temp, 'source-pins.json'))),
      fixture = JSON.parse(fs.readFileSync(path.join(temp, 'fixture.json')));
    for (const text of ['', 'abc', 'Énergie 🍁', 'x'.repeat(10000)])
      assert.equal(
        browser.digest(text),
        createHash('sha256').update(text).digest('hex')
      );
    for (const injectError of [false, true]) {
      let previous = null;
      for (let i = 0; i < 5; i++) {
        if (i === 4 && injectError) {
          assert.throws(() =>
            browser.executeStage(i, previous, { injectError })
          );
          break;
        }
        const expected = original.executeStage(i, previous, { injectError });
        assert.deepEqual(
          browser.executeStage(i, previous, { injectError }),
          expected
        );
        previous = expected;
      }
    }
    assert.equal(replay.reviewReplay(fixture, pins).complete, true);
    for (const mutate of [
      (f) => (f.records[1].previousSha256 = '0'.repeat(64)),
      (f) => (f.records[0].sourcePins['engine.cjs'] = '0'.repeat(64)),
      (f) => (f.records[1].data.recommendedSupplier = 'forged'),
      (f) => (f.records[1].options.injectError = true),
      (f) => f.records.splice(1, 1),
      (f) => (f.productionApproved = true),
    ]) {
      const f = structuredClone(fixture);
      mutate(f);
      assert.throws(() => replay.reviewReplay(f, pins));
    }
    const rehashed = structuredClone(fixture);
    rehashed.records[1].data.recommendedSupplier = 'forged';
    for (let i = 1; i < rehashed.records.length; i++)
      rehashed.records[i].previousSha256 = browser.digest(
        JSON.stringify(rehashed.records[i - 1], null, 2) + '\n'
      );
    assert.throws(() => replay.reviewReplay(rehashed, pins));
    let started = replay.start(pins);
    assert.equal(replay.reviewReplay(started, pins).verifiedRetainedStages, 1);
    for (let i = 1; i < 5; i++) started = replay.advance(started, pins);
    assert.equal(replay.reviewReplay(started, pins).complete, true);
    let bad = replay.start(pins, true);
    for (let i = 1; i < 4; i++) bad = replay.advance(bad, pins);
    assert.equal(replay.reviewReplay(bad, pins).reviewAccepted, false);
    assert.throws(() => replay.advance(bad, pins));
    assert.equal(
      replay.reviewReplay(started, pins).persistentStorageVerified,
      false
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('bounded hash compatibility rejects unsupported algorithms, encodings and reuse', () => {
  assert.throws(() => browserHash('md5'));
  assert.throws(() => browserHash('sha256').update({}));
  assert.throws(() => browserHash('sha256').update('abc', 'hex'));
  assert.throws(() => browserHash('sha256').update('abc').digest('base64'));
  const h = browserHash('sha256')
    .update('a')
    .update(new Uint8Array([98, 99]));
  assert.equal(
    h.digest('hex'),
    createHash('sha256').update('abc').digest('hex')
  );
  assert.throws(() => h.update('x'));
  assert.throws(() => h.digest('hex'));
});
