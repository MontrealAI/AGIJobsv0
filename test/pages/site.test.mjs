import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import {
  basePath,
  makeCatalog,
  renderMarkdown,
  root,
} from '../../scripts/pages/build.mjs';
import { advance, receipt } from '../../website/assets/lifecycle.mjs';
import { displaySource } from '../../website/assets/diagram-source.mjs';

test('legacy flowchart labels remain intact while reserved punctuation is quoted for display', () => {
  const original =
    'flowchart LR\nA[[Core (v2)]] --> B[reports.{md,json}]\nB --> C[(Store)]\nC --> D["Already (quoted)"]';
  assert.equal(
    displaySource(original),
    'flowchart LR\nA[["Core (v2)"]] --> B["reports.{md,json}"]\nB --> C[(Store)]\nC --> D["Already (quoted)"]'
  );
  assert.equal(displaySource(displaySource(original)), displaySource(original));
  assert.equal(
    displaySource('sequenceDiagram\nA->>B: Core (v2)'),
    'sequenceDiagram\nA->>B: Core (v2)'
  );
});

test('walkthrough never settles missing evidence, rejected work or incomplete validation', () => {
  for (const inputs of [
    { evidence: false, vote: 'approve' },
    { evidence: true, vote: 'reject' },
    { evidence: true, vote: 'incomplete' },
  ]) {
    let state = { step: 0, events: [], blocked: false };
    for (let i = 0; i < 6; i++) state = advance(state, inputs);
    assert.equal(state.blocked, true);
    const proof = receipt(state, { name: 'Fixture scenario' }, inputs);
    assert.equal(proof.settled, false);
    assert.equal(proof.simulated, true);
    assert.equal(proof.productionApproved, false);
    assert.equal(proof.chainTransactions, 0);
  }
  const inputs = { evidence: true, vote: 'approve' };
  let state = { step: 0, events: [], blocked: false };
  for (let i = 0; i < 4; i++) state = advance(state, inputs);
  assert.equal(
    receipt(state, { name: 'Fixture scenario' }, inputs).settled,
    true
  );
  assert.equal(state.events.length, 4);
  assert.deepEqual(advance(state, inputs), state);
});

test('public guides sanitize executable HTML and unsafe URLs while retaining diagram sources', () => {
  const diagram = 'flowchart TD\nA[Mission] --> B[Evidence]';
  const source =
    '# Guide\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n<img src="x" onerror="alert(1)">\n\n```mermaid\n' +
    diagram +
    '\n```\n\n[Local guide](next.md)';
  const rendered = renderMarkdown(source, 'demo/example/README.md', {
    base: '/AGIJobsv0/',
    revision: 'abc',
    guideRoutes: new Map([['demo/example/next.md', 'guides/next.html']]),
    tracked: new Set(),
    images: new Set(),
  });
  assert.deepEqual(rendered.diagrams, [diagram]);
  const document = new JSDOM(rendered.html).window.document;
  assert.equal(document.querySelectorAll('script,[onerror],iframe').length, 0);
  assert.equal(
    document.querySelector('[data-diagram] code').textContent,
    diagram
  );
  assert.equal(
    document.querySelector('a[href]').getAttribute('href'),
    '/AGIJobsv0/guides/next.html'
  );
  assert.equal(document.querySelectorAll('a[href^="javascript:"]').length, 0);
});

