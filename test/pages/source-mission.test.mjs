import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderSourceMissionPage } from '../../scripts/pages/source-mission.mjs';
import { sourceMissionCopy } from '../../website/assets/source-mission-copy.mjs';
import { SOURCE_MISSION_STRATEGIES } from '../../packages/successor-core/src/source-mission.mjs';

const base = '/AGIJobsv0/';
const revision = '0123456789abcdef0123456789abcdef01234567';
const page = (language = 'en', commit = revision) => new JSDOM(renderSourceMissionPage(base, commit, language)).window.document;

test('both source mission routes expose an accessible first-use workspace and fail-closed output controls', () => {
  for (const language of ['en', 'fr']) {
    const document = page(language), root = document.querySelector('[data-source-mission]');
    assert.equal(root.lang, language);
    assert.equal(document.querySelectorAll('main').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('#sm-status').getAttribute('role'), 'status');
    for (const input of document.querySelectorAll('input, textarea, select')) {
      assert.ok(input.id && document.querySelector(`label[for="${input.id}"]`) || input.closest('label'), `Missing label: ${language} ${input.id}`);
      for (const help of (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean))
        assert.ok(document.getElementById(help), `Missing help: ${language} ${help}`);
    }
    for (const selector of ['#sm-title-input', '#sm-source-title', '#sm-goal', '#sm-text', '#sm-public', '#sm-fresh-title', '#sm-fresh-text', '#sm-fresh-public', '#sm-fresh-unused'])
      assert.equal(document.querySelector(selector).required, true, `${language} ${selector}`);
    for (const id of ['export', 'report', 'jobs']) assert.equal(document.querySelector(`#sm-${id}`).disabled, true);
    assert.equal(document.querySelector('#sm-results').hidden, true);
    assert.equal(document.querySelector('#sm-text').maxLength, 40000);
    assert.equal(document.querySelector('#sm-fresh-text').maxLength, 40000);
    assert.equal(document.querySelector('#sm-brief').maxLength, 4000);
    assert.equal(document.querySelector('#sm-restore').accept, 'application/json,.json');
  }
});

test('the research companion preserves project-prefix navigation and separates local extraction from proof and live contracts', () => {
  for (const language of ['en', 'fr']) {
    const document = page(language), links = [...document.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    assert.ok(links.includes(`${base}successor/research/`));
    assert.ok(links.includes(`${base}successor/research/fr/`));
    assert.ok(links.includes(`${base}successor/alpha/`));
    assert.ok(links.includes(`${base}successor/build/${language === 'fr' ? '?lang=fr' : ''}`));
    assert.ok(links.includes(`${base}ecosystem/#contracts`));
    assert.equal(document.querySelector('a[aria-current="page"]').getAttribute('lang'), language);
    assert.match(document.querySelector('.sm-free').textContent, language === 'fr' ? /Sans compte, portefeuille ni clé API/ : /No account, wallet or API key/);
    assert.equal(document.querySelector('.sm-boundary').textContent.includes(sourceMissionCopy[language].promiseBody), true);
    assert.equal(document.querySelector('.sm-human').textContent.includes(sourceMissionCopy[language].human4), true);
    assert.match(document.querySelector('.sm-jobs-detail').textContent, language === 'fr' ? /non signés et non financés/ : /unsigned and unfunded/);
    assert.deepEqual([...document.querySelectorAll('script')].map((script) => script.getAttribute('src')), [`${base}assets/source-mission.js`]);
    assert.equal(document.querySelectorAll('script:not([src])').length, 0);
    assert.equal(document.querySelectorAll('[onclick],[onerror]').length, 0);
  }
  const ids = SOURCE_MISSION_STRATEGIES.map((strategy) => strategy.id).sort();
  assert.equal(ids.length, 6);
  for (const language of ['en', 'fr']) assert.deepEqual(Object.keys(sourceMissionCopy[language].strategies).sort(), ids);
  assert.throws(() => renderSourceMissionPage(base, revision, 'unsupported'), /Unsupported source mission language/);
});

test('revision metadata is rendered as inert text and does not become markup or event handlers', () => {
  const hostile = '\"><img id="injected" src=x onerror="globalThis.sourceMissionCompromised=true">';
  const document = page('en', hostile);
  assert.equal(document.querySelector('[data-source-mission]').dataset.revision, hostile);
  assert.equal(document.querySelector('#injected'), null);
  assert.equal(document.querySelectorAll('[onerror]').length, 0);
});
