'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http'),
  { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const { createServer } = require('../computer-work/server.cjs');
const { review, reviewReceipt } = require('../computer-work/review.cjs');
const {
  executeComputerWork,
  computerTaskDigest,
} = require('../../../apps/orchestrator/computerWork.ts');
const task = require('../computer-work/task.json');
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function main() {
  const out =
    process.env.PLANETARY_QA_DIR ||
    (await fs.mkdtemp(path.join(os.tmpdir(), 'planetary-browser-')));
  await fs.mkdir(out, { recursive: true });
  const server = createServer(),
    origin = await listen(server),
    browser = await chromium.launch({ headless: true });
  let provider;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
      acceptDownloads: true,
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort()
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByText('Plan ready.', { exact: false }).waitFor();
    assert.equal(await page.locator('#jobs tr').count(), 10);
    assert.match(await page.locator('#metrics').innerText(), /10600\.000000/);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      axe.violations.map((x) => ({
        id: x.id,
        nodes: x.nodes.map((n) => n.target),
      })),
      []
    );
    await page.screenshot({
      path: path.join(out, 'desktop.png'),
      fullPage: true,
    });
    const downloads = {};
    for (const [id, name] of [
      ['allocation', 'allocation.json'],
      ['brief', 'brief.md'],
    ]) {
      const download = page.waitForEvent('download');
      await page.locator('#' + id).click();
      const file = await download;
      await file.saveAs(path.join(out, name));
      downloads[name] = await fs.readFile(path.join(out, name), 'utf8');
    }
    assert.equal(
      review(JSON.parse(downloads['allocation.json']), downloads['brief.md'])
        .status,
      'passed'
    );
    await page.locator('#budget').fill('1.000000');
    assert.equal(await page.locator('#allocation').isDisabled(), true);
    await page.locator('#calculate').click();
    assert.match(await page.locator('#metrics').innerText(), /0 \/ 10/);
    await page.locator('#reset').click();
    await page.locator('#outage').selectOption('earth-code');
    await page.locator('#calculate').click();
    assert.match(
      await page.locator('#workers').innerText(),
      /earth-code · offline/
    );
    await page.locator('#language').selectOption('fr');
    assert.match(await page.locator('h2').first().innerText(), /Quels travaux/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, 'mobile-fr.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    await page.locator('#reset').click();
    await page.locator('#language').selectOption('en');
    await page.getByRole('link', { name: 'Open the operator guide' }).click();
    await page
      .getByRole('heading', { name: '1. Try the local rehearsal' })
      .waitFor();
    await page.goto(origin);
    await page.getByText('Plan ready.', { exact: false }).waitFor();
    await page.route('**/board.json', (route) => route.abort());
    await page.reload();
    await page.getByText('Source unavailable.', { exact: false }).waitFor();
    assert.equal(await page.locator('#allocation').isDisabled(), true);
    await page.unroute('**/board.json');
    const board = JSON.parse(
      await fs.readFile(
        path.join(__dirname, '../computer-work/board.json'),
        'utf8'
      )
    );
    board.jobs[0].title = '<img src=x onerror="window.attacked=true">';
    await page.route('**/board.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(board),
      })
    );
    await page.reload();
    await page.getByText('Plan ready.', { exact: false }).waitFor();
    assert.equal(await page.locator('#jobs img').count(), 0);
    assert.equal(await page.evaluate(() => window.attacked), undefined);
    await page.unroute('**/board.json');
    const token = randomUUID();
    process.env.COMPUTER_WORK_PLANETARY_BROWSER_TOKEN = token;
    let calls = 0;
    provider = http.createServer(async (req, res) => {
      try {
        assert.equal(req.headers.authorization, `Bearer ${token}`);
        calls++;
        for await (const _ of req) {
        }
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'browser-fixture',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      status: 'completed',
                      summary:
                        'Actual isolated Chromium exports with scripted fixture decisions; no live provider',
                      artifacts: [
                        {
                          name: 'allocation.json',
                          mediaType: 'application/json',
                          content: downloads['allocation.json'],
                        },
                        {
                          name: 'brief.md',
                          mediaType: 'text/markdown',
                          content: downloads['brief.md'],
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
          })
        );
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    const providerOrigin = await listen(provider);
    const profile = {
      endpoint: providerOrigin + '/v1/responses',
      agentId: 'planetary',
      tokenEnv: 'COMPUTER_WORK_PLANETARY_BROWSER_TOKEN',
      deploymentId: 'browser-' + randomUUID(),
      mode: 'fixture',
      timeoutMs: 10000,
      maxResponseBytes: 262144,
      maxOutputTokens: 8192,
      approvedJobs: [{ jobId: '1', taskSha256: computerTaskDigest(task) }],
    };
    const receipt = await executeComputerWork('1', task, profile, {
      stateDirectory: path.join(out, 'journal'),
    });
    const verdict = reviewReceipt(receipt, {
      jobId: '1',
      deploymentId: profile.deploymentId,
    });
    assert.equal(verdict.status, 'passed');
    assert.equal(calls, 1);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(out, 'receipt.json'),
      JSON.stringify(receipt, null, 2)
    );
    await fs.writeFile(
      path.join(out, 'review.json'),
      JSON.stringify(verdict, null, 2)
    );
    await fs.writeFile(
      path.join(out, 'browser-evidence.json'),
      JSON.stringify(
        {
          actualBrowser: true,
          actualProvider: false,
          actualChain: false,
          simulatedDecisions: true,
          baselinePassed: true,
          accessibilityViolations: axe.violations.length,
          pageErrors: errors,
        },
        null,
        2
      )
    );
    console.log('Browser checks passed:', out);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (provider) {
      provider.closeAllConnections();
      await new Promise((resolve) => provider.close(resolve));
    }
    delete process.env.COMPUTER_WORK_PLANETARY_BROWSER_TOKEN;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
