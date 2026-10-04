import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { root } from './build.mjs';
const output = path.join(root, 'build/pages/experiments/culture');
const reports = path.join(root, 'reports/pages');
fs.mkdirSync(reports, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(
    output,
    '.' + (pathname === '/' ? '/index.html' : pathname)
  );
  if (
    !file.startsWith(output + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    'Content-Type',
    { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[
      path.extname(file)
    ] || 'application/octet-stream'
  );
  fs.createReadStream(file).pipe(res);
});
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
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => {
    if (
      !req.url().startsWith(origin) &&
      !req.url().startsWith('blob:') &&
      !req.url().startsWith('data:')
    )
      external.push(req.url());
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Knowledge grows/ }).waitFor();
  const panel = (id) => page.locator(`#panel-${id}`);
  await panel(0)
    .getByLabel('Artifact title')
    .fill('A practical guide to public evidence');
  await panel(0)
    .getByLabel('Lesson instructions')
    .fill('Teach a community to cite evidence before making a claim.');
  await panel(0).getByRole('button', { name: 'Send to assistant' }).click();
  await panel(0).getByRole('button', { name: 'Preview IPFS upload' }).click();
  await panel(0)
    .getByText(/preview-sha256-/)
    .waitFor();
  await panel(0).getByRole('button', { name: 'Preview artifact mint' }).click();
  await panel(0).getByRole('button', { name: 'Preview follow-on job' }).click();
  assert.match(await panel(0).locator('.status-panel').innerText(), /#4/);
  await page
    .getByRole('button', { name: /Self-Play Arena/, exact: false })
    .click();
  await panel(1).getByLabel('1. Pick the anchor artifact').selectOption('4');
  await panel(1)
    .getByRole('button', { name: 'Launch arena', exact: true })
    .click();
  await panel(1)
    .getByRole('heading', { name: 'Submission evidence · round 1' })
    .waitFor();
  assert.equal(
    await panel(1).locator('.submission-evidence tbody tr').count(),
    6
  );
  await panel(1)
    .getByRole('button', { name: 'Pause arenas', exact: true })
    .click();
  assert.equal(
    await panel(1)
      .getByRole('button', { name: 'Launch arena', exact: true })
      .isDisabled(),
    true
  );
  await panel(1)
    .getByRole('button', { name: 'Resume arenas', exact: true })
    .click();
  await panel(1).getByLabel('Target success rate', { exact: true }).fill('0.8');
  await panel(1)
    .getByLabel('Target success rate', { exact: true })
    .press('Tab');
  await page.waitForFunction(
    () => document.querySelector('#panel-1 input[max="0.95"]').value === '0.8'
  );
  await panel(1)
    .getByRole('button', { name: 'Hold difficulty steady' })
    .click();
  await panel(1).getByLabel('Parallel jobs per batch').selectOption('1');
  await panel(1)
    .getByRole('button', { name: 'Launch arena', exact: true })
    .click();
  await panel(1)
    .getByRole('heading', { name: 'Submission evidence · round 2' })
    .waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download evidence', exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  const evidence = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(evidence.mode, 'simulation');
  assert.equal(evidence.artifacts.length, 4);
  assert.equal(evidence.jobs.length, 1);
  assert.equal(evidence.rounds.length, 2);
  assert.equal(evidence.rounds[1].difficultyDelta, 0);
  assert.equal(evidence.rounds[1].target, 0.8);
  assert.equal(evidence.rounds[1].batches, 6);
  assert.equal(
    evidence.rounds[0].observedSuccessRate,
    evidence.rounds[0].winners.length / 6
  );
  checks.push(
    'Complete create/store/register/job/arena/evidence journey, shared state and effective controls'
  );
  await page.getByRole('button', { name: /Culture Graph/ }).click();
  await panel(2).locator('.artifact-choice').last().click();
  await panel(2).getByRole('button', { name: 'Create derivative job' }).click();
  await panel(2)
    .getByText('Job ready: Evaluate transfer from artifact #4')
    .waitFor();
  for (const [index, name] of [
    'Create Artifact',
    'Self-Play Arena',
    'Culture Graph',
    'Evidence & Guide',
  ].entries()) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
      [],
      `${name}: accessibility`
    );
    assert.equal(await panel(index).isVisible(), true);
  }
  await page.getByRole('button', { name: /Create Artifact/ }).click();
  assert.equal(
    await panel(0)
      .getByRole('button', { name: 'Job preview complete' })
      .isDisabled(),
    true
  );
  checks.push(
    'All sections pass accessibility checks; creation progress survives navigation'
  );
  await page.screenshot({
    path: path.join(reports, 'culture-desktop.png'),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      'Create Artifact',
      'Self-Play Arena',
      'Culture Graph',
      'Evidence & Guide',
    ]) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll('canvas')).every(
              (c) =>
                !c.offsetParent ||
                c.getBoundingClientRect().right <= window.innerWidth
            ),
          { timeout: 5000 }
        )
        .catch(async () => {
          console.log(
            await page.evaluate(() =>
              [...document.querySelectorAll('body *')]
                .filter(
                  (el) => el.getBoundingClientRect().right > innerWidth + 1
                )
                .map((el) => ({
                  tag: el.tagName,
                  cls: el.className,
                  width: el.getBoundingClientRect().width,
                }))
                .slice(0, 20)
            )
          );
        });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true,
        `${name} overflow at ${width}`
      );
    }
  }
  await page.getByRole('button', { name: /Culture Graph/ }).click();
  await page.screenshot({
    path: path.join(reports, 'culture-mobile.png'),
    fullPage: true,
  });
  checks.push('All sections fit 390px and 320px viewports');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await panel(0)
    .getByRole('button', { name: 'Preview artifact mint' })
    .waitFor();
  assert.equal(await panel(0).locator('.artifact-choice').count(), 3);
  assert.equal(
    await panel(0)
      .getByRole('button', { name: 'Preview artifact mint' })
      .isDisabled(),
    true
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  checks.push(
    'Reset clears session; no external requests or browser exceptions'
  );
  fs.writeFileSync(
    path.join(reports, 'culture-browser-report.json'),
    JSON.stringify({ status: 'passed', checks }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
