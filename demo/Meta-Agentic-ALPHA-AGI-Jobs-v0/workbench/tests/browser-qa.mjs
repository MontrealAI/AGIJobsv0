import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from '../server.cjs';
import { stages, makeTask, taskDigest, json } from '../model.mjs';
import { execute } from '../execute.mjs';
import { reviewBundle } from '../review.mjs';
import { buildSite } from '../../scripts/build-site.mjs';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);
const source = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/workbench/scenario.json'
    )
  )
);
const out = path.join(root, 'reports/meta-agentic-alpha/browser');
fs.mkdirSync(out, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-browser-'));
const server = createServer(await buildSite(path.join(temporary, 'site')));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
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
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (r) => errors.push(r.url()));
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith('blob:'))
      external.push(r.url());
  });
  await page.goto(origin);
  await page.waitForSelector('body[data-ready=true]');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Skip to content');
  assert.equal(await page.locator('[data-stage]').count(), 6);
  assert.equal(await page.locator('#work-rows tr').count(), 12);
  for (const stage of stages) {
    await page
      .getByLabel('Evaluation phase', { exact: true })
      .selectOption(stage.id);
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download work order', exact: true })
      .click();
    const download = await pending,
      task = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(
      await taskDigest(task),
      await taskDigest(await makeTask(source, stage.id))
    );
  }
  checks.push('keyboard navigation and all six exact task downloads');
  await page
    .getByRole('button', { name: /Evaluate the six-phase portfolio/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  assert.equal(await page.locator('#review-checks .pass').count(), 35);
  assert.equal(await page.locator('[data-decision=admitted]').count(), 5);
  assert.match(await page.locator('#findings').textContent(), /23,000/);
  assert.match(
    await page.locator('#findings').textContent(),
    /Review-ready work orders/
  );
  const downloadPending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download evidence', exact: true })
    .click();
  const evidenceDownload = await downloadPending,
    evidence = JSON.parse(
      fs.readFileSync(await evidenceDownload.path(), 'utf8')
    );
  assert.equal((await reviewBundle(evidence, source)).accepted, true);
  fs.writeFileSync(path.join(out, 'browser-evidence.json'), json(evidence));
  const reportPending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download dossier', exact: true })
    .click();
  assert.match(
    fs.readFileSync(await (await reportPending).path(), 'utf8'),
    /Proposed customer jobs completed: 0/
  );
  checks.push('six-stage execution, evidence and readable dossier downloads');
  await page
    .getByRole('button', { name: 'Test a rehashed wrong answer' })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  assert.match(
    await page.locator('#review-checks .fail').textContent(),
    /independent arithmetic/
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Download evidence', exact: true })
      .isDisabled(),
    true
  );
  checks.push('wrong answer rejected after its hash is repaired');
  const upload = (value) =>
    page.locator('#receipt-file').setInputFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof value === 'string' ? value : json(value)),
    });
  await upload(evidence);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  await upload('<script>window.bad=true</script>');
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'File could not be verified'
  );
  assert.equal(await page.evaluate(() => window.bad), undefined);
  assert.equal(await page.locator('#findings').textContent(), '');
  await upload(' '.repeat(1048577));
  assert.match(
    await page.locator('#review-status').textContent(),
    /at most 1 MiB/
  );
  const stage = stages[3],
    task = await makeTask(source, stage.id),
    bundle = await execute(source);
  await page
    .getByLabel('Evaluation phase', { exact: true })
    .selectOption(stage.id);
  await page.getByLabel('File type', { exact: true }).selectOption('candidate');
  await upload(bundle.results[3].artifact.content);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  assert.match(
    await page.locator('#review-status').textContent(),
    /provenance not assessed/
  );
  await page.getByLabel('File type', { exact: true }).selectOption('receipt');
  const receipt = {
    schemaVersion: 1,
    provider: 'openclaw-responses',
    workerProfile: 'meta-agentic-alpha',
    jobId: '73',
    deploymentId: 'qa-fixture',
    task,
    taskSha256: await taskDigest(task),
    status: 'evidence-ready',
    simulated: true,
    productionApproved: false,
    settlementApproved: false,
    artifacts: [bundle.results[3].artifact],
  };
  await upload(receipt);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks failed'
  );
  await page
    .getByText('Worker receipt: expected admission', { exact: true })
    .click();
  await page.getByLabel('Expected job ID', { exact: true }).fill('73');
  await page
    .getByLabel('Expected deployment identity', { exact: true })
    .fill('qa-fixture');
  await upload(receipt);
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  checks.push(
    'valid, malformed, oversized, raw candidate and independently bound receipt imports'
  );
  await page.getByLabel('Active agents', { exact: true }).fill('');
  assert.equal(await page.locator('#annual-volume').textContent(), '—');
  assert.match(
    await page.locator('#milestone-text').textContent(),
    /No estimate/
  );
  await page.getByLabel('Active agents', { exact: true }).fill('1000');
  assert.equal(
    await page.locator('#annual-volume').textContent(),
    '$292,000,000'
  );
  await page.getByLabel('Reviewer hours per day', { exact: true }).fill('0');
  assert.equal(await page.locator('#annual-volume').textContent(), '$0');
  await page.getByLabel('Reviewer hours per day', { exact: true }).fill('200');
  checks.push(
    'capacity bounds, zero review capacity and cleared invalid estimates'
  );
  await page
    .getByRole('button', { name: /Evaluate the six-phase portfolio/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('#review-title').textContent ===
      'Artifact checks passed'
  );
  const a11y = [];
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      name + ' page overflow'
    );
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    a11y.push({ name, violations: result.violations });
    assert.deepEqual(result.violations, [], name + ' accessibility');
    await page.screenshot({
      path: path.join(out, name + '.png'),
      fullPage: true,
    });
  }
  checks.push('desktop/mobile layouts and automated accessibility');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const archiveLinks = await page
    .locator('#archive a')
    .evaluateAll((nodes) => nodes.map((x) => x.href));
  assert.equal(archiveLinks.length, 13);
  const recorded = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/legacy/snapshots.json'
      ),
      'utf8'
    )
  );
  const diagrams = Object.entries(recorded).flatMap(([version, payload]) =>
    Object.entries(payload.mermaid || {}).map(([name, source]) => ({
      version,
      name,
      source,
    }))
  );
  const parseFailures = await page.evaluate(async (diagrams) => {
    const { mermaid } = await import('./archive/legacy/runtime.mjs'),
      failures = [];
    for (const d of diagrams)
      try {
        await mermaid.parse(d.source);
      } catch (error) {
        failures.push({
          version: d.version,
          name: d.name,
          error: error.message,
        });
      }
    return failures;
  }, diagrams);
  fs.writeFileSync(
    path.join(out, 'diagram-validation.json'),
    json({ total: diagrams.length, failures: parseFailures })
  );
  assert.deepEqual(parseFailures, []);
  const archive = [];
  for (const href of archiveLinks) {
    await page.goto(href, { waitUntil: 'networkidle' });
    const count = await page.locator('.mermaid').count();
    if (count) {
      try {
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.mermaid')].every((x) =>
              x.querySelector('svg')
            ),
          {},
          { timeout: 15000 }
        );
      } catch (error) {
        throw new Error(
          href +
            ' ' +
            JSON.stringify(
              await page.locator('.mermaid:not(:has(svg))').allTextContents()
            ) +
            ' ' +
            JSON.stringify(errors)
        );
      }
    }
    const text = await page.locator('body').innerText();
    if (
      /Mermaid render error|Syntax error in text|Failed to load dashboard|Dashboard data unavailable/i.test(
        text
      )
    )
      throw new Error(href + ' ' + JSON.stringify(errors));
    const legacyAccessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    a11y.push({
      name: new URL(href).pathname,
      violations: legacyAccessibility.violations,
    });
    fs.writeFileSync(path.join(out, 'accessibility.json'), json(a11y));
    assert.deepEqual(
      legacyAccessibility.violations.map((x) => ({
        id: x.id,
        nodes: x.nodes.map((n) => n.target),
      })),
      [],
      href + ' accessibility'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      href + ' mobile overflow'
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    const links = await page
      .locator('a[href]')
      .evaluateAll((nodes) => nodes.map((x) => x.href));
    for (const link of new Set(links))
      if (link.startsWith(origin + '/archive/'))
        assert.equal((await context.request.get(link)).status(), 200, link);
    archive.push({ route: new URL(href).pathname, diagrams: count });
  }
  fs.writeFileSync(path.join(out, 'archive.json'), json(archive));
  checks.push(
    'all thirteen preserved dashboards load their data and render every diagram locally'
  );
  const hostilePage = await context.newPage();
  await hostilePage.route('**/dashboard-data-v11.json', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.identify.streams[0].id =
      '<img src="https://invalid.example/attack" onerror="window.__metaAlphaHostileRecordExecuted=true"><script>window.__metaAlphaHostileRecordExecuted=true</script>INERT_RECORD';
    await route.fulfill({ response, json: payload });
  });
  await hostilePage.goto(origin + '/archive/meta_agentic_alpha_v11/ui/', {
    waitUntil: 'networkidle',
  });
  await hostilePage.getByText('INERT_RECORD', { exact: true }).waitFor();
  assert.equal(
    await hostilePage.evaluate(() => window.__metaAlphaHostileRecordExecuted),
    undefined
  );
  assert.equal(
    await hostilePage
      .locator('img[src*="invalid.example"],script:not([src])')
      .count(),
    0
  );
  await hostilePage.close();
  checks.push(
    'legacy record HTML cannot execute scripts or inject remote images'
  );
  const failedPage = await context.newPage();
  await failedPage.route('**/scenario.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' })
  );
  await failedPage.goto(origin);
  await failedPage.waitForSelector('body[data-ready=failed]');
  assert.equal(await failedPage.locator('#run').isDisabled(), true);
  assert.match(
    await failedPage.locator('#load-status').textContent(),
    /could not be loaded/
  );
  checks.push('source failure disables execution');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(path.join(out, 'accessibility.json'), json(a11y));
  fs.writeFileSync(
    path.join(out, 'browser-qa.json'),
    json({ checks, errors, externalRequests: external, providerCalls: 0 })
  );
  console.log(
    json({
      checks,
      browserErrors: errors.length,
      externalRequests: external.length,
      accessibilityViolations: 0,
      output: out,
    })
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
