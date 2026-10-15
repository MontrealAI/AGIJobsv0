import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyAtlas({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/atlas/', { waitUntil: 'networkidle' });
  const run = async () => {
    await page.locator('button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#raw').textContent());
  };
  const first = await run();
  assert.equal(first.spentCents, 19000);
  assert.equal(first.firstPass.spentCents, 9000);
  assert.equal(first.completionMinute, 95);
  await page.waitForFunction(() =>
    document.getElementById('digest').textContent.includes('SHA-256')
  );
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  assert.ok(
    (await page.locator('#digest').textContent()).includes(
      createHash('sha256').update(bytes).digest('hex')
    )
  );
  await page.locator('#budget').fill('15000');
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal((await run()).accepted, false);
  await page.locator('#reset').click();
  await page.locator('[data-field=recover]').nth(1).uncheck();
  assert.equal((await run()).spentCents, 9000);
  await page.locator('#reset').click();
  await page.locator('[data-field=dependencies]').first().fill('report');
  await page.locator('button[type=submit]').click();
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#reset').click();
  await page.locator('[data-field=id]').first().fill('inspect-2');
  assert.ok(
    (await page.locator('.job button').first().textContent()).includes(
      'inspect-2'
    )
  );
  await page.locator('#reset').click();
  await page.locator('#budget').fill('');
  await page.locator('[data-field=cost]').first().fill('');
  await page.locator('#language').click();
  assert.equal(await page.locator('#budget').inputValue(), '');
  assert.equal(
    await page.locator('[data-field=cost]').first().inputValue(),
    ''
  );
  await page.locator('#language').click();
  await page.locator('#reset').click();
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
          `atlas ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('atlas-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `atlas-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `atlas-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  const importData = async (data) => {
    await page.locator('#import').setInputFiles({
      name: 'scenario.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
  };
  await importData(bytes);
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await importData(
    JSON.stringify({
      schema: 'agijobs.atlas-browser-evidence.v1',
      scenario: JSON.parse(bytes),
      result: { executedExternalWork: true },
      downloadedScenarioSha256: 'forged',
      hashScope: 'forged',
    })
  );
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await importData('{"schema":1,"schema":2}');
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  await importData(bytes);
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await page.locator('#reset').click();
  await page.locator('#add').click();
  assert.equal(await page.locator('.job').count(), 6);
  await page.locator('.job button').last().click();
  assert.equal(await page.locator('.job').count(), 5);
  await page.keyboard.press('Control+Home');
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');

  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.restoreDigest = () => (crypto.subtle.digest = original);
    crypto.subtle.digest = (...args) =>
      new Promise((resolve) => {
        window.releaseDigest = async () => resolve(await original(...args));
      });
  });
  await run();
  assert.equal(await page.locator('#evidence').isDisabled(), true);
  await page.locator('#budget').fill('100');
  await page.evaluate(() => window.releaseDigest());
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreDigest());
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.restoreFile = () => (File.prototype.text = original);
    File.prototype.text = function () {
      const file = this;
      return new Promise((resolve) => {
        window.releaseFile = async () => resolve(await original.call(file));
      });
    };
  });
  await importData(bytes);
  await page.waitForFunction(() => !!window.releaseFile);
  await page.locator('#reset').click();
  await page.evaluate(() => window.releaseFile());
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreFile());
  checks.push(
    'Atlas: exact cents and retry ledger; recovery/budget/cycle cases; EN/FR; eight layouts200%; Axe; scenario/evidence reopen and strict rejection; add/remove and keyboard'
  );
}
