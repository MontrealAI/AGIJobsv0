import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyPolaris({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/polaris/', { waitUntil: 'networkidle' });
  await page.locator('#result').waitFor({ state: 'visible' });
  const read = async () => JSON.parse(await page.locator('#raw').textContent());
  const first = await read();
  assert.equal(first.accepted, true);
  assert.equal(first.chainAttested, false);
  assert.equal(await page.locator('#first').textContent(), 'Failed');
  assert.equal(await page.locator('#replacement').textContent(), 'Success');
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.ok((await page.locator('#digest').textContent()).includes(digest));
  const importData = async (data) => {
    await page.locator('#import').setInputFiles({
      name: 'fixture.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
    await page.waitForFunction(
      () => document.getElementById('import').value === ''
    );
  };
  await importData(
    JSON.stringify({
      schema: 'agijobs.polaris-browser-evidence.v1',
      fixture: JSON.parse(bytes),
      result: { accepted: false, chainAttested: true },
      downloadedFixtureSha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(await read(), first);
  const corrupt = JSON.parse(bytes);
  corrupt.first.observedSuccess = true;
  await importData(JSON.stringify(corrupt));
  assert.equal((await read()).accepted, false);
  assert.match(await page.locator('#first').textContent(), /Unverified/i);
  await importData('{"schema":1,"schema":2}');
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  const malformed = Buffer.from(bytes);
  malformed[malformed.indexOf(Buffer.from('schema')) + 10] = 255;
  await importData(malformed);
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData(bytes);
  assert.deepEqual(await read(), first);
  for (const [reveals, approvals, expectedFirst, expectedReplacement] of [
    [2, 2, false, true],
    [3, 1, true, false],
  ]) {
    await page.locator('#reveals').fill(String(reveals));
    await page.locator('#approvals').fill(String(approvals));
    await page.locator('button[type=submit]').click();
    const prediction = JSON.parse(
      await page.locator('#prediction-json').textContent()
    );
    assert.equal(prediction.firstExpectedSuccess, expectedFirst);
    assert.equal(prediction.replacementExpectedSuccess, expectedReplacement);
    assert.equal(prediction.executed, false);
    assert.deepEqual(await read(), first);
    assert.ok((await page.locator('#digest').textContent()).includes(digest));
  }
  for (const selector of ['#reveals', '#approvals']) {
    const input = page.locator(selector),
      previous = await input.inputValue();
    for (const raw of ['1.00000000000000001', '1e0']) {
      await input.fill(raw);
      await page.locator('button[type=submit]').click();
      assert.equal(await page.locator('#prediction').isVisible(), false);
    }
    await input.fill(previous);
  }
  await page.locator('#reveals').fill('2');
  assert.equal(await page.locator('#calculator-error').isVisible(), false);
  await page.locator('#reveals').fill('1e0');
  await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#calculator-error').isVisible(), true);
  await page.locator('#language').click();
  assert.equal(await page.locator('#calculator-error').isVisible(), false);
  await page.locator('#language').click();
  await page.locator('#reveals').fill('');
  await page.locator('#language').click();
  assert.equal(await page.locator('#reveals').inputValue(), '');
  await page.locator('#language').click();
  await page.locator('#reveals').fill('1');
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
          `polaris ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('polaris-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `polaris-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `polaris-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let held = true;
    window.restoreDigest = () => (crypto.subtle.digest = original);
    crypto.subtle.digest = (...args) =>
      held
        ? new Promise((resolve) => {
            window.releaseDigest = async () => {
              held = false;
              resolve(await original(...args));
            };
          })
        : original(...args);
  });
  await page.locator('#reset').click();
  await page.waitForFunction(() => !!window.releaseDigest);
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData('{"schema":1,"schema":2}');
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
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await page.waitForFunction(() => !!window.releaseFile);
  await page.locator('#reset').click();
  await page.locator('#result').waitFor({ state: 'visible' });
  await page.evaluate(() => window.releaseFile());
  await page.waitForTimeout(100);
  assert.deepEqual(await read(), first);
  await page.evaluate(() => window.restoreFile());
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  checks.push(
    'Polaris: exact bundled reviewer, fixture hashes/reopen, forged review ignored, receipt tamper failure, separate hypothetical calculator, stale async guards, EN/FR sixteen layouts/Axe and keyboard'
  );
}
