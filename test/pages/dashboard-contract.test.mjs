import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  assertDashboardRoutes,
  assertCatalogKindLinks,
  expectedCatalogKindLinks,
  expectedDesignLinks,
  originalDesignNames,
  expectedDashboardRoutes,
  implementedDashboards,
  legacyDashboardRoutes,
} from './dashboard-contract.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

test('dashboard inventory rejects missing, extra, substituted and duplicate routes', () => {
  const expected = expectedDashboardRoutes(root);
  assert.equal(legacyDashboardRoutes.length, 15);
  assertDashboardRoutes([...expected].reverse(), expected);
  assert.throws(() => assertDashboardRoutes(expected.slice(1), expected));
  assert.throws(() =>
    assertDashboardRoutes([...expected, 'experiments/unknown/'], expected)
  );
  assert.throws(() =>
    assertDashboardRoutes(
      ['experiments/unknown/', ...expected.slice(1)],
      expected
    )
  );
  assert.throws(() =>
    assertDashboardRoutes([...expected, expected[0]], expected)
  );
});

for (const { route, source } of implementedDashboards(root)) {
  test(`${route} source preserves the shared landmark, skip and local-navigation contracts`, () => {
    const document = new JSDOM(
      fs.readFileSync(path.join(root, source, 'index.html'), 'utf8')
    ).window.document;
    assert.equal(document.querySelectorAll('main').length, 1);
    const main = document.querySelector('main#main');
    assert.ok(main, 'The published page needs main#main');
    const skip = document.querySelector('a.skip');
    assert.ok(skip, 'A keyboard skip link must be present');
    assert.equal(skip.getAttribute('href'), '#main');
    assert.equal(document.getElementById(skip.hash.slice(1)), main);
    const ids = [...document.querySelectorAll('[id]')].map(
      (element) => element.id
    );
    assert.equal(new Set(ids).size, ids.length, 'Anchor IDs must be unique');
    const policy = document.querySelector(
      'meta[http-equiv="Content-Security-Policy"]'
    );
    assert.ok(
      policy,
      'The source must declare its offline content security policy'
    );
    assert.match(policy.content, /script-src 'self'/);
    assert.equal(document.querySelectorAll('script:not([src])').length, 0);
    for (const link of document.querySelectorAll('a[href^="#"]'))
      assert.ok(
        document.getElementById(link.hash.slice(1)),
        `Missing anchor: ${link.hash}`
      );
    const directory = document.querySelector('a[data-t="directory"]');
    if (directory) {
      const target = new URL(
        directory.getAttribute('href'),
        `https://pages.invalid/AGIJobsv0/${route}`
      );
      assert.equal(
        target.pathname,
        '/AGIJobsv0/',
        'The collection lives at the site root, not /demos/'
      );
      assert.equal(target.hash, '#explore');
    }
    if (route === 'experiments/governance/')
      assert.ok(
        main.querySelector('#workbench'),
        'Preserve the existing workbench deep link'
      );
  });
}

test('catalog kind filter follows implemented source transitions and rejects wrong same-count cards', () => {
  const catalog = [
    { id: 'first', kindId: 'design' },
    { id: 'second', kindId: 'design' },
    { id: 'working', kindId: 'code' },
  ];
  const before = expectedCatalogKindLinks(catalog, '/AGIJobsv0/', 'design');
  assertCatalogKindLinks(
    ['/AGIJobsv0/demos/second/', '/AGIJobsv0/demos/first/'],
    before
  );
  catalog[0].kindId = 'code';
  const after = expectedCatalogKindLinks(catalog, '/AGIJobsv0/', 'design');
  assert.deepEqual(after, ['/AGIJobsv0/demos/second/']);
  assert.throws(() =>
    assertCatalogKindLinks(['/AGIJobsv0/demos/working/'], after)
  );
  assert.throws(() => assertCatalogKindLinks([], after));
  assert.throws(() => assertCatalogKindLinks([...after, ...after], after));
  catalog[1].kindId = 'code';
  assertCatalogKindLinks(
    [],
    expectedCatalogKindLinks(catalog, '/AGIJobsv0/', 'design')
  );
  assert.throws(() =>
    expectedCatalogKindLinks(
      [
        { id: 'same', kindId: 'design' },
        { id: 'same', kindId: 'design' },
      ],
      '/',
      'design'
    )
  );
});

test('fixed original design identities reject stale classifications and unexpected substitutions', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-filter-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const catalog = originalDesignNames.map((name, i) => ({
    name,
    id: `design-${i}`,
    kindId: 'design',
  }));
  assert.equal(expectedDesignLinks(catalog, directory, '/').length, 7);
  fs.mkdirSync(path.join(directory, 'demo', originalDesignNames[0], 'web'), {
    recursive: true,
  });
  assert.throws(() => expectedDesignLinks(catalog, directory, '/'));
  catalog[0].kindId = 'code';
  assert.equal(expectedDesignLinks(catalog, directory, '/').length, 6);
  const wrong = catalog.map((entry) => ({ ...entry }));
  wrong[1].name = 'unreviewed-design';
  assert.throws(() => expectedDesignLinks(wrong, directory, '/'));
  assert.throws(() =>
    expectedDesignLinks(catalog.slice(0, -1), directory, '/')
  );
});
