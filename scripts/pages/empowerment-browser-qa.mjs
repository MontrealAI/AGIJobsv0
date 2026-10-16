import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { buildEmpowermentSite } from './empowerment-build.mjs';
import { bundleEmpowerment } from './empowerment-bundle.mjs';
import {
  artifacts,
  pack,
  bytes,
  digest,
  canonical,
  MAX_BYTES,
  BUNDLE_MAX_BYTES,
} from '../../demo/superintelligent-empowerment/web/model.mjs';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
// Keyboard.press sends key events; it does not await same-document navigation.
// Keep one real Enter activation and wait for its exact URL outcome, bounded.
export async function verifyEmpowermentSkipLink(page) {
  assert.notEqual(
    new URL(page.url()).hash,
    '#main',
    'Start before skip navigation'
  );
  const skip = page.locator('a.skip');
  assert.equal(await skip.getAttribute('href'), '#main');
  await skip.focus();
  assert.equal(
    await skip.evaluate((element) => element === document.activeElement),
    true
  );
  const destination = new URL(page.url());
  destination.hash = 'main';
  await Promise.all([
    page.waitForURL(destination.href, { timeout: 5000 }),
    page.keyboard.press('Enter'),
  ]);
  assert.equal(new URL(page.url()).hash, '#main');
  assert.equal(await page.locator('main#main').count(), 1);
}

