import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function verifySuccessor({ page, url, artifacts, a11y, checks }) {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(url + 'successor/', { waitUntil: 'networkidle' });
  await page.locator('[data-successor][data-ready="true"]').waitFor();
  assert.equal(await page.locator('#omega-export').isDisabled(), true);
  await page.locator('#omega-run').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-successor]').dataset.stage === 'EVALUATED'
  );
  assert.match(
    await page.locator('#omega-policy-content').innerText(),
    /HOLD_AND_ESCALATE/
  );
  assert.equal(await page.locator('#omega-jobs-content li').count(), 10);
  assert.match(
    await page.locator('#omega-world-content').innerText(),
    /C\$6,300/
  );
  await page.locator('#omega-freeze').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('[data-successor]').dataset.stage === 'FROZEN'
  );
  await page.locator('#omega-review').focus();
  await page.keyboard.press('Enter');
  assert.match(
    await page.locator('#omega-status').innerText(),
    /INDEPENDENT_PROOF_REQUIRED/
  );
  assert.match(
    await page.locator('#omega-state-authority').innerText(),
    /None/
  );
  const wait = page.waitForEvent('download');
  await page.locator('#omega-export').focus();
  await page.keyboard.press('Enter');
  const downloaded = await wait;
  const packPath = await downloaded.path(),
    pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  assert.equal(pack.restorePolicy, 'KNOWLEDGE_ONLY_NO_AUTHORITY');
  assert.equal(
    pack.artifacts.find((a) => a.kind === 'knowledge').content.dossier
      .recommendation,
    'HOLD_AND_ESCALATE'
  );
  assert.ok(pack.artifacts.some((a) => a.kind === 'negative-knowledge'));
  await a11y('successor-invoice');
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(artifacts, 'successor-desktop.png'),
  });
  await page.screenshot({
    path: path.join(artifacts, 'successor-invoice-desktop.png'),
    fullPage: true,
  });
  await page.locator('#omega-impair').click();
  assert.match(
    await page.locator('#omega-status').innerText(),
    /SIMULATED_RIGHTS_LOSS/
  );
  assert.equal(await page.locator('#omega-export').isDisabled(), true);
  await page.locator('#omega-restore').setInputFiles({
    name: 'mission-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.waitForFunction(() =>
    document
      .getElementById('omega-status')
      .textContent.includes('PACK_RESTORED')
  );
  assert.equal(await page.locator('#omega-export').isDisabled(), true);
  await page.locator('#omega-descendant').click();
  await page.waitForFunction(() =>
    document
      .getElementById('omega-status')
      .textContent.includes('SUCCESSOR_CREATED')
  );
  const restoreView = JSON.parse(
    await page.locator('#omega-pack-json').textContent()
  );
  assert.deepEqual(restoreView.restored.activeAuthority, []);
  assert.equal(restoreView.restored.proofCurrency, 'absent');
  assert.deepEqual(restoreView.descendant.authority, []);
  assert.equal(restoreView.descendant.status, 'PROPOSED');
  const tampered = structuredClone(pack);
  tampered.artifacts[0].content.dossier.recommendation = 'RELEASE_PAYMENT';
  await page.locator('#omega-restore').setInputFiles({
    name: 'tampered.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tampered)),
  });
  await page.waitForFunction(
    () => document.getElementById('omega-status').dataset.error === 'true'
  );
  assert.match(await page.locator('#omega-status').innerText(), /PACK_DIGEST/);
  assert.equal(await page.locator('#omega-descendant').isDisabled(), true);
  checks.push(
    'SUCCESSOR invoice: actual ten-job core, keyboard freeze, denied simulated admission, portable knowledge and fail-closed restore'
  );

  await page.locator('#omega-select').selectOption('world');
  await page.locator('#omega-run').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-successor]').dataset.stage === 'EVALUATED'
  );
  let report = JSON.parse(
    await page.locator('#omega-report-json').textContent()
  ).workbench;
  assert.ok(
    report.candidates.some((c) => !c.eligible && c.metrics.criticalMisses > 0)
  );
  assert.equal(report.alpha.status, 'ABSENT');
  assert.equal(
    await page.locator('#omega-comparison-content tbody tr').count(),
    report.candidates.length
  );
  await a11y('successor-world');
  await page.locator('#omega-select').selectOption('resources');
  await page.locator('#omega-run').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-successor]').dataset.stage === 'EVALUATED'
  );
  report = JSON.parse(
    await page.locator('#omega-report-json').textContent()
  ).workbench;
  assert.equal(report.resourcePlan.energyConserved, true);
  assert.ok(report.stress.expectedUtility < report.nominal.expectedUtility);
  assert.equal(
    report.correlation.onePositive,
    report.correlation.twoCorrelatedPositives
  );
  await page.locator('#omega-probability').fill('0.3');
  assert.equal(await page.locator('#omega-export').isDisabled(), true);
  assert.equal(await page.locator('#omega-report-json').textContent(), '{}');
  await page.locator('#omega-run').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-successor]').dataset.stage === 'EVALUATED'
  );
  const changed = JSON.parse(
    await page.locator('#omega-report-json').textContent()
  ).workbench;
  assert.notEqual(
    changed.nominal.expectedUtility,
    report.nominal.expectedUtility
  );
  await a11y('successor-resources');
  checks.push(
    'SUCCESSOR workbenches: measured unsafe-patch rejection, comparator tie, physical accounting, correlation and stale-input invalidation'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + 'successor/fr/', { waitUntil: 'networkidle' });
  await page.locator('[data-successor][data-ready="true"]').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  await page.locator('#omega-run').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-successor]').dataset.stage === 'EVALUATED'
  );
  assert.match(
    await page.locator('#omega-world-content').innerText(),
    /6 300 \$ CA/
  );
  await page.locator('#omega-freeze').click();
  await page.waitForFunction(
    () => document.querySelector('[data-successor]').dataset.stage === 'FROZEN'
  );
  await page.locator('#omega-review').click();
  assert.match(
    await page.locator('#omega-status').innerText(),
    /Aucune autorité/
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true
  );
  await a11y('successor-mobile-fr');
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(artifacts, 'successor-mobile-fr-top.png'),
  });
  await page.screenshot({
    path: path.join(artifacts, 'successor-mobile-fr.png'),
    fullPage: true,
  });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.locator('#omega-stop').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#omega-export').isDisabled(), true);
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  checks.push(
    'SUCCESSOR EN/FR: project-prefix routes, mobile layout, reduced motion, high contrast and keyboard operation'
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
}

