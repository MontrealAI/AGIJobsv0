import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(demo, '../..');
const root = path.resolve(
  process.env.SYNTHESIS_SITE_ROOT || path.join(repo, 'build/program-synthesis')
);
const out = path.join(repo, 'reports/pages/program-synthesis');
fs.mkdirSync(out, { recursive: true });
const errors = [],
  requests = [],
  checks = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(
    new URL(req.url, 'http://localhost').pathname
  );
  let file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
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
      '.json': 'application/json',
      '.css': 'text/css',
    }[path.extname(file)] || 'application/octet-stream'
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : (requests.push(route.request().url()), route.abort())
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(origin);
  await page.waitForFunction(
    () => document.getElementById('run').disabled === false
  );
  await page.waitForFunction(() =>
    document
      .getElementById('record-summary')
      .textContent.includes('Final fitness')
  );
  for (const task of ['normalize', 'ledger', 'catalog']) {
    await page.locator('#case').selectOption(task);
    await page.locator('#run').click();
    await page.waitForFunction(
      () =>
        document.getElementById('lab-state').textContent === 'REVIEW REQUIRED'
    );
    const pending = page.waitForEvent('download');
    await page.locator('#download-candidate').click();
    const download = await pending,
      file = path.join(out, `${task}.json`);
    await download.saveAs(file);
    const review = spawnSync(
      process.env.PYTHON_BIN || 'python3',
      [path.join(demo, 'computer-work/review.py'), file, '--task', task],
      { encoding: 'utf8' }
    );
    assert.equal(review.status, 0, review.stdout + review.stderr);
    checks.push(`${task}: browser export passes Python acceptance cases`);
  }
  const badDownload = page.waitForEvent('download');
  await page.locator('#inject').click();
  const badFile = path.join(out, 'wrong.json');
  await (await badDownload).saveAs(badFile);
  assert.equal(
    spawnSync(process.env.PYTHON_BIN || 'python3', [
      path.join(demo, 'computer-work/review.py'),
      badFile,
      '--task',
      'catalog',
    ]).status,
    1
  );
  checks.push('wrong candidate rejected');
  await page.locator('#candidate-limit').fill('1');
  await page.locator('#run').click();
  await page.waitForFunction(
    () => document.getElementById('lab-state').textContent === 'LIMIT REACHED'
  );
  assert.equal(await page.locator('#download-candidate').isDisabled(), true);
  checks.push('candidate budget fails closed');
  await page.locator('#candidate-limit').fill('400');
  await page.evaluate(() => {
    document.getElementById('lab-form').requestSubmit();
    document.getElementById('stop').click();
  });
  assert.equal(await page.locator('#lab-state').textContent(), 'STOPPED');
  assert.equal(await page.locator('#download-candidate').isDisabled(), true);
  checks.push('local cancellation blocks candidate export');
  assert.match(await page.locator('#plan-status').textContent(), /Held/);
  for (const id of ['lawful', 'rights', 'independent'])
    await page.locator('#' + id).check();
  assert.match(
    await page.locator('#plan-status').textContent(),
    /Ready for operator review/
  );
  const orderDownload = page.waitForEvent('download');
  await page.locator('#export-order').click();
  const orderFile = path.join(out, 'work-order.json');
  await (await orderDownload).saveAs(orderFile);
  const order = JSON.parse(fs.readFileSync(orderFile));
  assert.equal(order.estimatedCostUsdc, '500.000000');
  assert.equal(order.dispatched, false);
  checks.push('exact USDC work-order export');
  await page.locator('#review-capacity').fill('0');
  assert.match(await page.locator('#plan-status').textContent(), /Held/);
  checks.push('reviewer capacity blocks work order');
  await page.locator('#budget').fill('1e4');
  assert.equal(await page.locator('#export-order').isDisabled(), true);
  checks.push('invalid money rejected');
  await page.locator('#budget').fill('1500');
  await page.locator('#review-capacity').fill('60');
  await page.locator('#adoption').fill('0');
  assert.equal(await page.locator('#work-value').textContent(), '$0');
  checks.push('economic filters recompute');
  await page.locator('#adoption').fill('0.01');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      true,
      `overflow at ${width}`
    );
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    fs.writeFileSync(
      path.join(out, `axe-${width}.json`),
      JSON.stringify(axe.violations, null, 2)
    );
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(
        axe.violations.map((x) => ({
          id: x.id,
          nodes: x.nodes.map((n) => n.target),
        }))
      )
    );
    await page.screenshot({
      path: path.join(out, `desktop-${width}.png`),
      fullPage: true,
    });
    checks.push(`layout and accessibility ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of [
    'legacy/python/',
    'legacy/python/alpha/report.html',
    'legacy/typescript/meta-agentic-program-synthesis-dashboard.html',
  ]) {
    await page.goto(origin + '/' + route);
    const count = await page.locator('.mermaid').count();
    assert.ok(count > 0);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.mermaid')].every((node) =>
          node.querySelector('svg')
        ),
      {},
      { timeout: 60000 }
    );
    assert.equal(
      await page.locator('.error-icon,.error-text').count(),
      0,
      route
    );
    checks.push(`${route}: ${count} preserved flowcharts render`);
    if (route.includes('typescript'))
      assert.equal(
        await page
          .locator('#meta-agentic-summary')
          .evaluate((node) => JSON.parse(node.textContent).evidenceClass),
        'seeded-simulation'
      );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  fs.writeFileSync(
    path.join(out, 'qa.json'),
    JSON.stringify({ checks, errors, externalRequests: requests }, null, 2)
  );
  console.log(
    `${checks.length} browser checks passed; zero accessibility violations or external requests.`
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
