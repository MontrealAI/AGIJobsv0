import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluate } from '../../demo/zenith-sapience/engine.mjs';
import { buildZenithSite } from '../../scripts/pages/zenith-build.mjs';
const fixture = JSON.parse(
  fs.readFileSync('demo/zenith-sapience/scenario.json')
);
test('browser bundles exact original engine, preserves unknowns and exposes partial deficits', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-browser-'));
  try {
    await buildZenithSite(temp);
    const browser = await import(pathToFileURL(path.join(temp, 'engine.mjs')));
    const cases = [fixture];
    for (let i = 0; i < 100; i++) {
      const s = structuredClone(fixture);
      s.jobs[2].reportedUnits = i % 7 === 0 ? null : String(i * 1000);
      s.jobs[0].reportedUnits = String(40000 + i * 33);
      if (i % 11 === 0) s.regions[0].allocationUnits = '40001';
      cases.push(s);
    }
    for (const s of cases) assert.deepEqual(browser.evaluate(s), evaluate(s));
    assert.equal(browser.evaluate(fixture).reported, null);
    assert.equal(browser.evaluate(fixture).proposals.length, 0);
    const partial = structuredClone(fixture);
    partial.jobs[2].reportedUnits = '999999';
    const r = browser.evaluate(partial);
    assert.equal(r.fullyFundedAfterProposal, false);
    assert.notEqual(r.uncoveredDeficitUnits, '0');
    assert.equal(r.transfersExecuted, false);
    for (const text of ['{"x":1,"x":2}', '{"x":NaN}'])
      assert.throws(() => browser.parseStrictJson(text));
    for (const value of ['1e1', '1.00000000000000001', '01', '-1']) {
      const s = structuredClone(fixture);
      s.totalUnits = value;
      assert.throws(() => browser.evaluate(s));
    }
    assert.equal(
      fs.readFileSync(path.join(temp, 'scenario.json'), 'utf8'),
      fs.readFileSync('demo/zenith-sapience/scenario.json', 'utf8')
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
