import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'esbuild';

async function main() {
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-browser-'));
const out = path.join(root, 'reports/security/remediation-browser'); fs.mkdirSync(out, { recursive: true });
const hostile = '<img src=x onerror="globalThis.pwned=1"><button id="sim-approve">Fake approval</button><svg onload="globalThis.pwned=1"></svg>';
const checks = [], errors = [], requests = [];
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SlaViewer} from './apps/enterprise-portal/src/components/SlaViewer';import {DeliverableVerificationPanel} from './apps/enterprise-portal/src/components/DeliverableVerificationPanel';import {ApiProvider} from './apps/console/src/context/ApiContext';import {GasPanel} from './apps/console/src/components/GasPanel';createRoot(document.getElementById('root')).render(<><SlaViewer/><DeliverableVerificationPanel events={[{name:'ResultSubmitted',jobId:42n,meta:{args:{resultURI:'javascript:globalThis.pwned=1'}},timestamp:1}]}/><ApiProvider><GasPanel/></ApiProvider></>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, format: 'esm', platform: 'browser', outfile: path.join(temporary, 'harness.js'), jsx: 'automatic',
  alias: { react: path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) },
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
});
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/portal/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>Actual React components</title></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>'); return; }
  const file = pathname === '/harness.js' ? path.join(temporary, 'harness.js') : path.join(root, pathname.startsWith('/v2/') ? 'apps/onebox-static' : 'apps/onebox/dist', pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  let mode = 'plan';
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url === 'https://metadata.example/sla.json') { requests.push(url); await route.fulfill({ json: { uri: 'JaVaScRiPt:globalThis.pwned=1', obligations: [hostile] } }); return; }
    if (url === 'https://metadata.example/bad.json') { requests.push(url); await route.fulfill({ json: { obligations: [{ html: hostile }] } }); return; }
    if (!url.startsWith(origin)) { requests.push(url); await route.abort(); return; }
    if (url.includes('/onebox/')) {
      requests.push(url);
      if (url.includes('/plan') && mode === 'error') await route.fulfill({ status: 500, json: { error: hostile } });
      else if (url.includes('/plan')) await route.fulfill({ json: { preview_summary: hostile, plan: { budget: { max: hostile, token: hostile } } } });
      else if (url.includes('/simulate')) await route.fulfill({ json: { estimatedBudget: hostile, feeAmount: hostile, risks: [hostile] } });
      else if (url.includes('/execute')) await route.fulfill({ json: { run_id: 'fixture' } });
      else await route.fulfill({ json: { run: { state: 'succeeded', plan_id: hostile }, steps: [{ state: hostile, kind: hostile, name: hostile }], receipts: { job_id: hostile, txes: [hostile], cids: [hostile] } } });
      return;
    }
    await route.continue();
  });
  await page.addInitScript(({ origin, hostile }) => {
    localStorage.setItem('ONEBOX_ORCH_URL', origin); localStorage.setItem('ORCH_URL', origin);
    localStorage.setItem('ONEBOX_RECEIPTS_V1', JSON.stringify([{ planHash: hostile, jobId: hostile, reward: hostile, token: hostile, status: hostile, cid: hostile, url: 'javascript:globalThis.pwned=1', timestamp: 0 }]));
  }, { origin, hostile });
  await page.goto(origin); await page.locator('#onebox-form').waitFor();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.ok(csp.includes("script-src 'self'"));
  await page.locator('#onebox-input').fill(hostile); await page.locator('#send').click();
  await page.locator('#plan-approve').waitFor();
  assert.equal(await page.locator('#chat img,#chat svg,#receipts-list img,#receipts-list svg').count(), 0);
  assert.equal(await page.locator('#sim-approve').count(), 0);
  assert.ok((await page.locator('#chat').innerText()).includes(hostile));
  await page.locator('#plan-approve').click(); await page.locator('#sim-approve').waitFor();
  assert.equal(await page.locator('#sim-approve').count(), 1);
  await page.locator('#sim-approve').click(); await page.getByText('Receipt ready.', { exact: true }).waitFor();
  assert.equal(await page.locator('#chat img,#chat svg,#chat a,#receipts-list a').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
  mode = 'error'; await page.locator('#onebox-input').fill('hostile server error'); await page.locator('#send').click();
  await page.locator('#chat .error-text').last().waitFor();
  assert.equal(await page.locator('#chat img,#chat svg').count(), 0);
  checks.push('Built Onebox with actual CSP: chat, plan, simulation, approved execution, progress, persisted receipts and hostile server errors remain inert; only application approval controls exist');
  await page.goto(origin + '/v2/index.html'); await page.locator('#box').fill('test'); await page.locator('#send').click();
  await page.waitForFunction(() => !document.querySelector('#send').disabled);
  assert.equal(await page.locator('#chat img,#chat svg').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
  checks.push('Legacy v2 error rendering is text/Node based and does not inject exception markup');
  await page.goto(origin + '/portal/'); await page.locator('#verify-cid').waitFor();
  const invalid = ['javascript:globalThis.pwned=1', 'JaVaScRiPt:globalThis.pwned=1', 'java\nscript:globalThis.pwned=1', 'data:text/html,bad', 'javascript%3Aalert(1)', 'file:///etc/passwd', '//bad.test', 'https://user:pass@bad.test'];
  const slaInput = page.getByPlaceholder('https://gateway.ipfs.io/ipfs/.../sla.json');
  for (const value of invalid) {
    const count = requests.length;
    await page.locator('#verify-cid').fill(value); assert.equal(await page.locator('a[href^="javascript:"],a[href^="data:"],a[href^="file:"]').count(), 0);
    await slaInput.fill(value); await page.getByRole('button', { name: 'Fetch SLA', exact: true }).click();
    await page.getByText('Provide a valid SLA URI to fetch metadata.', { exact: true }).waitFor();
    assert.equal(requests.length, count);
  }
  await slaInput.fill('https://metadata.example/sla.json'); await page.getByRole('button', { name: 'Fetch SLA', exact: true }).click();
  await page.getByRole('heading', { name: 'Obligations', exact: true }).waitFor();
  assert.equal(await page.locator('a[href^="javascript:"],img,svg').count(), 0);
  assert.ok((await page.locator('body').innerText()).includes(hostile));
  await slaInput.fill('https://metadata.example/bad.json'); await page.getByRole('button', { name: 'Fetch SLA', exact: true }).click();
  await page.getByText('SLA obligations must contain text values.', { exact: true }).waitFor();
  await slaInput.fill('https://metadata.example/sla.json'); await page.getByRole('button', { name: 'Fetch SLA', exact: true }).click();
  await page.getByRole('heading', { name: 'Obligations', exact: true }).waitFor();
  await page.locator('#verify-cid').fill('ipfs://bafyfixture/report.json');
  assert.equal(await page.getByRole('link', { name: 'Open deliverable' }).getAttribute('href'), 'https://ipfs.io/ipfs/bafyfixture/report.json');
  await page.locator('#paymaster-address').fill('0x1111111111111111111111111111111111111111'); await page.locator('#topup-amount').fill('1.5');
  assert.equal(await page.getByRole('link', { name: 'Send 1.5 AGIA' }).getAttribute('href'), 'ethereum:0x1111111111111111111111111111111111111111?value=0x14d1120d7b160000');
  for (const value of invalid) { await page.locator('#paymaster-address').fill(value); assert.equal(await page.locator('a[href^="ethereum:"]').count(), 0); }
  assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
  checks.push('Actual React portal components: hostile typed and fetched metadata URLs rejected; HTTPS/IPFS retained; validated ethereum wallet links retained without wallet invocation');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, checks, csp, errors, requests, realWalletOperations: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks, errors, realWalletOperations: 0 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temporary, { recursive: true, force: true }); }

}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
