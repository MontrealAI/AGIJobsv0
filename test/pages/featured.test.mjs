import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  renderHeroSpotlight,
  renderSuccessorFlagship,
} from '../../scripts/pages/featured.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

test('the flagship preview provides direct bilingual mission entry without JavaScript and keeps the broader shortcuts available', () => {
  for (const base of ['/AGIJobsv0/', '/preview/']) {
    const document = new JSDOM(
      renderHeroSpotlight(base) + renderSuccessorFlagship(base)
    ).window.document;
    assert.equal(
      document.querySelector('.hero-spotlight a').getAttribute('href'),
      `${base}successor/mission/`
    );
    assert.equal(
      document
        .querySelector('#successor-flagship a.button.primary')
        .getAttribute('href'),
      `${base}successor/mission/`
    );
    assert.equal(
      document
        .querySelector('#successor-flagship a[hreflang="fr"]')
        .getAttribute('href'),
      `${base}successor/mission/fr/`
    );
    assert.equal(
      document.querySelectorAll(
        '#successor-flagship script, #successor-flagship button'
      ).length,
      0
    );
    for (const route of [
      'experiments/culture/',
      'experiments/kardashev-ii/',
      'experiments/alpha-agi-mark/',
      'experiments/phase6/',
    ])
      assert.ok(
        document.querySelector(`.hero-spotlight a[href="${base}${route}"]`)
      );
  }
});

test('home, primary navigation and README send a new visitor to the mission studio before supporting laboratories', () => {
  const output = path.join(root, 'build/pages');
  const document = new JSDOM(
    fs.readFileSync(path.join(output, 'index.html'), 'utf8')
  ).window.document;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'), 'utf8')
  );
  const route = `${manifest.basePath}successor/mission/`;
  assert.equal(
    document.querySelector('.hero h1').textContent.replace(/\s+/g, ' ').trim(),
    'Find your Alpha. Build your SUCCESSOR Ω.'
  );
  assert.equal(document.querySelector('.hero a').getAttribute('href'), route);
  assert.equal(
    document.querySelector('#site-nav a').getAttribute('href'),
    route
  );
  assert.equal(
    document
      .querySelector('#successor-flagship a.button.primary')
      .getAttribute('href'),
    route
  );
  assert.equal(
    document.querySelector('.hero').nextElementSibling.id,
    'successor-flagship'
  );
  for (const section of [
    '.ecosystem-overview',
    '#machine-labor',
    '#featured',
    '#explore',
  ]) {
    const later = document.querySelector(section);
    assert.ok(later, section);
    assert.ok(
      document
        .querySelector('#successor-flagship')
        .compareDocumentPosition(later) & 4,
      section
    );
  }
  const firstReadmeLink = fs
    .readFileSync(path.join(root, 'README.md'), 'utf8')
    .match(/\[[^\]]+\]\((https:\/\/[^)]+)\)/)?.[1];
  assert.equal(new URL(firstReadmeLink).pathname, route);
  for (const selector of ['title', 'meta[property="og:title"]']) {
    const element = document.querySelector(selector);
    assert.match(element.content || element.textContent, /SUCCESSOR Ω/);
    assert.match(element.content || element.textContent, /AGI Jobs/);
  }
  assert.match(
    document.querySelector('meta[name="description"]').content,
    /business opportunity|frontier mathematics/
  );
  assert.ok(document.querySelector('[data-feature-launch="culture"]'));
  assert.ok(document.querySelector('[data-feature-launch="kardashev"]'));
  assert.equal(
    document.querySelectorAll('#explore [data-demo-card]').length ||
      document.querySelectorAll('#explore .demo-card').length,
    manifest.directories
  );
});
