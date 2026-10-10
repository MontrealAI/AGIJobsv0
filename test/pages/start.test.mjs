import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderStartPage } from '../../scripts/pages/start.mjs';

for (const lang of ['en', 'fr'])
  test(`onboarding ${lang} is a complete static entrance under project and root paths`, () => {
    for (const base of ['/AGIJobsv0/', '/']) {
      const html = renderStartPage({
        base,
        guide: (s) => base + 'guides/' + s,
        revision: 'a'.repeat(40),
        lang,
      });
      const doc = new JSDOM(html).window.document;
      assert.equal(doc.documentElement.lang, lang);
      assert.equal(doc.querySelectorAll('h1').length, 1);
      assert.equal(doc.querySelectorAll('[name="role"]').length, 4);
      assert.equal(doc.querySelectorAll('[data-step]').length, 3);
      assert.equal(doc.querySelectorAll('[data-result]').length, 4);
      assert.equal(
        doc.querySelector('script').getAttribute('src'),
        base + 'assets/start.js'
      );
      assert.equal(
        doc.querySelector('#planner-handoff').getAttribute('href'),
        base + 'work/#from-start'
      );
      assert.match(
        doc.querySelector('[http-equiv="Content-Security-Policy"]').content,
        /connect-src 'none'/
      );
      assert.equal(
        doc.querySelectorAll('script:not([src]),iframe,form').length,
        0
      );
      assert.equal(
        new Set([...doc.querySelectorAll('[id]')].map((e) => e.id)).size,
        doc.querySelectorAll('[id]').length
      );
      for (const link of doc.querySelectorAll('a'))
        assert.ok(!/undefined|null/.test(link.href));
    }
  });

test('onboarding built routes are featured and have a small standalone initial payload', () => {
  const output = path.resolve('build/pages');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  assert.deepEqual(manifest.onboardingRoutes, {
    en: 'start/',
    fr: 'start/fr/',
  });
  const home = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(home, /start\/">Start here/);
  for (const route of Object.values(manifest.onboardingRoutes))
    assert.ok(fs.existsSync(path.join(output, route, 'index.html')));
  const sitemap = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /start\/fr\//);
  for (const file of [
    'start/index.html',
    'start/fr/index.html',
    'assets/start.css',
    'assets/start.js',
  ])
    assert.ok(fs.statSync(path.join(output, file)).size < 45000, file);
});