async function standalone() {
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    ),
    output = path.join(root, 'build/pages'),
    artifacts = path.join(root, 'reports/pages');
  fs.mkdirSync(artifacts, { recursive: true });
  const base = JSON.parse(
      fs.readFileSync(path.join(output, 'catalog.json'), 'utf8')
    ).basePath,
    errors = [],
    external = [],
    checks = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404);
      res.end();
      return;
    }
    let file = path.resolve(
      output,
      decodeURIComponent(url.pathname.slice(base.length)) || 'index.html'
    );
    if (!file.startsWith(output + path.sep) && file !== output) {
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
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      }[path.extname(file)] || 'application/octet-stream'
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1050 },
        reducedMotion: 'reduce',
        acceptDownloads: true,
      }),
      page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(request.url()));
    page.on('request', (request) => {
      if (
        !request.url().startsWith(origin) &&
        !request.url().startsWith('data:') &&
        !request.url().startsWith('blob:')
      )
        external.push(request.url());
    });
    const a11y = async (label) => {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      fs.writeFileSync(
        path.join(artifacts, `accessibility-${label}.json`),
        JSON.stringify(result.violations, null, 2)
      );
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
        label
      );
    };
    await verifySuccessor({
      page,
      url: origin + base,
      artifacts,
      a11y,
      checks,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(
      path.join(artifacts, 'successor-browser-qa.json'),
      JSON.stringify(
        { mode: 'SYNTHETIC_REHEARSAL', checks, errors, external, passed: true },
        null,
        2
      ) + '\n'
    );
    console.log(
      JSON.stringify({ passed: true, checks, errors, external }, null, 2)
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await standalone();
