import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeTask, taskDigest, createExample, json } from '../core.mjs';
const require = createRequire(import.meta.url);
const { createServer } = require('../server.cjs');
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const output = path.join(root, 'reports/kardashev-business');
fs.mkdirSync(output, { recursive: true });
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [],
  external = [],
  checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(r.url()));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:'))
      external.push(r.url());
  });
  await page.goto(origin);
  await page.waitForSelector('body[data-ready=true]');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Skip to content');
  checks.push('keyboard skip link');
  assert.equal(await page.locator('.template').count(), 10);
  assert.equal(await page.locator('.engine-card').count(), 5);
  await page.getByRole('button', { name: /Performance optimization/ }).click();
  await page.waitForFunction(
    () => document.querySelector('#artifact').textContent === 'benchmark.md'
  );
  await page.getByLabel('Simulation lens').selectOption('ultra');
  await page.waitForFunction(() =>
    document.querySelector('#task-goal').textContent.startsWith('Ultra:')
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download work order' }).click();
  const download = await pending;
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(
    await taskDigest(exported),
    await taskDigest(await makeTask('performance', 'ultra'))
  );
  checks.push('template selection, family selection and exact task download');
  await page.getByRole('button', { name: 'Generate & check example' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  assert.match(
    await page.locator('#review-status').textContent(),
    /Settlement is not approved/
  );
  const evidenceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download evidence JSON/ }).click();
  const evidence = await evidenceDownload;
  fs.copyFileSync(
    await evidence.path(),
    path.join(output, 'browser-evidence.json')
  );
  await page.getByRole('button', { name: 'Test a wrong answer' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  assert.match(await page.locator('.fail').textContent(), /Total and deficit/);
  checks.push(
    'local artifact generation, evidence download and rehashed wrong-answer rejection'
  );
  await page.locator('#receipt-file').setInputFiles({
    name: 'receipt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json(await createExample('ultra'))),
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await page.locator('#receipt-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('<script>alert(1)</script>'),
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'File could not be verified'
  );
  await page.locator('#receipt-file').setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(262145, 32),
  });
  assert.match(
    await page.locator('#review-status').textContent(),
    /under 256 KiB/
  );
  checks.push('valid import, malformed import and file-size guard');
  await page.getByRole('spinbutton', { name: 'Review hours / day' }).fill('0');
  assert.equal(await page.locator('#jobs-day').textContent(), '0');
  await page.getByRole('spinbutton', { name: 'Review minutes / job' }).fill('');
  assert.equal(await page.locator('#annual-volume').textContent(), '—');
  await page.getByRole('spinbutton', { name: 'Review hours / day' }).fill('8');
  await page
    .getByRole('spinbutton', { name: 'Review minutes / job' })
    .fill('10');
  assert.equal(
    await page.locator('#annual-volume').textContent(),
    '$17,520,000'
  );
  checks.push('capacity boundaries and clearing stale estimates');
  await page.getByLabel('Simulation lens').selectOption('foundation');
  await page
    .getByRole('button', { name: /Energy & scientific analysis/ })
    .click();
  await page.getByRole('button', { name: 'Generate & check example' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  const a11y = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  fs.writeFileSync(
    path.join(output, 'accessibility.json'),
    json(a11y.violations)
  );
  assert.deepEqual(
    a11y.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    []
  );
  await page.screenshot({
    path: path.join(output, 'desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    ),
    false,
    'mobile overflow'
  );
  await page.screenshot({
    path: path.join(output, 'mobile.png'),
    fullPage: true,
  });
  checks.push('desktop/mobile layouts and WCAG automated accessibility');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(
    path.join(output, 'browser-qa.json'),
    json({
      checks,
      errors,
      externalRequests: external,
      actualBrowser: true,
      liveProvider: false,
      settlementApproved: false,
    })
  );
  console.log(
    json({
      checks,
      errors,
      externalRequests: external.length,
      accessibilityViolations: a11y.violations.length,
    })
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
