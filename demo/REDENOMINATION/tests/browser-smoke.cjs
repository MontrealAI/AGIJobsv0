'use strict';
// Optional real-browser verification: install root Playwright dependencies first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createControlRoom } = require('../scripts/control-room.cjs');
const { DEMO } = require('../scripts/playbook.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  'playwright');
async function main() {
  const server = createControlRoom();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const findings = {
    desktop: false,
    mobile: false,
    french: false,
    exactValues: false,
    untrustedText: false,
    missingExport: false,
    diagramFallback: false,
    liveDiagram: false,
  };
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('https://fonts.**/*', (route) => route.abort());
    await context.route('https://cdn.jsdelivr.net/**', (route) =>
      route.abort()
    );
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.waitForSelector('#actors .card');
    assert.equal(await page.locator('#actors .card').count(), 5);
    await page.locator('.phase-button').nth(1).click();
    assert.equal(
      await page.locator('.phase-button').nth(1).getAttribute('aria-pressed'),
      'true'
    );
    assert.ok(
      (await page.locator('#phase-detail').innerText()).includes(
        'Job Lifecycle'
      )
    );
    await page.waitForSelector('#mermaid-diagram pre', { state: 'attached' });
    await page.waitForFunction(
      () => document.querySelector('#mermaid-diagram img')?.naturalWidth > 0
    );
    findings.diagramFallback = true;
    await page.locator('#language-select').selectOption('fr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
    assert.ok(
      (await page.locator('[data-i18n="planningNotice"]').innerText()).includes(
        'hors ligne'
      )
    );
    findings.french = true;
    const out = process.env.REDENOMINATION_BROWSER_REPORT_DIR;
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({
        path: path.join(out, 'storyboard-desktop.png'),
        fullPage: true,
      });
    }
    findings.desktop = true;
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      'Storyboard overflows mobile viewport'
    );
    if (out)
      await page.screenshot({
        path: path.join(out, 'storyboard-mobile.png'),
        fullPage: true,
      });
    await page.goto(`${base}/ui/`);
    await page.waitForSelector('.owner-controls');
    assert.ok((await page.locator('#app').innerText()).includes('0.001 AGIΩ'));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      'Exact-value UI overflows mobile viewport'
    );
    if (out)
      await page.screenshot({
        path: path.join(out, 'control-room-mobile.png'),
        fullPage: true,
      });
    findings.mobile = true;
    const saved = JSON.parse(
      fs.readFileSync(path.join(DEMO, 'ui/export/latest.json'))
    );
    saved.token.targetSymbol = '<img src=x onerror="window.compromised=1">';
    saved.configSnapshots.jobRegistry.jobStakeTokens = '0.000000000000000001';
    await page.route('**/ui/export/latest.json*', (route) =>
      route.fulfill({ json: saved })
    );
    await page.locator('#refresh-button').click();
    await page.waitForSelector('.owner-controls');
    assert.ok(
      (await page.locator('.owner-controls').innerText()).includes(
        '0.000000000000000001'
      )
    );
    assert.equal(await page.locator('#app img').count(), 0);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    findings.exactValues = true;
    const scenario = JSON.parse(
      fs.readFileSync(path.join(DEMO, 'scenario.json'))
    );
    scenario.actors[0].goal = '<img src=x onerror="window.compromised=1">';
    await page.route('**/scenario.json', (route) =>
      route.fulfill({ json: scenario })
    );
    await page.goto(base);
    await page.waitForSelector('#actors .card');
    assert.equal(await page.locator('#actors img').count(), 0);
    assert.ok((await page.locator('#actors').innerText()).includes('<img'));
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    findings.untrustedText = true;
    await page.unroute('**/ui/export/latest.json*');
    await page.route('**/ui/export/latest.json*', (route) =>
      route.fulfill({ status: 404, body: 'missing' })
    );
    await page.goto(`${base}/ui/`);
    await page.waitForSelector('[role="alert"]');
    assert.equal(await page.locator('.owner-controls').count(), 0);
    findings.missingExport = true;
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    // Separate optional online check. CDN unavailability is reported, never hidden.
    if (process.env.REDENOMINATION_CHECK_ONLINE_DIAGRAM === '1') {
      const online = await browser.newPage();
      await online.goto(base);
      try {
        await online.waitForSelector('#mermaid-diagram svg', {
          timeout: 30000,
        });
        findings.liveDiagram = true;
      } catch {
        findings.diagramNetworkNote =
          'Pinned CDN renderer unavailable; source fallback verified.';
      }
      if (out && findings.liveDiagram)
        await online.screenshot({
          path: path.join(out, 'diagram-rendered.png'),
          fullPage: true,
        });
      await online.close();
    }
    console.log(JSON.stringify(findings, null, 2));
    if (out)
      fs.writeFileSync(
        path.join(out, 'browser-review.json'),
        JSON.stringify(findings, null, 2) + '\n'
      );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
