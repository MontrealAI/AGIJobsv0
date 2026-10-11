import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderWelcomeExample } from '../../scripts/pages/welcome-example.mjs';

for (const lang of ['en', 'fr']) {
  test(`beginner example ${lang}: complete no-script content, safe local routes and localized feedback`, () => {
    for (const base of ['/AGIJobsv0/', '/']) {
      const doc = new JSDOM(
        renderWelcomeExample({ base, lang, revision: 'a'.repeat(40) })
      ).window.document;
      assert.equal(doc.documentElement.lang, lang);
      assert.equal(doc.querySelectorAll('h1').length, 1);
      assert.equal(
        doc.querySelectorAll('[data-example-step]:not([hidden])').length,
        3
      );
      assert.equal(
        doc.querySelectorAll('[data-example-panel]:not([hidden])').length,
        2
      );
      assert.equal(
        doc.querySelectorAll('form,iframe,script:not([src])').length,
        0
      );
      assert.equal(doc.querySelectorAll('input:checked').length, 0);
      assert.equal(doc.querySelectorAll('.club-page h3.club-name').length, 3);
      assert.equal(
        doc.querySelectorAll('.club-page h4.meeting-label').length,
        2
      );
      assert.match(
        doc.querySelector('[http-equiv="Content-Security-Policy"]').content,
        /connect-src 'none'/
      );
      const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const link of doc.querySelectorAll('a[href^="#"]')) {
        assert.ok(doc.querySelector(link.getAttribute('href')));
      }
      assert.equal(
        doc.querySelector('.example-next a').getAttribute('href'),
        `${base}start/${lang === 'fr' ? 'fr/' : ''}#guide`
      );
      for (const asset of doc.querySelectorAll(
        'script[src],link[rel="stylesheet"]'
      )) {
        assert.ok(
          (asset.getAttribute('src') || asset.getAttribute('href')).startsWith(
            base + 'assets/'
          )
        );
      }
      const feedback = JSON.parse(
        doc.querySelector('#example').dataset.messages
      );
      assert.equal(feedback.next.length, 2);
      for (const key of ['none', 'some', 'all', 'changed'])
        assert.ok(feedback[key].length > 30);
      assert.ok(feedback.some.includes('{count}'));
      assert.equal(doc.querySelector('#example-result').textContent, '');
    }
  });
}

test('both examples are published, discoverable and lightweight', () => {
  const output = path.resolve('build/pages');
  const read = (file) => fs.readFileSync(path.join(output, file), 'utf8');
  const manifest = JSON.parse(read('catalog.json'));
  assert.deepEqual(manifest.onboardingExampleRoutes, {
    en: 'start/example/',
    fr: 'start/fr/example/',
  });
  const sitemap = read('sitemap.xml');
  for (const [lang, route] of Object.entries(
    manifest.onboardingExampleRoutes
  )) {
    assert.ok(sitemap.includes(route));
    const welcome = read(`start/${lang === 'fr' ? 'fr/' : ''}index.html`);
    assert.ok(welcome.includes(manifest.basePath + route));
    assert.ok(fs.statSync(path.join(output, route, 'index.html')).size < 24000);
  }
  assert.ok(read('index.html').includes(`${manifest.basePath}start/example/`));
  const assets = ['assets/welcome-example.js', 'assets/welcome-example.css'];
  assert.ok(
    assets.reduce(
      (sum, file) => sum + fs.statSync(path.join(output, file)).size,
      0
    ) < 20000
  );
});
