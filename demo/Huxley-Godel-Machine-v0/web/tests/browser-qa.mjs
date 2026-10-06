import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root = path.resolve(
  process.env.HGM_SITE_ROOT ||
    fileURLToPath(new URL('../../../../build/hgm/', import.meta.url))
);
const evidence = path.resolve('reports/pages/hgm');
fs.mkdirSync(evidence, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    let file = path.resolve(root, '.' + decodeURIComponent(u.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) throw new Error();
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:'))
      external.push(r.url());
  });
  await page.goto(origin);
  await page.locator('#summary-cards .metric').first().waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.mermaid svg').length === 2
  );
  assert.equal(await page.locator('h1').count(), 1);
  await page.screenshot({
    path: path.join(evidence, 'desktop.png'),
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      true,
      'Overflow at ' + width
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(evidence, 'mobile.png'),
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  fs.writeFileSync(
    path.join(evidence, 'accessibility.json'),
    JSON.stringify(axe.violations, null, 2)
  );
  assert.deepEqual(axe.violations, []);
  await page.locator('#scenario').selectOption('paused');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#record-status')
        .textContent.includes('Bundled recording') &&
      document.querySelector('#summary-cards').textContent.includes('$0')
  );
  assert.match(
    await page.locator('#roi-chart').textContent(),
    /No completed cost/
  );
  await page.locator('#scenario').selectOption('reference');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#record-status')
        .textContent.includes('Bundled recording') &&
      document.querySelector('#summary-cards').textContent.includes('$') &&
      !document.querySelector('#analyse').disabled
  );
  const save = page.waitForEvent('download');
  await page.locator('#analyse').click();
  const file = await save;
  assert.equal(file.suggestedFilename(), 'benchmark-analysis.json');
  const candidate = JSON.parse(fs.readFileSync(await file.path()));
  const receipt = page.waitForEvent('download');
  await page.locator('#candidate-file').setInputFiles({
    name: 'candidate.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await receipt;
  assert.match(
    await page.locator('#analysis-status').textContent(),
    /Content checks passed/
  );
  candidate.settlementApproved = true;
  const badReceipt = page.waitForEvent('download');
  await page.locator('#candidate-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await badReceipt;
  assert.match(
    await page.locator('#analysis-status').textContent(),
    /Candidate rejected/
  );
  const draft = page.waitForEvent('download');
  await page.locator('#job-type').selectOption('reports');
  await page.locator('#job-form button').click();
  const draftFile = await draft;
  assert.equal(
    JSON.parse(fs.readFileSync(await draftFile.path())).admitted,
    false
  );
  await page.locator('#capture').fill('0');
  assert.equal(await page.locator('#market-value').textContent(), '$0');
  await page.locator('#comparison-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hgm":"<script>alert(1)</script>"}'),
  });
  await page.waitForFunction(() =>
    document.querySelector('#record-status').textContent.includes('current HGM')
  );
  assert.equal(await page.locator('#analyse').isDisabled(), true);
  assert.equal(await page.locator('#summary-cards .metric').count(), 0);
  await page.goto(origin + '/legacy/');
  await page.waitForFunction(
    () => document.querySelectorAll('.mermaid svg').length >= 2
  );
  await page.locator('#load-default').click();
  await page.waitForFunction(() =>
    document.querySelector('#observatory-alert').textContent.includes('Loaded')
  );
  assert.ok((await page.locator('#observatory-table tbody tr').count()) > 1);
  await page.locator('#timeline-file').setInputFiles({
    name: 'paused.json',
    mimeType: 'application/json',
    buffer: fs.readFileSync(
      path.join(root, 'reproduction/paused/hgm_timeline.json')
    ),
  });
  await page.waitForFunction(() =>
    document.querySelector('#observatory-cards').textContent.includes('N/A')
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        widths: [320, 390, 768, 1024, 1440],
        diagrams: 2,
        legacy: true,
        externalRequests: external.length,
        consoleErrors: errors.length,
        accessibilityViolations: axe.violations.length,
      },
      null,
      2
    )
  );
  console.log(
    'HGM browser QA passed: layouts, diagrams, imports, exports, content review, owner pause, legacy and accessibility.'
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
