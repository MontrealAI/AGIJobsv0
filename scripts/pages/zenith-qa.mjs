import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyZenith({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/zenith/', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelectorAll('#jobs fieldset').length === 3
  );
  const run = async () => {
    await page.locator('button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#raw').textContent());
  };
  const first = await run();
  assert.equal(first.reportedComplete, false);
  assert.equal(first.reported, null);
  assert.deepEqual(first.proposals, []);
  assert.match(await page.locator('#totals').textContent(), /Unknown/);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  assert.ok(
    (await page.locator('#digest').textContent()).includes(
      createHash('sha256').update(bytes).digest('hex')
    )
  );
  const last = page.locator('#jobs fieldset').last();
  await last.locator('[data-field=unknown]').uncheck();
  await last.locator('[data-field=reportedUnits]').fill('20000');
  const complete = await run();
  assert.equal(complete.reportedComplete, true);
  assert.equal(complete.fullyFundedAfterProposal, true);
  assert.equal(complete.proposals[0].units, '5000');
  assert.equal(complete.transfersExecuted, false);
  await last.locator('[data-field=reportedUnits]').fill('999999');
  const partial = await run();
  assert.equal(partial.fullyFundedAfterProposal, false);
  assert.notEqual(partial.uncoveredDeficitUnits, '0');
  await page.locator('#total').fill('1.00000000000000001');
  await page.locator('#language').click();
  assert.equal(
    await page.locator('#total').inputValue(),
    '1.00000000000000001'
  );
  await page.locator('#language').click();
  await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#reset').click();
  await page.waitForFunction(
    () => document.getElementById('total').value === '100000'
  );
  await run();
  for (const lang of ['en', 'fr']) {
    if (lang === 'fr') await page.locator('#language').click();
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const scale of [100, 200]) {
        await page.evaluate(
          (scale) => (document.documentElement.style.fontSize = scale + '%'),
          scale
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          `zenith ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('zenith-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `zenith-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `zenith-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  const importData = async (data) => {
    await page.locator('#import').setInputFiles({
      name: 'scenario.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
    await page.waitForFunction(
      () => document.getElementById('import').value === ''
    );
  };
  await importData(
    JSON.stringify({
      schema: 'agijobs.zenith-browser-evidence.v1',
      scenario: JSON.parse(bytes),
      result: { transfersExecuted: true },
      downloadedScenarioSha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await importData(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  const malformed = Buffer.from(bytes);
  malformed[malformed.indexOf(Buffer.from('Reconcile'))] = 255;
  await importData(malformed);
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData('{"schema":1,"schema":2}');
  assert.equal(await page.locator('#error').isVisible(), true);
  await importData(bytes);
  await page.locator('#add-job').click();
  assert.equal(await page.locator('#jobs fieldset').count(), 4);
  await page.locator('#jobs fieldset').last().locator('button').click();
  await page.locator('#add-region').click();
  assert.equal(await page.locator('#regions fieldset').count(), 4);
  await page.locator('#regions fieldset').last().locator('button').click();
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.restoreDigest = () => (crypto.subtle.digest = original);
    crypto.subtle.digest = (...args) =>
      new Promise(
        (resolve) =>
          (window.releaseDigest = async () => resolve(await original(...args)))
      );
  });
  await page.locator('button[type=submit]').click();
  await page.waitForFunction(() => !!window.releaseDigest);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#total').fill('2');
  await page.evaluate(() => window.releaseDigest());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreDigest());
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    window.restoreFile = () => (File.prototype.arrayBuffer = original);
    File.prototype.arrayBuffer = function () {
      const file = this;
      return new Promise(
        (resolve) =>
          (window.releaseFile = async () => resolve(await original.call(file)))
      );
    };
  });
  await page.locator('#import').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await page.waitForFunction(() => !!window.releaseFile);
  await page.locator('#reset').click();
  await page.evaluate(() => window.releaseFile());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreFile());
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  checks.push(
    'Zenith: unknown/complete/partial reconciliation, exact declared-unit strings, strict UTF8/evidence recovery, EN/FR16layouts/Axe, add/remove, hash/import stale guards and keyboard'
  );
}
