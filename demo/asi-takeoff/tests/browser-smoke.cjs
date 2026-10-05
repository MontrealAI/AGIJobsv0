'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  'playwright');
const { createStudio } = require('../scripts/studio.cjs');
async function main() {
  const server = createStudio();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  const findings = {};
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.waitForSelector('#mission table');
    assert.equal(await page.locator('#mission tbody tr').count(), 5);
    assert.ok((await page.locator('#mission').innerText()).includes('500000'));
    await page.selectOption('#scenario', 'planetary');
    await page.waitForFunction(() =>
      document.querySelector('#mission').textContent.includes('780000')
    );
    assert.ok((await page.locator('#mission').innerText()).includes('41 days'));
    assert.ok((await page.locator('#mission').innerText()).includes('30-day'));
    findings.scenarios = true;
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: base,
      });
    const expectedCommand =
      'node demo/asi-takeoff/computer-work/review.cjs --receipt /path/to/receipt.json 73 your-deployment-id';
    assert.equal(
      await page.locator('#review-receipt-command').textContent(),
      expectedCommand
    );
    for (const command of await page
      .locator('code[data-command]')
      .allTextContents())
      assert.ok(!command.includes('\n'));
    await page.locator('[data-copy="review-receipt-command"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.copy-feedback')].some(
        (el) => el.textContent === 'Command copied.'
      )
    );
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      expectedCommand
    );
    findings.copyCommands = true;
    await page.selectOption('#language', 'fr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
    assert.ok(
      (await page.locator('header').innerText()).includes('aucune transaction')
    );
    findings.french = true;
    await page.locator('[data-copy="review-receipt-command"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.copy-feedback')].some(
        (el) => el.textContent === 'Commande copiée.'
      )
    );
    const dir = process.env.ASI_TAKEOFF_BROWSER_REPORT_DIR;
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, 'studio-desktop.png'),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    findings.mobile = true;
    assert.ok(
      await page
        .locator('.architecture')
        .evaluate((el) => el.complete && el.naturalWidth > 0)
    );
    findings.offlineDiagram = true;
    const links = page.locator('#handoff a[download]');
    for (let i = 0; i < (await links.count()); i++) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        links.nth(i).click(),
      ]);
      assert.equal(await download.failure(), null);
      assert.ok(fs.statSync(await download.path()).size > 0);
    }
    findings.downloads = true;
    if (dir) {
      await page
        .locator('#handoff')
        .screenshot({ path: path.join(dir, 'handoff-mobile.png') });
    }
    await page.route('**/api/plan*', async (route) => {
      const response = await route.fetch();
      const report = await response.json();
      report.initiative = '<img src=x onerror="window.compromised=1">';
      await route.fulfill({ json: report });
    });
    await page.click('#refresh');
    await page.waitForSelector('#mission table');
    assert.equal(await page.locator('#mission img').count(), 0);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    findings.untrustedText = true;
    await page.unroute('**/api/plan*');
    await page.route('**/api/plan*', (route) =>
      route.fulfill({ status: 500, body: 'unavailable' })
    );
    await page.click('#refresh');
    await page.waitForSelector('#error:not([hidden])');
    assert.equal(await page.locator('#mission table').count(), 0);
    assert.equal(await page.locator('#refresh').isEnabled(), true);
    findings.failureRecovery = true;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(findings, null, 2));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
