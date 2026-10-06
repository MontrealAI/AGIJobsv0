import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { root } from './build.mjs';

const profiles = JSON.parse(
  fs.readFileSync(path.join(root, 'website/demo-experiences.json'), 'utf8')
);
const output = path.join(root, 'build/pages');
const artifacts = path.join(root, 'reports/pages');
fs.mkdirSync(artifacts, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'catalog.json')));
const errors = [],
  requests = [],
  checks = [],
  diagramFailures = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith(manifest.basePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.resolve(
    output,
    decodeURIComponent(url.pathname.slice(manifest.basePath.length)) ||
      'index.html'
  );
  if (!file.startsWith(output + path.sep) && file !== output) {
    res.writeHead(403);
    res.end();
    return;
  }
  const target =
    fs.existsSync(file) && fs.statSync(file).isDirectory()
      ? path.join(file, 'index.html')
      : file;
  if (!fs.existsSync(target)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    'Content-Type',
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    }[path.extname(target)] || 'application/octet-stream'
  );
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + manifest.basePath;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(request.url() + ': ' + request.failure()?.errorText)
  );
  page.on('request', (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:'))
      requests.push(request.url());
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-demo-card]:visible').count(), 12);
  await page.screenshot({ path: path.join(artifacts, 'desktop-home.png') });
  const a11y = async (label) => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    fs.writeFileSync(
      path.join(artifacts, `accessibility-${label}.json`),
      JSON.stringify(result.violations, null, 2)
    );
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      label
    );
    checks.push(label + ': accessibility');
  };
  await a11y('home');
  await page
    .locator('#site-nav')
    .getByRole('link', { name: 'Featured demos' })
    .click();
  await page.locator('#featured').screenshot({
    path: path.join(artifacts, 'featured-demos-desktop.png'),
    style: '.site-header, .skip-link { visibility: hidden !important; }',
  });
  for (const [demo, route] of [
    ['culture', manifest.cultureStudioRoute],
    ['kardashev', 'experiments/kardashev-ii/'],
  ]) {
    const launch = page.locator(`[data-feature-launch="${demo}"]`);
    assert.equal(await launch.getAttribute('href'), manifest.basePath + route);
    await launch.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(url + route);
    if (demo === 'culture') {
      await page.getByRole('heading', { name: /Knowledge grows/ }).waitFor();
    } else {
      await page.waitForFunction(
        () => document.documentElement.dataset.demoStatus === 'ready'
      );
    }
    await page.goBack({ waitUntil: 'networkidle' });
  }
  checks.push(
    'featured experiences: direct launch, keyboard activation and browser return'
  );
  await page.getByLabel('Search the collection').fill('aurora');
  assert.equal(await page.locator('[data-demo-card]:visible').count(), 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.getByLabel('Search the collection').inputValue(),
    'aurora'
  );
  await page.getByLabel('Search the collection').fill('no-such-demo-7391');
  assert.equal(await page.locator('#catalog-empty').isVisible(), true);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Experience', { exact: true }).selectOption('design');
  assert.equal(await page.locator('[data-demo-card]:visible').count(), 7);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Show more demos' }).click();
  assert.equal(await page.locator('[data-demo-card]:visible').count(), 24);
  checks.push('search, URL persistence, empty state, type filter, pagination');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /npm run demo:aurora:local/
  );
  checks.push('copy local setup commands');
  await page.locator('#walkthrough').scrollIntoViewIfNeeded();
  for (let i = 0; i < 4; i++) await page.locator('#walkthrough-next').click();
  assert.equal(
    await page.locator('#walkthrough-status').textContent(),
    'Simulated settlement complete'
  );
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#walkthrough-download').click();
  const download = await downloadPromise;
  const receipt = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(receipt.simulated, true);
  assert.equal(receipt.chainTransactions, 0);
  assert.equal(receipt.productionApproved, false);
  assert.equal(receipt.settled, true);
  await page.locator('#walkthrough-reset').click();
  await page.getByLabel('Worker includes the required evidence').uncheck();
  await page.locator('#walkthrough-next').click();
  await page.locator('#walkthrough-next').click();
  assert.equal(
    await page.locator('#walkthrough-status').textContent(),
    'Evidence missing'
  );
  assert.equal(await page.locator('#walkthrough-next').isDisabled(), true);
  await page.locator('#walkthrough-reset').click();
  await page.getByLabel('Worker includes the required evidence').check();
  await page.getByLabel('Validator outcome').selectOption('reject');
  for (let i = 0; i < 3; i++) await page.locator('#walkthrough-next').click();
  assert.equal(
    await page.locator('#walkthrough-status').textContent(),
    'Review required'
  );
  await page.screenshot({
    path: path.join(artifacts, 'walkthrough-review.png'),
  });
  checks.push(
    'successful walkthrough, labeled download, missing evidence, rejected result'
  );
  await page.goto(url + 'demos/aurora/', { waitUntil: 'networkidle' });
  await a11y('demo');
  await page.getByLabel('Find a field or value').fill('validation k');
  assert.equal(await page.locator('.lab-field').count(), 1);
  assert.equal(await page.locator('.field-value').textContent(), '2');
  await page.getByLabel('Find a field or value').fill('no-such-field-482');
  assert.equal(await page.locator('.lab-field').count(), 0);
  await page.locator('[data-inspect-source="1"]').click();
  assert.equal(await page.locator('#lab-source').inputValue(), '1');
  assert.ok((await page.locator('#lab-code').textContent()).includes('import'));
  await page.getByLabel('Choose a walkthrough source').selectOption('0');
  const sourceDownload = page.waitForEvent('download');
  await page.locator('#lab-download').click();
  const sourceFile = await sourceDownload;
  assert.deepEqual(
    fs.readFileSync(await sourceFile.path()),
    fs.readFileSync(path.join(root, 'demo/aurora/config/aurora.spec@v2.json'))
  );
  await page.locator('#guided-tour').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'demo-guided-tour.png') });
  await page.locator('#inspect').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(artifacts, 'demo-source-inspector.png'),
  });
  checks.push(
    'source steps, exact source download, field search and empty results'
  );
  await page.getByRole('link', { name: 'Read the full guide' }).click();
  await page.locator('[data-diagram]').first().scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-rendered="true"] svg', { timeout: 30000 });
  await a11y('guide');
  await page.screenshot({ path: path.join(artifacts, 'guide-diagram.png') });
  checks.push('demo detail, original guide, live Mermaid rendering');
  for (const width of [320, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['', 'demos/aurora/']) {
      await page.goto(url + route, { waitUntil: 'networkidle' });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1
        ),
        false,
        `overflow at ${width}: ${route}`
      );
    }
    checks.push('responsive layout: ' + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(artifacts, 'mobile-full.png'),
    fullPage: true,
  });
  await page.screenshot({ path: path.join(artifacts, 'mobile-home.png') });
  await page.locator('#featured').screenshot({
    path: path.join(artifacts, 'featured-demos-mobile.png'),
    style: '.site-header, .skip-link { visibility: hidden !important; }',
  });
  await page.getByRole('button', { name: 'Menu' }).click();
  assert.equal(await page.locator('#site-nav').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#menu-toggle').getAttribute('aria-expanded'),
    'false'
  );
  await page.getByRole('button', { name: 'Menu' }).click();
  await page
    .locator('#site-nav')
    .getByRole('link', { name: 'Featured demos' })
    .click();
  assert.equal(
    await page.locator('#menu-toggle').getAttribute('aria-expanded'),
    'false'
  );
  await a11y('mobile');
  checks.push('mobile navigation');
  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const fallback = await noJS.newPage();
  await fallback.goto(url);
  assert.equal(
    await fallback.locator('[data-feature-launch]:visible').count(),
    2
  );
  assert.equal(
    await fallback.locator('[data-demo-card]:visible').count(),
    manifest.directories
  );
  checks.push('all catalog entries available without JavaScript');
  await fallback.setViewportSize({ width: 390, height: 844 });
  assert.equal(await fallback.locator('#site-nav').isVisible(), true);
  await fallback.goto(url + 'demos/aurora/');
  assert.equal(await fallback.locator('.lesson-step:visible').count(), 3);
  assert.ok(
    (await fallback.locator('#lab-code').textContent()).includes(
      'AURORA-Flagship-Job'
    )
  );
  assert.equal(await fallback.locator('#experience-command').isVisible(), true);
  await noJS.close();
  // Exercise every individual experience, including aliases, design guides and binary assets.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const demo of manifest.catalog) {
    await page.goto(url + 'demos/' + demo.id + '/', {
      waitUntil: 'networkidle',
    });
    assert.equal(
      await page.locator('.lesson-step').count(),
      profiles[demo.name].steps.length,
      demo.name
    );
    assert.equal(
      await page.locator('.lab-toolbar').isVisible(),
      true,
      demo.name
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1
      ),
      false,
      demo.name
    );
    await page
      .getByLabel('Choose a walkthrough source')
      .selectOption({ index: 1 });
    assert.ok(
      (await page.locator('#lab-path').textContent()).length > 0,
      demo.name
    );
  }
  checks.push(
    'all ' +
      manifest.directories +
      ' experiences: working inspector and mobile layout'
  );
  await page.goto(
    url +
      'demos/' +
      manifest.catalog.find((d) => d.name === 'AlphaEvolve-v0').id +
      '/',
    { waitUntil: 'networkidle' }
  );
  await page
    .getByLabel('Choose a walkthrough source')
    .selectOption({ index: 2 });
  await a11y('source-inspector-mobile');
  await page.locator('#inspect').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(artifacts, 'mobile-source-inspector.png'),
  });
  checks.push(
    'no-JavaScript experience retains steps, commands and full first source'
  );
  // Parse every preserved flowchart in the same browser engine used for rendering.
  await page.goto(url + manifest.guideRoutes['demo/aurora/README.md']);
  await page.locator('[data-diagram]').first().scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-rendered="true"] svg');
  const diagramModule = fs
    .readdirSync(path.join(output, 'assets'))
    .find((name) => name.startsWith('diagrams-') && name.endsWith('.js'));
  const sources = [];
  for (const [file, route] of Object.entries(manifest.guideRoutes)) {
    const html = fs.readFileSync(path.join(output, route), 'utf8');
    const { JSDOM } = await import('jsdom');
    const document = new JSDOM(html).window.document;
    for (const code of document.querySelectorAll('[data-diagram] code'))
      sources.push({ file, text: code.textContent });
  }
  const parseResults = await page.evaluate(
    async ({ moduleURL, sources }) => {
      const { validateDiagram, renderDiagram } = await import(moduleURL);
      const errors = [];
      let index = 0;
      for (const source of sources) {
        const figure = document.createElement('figure');
        figure.dataset.diagram = `qa-${index++}`;
        figure.innerHTML =
          '<figcaption class="diagram-status"></figcaption><div class="diagram-viewport"></div><details><pre><code></code></pre></details>';
        figure.querySelector('code').textContent = source.text;
        document.body.append(figure);
        try {
          await validateDiagram(source.text);
          await renderDiagram(figure);
          if (!figure.querySelector('svg'))
            throw new Error('Missing rendered SVG');
        } catch (error) {
          errors.push({
            file: source.file,
            message: String(error).slice(0, 300),
          });
        } finally {
          figure.remove();
        }
      }
      return errors;
    },
    { moduleURL: manifest.basePath + 'assets/' + diagramModule, sources }
  );
  diagramFailures.push(...parseResults);
  fs.writeFileSync(
    path.join(artifacts, 'diagram-validation.json'),
    JSON.stringify(
      { total: sources.length, failures: diagramFailures },
      null,
      2
    )
  );
  assert.deepEqual(
    diagramFailures,
    [],
    'Every preserved diagram must parse and render'
  );
  assert.equal(manifest.dashboardRoutes.length, 11);
  assert.equal(manifest.archiveRoutes.length, 21);
  const legacyDecks = manifest.dashboardRoutes.filter((route) =>
    route.startsWith('experiments/kardashev-ii/')
  );
  assert.equal(legacyDecks.length, 6);
  for (const route of legacyDecks) {
    await page.goto(url + route, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.documentElement.dataset.demoStatus === 'ready'
    );
    await page.locator('#mermaid-container svg').waitFor();
    await page.locator('#dyson-container svg').waitFor();
    assert.equal(await page.locator('main#main').count(), 1);
    await page.waitForFunction(
      () => document.querySelector('#computer-work')?.dataset.status === 'ready'
    );
    assert.equal(await page.locator('#cw-example option').count(), 10);
    assert.match(await page.locator('#cw-results').innerText(), /\$10,125,000/);
  }
  checks.push(
    'all six published Kardashev command decks load diagrams and computer-work planning'
  );
  await page.goto(url + 'experiments/kardashev-business/');
  await page.waitForSelector('body[data-ready=true]');
  assert.equal(await page.locator('.engine-card').count(), 5);
  assert.equal(await page.locator('.template').count(), 10);
  await page.getByRole('button', { name: 'Generate & check example' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await page.getByRole('button', { name: 'Test a wrong answer' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  checks.push(
    'published Business 3 workbench generates and checks evidence without a provider'
  );
  await page.goto(url + 'experiments/omnisovereign/');
  await page.waitForSelector('body[data-ready=true]');
  assert.equal(await page.locator('[data-stage]').count(), 6);
  await page
    .getByRole('button', { name: /Run the six-stage rehearsal/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await page
    .getByRole('button', { name: 'Test a rehashed wrong answer' })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  checks.push(
    'published OmniSovereign route executes six stages and rejects rehashed incorrect evidence'
  );
  await page.goto(url + 'experiments/meta-agentic-alpha/');
  await page.waitForSelector('body[data-ready=true]');
  assert.equal(await page.locator('#work-rows tr').count(), 12);
  await page
    .getByRole('button', { name: /Evaluate the six-phase portfolio/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  assert.match(await page.locator('#findings').textContent(), /23,000/);
  await page
    .getByRole('button', { name: 'Test a rehashed wrong answer' })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  checks.push(
    'published Meta-Agentic ALPHA route evaluates twelve briefs and rejects incorrect evidence'
  );
  assert.deepEqual(requests, [], 'Unexpected external network requests');
  assert.deepEqual(errors, [], 'Browser errors');
  fs.writeFileSync(
    path.join(artifacts, 'browser-report.json'),
    JSON.stringify(
      {
        status: 'passed',
        checks,
        diagrams: sources.length,
        diagramSyntaxFailures: diagramFailures,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      checks: checks.length,
      diagrams: sources.length,
      diagramSyntaxFailures: diagramFailures.length,
    })
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