export async function verifyEmpowerment({
  page,
  origin,
  route = '/experiments/empowerment/',
  artifactsDirectory = path.join(root, 'reports/pages/empowerment'),
}) {
  fs.mkdirSync(artifactsDirectory, { recursive: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cspViolations = [];
  await page.exposeFunction('recordEmpowermentCspViolation', (directive) =>
    cspViolations.push(directive)
  );
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      window.recordEmpowermentCspViolation(event.effectiveDirective);
    });
  });
  await page.goto(origin + route);
  assert.match(
    await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content'),
    /script-src 'self'/
  );
  await verifyEmpowermentSkipLink(page);
  assert.match(
    await page.locator('h1').innerText(),
    /initiative\s+an evidence/
  );
  await page.locator('#cli').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  assert.equal(await page.locator('#ledger li').count(), 3);
  assert.match(
    await page.locator('#ledger').innerText(),
    /Blocked by: follow-up/
  );
  assert.match(await page.locator('#summary').innerText(), /1 \/ 3/);
  const axe = async (label) => {
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    fs.writeFileSync(
      path.join(artifactsDirectory, label + '-axe.json'),
      JSON.stringify(r.violations, null, 2)
    );
    assert.deepEqual(
      r.violations.map((x) => x.id),
      []
    );
  };
  const cliBundlePath = path.join(artifactsDirectory, 'actual-cli-bundle.json');
  // A fresh destination is required by the converter; retain previous evidence separately.
  const freshBundlePath = cliBundlePath + '.' + Date.now();
  await bundleEmpowerment(
    path.join(root, 'demo/superintelligent-empowerment/web/cli-example'),
    freshBundlePath
  );
  await page.locator('#import-bundle').setInputFiles(freshBundlePath);
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  await axe('desktop-en');
  await page.screenshot({
    path: path.join(artifactsDirectory, 'desktop-en.png'),
    fullPage: true,
  });
  const download = page.waitForEvent('download');
  await page.locator('#export-bundle').click();
  const dl = await download;
  const bundle = fs.readFileSync(await dl.path());
  assert.ok(bundle.length > 0);
  await page.locator('#packet').fill('{bad');
  assert.equal(await page.locator('#export-bundle').isDisabled(), true);
  await page.locator('#evaluate').click();
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Check failed')
  );
  assert.equal(await page.locator('#ledger li').count(), 0);
  await page.locator('#restore').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  await page.reload();
  await page.locator('#restore').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  await page.locator('#import-bundle').setInputFiles({
    name: 'bundle.json',
    mimeType: 'application/json',
    buffer: bundle,
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  const raw = fs.readFileSync(
    path.join(
      root,
      'demo/superintelligent-empowerment/web/cli-example/packet.json'
    )
  );
  const r = await artifacts(raw);
  const ledger = JSON.parse(Buffer.from(r.files['ledger.json']));
  ledger.readyCount = 3;
  r.files['ledger.json'] = canonical(ledger);
  const receipt = JSON.parse(Buffer.from(r.files['receipt.json']));
  receipt.artifacts['ledger.json'] = await digest(r.files['ledger.json']);
  r.files['receipt.json'] = canonical(receipt);
  await page.locator('#import-bundle').setInputFiles({
    name: 'resealed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(pack(r.files)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('differs from recomputed')
  );
  assert.equal(await page.locator('#export-bundle').isDisabled(), true);
  const replacement = JSON.parse(raw);
  replacement.title = 'Replaced supplied evidence';
  const replaced = await artifacts(bytes(JSON.stringify(replacement)));
  await page.locator('#import-bundle').setInputFiles({
    name: 'replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(pack(replaced.files)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#summary')
      .textContent.includes('Replaced supplied evidence')
  );
  assert.match(
    await page.locator('#status').innerText(),
    /origin remains unverified/
  );
  // Preserve CRLF exact bytes even though the textarea normalizes line endings.
  const crlf = Buffer.from(raw.toString().replace(/\n/g, '\r\n'));
  await page.locator('#import-packet').setInputFiles({
    name: 'packet.json',
    mimeType: 'application/json',
    buffer: crlf,
  });
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Packet evaluated')
  );
  const packetDownload = page.waitForEvent('download');
  await page.locator('#export-packet').click();
  assert.deepEqual(fs.readFileSync(await (await packetDownload).path()), crlf);
  await page.locator('#import-packet').setInputFiles({
    name: 'bom.json',
    mimeType: 'application/json',
    buffer: Buffer.concat([Buffer.from([239, 187, 191]), raw]),
  });
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Check failed')
  );
  await page.locator('#import-packet').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from([255]),
  });
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Check failed')
  );
  for (const [selector, limit] of [
    ['#import-packet', MAX_BYTES],
    ['#import-bundle', BUNDLE_MAX_BYTES],
  ]) {
    await page.locator(selector).setInputFiles({
      name: 'oversized.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(limit + 1, 32),
    });
    await page.waitForFunction(() =>
      document
        .querySelector('#status')
        .textContent.includes('File exceeds byte limit')
    );
    assert.equal(await page.locator('#export-bundle').isDisabled(), true);
    assert.equal(await page.locator('#ledger li').count(), 0);
  }
  // A slower file import must never replace a newer editor action.
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.json')
        await new Promise((r) => setTimeout(r, 300));
      return original.call(this);
    };
  });
  await page.locator('#import-packet').setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer: raw,
  });
  await page.locator('#packet').fill('{"newer":"edit"}');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#packet').inputValue(), '{"newer":"edit"}');
  assert.equal(await page.locator('#export-bundle').isDisabled(), true);
  await page.locator('#cli').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  await page.locator('#language').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  assert.match(
    await page.locator('#status').innerText(),
    /Vérification des artefacts réussie/
  );
  await page.locator('#packet').fill('{}');
  await page.locator('#evaluate').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Dossier : champs absents ou inconnus')
  );
  const longTitlePacket = JSON.parse(raw);
  longTitlePacket.title = 'A'.repeat(200);
  await page.locator('#packet').fill(JSON.stringify(longTitlePacket));
  await page.locator('#evaluate').click();
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Dossier évalué')
  );
  await axe('desktop-fr');
  await page.setViewportSize({ width: 390, height: 844 });
  await axe('mobile-fr');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await page.screenshot({
    path: path.join(artifactsDirectory, 'mobile-fr.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => (document.documentElement.style.zoom = '2'));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await axe('zoom200-fr');
  await page.screenshot({
    path: path.join(artifactsDirectory, 'zoom200-fr.png'),
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.style.zoom = ''));
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('#cli').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Artifact verification passed')
  );
  await page.evaluate(() =>
    localStorage.setItem('agijobsv0.initiative-ledger.session.v1', '{broken')
  );
  await page.locator('#restore').click();
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Check failed')
  );
  assert.equal(await page.locator('#export-bundle').isDisabled(), true);
  await page.evaluate(() => {
    window.originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw Error('Storage denied');
    };
  });
  await page.locator('#cli').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.includes('Browser storage unavailable')
  );
  assert.equal(await page.locator('#export-bundle').isEnabled(), true);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalStorageSetItem;
  });
  await page.locator('#forget').click();
  await page.locator('#restore').click();
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.includes('No saved session')
  );
  assert.equal(await page.locator('#export-bundle').isDisabled(), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    cspViolations,
    [],
    'All exercised UI flows must run under the declared CSP'
  );
  return {
    passed: true,
    checks: [
      'enforced CSP without violations',
      'skip navigation',
      'oversized packet and bundle rejection',
      'actual CLI artifacts',
      'EN/FR Axe',
      '390px reflow with 200-character unbroken title',
      'French field validation',
      '200% zoom',
      'keyboard',
      'exact CRLF export',
      'bundle recovery and reload',
      'resealed forged output',
      'replaced supplied origin remains unverified',
      'UTF-8 and BOM rejection',
      'stale file import race',
      'corrupt recovery fails closed',
      'storage denied preserves export',
      'forget recovery',
    ],
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = await buildEmpowermentSite();
  const server = http.createServer((req, res) => {
    let p = path.resolve(
      output,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    );
    if (!p.startsWith(output + path.sep) && p !== output) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory())
      p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      'content-type',
      {
        '.html': 'text/html',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[path.extname(p)] || 'text/plain'
    );
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const result = await verifyEmpowerment({
      page,
      origin: `http://127.0.0.1:${server.address().port}`,
      route: '/',
    });
    fs.writeFileSync(
      path.join(root, 'reports/pages/empowerment/result.json'),
      JSON.stringify(result, null, 2)
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    server.close();
  }
}
