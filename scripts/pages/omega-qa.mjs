import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function verifyOmega({ page, url, artifacts, a11y, checks }) {
  await page.goto(url + 'experiments/omega/', { waitUntil: 'networkidle' });
  await page.locator('#result').waitFor({ state: 'visible' });
  const read = async () => JSON.parse(await page.locator('#raw').textContent());
  const first = await read();
  assert.equal(first.review.complete, true);
  assert.equal(first.review.persistentStorageVerified, false);
  assert.equal(await page.locator('#advance').isDisabled(), true);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const bytes = fs.readFileSync(await (await pending).path());
  assert.ok(
    (await page.locator('#digest').textContent()).includes(
      createHash('sha256').update(bytes).digest('hex')
    )
  );
  await page.locator('#start').click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.getElementById('raw').textContent).review
        .verifiedRetainedStages === 1
  );
  for (let i = 2; i <= 5; i++) {
    await page.locator('#advance').click();
    await page.waitForFunction(
      (i) =>
        !document.getElementById('result').hidden &&
        JSON.parse(document.getElementById('raw').textContent).review
          .verifiedRetainedStages === i,
      i
    );
  }
  assert.equal((await read()).review.complete, true);
  await page.locator('#start-error').click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.getElementById('raw').textContent).review
        .verifiedRetainedStages === 1
  );
  for (let i = 2; i <= 4; i++) {
    await page.locator('#advance').click();
    await page.waitForFunction(
      (i) =>
        !document.getElementById('result').hidden &&
        JSON.parse(document.getElementById('raw').textContent).review
          .verifiedRetainedStages === i,
      i
    );
  }
  assert.equal((await read()).review.reviewAccepted, false);
  assert.equal(await page.locator('#advance').isDisabled(), true);
  await page.locator('#reset').click();
  await page.locator('#result').waitFor({ state: 'visible' });
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
          `omega ${lang}/${width}/${scale}`
        );
      }
    }
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '100%')
    );
    await a11y('omega-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `omega-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({
      path: path.join(artifacts, `omega-${lang}-mobile.png`),
      fullPage: true,
    });
  }
  const importData = async (data) => {
    await page.locator('#import').setInputFiles({
      name: 'replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
    await page.waitForFunction(
      () => document.getElementById('import').value === ''
    );
  };
  await importData(
    JSON.stringify({
      schema: 'agijobs.omega-browser-evidence.v1',
      evidence: JSON.parse(bytes),
      review: { executionAttested: true },
      downloadedReplaySha256: 'forged',
      hashScope: 'forged',
    })
  );
  assert.deepEqual(await read(), first);
  const corrupt = JSON.parse(bytes);
  corrupt.records[1].data.recommendedSupplier = 'forged';
  await importData(JSON.stringify(corrupt));
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  await importData(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.equal(await page.locator('#result').isVisible(), false);
  const malformed = Buffer.from(bytes);
  malformed[malformed.indexOf(Buffer.from('deterministic'))] = 255;
  await importData(malformed);
  assert.equal(await page.locator('#error').isVisible(), true);
  await importData('{"schema":1,"schema":2}');
  assert.equal(await page.locator('#error').isVisible(), true);
  await importData(bytes);
  const cli = spawnSync(
    process.execPath,
    [
      'demo/zenith-sapience-initiative-omega-omni-operating-system/run.cjs',
      '--stop-after',
      '2',
    ],
    { encoding: 'utf8', timeout: 30000 }
  );
  assert.equal(cli.status, 1, cli.stderr);
  const interrupted = JSON.parse(cli.stdout);
  const cliEvidence = {
    schema: 'agijobs.omega-replay-evidence.v1',
    scope:
      'Actual local CLI interrupted checkpoint, imported for browser consistency review',
    records: [1, 2].map((n) =>
      JSON.parse(
        fs.readFileSync(path.join(interrupted.directory, n + '.json'), 'utf8')
      )
    ),
    productionApproved: false,
    settlementApproved: false,
  };
  await importData(JSON.stringify(cliEvidence));
  assert.equal(
    (await read()).review.checkpointSha256,
    interrupted.checkpointSha256
  );
  assert.equal((await read()).review.verifiedRetainedStages, 2);
  const retained = JSON.parse(bytes);
  retained.records = retained.records.slice(0, 2);
  await importData(JSON.stringify(retained));
  assert.equal((await read()).review.verifiedRetainedStages, 2);
  await page.locator('#advance').click();
  await page.waitForFunction(
    () =>
      !document.getElementById('result').hidden &&
      JSON.parse(document.getElementById('raw').textContent).review
        .verifiedRetainedStages === 3
  );
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.restoreDigest = () => (crypto.subtle.digest = original);
    let held = true;
    crypto.subtle.digest = (...args) =>
      held
        ? new Promise(
            (resolve) =>
              (window.releaseDigest = async () => {
                held = false;
                resolve(await original(...args));
              })
          )
        : original(...args);
  });
  await page.locator('#advance').click();
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
    name: 'replay.json',
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
    'Omega: five exact stages, injected error rejected at independent review, exported partial replay/recovery, source/tamper/hash/UTF8 guards, EN/FR16layouts/Axe and keyboard'
  );
}
