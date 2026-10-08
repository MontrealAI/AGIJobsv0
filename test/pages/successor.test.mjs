import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { renderSuccessorPage } from '../../scripts/pages/successor.mjs';
import { successorCopy } from '../../website/assets/successor-copy.mjs';
import {
  createRehearsalState,
  invalidateRehearsal,
  recordRehearsalRun,
  freezeRehearsal,
  reviewRehearsal,
  impairRehearsal,
} from '../../packages/successor-core/src/presentation-state.mjs';
import { runInvoiceJourney } from '../../packages/successor-core/src/invoice.mjs';
import {
  createMissionPack,
  restoreMissionPack,
} from '../../packages/successor-core/src/pack.mjs';

const revision = '5b4cebb309a83a7a6749d8911d8bf96a1921e042';

test('W01: EN/FR core journey has semantic parity, labels, explicit research scope and project-prefix links', () => {
  assert.deepEqual(
    Object.keys(successorCopy.en).sort(),
    Object.keys(successorCopy.fr).sort()
  );
  const documents = ['en', 'fr'].map(
    (language) =>
      new JSDOM(renderSuccessorPage('/AGIJobsv0/', revision, language)).window
        .document
  );
  for (const [index, doc] of documents.entries()) {
    assert.equal(doc.querySelector('main').lang, index ? 'fr' : 'en');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelectorAll('[data-omega-mission]').length, 3);
    const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const control of doc.querySelectorAll('input,select'))
      assert.ok(doc.querySelector(`label[for="${control.id}"]`));
    for (const anchor of doc.querySelectorAll('a[href^="/"]'))
      assert.ok(anchor.getAttribute('href').startsWith('/AGIJobsv0/'));
    assert.equal(doc.querySelector('#omega-freeze').disabled, true);
    assert.equal(doc.querySelector('#omega-export').disabled, true);
    assert.equal(
      doc.querySelectorAll('input[type="password"],input[name="apiKey"]')
        .length,
      0
    );
    assert.match(doc.querySelector('#omega-state-authority').textContent, /A0/);
    assert.ok(
      doc
        .querySelector('a[hreflang="fr"]')
        .href.includes('/AGIJobsv0/successor/fr/')
    );
  }
  assert.deepEqual(
    [...documents[0].querySelectorAll('[id]')].map((n) => n.id),
    [...documents[1].querySelectorAll('[id]')].map((n) => n.id)
  );
});

test('W02: actual invoice output freezes exact semantic content but never creates independent proof or authority', async () => {
  const draft = createRehearsalState('invoice', revision),
    report = await runInvoiceJourney();
  const evaluated = recordRehearsalRun(draft, report, draft.generation);
  const frozen = await freezeRehearsal(evaluated);
  assert.match(frozen.frozen.digest, /^sha256:[a-f0-9]{64}$/);
  const reviewed = reviewRehearsal(frozen);
  assert.equal(reviewed.review.decision, 'DENIED');
  assert.equal(reviewed.review.reason, 'INDEPENDENT_PROOF_REQUIRED');
  assert.equal(reviewed.proofCurrency, 'absent');
  assert.deepEqual(reviewed.authority, []);
  assert.equal(reviewed.report.dossier.recommendation, 'HOLD_AND_ESCALATE');
  const changed = structuredClone(report);
  changed.dossier.metrics.costBaseUnits = '1001';
  const changedFreeze = await freezeRehearsal(
    recordRehearsalRun(draft, changed, 0)
  );
  assert.notEqual(changedFreeze.frozen.digest, frozen.frozen.digest);
  assert.throws(() => recordRehearsalRun(draft, { mode: 'PRODUCTION' }, 0), {
    code: 'UI_SCOPE_MISMATCH',
  });
});

test('W02: stale asynchronous results cannot revive cleared reports, previews or downloads', async () => {
  const original = createRehearsalState(),
    cleared = invalidateRehearsal(original);
  const report = await runInvoiceJourney();
  assert.equal(
    recordRehearsalRun(cleared, report, original.generation),
    cleared
  );
  assert.equal(cleared.report, null);
  assert.equal(cleared.frozen, null);
  assert.throws(() => reviewRehearsal(cleared), { code: 'UI_FREEZE_REQUIRED' });
  const frozen = await freezeRehearsal(
    recordRehearsalRun(cleared, report, cleared.generation)
  );
  const impaired = impairRehearsal(frozen);
  assert.equal(impaired.stage, 'IMPAIRED');
  assert.equal(impaired.frozen, null);
  assert.equal(impaired.advantage, 'INVALIDATED');
  assert.deepEqual(impaired.authority, []);
});

test('W03: restored evidence remains inert even when hostile text resembles HTML', async () => {
  const hostile = '<img src=x onerror=alert(1)> — retained failure';
  const pack = await createMissionPack({
    institutionId: 'test-fixture',
    missionId: 'invoice',
    artifacts: [
      {
        path: 'knowledge/failure.json',
        kind: 'negative-knowledge',
        rights: 'owned',
        license: 'CC0-1.0',
        content: { note: hostile },
      },
    ],
  });
  const restored = await restoreMissionPack(pack);
  assert.equal(restored.artifacts[0].content.note, hostile);
  assert.deepEqual(restored.activeAuthority, []);
  assert.equal(restored.executionEnabled, false);
  const browser = fs.readFileSync(
    new URL('../../website/assets/successor.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    browser,
    /\.innerHTML\s*=|eval\s*\(|new Function|localStorage|fetch\s*\(/
  );
  assert.doesNotMatch(
    browser,
    /from\s+['"][^'"]*(?:proof|authority|signatures|store|runtime)\.mjs/
  );
  assert.match(browser, /token !== operation/);
});

test('W01: source rendering escapes revision and fails unsupported languages', () => {
  const doc = new JSDOM(
    renderSuccessorPage('/AGIJobsv0/', '"><img src=x onerror=alert(1)>')
  ).window.document;
  assert.equal(doc.querySelectorAll('img').length, 0);
  assert.throws(() => renderSuccessorPage('/AGIJobsv0/', revision, 'xx'));
});
