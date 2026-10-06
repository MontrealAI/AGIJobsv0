import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from '../server.cjs';
import {
  workTypes,
  makeWorkOrder,
  runAnalysis,
  digest,
  json,
} from '../core.mjs';
import { reviewEvidence } from '../review.mjs';
const base = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const repo = path.resolve(base, '../..');
const source = fs.readFileSync(path.join(base, 'project-plan.json'), 'utf8');
const out = path.join(repo, 'reports/pages/hypernova');
fs.mkdirSync(out, { recursive: true });
const prefix = '/AGIJobsv0/experiments/zenith-hypernova/';
const assets = new Set([
  'index.html',
  'styles.css',
  'app.mjs',
  'core.mjs',
  'review.mjs',
  'architecture.svg',
  'project-plan.json',
  'legacy-project-plan.json',
]);
const nativeServer = createServer(),
  handler = nativeServer.listeners('request')[0];
const published =
  process.env.HYPERNOVA_SITE_ROOT &&
  path.resolve(repo, process.env.HYPERNOVA_SITE_ROOT);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith(prefix)) {
    res.writeHead(404);
    return res.end();
  }
  const relative = pathname.slice(prefix.length) || 'index.html';
  if (published) {
    if (!assets.has(relative)) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.css': 'text/css',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      }[path.extname(relative)]
    );
    fs.createReadStream(path.join(published, relative))
      .on('error', () => res.destroy())
      .pipe(res);
  } else {
    req.url = '/' + relative;
    handler(req, res);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
const errors = [],
  external = [],
  checks = [];
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    origin = `http://127.0.0.1:${server.address().port}`;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(r.url()));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:'))
      external.push(r.url());
  });
  await page.goto(origin + prefix);
  await page.waitForSelector('body[data-ready="true"]');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Skip to content');
  assert.equal(await page.locator('#regions article').count(), 6);
  assert.equal(await page.locator('#jobs tr').count(), 11);
  async function downloaded(button) {
    // Pace repeated exports like user clicks; Chromium throttles rapid download bursts.
    await page.waitForTimeout(200);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    return fs.readFileSync(await (await pending).path(), 'utf8');
  }
  for (const type of workTypes) {
    await page
      .getByLabel('Type of work', { exact: true })
      .selectOption(type.id);
    assert.equal(await page.locator('#criteria li').count(), 3);
    const order = JSON.parse(await downloaded('Download work order'));
    assert.deepEqual(order, await makeWorkOrder(source, type.id, 'EARTH'));
  }
  assert.match(
    await downloaded('Download operator brief'),
    /proposal requiring owner authorization/
  );
  checks.push(
    'All ten browser proposals match the source-bound CLI contract; readable handoff exports'
  );
  await page.getByRole('button', { name: 'Analyze the mission' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  const evidence = JSON.parse(await downloaded('Download evidence'));
  assert.equal((await reviewEvidence(evidence, source)).passed, true);
  assert.equal(await downloaded('Download exact source'), source);
  assert.equal(
    await downloaded('Download CSV'),
    evidence.artifacts.find((a) => a.name === 'allocations.csv').content
  );
  assert.equal(
    await downloaded('Download report'),
    evidence.artifacts.find((a) => a.name === 'report.md').content
  );
  checks.push(
    'Fresh analysis, independent calculations, exact-source, CSV, report and evidence downloads'
  );
  await page
    .getByRole('button', { name: 'Inspect the original defects' })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('#analysis-table')
      .textContent.includes('ALLOCATION_TOTAL_MISMATCH')
  );
  assert.match(
    await page.locator('#analysis-table').textContent(),
    /REGION_OVER_BUDGET:EARTH/
  );
  const upload = (content) =>
    page.locator('#receipt-file').setInputFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        typeof content === 'string' ? content : json(content)
      ),
    });
  await upload(evidence);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  assert.equal(await page.locator('#download-evidence').isDisabled(), true);
  await page.getByRole('button', { name: 'Use corrected plan' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  const bad = structuredClone(evidence),
    a = bad.artifacts.find((x) => x.name === 'analysis.json');
  const content = JSON.parse(a.content);
  content.criticalPathDays = 1;
  a.content = json(content);
  a.sha256 = await digest(a.content);
  await upload(bad);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  assert.match(
    await page.locator('#checks .fail').textContent(),
    /Independent arithmetic/
  );
  assert.equal(await page.locator('#download-csv').isDisabled(), true);
  await upload('<script>window.injected=true</script>');
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'File could not be verified'
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await upload(' '.repeat(1048577));
  await page.waitForFunction(() =>
    document
      .querySelector('#review-status')
      .textContent.includes('at most 1 MiB')
  );
  checks.push(
    'Historical defects, mismatched source, rehashed wrong answer, malformed/oversized files rejected'
  );
  // Hold one file read to prove a late import cannot overwrite a newer action.
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) => {
        window.releaseFile = () => original.call(this).then(resolve);
      });
    };
    window.restoreFile = () => (File.prototype.text = original);
  });
  await upload(bad);
  await page.getByRole('button', { name: 'Use corrected plan' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await page.evaluate(async () => {
    await window.releaseFile();
    window.restoreFile();
  });
  assert.equal(
    await page.locator('#review-title').textContent(),
    'Artifact checks passed'
  );
  checks.push(
    'Stale asynchronous file import cannot replace a newer verified analysis'
  );
  await page
    .getByLabel('Total reviewer hours / day', { exact: true })
    .fill('0');
  assert.equal(await page.locator('#capacity-number').textContent(), '0');
  await page.getByLabel('Workers', { exact: true }).fill('');
  assert.equal(await page.locator('#capacity-number').textContent(), '—');
  await page.getByLabel('Workers', { exact: true }).fill('100');
  await page
    .getByLabel('Total reviewer hours / day', { exact: true })
    .fill('20');
  assert.equal(await page.locator('#capacity-number').textContent(), '16,000');
  checks.push(
    'Zero reviewers and invalid input clear capacity; restored inputs reproduce 16000 accepted jobs'
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      true,
      `Overflow at ${width}`
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      `Accessibility at ${width}`
    );
    if ([390, 1440].includes(width)) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: path.join(out, `hypernova-${width}.png`),
        fullPage: true,
      });
    }
  }
  checks.push(
    'Keyboard skip link, no overflow and zero automated WCAG A/AA violations at five widths'
  );
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(origin + prefix);
  assert.ok(await fallback.locator('noscript a').isVisible());
  await noJs.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(
    path.join(out, 'verification.json'),
    json({
      scope: published || 'source workbench under project prefix',
      checks,
      errors,
      externalRequests: external,
      liveProviderCalls: 0,
      blockchainTransactions: 0,
    })
  );
  console.log(json({ passed: true, checks }));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
