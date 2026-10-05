import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { examples, defaults } from '../ui/computer-work-model.mjs';
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
    await page.waitForFunction(
      () => document.querySelector('#computer-work')?.dataset.status === 'ready'
    );
    assert.equal(await page.locator('#cw-example option').count(), 10);
    for (const example of examples) {
      await page.locator('#cw-example').selectOption(example.id);
      assert.deepEqual(
        JSON.parse(await page.locator('#cw-json').textContent()),
        example.task
      );
      assert.equal(
        await page.locator('#cw-task li').count(),
        example.task.acceptanceCriteria.length +
          example.task.deliverables.length
      );
    }
    await page.locator('#cw-example').selectOption('supplier');
    const downloadEvent = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download task draft (JSON)' })
      .click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'k2-supplier-task-draft.json');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(await download.path(), 'utf8')),
      examples[0].task
    );
    await page.locator('#cw-reviewers').fill('0');
    assert.match(await page.locator('#cw-results').innerText(), /\$0/);
    await page.locator('#cw-reviewers').fill('45');
    assert.match(
      await page.locator('#cw-planning-status').innerText(),
      /0 submitted jobs exceed/
    );
    for (const value of ['', '-1', '1.5', '1000001']) {
      await page.locator('#cw-workers').fill(value);
      assert.equal(await page.locator('#cw-results').innerText(), '');
      assert.match(
        await page.locator('#cw-planning-status').innerText(),
        /Planning input invalid/
      );
    }
    await page
      .getByRole('button', { name: 'Reset planning assumptions' })
      .click();
    assert.equal(
      await page.locator('#cw-workers').inputValue(),
      String(defaults.workers)
    );
    assert.match(await page.locator('#cw-results').innerText(), /\$10,125,000/);
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
    await page.locator('#computer-work').screenshot({
      path: path.join(
        reportDir,
        (route.replaceAll('/', '-') || 'main') + '-computer-work.png'
      ),
    });
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
    '<img src=x onerror="window.__AGIJOBS_K2_XSS_EXECUTED__=true">';
  telemetry.missionDirectives.ownerPowers[0].title =
    '<svg onload="window.__AGIJOBS_K2_XSS_EXECUTED__=true">';
  await page.route('**/kardashev-telemetry.inline.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.__KARDASHEV_TELEMETRY__ = ${JSON.stringify(telemetry)};`,
    })
  );
  await page.route('**/computer-work-model.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: fs
        .readFileSync(path.join(root, 'ui/computer-work-model.mjs'), 'utf8')
        .replace(
          'Supplier comparison',
          '<img src=x onerror=window.__AGIJOBS_K2_XSS_EXECUTED__=true>'
        )
        .replace(
          'Compare eligible quotes and recommend the lowest-cost supplier meeting the delivery deadline.',
          '<svg onload=window.__AGIJOBS_K2_XSS_EXECUTED__=true>'
        ),
    })
  );
  await page.goto(origin + '/');
  await page.waitForFunction(
    () => document.documentElement.dataset.demoStatus === 'ready'
  );
  await page.waitForFunction(
    () => document.querySelector('#computer-work')?.dataset.status === 'ready'
  );
  assert.equal(await page.locator('#cw-task svg, #cw-example img').count(), 0);
  assert.match(await page.locator('#cw-task').innerText(), /<svg/);
  assert.equal(
    await page.evaluate(() => window.__AGIJOBS_K2_XSS_EXECUTED__),
    undefined
  );
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
      taskDraftsPerDashboard: examples.length,
      taskExports: 'passed',
      planningBoundaries: 'passed',
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
