import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { root } from './build.mjs';
import { verifyStart } from './start-qa.mjs';

const output = path.join(root, 'build/pages');
const artifacts = path.join(root, 'reports/pages');
fs.mkdirSync(artifacts, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'catalog.json')));
const server = http.createServer((request, response) => {
  const requested = new URL(request.url, 'http://localhost').pathname;
  if (!requested.startsWith(manifest.basePath)) {
    response.writeHead(404).end();
    return;
  }
  let file = path.resolve(
    output,
    decodeURIComponent(requested.slice(manifest.basePath.length)) ||
      'index.html'
  );
  if (!file.startsWith(output + path.sep) && file !== output) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader(
    'Content-Type',
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
    }[path.extname(file)] || 'application/octet-stream'
  );
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [],
    externalRequests = [],
    checks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(request.url() + ': ' + request.failure()?.errorText)
  );
  page.on('request', (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:'))
      externalRequests.push(request.url());
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
      result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
      []
    );
  };
  await verifyStart({
    page,
    context,
    url: origin + manifest.basePath,
    artifacts,
    a11y,
    checks,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  const report = { checks, errors, externalRequests };
  fs.writeFileSync(
    path.join(artifacts, 'onboarding-browser-report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
