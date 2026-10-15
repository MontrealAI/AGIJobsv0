import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { buildOmniphoenixSite } from '../../scripts/pages/omniphoenix-build.mjs';
import {
  mountDesk,
  rawInteger,
} from '../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/web/app.mjs';
import { fr } from '../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/web/i18n.mjs';
const require = createRequire(import.meta.url);
const nodeDesk = require('../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/index.cjs');
const source = new URL(
  '../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/',
  import.meta.url
);
const bytes = fs.readFileSync(
  new URL('project-plan.hyperstructure.json', source)
);
const html = fs.readFileSync(new URL('web/index.html', source), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniphoenix-test-'));
await buildOmniphoenixSite(dir);
const { desk } = await import(pathToFileURL(path.join(dir, 'engine.mjs')));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
function harness() {
  const dom = new JSDOM(html);
  const downloads = [];
  const app = mountDesk(dom.window.document, desk, bytes, {
    save: (bytes, name) => downloads.push({ bytes, name }),
  });
  return {
    dom,
    document: dom.window.document,
    app,
    downloads,
    $: (id) => dom.window.document.getElementById(id),
    input(id, value) {
      const node = this.$(id);
      node.value = value;
      node.dispatchEvent(new dom.window.Event('input'));
    },
    click(id) {
      this.$(id).click();
    },
  };
}
function file(data) {
  const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return {
    size: b.length,
    arrayBuffer: async () =>
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
}

test('bundled browser adapter exactly matches authoritative Node reports and recovery', () => {
  for (const controls of [
    {},
    { delays: [{ id: 'GLOBAL-INPUT-LEDGER', days: 5 }], horizonDays: 215 },
    {
      blockedJobIds: ['CLIMATE-SWARM-DEPLOY'],
      delays: [{ id: 'KNOWLEDGE-SAFEGUARD', days: 30 }],
      horizonDays: 220,
    },
  ]) {
    assert.deepEqual(
      desk.analyzeBytes(bytes, controls),
      nodeDesk.analyzeBytes(bytes, controls)
    );
    const envelope = desk.exportRecovery(bytes, controls);
    assert.deepEqual(envelope, nodeDesk.exportRecovery(bytes, controls));
    assert.deepEqual(
      desk.importRecovery(JSON.stringify(envelope)),
      nodeDesk.importRecovery(JSON.stringify(envelope))
    );
  }
});
test('bundle/source pins and source asset preserve original exact bytes; no broad Node adapters', () => {
  assert.deepEqual(fs.readFileSync(path.join(dir, 'plan.json')), bytes);
  const pins = JSON.parse(fs.readFileSync(path.join(dir, 'source-pins.json')));
  assert.equal(Object.keys(pins).length, 2);
  assert.ok(Object.values(pins).every((hash) => /^[a-f0-9]{64}$/.test(hash)));
  assert.match(
    fs.readFileSync(
      new URL('../../scripts/pages/omniphoenix-build.mjs', import.meta.url),
      'utf8'
    ),
    /args.importer !== engine/
  );
});
test('all visible static copy has French coverage; navigation, CSP and landmark contract', () => {
  const h = harness();
  for (const node of h.document.querySelectorAll('[data-i18n]'))
    assert.ok(fr[node.dataset.i18n], node.dataset.i18n);
  assert.equal(
    h.document.querySelector('header a').getAttribute('href'),
    '../../#explore'
  );
  assert.equal(h.document.querySelector('.skip').getAttribute('href'), '#main');
  assert.equal(h.document.querySelectorAll('main#main').length, 1);
  const csp = h.document.querySelector(
    '[http-equiv="Content-Security-Policy"]'
  ).content;
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.equal(h.$('job-controls').children.length, 7);
  assert.equal(h.app.getReport().baseline.criticalPathDays, 211);
  assert.equal(
    h.$('metrics').querySelector('[data-metric="allocated"] strong')
      .textContent,
    '1128000 AGIALPHA'
  );
  assert.doesNotMatch(
    h.$('results').textContent,
    /40000000000000|0xOMNIPHOENIX|atlas\.agent/
  );
  h.click('language');
  assert.equal(h.document.documentElement.lang, 'fr');
  assert.match(h.$('metrics').textContent, /Inconnu/);
  h.click('language');
  assert.equal(h.document.documentElement.lang, 'en');
});
test('raw controls reject lexical fractions, coercion and overflow; toggling language retains invalid text', () => {
  for (const invalid of [
    '',
    ' 1',
    '1 ',
    '01',
    '1.0',
    '1e2',
    '+2',
    '-0',
    '0x10',
    'Infinity',
    '365001',
    '9007199254740993',
  ])
    assert.throws(() => rawInteger(invalid));
  assert.equal(rawInteger('', { optional: true }), null);
  assert.equal(rawInteger('365000'), 365000);
});
test('DOM invalidation, recomputation, causal traces and exact download recovery', () => {
  const h = harness();
  h.input('delay-0', '1e2');
  assert.equal(h.app.getReport(), null);
  assert.equal(h.$('download-recovery').disabled, true);
  h.click('calculate');
  assert.equal(h.$('status').dataset.state, 'error');
  h.click('language');
  assert.equal(h.$('delay-0').value, '1e2');
  assert.equal(h.app.getReport(), null);
  h.input('delay-0', '5');
  h.click('calculate');
  assert.equal(h.app.getReport().scenario.criticalPathDays, 216);
  h.click('block-1');
  assert.equal(h.app.getReport(), null);
  h.click('calculate');
  const report = h.app.getReport();
  assert.equal(report.scenario.criticalPathDays, null);
  assert.match(
    h.$('trace').textContent,
    /CLIMATE-SWARM-DEPLOY → INFRA-REGEN-DEPLOY/
  );
  h.click('download-source');
  assert.deepEqual(Buffer.from(h.downloads[0].bytes), bytes);
  h.click('download-recovery');
  assert.deepEqual(desk.importRecovery(h.downloads[1].bytes).report, report);
  h.input('horizon', '1.0');
  h.click('calculate');
  assert.equal(h.app.getReport(), null);
  h.click('language');
  assert.equal(h.$('horizon').value, '1.0');
  h.click('reset');
  assert.equal(h.app.getReport().baseline.criticalPathDays, 211);
  assert.equal(h.$('horizon').value, '');
});
test('strict import rejects BOM, invalid UTF8, duplicate keys, tampering and unknown recovery keys', async () => {
  const h = harness();
  const envelope = desk.exportRecovery(bytes, {});
  const bad = [
    new Uint8Array([239, 187, 191, ...bytes]),
    new Uint8Array([255]),
    '{"initiative":"a","initiative":"b"}',
  ];
  for (const data of bad) {
    assert.equal(await h.app.importFile(file(data)), false);
    assert.equal(h.app.getReport(), null);
    assert.equal(h.$('download-source').disabled, true);
  }
  envelope.report.baseline.budget = '0';
  assert.equal(
    await h.app.importFile(file(JSON.stringify(envelope)), true),
    false
  );
  const unknown = { ...desk.exportRecovery(bytes, {}), extra: true };
  assert.equal(
    await h.app.importFile(file(JSON.stringify(unknown)), true),
    false
  );
  const okay = desk.exportRecovery(bytes, {
    delays: [{ id: 'GLOBAL-INPUT-LEDGER', days: 5 }],
  });
  assert.equal(await h.app.importFile(file(JSON.stringify(okay)), true), true);
  assert.equal(h.$('delay-0').value, '5');
  assert.deepEqual(h.app.getReport(), okay.report);
});
test('late imports cannot overwrite edits, another import, or reset; oversize rejects before reading', async () => {
  const h = harness();
  let release;
  const pending = {
    size: bytes.length,
    arrayBuffer: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  };
  const first = h.app.importFile(pending);
  h.input('delay-0', 'invalid');
  release(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  assert.equal(await first, false);
  assert.equal(h.$('delay-0').value, 'invalid');
  assert.equal(h.app.getReport(), null);
  const second = h.app.importFile(pending);
  h.click('reset');
  release(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  assert.equal(await second, false);
  assert.equal(h.app.getReport().scenario.criticalPathDays, 211);
  const third = h.app.importFile(pending);
  await h.app.importFile(file(bytes));
  release(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  assert.equal(await third, false);
  assert.equal(h.app.getReport().scenario.criticalPathDays, 211);
  let read = false;
  assert.equal(
    await h.app.importFile({
      size: 262145,
      arrayBuffer() {
        read = true;
      },
    }),
    false
  );
  assert.equal(read, false);
});
test('maximum source bytes and 100-job report round-trip through browser recovery without rounding', async () => {
  const original = bytes.toString('utf8');
  const padded = original + ' '.repeat(262144 - bytes.length);
  const h = harness();
  assert.equal(await h.app.importFile(file(padded)), true);
  h.click('download-source');
  assert.equal(h.downloads[0].bytes.length, 262144);
  assert.equal(new TextDecoder().decode(h.downloads[0].bytes), padded);
  h.click('download-recovery');
  assert.equal(await h.app.importFile(file(h.downloads[1].bytes), true), true);
  const p = JSON.parse(original);
  p.jobs = Array.from({ length: 100 }, (_, i) => ({
    ...p.jobs[0],
    id: 'job-' + i,
    title: '<img src=x onerror=alert(1)> ' + i,
    reward: '0.000000000000000001',
    deadlineDays: 1,
    dependencies: i ? ['job-' + (i - 1)] : [],
  }));
  const plan = JSON.stringify(p);
  assert.equal(await h.app.importFile(file(plan)), true);
  assert.equal(
    h.app.getReport().baseline.allocatedRewards,
    '0.0000000000000001'
  );
  assert.equal(h.document.querySelectorAll('#trace img').length, 0);
  h.click('block-0');
  h.click('calculate');
  assert.equal(
    h.app.getReport().scenario.blockedRewardExposure,
    '0.0000000000000001'
  );
  h.click('download-recovery');
  const exported = h.downloads.at(-1);
  assert.ok(exported.bytes.length <= 4194304);
  assert.equal(await h.app.importFile(file(exported.bytes), true), true);
  assert.equal(h.$('job-controls').children.length, 100);
});

test('source editing validates original Unicode before encoding and fingerprints exact whitespace', () => {
  const h = harness();
  const first = h.app.getReport();
  h.input('source-text', bytes.toString('utf8') + '\n ');
  assert.equal(h.app.getReport(), null);
  h.click('language');
  assert.equal(h.$('source-text').value, bytes.toString('utf8') + '\n ');
  h.click('calculate');
  assert.notEqual(h.app.getReport().sourceSha256, first.sourceSha256);
  assert.notEqual(h.app.getReport().reportSha256, first.reportSha256);
  h.click('download-source');
  assert.equal(
    new TextDecoder().decode(h.downloads[0].bytes),
    bytes.toString('utf8') + '\n '
  );
  h.input(
    'source-text',
    bytes.toString('utf8').replace('Omniphoenix', '\ud800')
  );
  h.click('calculate');
  assert.equal(h.app.getReport(), null);
  assert.equal(h.$('status').dataset.state, 'error');
});

test('the exact dashboard registry and browser verification remain mandatory in site QA', () => {
  const qa = fs.readFileSync(
    new URL('../../scripts/pages/browser-qa.mjs', import.meta.url),
    'utf8'
  );
  assert.match(qa, /await verifyOmniphoenix\(/);
  assert.match(qa, /assertDashboardRoutes\(/);
  assert.match(
    qa,
    /expectedDesignLinks\(makeCatalog\(\), root, manifest.basePath\)/
  );
  const build = fs.readFileSync(
    new URL('../../scripts/pages/build.mjs', import.meta.url),
    'utf8'
  );
  assert.match(build, /await buildOmniphoenixSite\(/);
  const profiles = JSON.parse(
    fs.readFileSync(
      new URL('../../website/demo-experiences.json', import.meta.url)
    )
  );
  assert.deepEqual(
    profiles['OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE'].dashboards.map(
      (d) => d.route
    ),
    ['experiments/omniphoenix/']
  );
});

for (const [ending, separator] of [
  ['CRLF', '\r\n'],
  ['CR', '\r'],
]) {
  for (const recovery of [false, true]) {
    test(`${ending} ${
      recovery ? 'recovery' : 'source'
    } import preserves exact bytes through controls until an explicit source edit`, async () => {
      const h = harness();
      const exact = Buffer.from(
        bytes.toString('utf8').replace(/\n/g, separator)
      );
      const expectedHash = desk.analyzeBytes(exact).sourceSha256;
      const input = recovery
        ? JSON.stringify(desk.exportRecovery(exact, {}))
        : exact;
      assert.equal(await h.app.importFile(file(input), recovery), true);
      // The browser display is intentionally normalized, but is not the source.
      assert.equal(h.$('source-text').value.includes('\r'), false);
      function assertExact() {
        assert.equal(h.app.getReport().sourceSha256, expectedHash);
        h.click('download-source');
        assert.deepEqual(Buffer.from(h.downloads.at(-1).bytes), exact);
        h.click('download-recovery');
        const reopened = desk.importRecovery(h.downloads.at(-1).bytes);
        assert.equal(reopened.sourceText, exact.toString('utf8'));
        assert.equal(reopened.report.sourceSha256, expectedHash);
      }
      assertExact();
      h.click('calculate');
      assertExact();
      h.input('delay-0', '5');
      h.click('calculate');
      assertExact();
      assert.equal(h.app.getReport().scenario.criticalPathDays, 216);
      h.click('block-1');
      h.click('calculate');
      assertExact();
      assert.equal(h.app.getReport().scenario.criticalPathDays, null);
      h.input('horizon', '220');
      h.click('calculate');
      assertExact();
      h.click('language');
      h.click('calculate');
      assertExact();
      h.input('delay-0', '1e2');
      h.click('calculate');
      assert.equal(h.app.getReport(), null);
      h.input('delay-0', '5');
      h.click('calculate');
      assertExact();
      const edited = h.$('source-text').value + ' ';
      h.input('source-text', edited);
      h.click('calculate');
      assert.notEqual(h.app.getReport().sourceSha256, expectedHash);
      assert.equal(
        h.app.getReport().sourceSha256,
        desk.analyzeBytes(edited).sourceSha256
      );
      h.click('download-source');
      assert.equal(new TextDecoder().decode(h.downloads.at(-1).bytes), edited);
      h.click('download-recovery');
      assert.equal(
        desk.importRecovery(h.downloads.at(-1).bytes).sourceText,
        edited
      );
    });
  }
}
