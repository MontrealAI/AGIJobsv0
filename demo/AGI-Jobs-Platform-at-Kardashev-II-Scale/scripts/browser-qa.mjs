import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const require = createRequire(import.meta.url);
const { createServer } = require('./serve-dashboard.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.resolve(root, '../../reports/kardashev');
fs.mkdirSync(reportDir, { recursive: true });
const server = await createServer(root);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [];
try {
  for (const route of [
    '',
    'output/',
    'stellar-civilization-lattice/',
    'stellar-civilization-lattice/output/',
    'k2-stellar-demo/',
    'k2-stellar-demo/output/',
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [],
      external = [],
      warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        warnings.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (
        !request.url().startsWith(origin) &&
        !request.url().startsWith('data:')
      )
        external.push(request.url());
    });
    await page.goto(origin + '/' + route);
    try {
      await page.waitForFunction(
        () => document.documentElement.dataset.demoStatus === 'ready',
        null,
        { timeout: 10000 }
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          route,
          errors,
          status: await page.locator('#demo-load-status').innerText(),
        })
      );
      throw error;
    }
    try {
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '#mermaid-container svg, #dyson-container svg'
          ).length === 2,
        null,
        { timeout: 12000 }
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          route,
          errors,
          warnings,
          diagrams: await page
            .locator('#mermaid-container, #dyson-container')
            .allTextContents(),
        })
      );
      throw error;
    }
    await page
      .getByRole('button', { name: 'Run reflection checklist' })
      .click();
    assert.ok(await page.locator('#reflection-checklist li').count());
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        `${route}: overflow at ${width}`
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('header').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(
        reportDir,
        (route.replaceAll('/', '-') || 'main') + '.png'
      ),
    });
    results.push({
      route,
      errors,
      external,
      violations: axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    });
    await context.close();
  }
  const page = await browser.newPage();
  const telemetry = JSON.parse(
    fs.readFileSync(path.join(root, 'output/kardashev-telemetry.json'))
  );
  telemetry.energy.liveFeeds.feeds[0].region =
    '<img src=x onerror="window.injected=true">';
  telemetry.missionDirectives.ownerPowers[0].title =
    '<svg onload="window.injected=true">';
  await page.route('**/kardashev-telemetry.inline.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.__KARDASHEV_TELEMETRY__ = ${JSON.stringify(telemetry)};`,
    })
  );
  await page.goto(origin + '/');
  await page.waitForFunction(
    () => document.documentElement.dataset.demoStatus === 'ready'
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(
    await page.locator('#energy-feed-list img, #owner-power-list svg').count(),
    0
  );
  assert.match(await page.locator('#energy-feed-list').innerText(), /<img/);
  await page.close();
  const legacyDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kardashev-browser-')
  );
  let legacyServer;
  try {
    const generated = spawnSync(
      process.execPath,
      [path.join(root, 'run-demo.cjs'), '--output-dir', legacyDir],
      { encoding: 'utf8', timeout: 60000 }
    );
    assert.equal(generated.status, 0, generated.stderr);
    legacyServer = await createServer(legacyDir);
    await new Promise((resolve) =>
      legacyServer.listen(0, '127.0.0.1', resolve)
    );
    const legacyPage = await browser.newPage();
    const legacyErrors = [];
    legacyPage.on('pageerror', (error) => legacyErrors.push(error.message));
    await legacyPage.goto(`http://127.0.0.1:${legacyServer.address().port}/`);
    await legacyPage.waitForFunction(
      () => document.documentElement.dataset.demoStatus === 'ready'
    );
    await legacyPage.locator('#mermaid-container svg').waitFor();
    await legacyPage.locator('#dyson-container svg').waitFor();
    assert.deepEqual(legacyErrors, []);
    await legacyPage.close();
  } finally {
    if (legacyServer)
      await new Promise((resolve) => legacyServer.close(resolve));
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }
  fs.writeFileSync(
    path.join(reportDir, 'browser-report.json'),
    JSON.stringify(
      { results, injectionBlocked: true, legacyExport: 'passed' },
      null,
      2
    )
  );
  assert.ok(
    results.every(
      (r) => !r.errors.length && !r.external.length && !r.violations.length
    ),
    JSON.stringify(results)
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      dashboards: results.length,
      mobileWidths: [320, 390, 768],
      externalRequests: 0,
      accessibilityViolations: 0,
      injectionBlocked: true,
      legacyExport: 'passed',
    })
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
