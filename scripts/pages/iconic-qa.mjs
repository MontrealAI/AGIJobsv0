import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyIconic({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/iconic/', { waitUntil: 'networkidle' });
  const run = async () => {
    await page.locator('button[type=submit]').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#raw').textContent());
  };
  for (const selector of ['#inputTokens', '#maximumCalls']) {
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
  assert.equal(first.artifactReview.accepted, true);
  assert.equal(first.artifactReview.checks.length, 11);
  assert.equal(first.packetComplete, false);
  assert.equal(first.usage.reportedCostMicrousd, null);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  assert.ok(
    (await page.locator('#digest').textContent()).includes(
      createHash('sha256').update(bytes).digest('hex')
    )
  );
  for (const [id, value] of [
    ['inputTokens', '200'],
    ['outputTokens', '100'],
    ['reportedCostMicrousd', '500'],
  ])
    await page.locator('#' + id).fill(value);
  assert.equal(await page.locator('#result').isVisible(), false);
  const complete = await run();
  assert.equal(complete.packetComplete, true);
  for (const k of [
    'executionAttested',
    'costAttested',
    'admitted',
    'productionApproved',
    'settlementApproved',
  ])
    assert.equal(complete[k], false);
  await page.locator('#maximumCostMicrousd').fill('100');
  assert.ok((await run()).unresolvedGates.includes('reportedCostWithinPolicy'));
  await page.locator('#reset').click();
  await page.locator('#workerTerminated').uncheck();
  assert.ok((await run()).unresolvedGates.includes('cleanupReported'));
  await page.locator('#reset').click();
  await page.locator('#maximumCalls').fill('');
  await page.locator('#language').click();
  assert.equal(await page.locator('#maximumCalls').inputValue(), '');
  assert.equal(await page.locator('#inputTokens').inputValue(), '');
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
          `iconic ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('iconic-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `iconic-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `iconic-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  const importData = async (data) => {
    await page.locator('#import').setInputFiles({
      name: 'packet.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
    await page.waitForFunction(
      () => document.getElementById('import').value === ''
    );
  };
  await importData(bytes);
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await importData(
    JSON.stringify({
      schema: 'agijobs.supplier-browser-evidence.v1',
      packet: JSON.parse(bytes),
      result: { admitted: true },
      downloadedPacketSha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  const live = JSON.parse(bytes);
  live.execution.mode = 'reported-live-provider';
  live.usage = {
    inputTokens: 200,
    outputTokens: 100,
    reportedCostMicrousd: 500,
  };
  await importData(JSON.stringify(live));
  const reported = JSON.parse(await page.locator('#raw').textContent());
  assert.equal(reported.packetComplete, true);
  assert.equal(reported.executionMode, 'reported-live-provider');
  for (const k of [
    'executionAttested',
    'costAttested',
    'admitted',
    'productionApproved',
    'settlementApproved',
  ])
    assert.equal(reported[k], false);
  const corrupt = JSON.parse(bytes);
  corrupt.receipt.artifacts[0].content =
    corrupt.receipt.artifacts[0].content.replace('49000', '49001');
  await importData(JSON.stringify(corrupt));
  assert.equal(
    JSON.parse(await page.locator('#raw').textContent()).artifactReview
      .accepted,
    false
  );
  await importData('{"schema":1,"schema":2}');
  await page.locator('#error').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData(bytes);
  assert.deepEqual(JSON.parse(await page.locator('#raw').textContent()), first);
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.restoreDigest = () => (crypto.subtle.digest = original);
    let held = true;
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
  await page.locator('button[type=submit]').click();
  await page.waitForFunction(() => !!window.releaseDigest);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#providerCalls').fill('4');
  await page.evaluate(() => window.releaseDigest());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreDigest());
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    window.restoreFile = () => (File.prototype.arrayBuffer = original);
    File.prototype.arrayBuffer = function () {
      const file = this;
      return new Promise((resolve) => {
        window.releaseFile = async () => resolve(await original.call(file));
      });
    };
  });
  await page.locator('#import').setInputFiles({
    name: 'packet.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await page.waitForFunction(() => !!window.releaseFile);
  await page.locator('#reset').click();
  await page.evaluate(() => window.releaseFile());
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.evaluate(() => window.restoreFile());
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
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
    'ICONIC: eleven artifact checks; unknown and reported-complete packet states; costs/cleanup/tamper failures; EN/FR16layouts/Axe; exact hashes/reopen; stale async guards and keyboard'
  );
}
