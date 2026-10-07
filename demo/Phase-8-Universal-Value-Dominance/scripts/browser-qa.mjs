import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const root = path.resolve(
  process.env.PHASE8_SITE_ROOT || path.join(repo, 'build/phase8')
);
const artifacts = path.join(repo, 'reports/pages/phase8');
fs.mkdirSync(artifacts, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  try {
    let file = path.resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    );
    if (file !== root && !file.startsWith(root + path.sep))
      return res.writeHead(403).end();
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [],
  external = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
page.on('request', (request) => {
  if (
    request.url().startsWith('http') &&
    !request.url().startsWith(origin + '/')
  )
    external.push(request.url());
});
try {
  await page.goto(origin + '/workbench/');
  await page.waitForFunction(
    () => document.getElementById('accepted').textContent === '43'
  );
  assert.equal(await page.locator('.task').count(), 10);
  await page.screenshot({
    path: path.join(artifacts, 'desktop.png'),
    fullPage: true,
  });
  for (const task of await page.locator('.task').all()) {
    await task.click();
    assert.equal(await task.getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('#criteria li').count()) >= 3);
  }
  await page
    .getByRole('button', { name: 'Review bottleneck', exact: true })
    .click();
  assert.equal(await page.locator('#accepted').innerText(), '6');
  await page
    .getByRole('button', { name: 'Worker interruption', exact: true })
    .click();
  assert.equal(await page.locator('#accepted').innerText(), '12');
  await page
    .getByRole('button', { name: 'Balanced launch', exact: true })
    .click();
  await page.getByLabel('Total budget (USDC)', { exact: true }).fill('');
  assert.equal(await page.locator('#export-plan').isDisabled(), true);
  assert.equal(await page.locator('#accepted').innerText(), '—');
  await page.getByLabel('Total budget (USDC)', { exact: true }).fill('30000');
  for (const [button, file] of [
    ['#export-plan', 'capacity.json'],
    ['#export-order', 'order.json'],
    ['#export-report', 'report.md'],
  ]) {
    const event = page.waitForEvent('download');
    await page.locator(button).click();
    const download = await event;
    await download.saveAs(path.join(artifacts, file));
  }
  const plan = JSON.parse(
    fs.readFileSync(path.join(artifacts, 'capacity.json'))
  );
  assert.equal(plan.accepted, 43);
  assert.equal(plan.productionApproved, false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(artifacts, 'order.json'))).settlement
      .approved,
    false
  );
  let violations = (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
  ).violations;
  assert.deepEqual(
    violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    []
  );
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: path.join(artifacts, `viewport-${width}.png`),
      fullPage: true,
    });
  }
  await page.goto(origin + '/');
  await page.waitForSelector('[data-test-id="stat-card"]');
  assert.match(
    await page.locator('[data-domain-slug="planetary-finance"]').innerText(),
    /296.67B/
  );
  await page.waitForFunction(() =>
    ['true', 'fallback'].includes(
      document.getElementById('mermaid-diagram')?.dataset.rendered
    )
  );
  assert.equal(
    await page.locator('#mermaid-diagram').getAttribute('data-rendered'),
    'true'
  );
  await page.locator('#manifest-reset').click();
  await page.waitForFunction(
    () =>
      document.getElementById('mermaid-diagram')?.dataset.rendered === 'true'
  );
  assert.equal(await page.locator('#mermaid-diagram svg').count(), 1);
  await page.goto(origin + '/ui/');
  await page.waitForSelector('svg');
  await page.setInputFiles('#extensionConfig', {
    name: 'untrusted.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        extensions: [
          {
            name: '<img src=x onerror=alert(1)>',
            module: '<script>bad</script>',
            ciChecks: ['<img src=y>'],
            dependencies: [],
          },
        ],
      })
    ),
  });
  await page.waitForFunction(() =>
    document.querySelector('#extensionTable tbody').textContent.includes('<img')
  );
  assert.equal(
    await page.locator('#extensionTable img, #extensionTable script').count(),
    0
  );
  await page.setInputFiles('#jobConfig', {
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await page.waitForFunction(() =>
    document.getElementById('jobPreview').textContent.includes('Could not load')
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    desktopMobileTablet: 'passed',
    tenWorkCategories: 'passed',
    downloads: 'passed',
    invalidInput: 'passed',
    reviewAndOutageScenarios: 'passed',
    accessibilityViolations: 0,
    preservedDiagrams: 'rendered',
    externalRequests: 0,
    browserErrors: [],
  };
  fs.writeFileSync(
    path.join(artifacts, 'qa.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