test('every demo has a unique route and all built local page/asset links resolve under the project prefix', () => {
  const catalog = makeCatalog();
  assert.equal(new Set(catalog.map((demo) => demo.id)).size, catalog.length);
  for (const demo of catalog)
    assert.ok(demo.title && demo.description && demo.kindLabel);
  for (const invalid of [
    '//example.com/',
    '/a/../',
    'https://example.com/',
    '/AGIJobsv0',
  ])
    assert.throws(() => basePath(invalid));
  const output = path.join(root, 'build/pages');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  assert.equal(manifest.directories, catalog.length);
  const pages = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.html')) pages.push(file);
    }
  }
  walk(output);
  const missing = [];
  const pageAnchors = new Map();
  const fragmentLinks = [];
  for (const file of pages) {
    const document = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
    pageAnchors.set(
      file,
      new Set(
        [...document.querySelectorAll('[id],a[name]')].map(
          (element) => element.id || element.getAttribute('name')
        )
      )
    );
    for (const element of document.querySelectorAll('[href],[src]')) {
      const value = element.getAttribute('href') || element.getAttribute('src');
      if (!value.startsWith(manifest.basePath)) continue;
      const route = decodeURIComponent(
        value.slice(manifest.basePath.length).split(/[?#]/)[0]
      );
      const target = path.join(output, route || 'index.html');
      if (!fs.existsSync(target)) missing.push({ file, value });
      else if (
        fs.statSync(target).isDirectory() &&
        !fs.existsSync(path.join(target, 'index.html'))
      )
        missing.push({ file, value });
      if (
        element.hasAttribute('href') &&
        value.includes('#') &&
        fs.existsSync(target)
      ) {
        const resolved = fs.statSync(target).isDirectory()
          ? path.join(target, 'index.html')
          : target;
        if (resolved.endsWith('.html'))
          fragmentLinks.push({
            file,
            value,
            target: resolved,
            fragment: decodeURIComponent(value.split('#').slice(1).join('#')),
          });
      }
    }
    if (file.endsWith('experiments/culture/index.html')) {
      assert.equal(document.querySelectorAll('#root').length, 1);
      assert.ok(document.querySelector('noscript a'));
    } else assert.equal(document.querySelectorAll('main#main').length, 1, file);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(
    fragmentLinks.filter(
      ({ target, fragment }) =>
        fragment && !pageAnchors.get(target)?.has(fragment)
    ),
    [],
    'Published guide links must resolve to an existing section, not just a page.'
  );
  assert.equal(
    pages.length,
    catalog.length +
      manifest.guides +
      2 +
      (manifest.dashboardRoutes || []).length +
      (manifest.successorRoutes || []).length +
      (manifest.archiveRoutes || []).length +
      Number(Boolean(manifest.cultureStudioRoute)) +
      Number(Boolean(manifest.oneboxRoute)) +
      Number(Boolean(manifest.workRoute)) +
      Number(Boolean(manifest.reviewRoute))
  );
});

test('published guides preserve every original Mermaid block verbatim', () => {
  const output = path.join(root, 'build/pages');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  let total = 0;
  for (const [file, route] of Object.entries(manifest.guideRoutes)) {
    const sources = [];
    marked.walkTokens(
      marked.lexer(
        file.endsWith('.mmd')
          ? '````mermaid\n' +
              fs.readFileSync(path.join(root, file), 'utf8').trimEnd() +
              '\n````'
          : fs.readFileSync(path.join(root, file), 'utf8')
      ),
      (token) => {
        if (token.type === 'code' && token.lang?.trim() === 'mermaid')
          sources.push(token.text);
      }
    );
    const document = new JSDOM(
      fs.readFileSync(path.join(output, route), 'utf8')
    ).window.document;
    assert.deepEqual(
      [...document.querySelectorAll('[data-diagram] code')].map(
        (code) => code.textContent
      ),
      sources,
      file
    );
    total += sources.length;
  }
  assert.equal(total, manifest.diagrams);
});

test('every experience resolves its sources, publishes exact downloads and includes its complete document library', () => {
  const output = path.join(root, 'build/pages');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  const profiles = JSON.parse(
    fs.readFileSync(path.join(root, 'website/demo-experiences.json'))
  );
  assert.equal(manifest.experiences, manifest.directories);
  assert.deepEqual(
    Object.keys(profiles).sort(),
    manifest.catalog.map((d) => d.name).sort()
  );
  for (const demo of manifest.catalog) {
    const document = new JSDOM(
      fs.readFileSync(path.join(output, 'demos', demo.id, 'index.html'), 'utf8')
    ).window.document;
    for (const id of [
      'guided-tour',
      'inspect',
      'try-it',
      'architecture',
      'library',
    ])
      assert.ok(document.getElementById(id), `${demo.name}: ${id}`);
    assert.equal(
      document.querySelectorAll('.lesson-step').length,
      profiles[demo.name].steps.length
    );
    const data = JSON.parse(
      document.querySelector('#lab-data').content.textContent
    );
    assert.equal(data.revision, manifest.revision);
    for (const source of data.sources) {
      if (source.content === null) continue;
      const local = fs.readFileSync(path.join(root, source.file));
      assert.equal(source.content, local.toString('utf8'), source.file);
      assert.deepEqual(
        fs.readFileSync(
          path.join(output, source.download.slice(manifest.basePath.length))
        ),
        local,
        source.file
      );
    }
    const links = [...document.querySelectorAll('#library a')].map((a) =>
      a.getAttribute('href')
    );
    for (const file of demo.guides)
      assert.ok(
        links.includes(manifest.basePath + manifest.guideRoutes[file]),
        file
      );
    for (const related of profiles[demo.name].related)
      assert.ok(manifest.catalog.some((d) => d.name === related));
  }
});

test('field inspection preserves values, ambiguous keys and empty containers without executing strings', async () => {
  const { sourceFields, findFields } = await import(
    '../../website/assets/source-model.mjs'
  );
  const value = {
    'a/b': { '~x': 0 },
    empty: [],
    object: {},
    bool: false,
    none: null,
    html: '<img src=x onerror=alert(1)>',
    rows: [{ reward: '100000000000000000001' }],
  };
  const fields = sourceFields(value);
  assert.ok(fields.some((r) => r.path === '$/a~1b/~0x' && r.value === '0'));
  assert.ok(
    fields.some(
      (r) => r.value === '100000000000000000001' && r.type === 'string'
    )
  );
  assert.equal(findFields(fields, 'none')[0].value, 'null');
  assert.equal(findFields(fields, 'BOOL false').length, 1);
  assert.equal(findFields(fields, 'onerror')[0].value, value.html);
  assert.equal(findFields(fields, 'not present').length, 0);
  assert.deepEqual(sourceFields([]), [
    { path: '$', value: '[]', type: 'array' },
  ]);
});

test('legacy schedules preserve relative timing without inventing dates or missing starts', async () => {
  const { relativeSchedule, displaySources } = await import(
    '../../website/assets/diagram-source.mjs'
  );
  const durationOnly = relativeSchedule(
    fs.readFileSync(
      path.join(root, 'demo/Economic-Power-v0/reports/global-expansion.mmd'),
      'utf8'
    )
  );
  assert.deepEqual(
    durationOnly.tasks.map((t) => t.duration),
    [72, 240, 720, 1440]
  );
  assert.ok(durationOnly.tasks.every((t) => t.start === null));
  const schedule = relativeSchedule(
    fs.readFileSync(
      path.join(root, 'demo/Economic-Power-v0/reports/timeline.mmd'),
      'utf8'
    )
  );
  assert.deepEqual(
    schedule.tasks.map((t) => t.start),
    [0, 0, 0, 0, 33.5]
  );
  assert.deepEqual(
    schedule.tasks.map((t) => t.duration),
    [33.5, 26.9, 26.3, 21.9, 19.6]
  );
  assert.throws(() =>
    relativeSchedule(
      'gantt\n dateFormat X\n Valid : id1, 5h\n Invalid : id2, tomorrow, 5h'
    )
  );
  const combined = fs.readFileSync(
    path.join(root, 'demo/alpha-agi-mark/runbooks/alpha-agi-mark-flow.mmd'),
    'utf8'
  );
  assert.equal(displaySources(combined).length, 2);
  const hierarchy = displaySource(
    'mindmap\n  root((Core (v2)))\n    "Sigma":::core --> "Welfare":::metric'
  );
  assert.match(hierarchy, /legacy_mind_0\["Core \(v2\)"\]/);
  assert.match(hierarchy, /legacy_mind_0 --> legacy_mind_1/);
  assert.match(hierarchy, /legacy_mind_1 --> legacy_mind_2/);
  const chart = displaySource(
    '%%{init: {theme: forest} }\nlineChart\n title Recorded success\n 0:0.33\n 1:0.67'
  );
  assert.match(chart, /line \[0.33, 0.67\]/);
});

test('nested demo documentation is discovered without misclassifying the implementation as an alias', () => {
  const demo = makeCatalog().find(
    (d) => d.name === 'superintelligent-empowerment'
  );
  assert.equal(demo.readme, 'demo/superintelligent-empowerment/docs/README.md');
  assert.equal(demo.kindId, 'code');
});

test('all published command decks retain their local assets and navigation', () => {
  const output = path.join(root, 'build/pages');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  assert.equal(manifest.dashboardRoutes.length, 15);
  assert.ok(manifest.dashboardRoutes.includes('experiments/phase6/'));
  assert.ok(manifest.dashboardRoutes.includes('experiments/zenith-hypernova/'));
  assert.ok(manifest.dashboardRoutes.includes('experiments/phase8/workbench/'));
  for (const route of manifest.dashboardRoutes) {
    const document = new JSDOM(
      fs.readFileSync(path.join(output, route, 'index.html'), 'utf8')
    ).window.document;
    assert.match(
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        .content,
      /script-src 'self'/
    );
    assert.equal(document.querySelectorAll('script:not([src])').length, 0);
    for (const element of document.querySelectorAll('[href],[src]')) {
      const value = element.getAttribute('href') || element.getAttribute('src');
      if (value.startsWith('#')) {
        assert.ok(
          document.getElementById(value.slice(1)),
          `${route}: ${value}`
        );
        continue;
      }
      const url = new URL(value, `https://example.invalid/${route}`);
      if (
        element.tagName === 'LINK' &&
        element.getAttribute('rel') === 'canonical'
      ) {
        assert.equal(
          url.href,
          `https://montrealai.github.io${manifest.basePath}${route}`
        );
        continue;
      }
      if (
        element.tagName === 'A' &&
        url.protocol === 'https:' &&
        url.origin !== 'https://example.invalid'
      ) {
        assert.ok(
          [
            'montrealai.github.io',
            'github.com',
            'docs.openclaw.ai',
            'learn.chatgpt.com',
            'developers.openai.com',
          ].includes(url.hostname),
          `${route}: unexpected external reference`
        );
        continue;
      }
      assert.equal(
        url.origin,
        'https://example.invalid',
        `${route}: external asset`
      );
      const localRoute = url.pathname.startsWith(manifest.basePath)
        ? url.pathname.slice(manifest.basePath.length)
        : url.pathname;
      assert.ok(
        fs.existsSync(path.join(output, decodeURIComponent(localRoute))),
        `${route}: ${value}`
      );
    }
  }
});

test('published Culture Studio uses the real workspace build with no provider connections', () => {
  const directory = path.join(root, 'build/pages/experiments/culture');
  const document = new JSDOM(
    fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  ).window.document;
  const policy = document.querySelector(
    'meta[http-equiv="Content-Security-Policy"]'
  ).content;
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.equal(document.querySelectorAll('script:not([src])').length, 0);
  for (const element of document.querySelectorAll('script[src],link[href]')) {
    const asset = element.getAttribute('src') || element.getAttribute('href');
    assert.ok(asset.startsWith('./assets/'));
    assert.ok(fs.existsSync(path.join(directory, asset)));
  }
});

test('dashboard descriptions remain readable text rather than URL-encoded strings', () => {
  for (const name of [
    'culture-v0',
    'agi-jobs-platform-at-kardashev-ii-scale',
  ]) {
    const document = new JSDOM(
      fs.readFileSync(
        path.join(root, 'build/pages/demos', name, 'index.html'),
        'utf8'
      )
    ).window.document;
    const text = document.querySelector(
      '.experience-intro .section-description'
    ).textContent;
    assert.ok(text.includes(' '));
    assert.ok(!text.includes('%20'));
  }
});

test('published One-Box is the offline console with intact integrity metadata', () => {
  const directory = path.join(root, 'build/pages/experiments/one-box');
  const document = new JSDOM(
    fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  ).window.document;
  assert.equal(
    document.querySelector('meta[name="onebox-demo"]').content,
    'true'
  );
  assert.match(
    document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      .content,
    /connect-src 'none'/
  );
  assert.ok(document.querySelector('#preview-export'));
  assert.ok(document.querySelector('#owner-console'));
  for (const element of document.querySelectorAll(
    'script[src],link[rel="stylesheet"]'
  )) {
    assert.match(element.getAttribute('integrity'), /^sha384-/);
    assert.ok(
      fs.existsSync(
        path.join(
          directory,
          element.getAttribute('src') || element.getAttribute('href')
        )
      )
    );
  }
});
