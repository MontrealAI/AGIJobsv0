import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyGovernance({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/governance/', {
    waitUntil: 'networkidle',
  });
  const run = async () => {
    await page.locator('button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#artifact').textContent());
  };
  for (const selector of ['#requested', '#votes [data-key=weight]']) {
    const input = page.locator(selector).first(),
      previous = await input.inputValue();
    for (const value of ['1.00000000000000001', '1e1']) {
      await input.fill(value);
      await page.locator('#language').click();
      assert.equal(await page.locator(selector).first().inputValue(), value);
      await page.locator('#language').click();
      await page.locator('button[type=submit]').click();
      await page.locator('#error').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#result').isVisible(), false);
    }
    await input.fill(previous);
  }
  const first = await run();
  assert.equal(first.result.accepted, true);
  assert.equal(first.result.remainingCentsIfApproved, 80000);
  const pending = page.waitForEvent('download');
  await page.locator('#scenario-download').click();
  const file = await pending;
  const bytes = fs.readFileSync(await file.path());
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    first.downloadedScenarioSha256
  );
  assert.deepEqual(JSON.parse(bytes), first.scenario);
  for (const [selector, value, gate] of [
    ['#quorum', '95', 'quorum'],
    ['#approval', '90', 'approval'],
    ['#available', '100', 'budget'],
  ]) {
    await page.locator('#reset').click();
    await page.locator(selector).fill(value);
    assert.equal(await page.locator('#result').isVisible(), false);
    assert.deepEqual((await run()).result.reasons, [gate]);
  }
  await page.locator('#reset').click();
  await page.locator('#pause').uncheck();
  assert.deepEqual((await run()).result.reasons, ['ownerControls']);
  await page.locator('#reset').click();
  await page.locator('[data-voter=maintenance] select').selectOption('abstain');
  assert.equal((await run()).result.checks.approval, false);
  await page.locator('#eligible').fill('1');
  await page.locator('button[type=submit]').click();
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
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
          `governance ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('governance-rehearsal-' + lang);
    await page.evaluate(() => document.activeElement.blur());
    await page.screenshot({
      path: path.join(artifacts, `governance-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `governance-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  await page.locator('#import').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  assert.deepEqual((await run()).result, first.result);
  const forged = { ...first, result: { accepted: false, enacted: true } };
  await page.locator('#import').setInputFiles({
    name: 'evidence.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(forged)),
  });
  await page.waitForFunction(
    () => document.getElementById('import').value === ''
  );
  assert.deepEqual((await run()).result, first.result);
  await page.locator('#import').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"x","schema":"y"}'),
  });
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#title').fill('');
  await page.locator('#language').click();
  assert.equal(await page.locator('#title').inputValue(), '');
  await page.locator('#reset').click();
  await page.evaluate(() => {
    window.originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(window.originalDigest(...args)), 100)
      );
  });
  await page.locator('button[type=submit]').click();
  await page.locator('#requested').fill('2');
  await page.waitForTimeout(160);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => {
    crypto.subtle.digest = window.originalDigest;
    window.originalFileText = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      const file = this;
      return new Promise((resolve) =>
        setTimeout(() => resolve(window.originalFileText.call(file)), 100)
      );
    };
  });
  await page.locator('#import').setInputFiles({
    name: 'late.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await page.locator('#requested').fill('3');
  await page.waitForTimeout(160);
  assert.equal(await page.locator('#requested').inputValue(), '3');
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.reload();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.locator('.skip').evaluate((el) => el === document.activeElement),
    true
  );
  const malformed = Buffer.from(bytes);
  malformed[malformed.indexOf(Buffer.from('title')) + 9] = 255;
  await page.locator('#import').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: malformed,
  });
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
  checks.push(
    'governance: EN/FR, gates, abstention, exact-byte exports, strict evidence recovery, delayed import/hash invalidation, keyboard, responsive200%'
  );
}
