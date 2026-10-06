'use strict';
// Optional browser QA; Playwright and a browser must be installed by the operator.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  'playwright');
const { run, parseArgs } = require('../lib/mission.cjs');
const { createServer } = require('../ui/server.cjs');
async function main() {
  const output =
    process.env.OMEGA_BROWSER_OUTPUT ||
    fs.mkdtempSync(path.join(os.tmpdir(), 'omega-browser-'));
  fs.mkdirSync(output, { recursive: true });
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const result = await run(
    parseArgs([
      '--out',
      path.join(output, 'run'),
      '--origin',
      `http://127.0.0.1:${port}`,
    ])
  );
  let server = createServer(result.out, port);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    const external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (!r.url().startsWith(`http://127.0.0.1:${port}/`))
        external.push(r.url());
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('.mission').nth(2).waitFor();
    assert.equal(await page.locator('.mission').count(), 3);
    assert.match(
      await page.locator('#detail').textContent(),
      /Solaris Continuum/
    );
    await page.locator('.mission').nth(2).click();
    assert.match(
      await page.locator('#detail').textContent(),
      /Celestial Silk Road/
    );
    assert.equal(
      await page.locator('.mission').nth(2).getAttribute('aria-pressed'),
      'true'
    );
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Agent task', exact: true }).click();
    const download = await downloaded;
    const file = await download.path();
    const task = JSON.parse(fs.readFileSync(file));
    assert.equal(task.workerProfile, 'omega');
    assert.ok(task.inputText.includes('supplier-selection'));
    assert.deepEqual(task.allowedOrigins, [`http://127.0.0.1:${port}`]);
    await page.locator('#capacity').fill('10');
    assert.match(
      await page.locator('#capacity-result').textContent(),
      /1 of 3/
    );
    await page.locator('#language').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
    assert.match(
      await page.locator('h1').textContent(),
      /Du travail vérifiable/
    );
    await page.locator('#language').click();
    await page.locator('.mission').nth(0).click();
    await page.locator('#capacity').fill('40');
    await page.screenshot({
      path: path.join(output, 'desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      'mobile overflow'
    );
    await page.locator('.mission').nth(1).focus();
    await page.keyboard.press('Enter');
    assert.match(
      await page.locator('#detail').textContent(),
      /Arctic Quantum Accord/
    );
    await page.screenshot({
      path: path.join(output, 'mobile.png'),
      fullPage: true,
    });
    // A verified custom report can validly need 1440 minutes per job while
    // saved capacity is zero. Preview must reach one job and the whole batch.
    const custom = structuredClone(require('../config/omega.simulation.json'));
    custom.businessPolicy.maxReviewerMinutesPerJob = 1440;
    custom.nations.forEach((nation) => {
      nation.estimatedReviewMinutes = 1440;
    });
    const customPath = path.join(output, 'custom-scenario.json');
    fs.writeFileSync(customPath, JSON.stringify(custom));
    const customResult = await run(
      parseArgs([
        '--scenario',
        customPath,
        '--review-capacity',
        '0',
        '--out',
        path.join(output, 'custom-run'),
        '--origin',
        `http://127.0.0.1:${port}`,
      ])
    );
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    server = createServer(customResult.out, port);
    await new Promise((r) => server.listen(port, '127.0.0.1', r));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('.mission').nth(2).waitFor();
    assert.equal(await page.locator('#capacity').getAttribute('max'), '4320');
    await page.locator('#capacity').fill('1440');
    assert.match(
      await page.locator('#capacity-result').textContent(),
      /1 of 3/
    );
    await page.locator('#capacity').fill('4320');
    assert.match(
      await page.locator('#capacity-result').textContent(),
      /3 of 3/
    );
    await page.locator('#language').click();
    assert.match(
      await page.locator('#capacity-result').textContent(),
      /3 mandat\(s\).*4320/
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(customResult.out, 'report.json')))
        .review.capacityMinutes,
      0
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      'custom scenario mobile overflow'
    );
    await page.screenshot({
      path: path.join(output, 'custom-capacity.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.equal(await page.locator('#error').isVisible(), false);
    console.log(
      `Browser checks passed: desktop/mobile, keyboard, language, default/custom capacity preview, task download, no external requests or browser errors. Screenshots: ${output}`
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
