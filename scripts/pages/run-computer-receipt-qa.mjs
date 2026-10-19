import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { verifyComputerReceipt } from './computer-receipt-qa.mjs';
const output = path.resolve('build/pages'),
  artifacts = path.resolve('reports/pages/computer-receipt');
fs.mkdirSync(artifacts, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'catalog.json')));
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith(manifest.basePath)) {
    response.writeHead(404);
    response.end();
    return;
  }
  let file = path.resolve(
    output,
    decodeURIComponent(url.pathname.slice(manifest.basePath.length)) ||
      'index.html'
  );
  if (!file.startsWith(output + path.sep) && file !== output) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
      ? 'text/css'
      : file.endsWith('.json')
      ? 'application/json'
      : 'text/html'
  );
  response.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(),
    checks = [],
    errors = [],
    external = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on('request', (request) => {
    if (
      !request.url().startsWith(origin) &&
      !request.url().startsWith('blob:' + origin)
    )
      external.push(request.url());
  });
  await page.addInitScript(() => {
    globalThis.__walletCalls = 0;
    Object.defineProperty(window, 'ethereum', {
      value: Object.freeze({
        request: async () => {
          globalThis.__walletCalls++;
          throw Error('NO_WALLET_PERMISSION');
        },
      }),
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await verifyComputerReceipt({
    page,
    url: `${origin}${manifest.basePath}`,
    artifacts,
    checks,
  });
  if (errors.length) throw Error(errors.join('\n'));
  if (
    external.length ||
    (await page.evaluate(() => globalThis.__walletCalls)) !== 0
  )
    throw Error('Unexpected network or wallet call');
  console.log(
    JSON.stringify({
      passed: true,
      scope: 'GUI_WITH_PROTOCOL_DOUBLE_INPUTS_NO_NATIVE_EXECUTION_CLAIM',
      checks,
    })
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
