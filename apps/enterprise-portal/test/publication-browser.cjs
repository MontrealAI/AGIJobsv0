'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const portal = path.dirname(__dirname);
const report = path.join(root, 'reports/portal-publication');
const port = Number(process.env.PORTAL_QA_PORT || 3993);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid QA port');
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next', { paths: [portal] }),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: portal,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let serverLog = '';
child.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
child.stderr.on('data', (chunk) => {
  serverLog += chunk;
});
let browser;

async function main() {
  await fs.mkdir(report, { recursive: true });
  const deadline = Date.now() + 45000;
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(`Portal exited before readiness: ${serverLog}`);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok) break;
    } catch {}
    if (Date.now() > deadline)
      throw new Error(`Portal readiness timeout: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    locale: 'en-US',
  });
  let publishedBytes = '';
  const errors = [];
  let storageReads = 0;
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    if (url === 'https://ipfs.io/ipfs/bafyportalfixture') {
      storageReads++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: publishedBytes,
      });
    }
    if (url === 'https://sepolia.infura.io/v3/demo') {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Allow-Methods': 'POST',
          },
        });
      const body = route.request().postDataJSON();
      const answer = (call) => ({
        jsonrpc: '2.0',
        id: call.id,
        result:
          call.method === 'eth_chainId'
            ? '0xaa36a7'
            : [
                'eth_getLogs',
                'eth_getFilterChanges',
                'eth_getFilterLogs',
              ].includes(call.method)
            ? []
            : call.method === 'eth_uninstallFilter'
            ? true
            : '0x1',
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(
          Array.isArray(body) ? body.map(answer) : answer(body)
        ),
      });
    }
    errors.push(`Unexpected external request: ${url}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  const next = () =>
    page
      .locator('.chat-form')
      .getByRole('button', { name: 'Next', exact: true })
      .click();
  await page.locator('#chat-title').fill('Supplier comparison');
  await next();
  await page
    .locator('#chat-description')
    .fill('Compare quotes for 40 units and deliver within seven days.');
  await next();
  await next(); // No local attachments.
  await page.locator('#chat-reward').fill('100');
  await next();
  await next(); // Default deadline.
  await next(); // Skills optional.
  await next(); // Validation window.
  await next(); // Agent archetype.
  await page
    .locator('.chat-actions')
    .getByRole('button', { name: 'No', exact: true })
    .click();
  const card = page.locator('.specification-publication');
  await card.waitFor();
  async function downloadSpec(name) {
    const pending = page.waitForEvent('download');
    await card
      .getByRole('link', { name: 'Download exact specification' })
      .click();
    const download = await pending;
    const file = path.join(report, name);
    await download.saveAs(file);
    return fs.readFile(file, 'utf8');
  }
  publishedBytes = await downloadSpec('conversation-spec.json');
  assert.equal(JSON.parse(publishedBytes).title, 'Supplier comparison');
  await page.locator('#chat-spec-uri').fill('ipfs://bafyportalfixture');
  const verify = () =>
    card
      .getByRole('button', {
        name: 'Verify published specification',
        exact: true,
      })
      .click();
  await verify();
  await card.getByRole('status').filter({ hasText: 'Verified:' }).waitFor();
  publishedBytes += '\n'; // Even a well-formed JSON document with different bytes must fail.
  await verify();
  await card.getByRole('status').filter({ hasText: 'do not match' }).waitFor();
  publishedBytes = publishedBytes.slice(0, -1);
  await verify();
  await card.getByRole('status').filter({ hasText: 'Verified:' }).waitFor();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const axe = await page.evaluate(async () =>
    window.axe.run(
      { include: ['.specification-publication'] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }
    )
  );
  assert.deepEqual(
    axe.violations.map((item) => item.id),
    []
  );
  await card.screenshot({ path: path.join(report, 'publication-desktop.png') });
  for (const locale of ['en', 'fr', 'es', 'zh', 'ja']) {
    await page.locator('.language-selector__select').selectOption(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.boundingBox();
    assert.ok(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391,
      `${locale}: mobile card overflow`
    );
    assert.equal(
      await card.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1
      ),
      true
    );
    assert.ok(
      !(await card.innerText()).includes('publication.'),
      `${locale}: missing translations`
    );
  }
  await page.locator('.language-selector__select').selectOption('en');
  await card.screenshot({ path: path.join(report, 'publication-mobile.png') });
  await page.goto(`${origin}/solving-governance`);
  await card.waitFor();
  publishedBytes = await downloadSpec('governance-spec.json');
  assert.equal(JSON.parse(publishedBytes).scenarioId, 'nation-a');
  await page.locator('#governance-spec-uri').fill('ipfs://bafyportalfixture');
  await verify();
  await card.getByRole('status').filter({ hasText: 'Verified:' }).waitFor();
  await page.getByLabel('Nation Scenario').selectOption('nation-b');
  assert.equal(
    await card.getByRole('status').count(),
    0,
    'Draft changes must invalidate displayed verification'
  );
  await verify();
  await card.getByRole('status').filter({ hasText: 'do not match' }).waitFor();
  publishedBytes = await downloadSpec('governance-updated-spec.json');
  await verify();
  await card.getByRole('status').filter({ hasText: 'Verified:' }).waitFor();
  assert.equal(JSON.parse(publishedBytes).scenarioId, 'nation-b');
  assert.deepEqual(errors, []);
  const result = {
    status: 'passed',
    provider: 'intercepted-browser-fixture',
    walletTransactions: 0,
    storageReads,
    languages: 5,
    mobileWidth: 390,
    accessibilityViolations: axe.violations.length,
    pageErrors: errors.length,
  };
  await fs.writeFile(
    path.join(report, 'result.json'),
    JSON.stringify(result, null, 2) + '\n'
  );
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      timer.unref();
    }
  });
