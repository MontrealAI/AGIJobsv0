import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyCelestial({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/celestial/', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelectorAll('#jobs fieldset').length === 4
  );
  const run = async () => {
    await page.locator('button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#raw').textContent());
  };
  for (const selector of [
    '#outageCapacity-energyUnits',
    '#jobs [data-field=priority]',
    '#jobs [data-field=computeUnits]',
  ]) {
    const input = page.locator(selector).first(),
      previous = await input.inputValue();
    for (const value of ['1.00000000000000001', '1e1']) {
      await input.fill(value);
      await page.locator('button[type=submit]').click();
      await page.locator('#error').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#result').isVisible(), false);
    }
    await input.fill(previous);
  }
  const first = await run();
  assert.deepEqual(first.displacedIds, ['indexing', 'archive']);
  assert.equal(first.outage.conserved, true);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  assert.ok(
    (await page.locator('#digest').textContent()).includes(
      createHash('sha256').update(bytes).digest('hex')
    )
  );
  await page.locator('#outageCapacity-energyUnits').fill('9');
  assert.equal(await page.locator('#result').isVisible(), false);
  const paused = await run();
  assert.equal(paused.outage.dispatchPaused, true);
  assert.equal(paused.outage.allocated.energyUnits, 0);
  await page.locator('#outageCapacity-energyUnits').fill('');
  await page.locator('#language').click();
  assert.equal(
    await page.locator('#outageCapacity-energyUnits').inputValue(),
    ''
  );
  await page.locator('#language').click();
  await page.locator('#reset').click();
  await page.waitForFunction(
    () => document.getElementById('outageCapacity-energyUnits').value === '65'
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
          `celestial ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('celestial-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `celestial-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `celestial-${lang}-mobile.png`),
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
      schema: 'agijobs.celestial-browser-evidence.v1',
      scenario: JSON.parse(bytes),
      result: { executionAttested: true },
      downloadedScenarioSha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await importData('{"schema":1,"schema":2}');
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  const malformed = Buffer.from(bytes);
  malformed[malformed.indexOf(Buffer.from('Keep'))] = 255;
  await importData(malformed);
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData(bytes);
  await page.locator('#add').click();
  assert.equal(await page.locator('#jobs fieldset').count(), 5);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#jobs fieldset').last().locator('button').click();
  assert.equal(await page.locator('#jobs fieldset').count(), 4);
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
  await page.locator('#outageCapacity-computeUnits').fill('40');
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
    'Celestial: resource conservation/reserve pause, editable requests, EN/FR16layouts/Axe, exact hashes and strict reopen, forged evidence ignored, stale async guards and keyboard'
  );
}
