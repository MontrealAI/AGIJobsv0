import { createOmniphoenixDownloader } from './omniphoenix-download-qa.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const desk = require('../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/index.cjs');
const original = fs.readFileSync(
  new URL(
    '../../demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/project-plan.hyperstructure.json',
    import.meta.url
  )
);
export async function verifyOmniphoenix({
  page,
  url,
  artifacts,
  a11y,
  checks,
}) {
  await page.goto(url + 'experiments/omniphoenix/', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(
    () => document.querySelector('#status').dataset.state === 'ready'
  );
  assert.equal(await page.locator('#job-controls .job-control').count(), 7);
  assert.equal(await page.locator('main#main').count(), 1);
  assert.equal(
    await page.locator('header a').getAttribute('href'),
    '../../#explore'
  );
  const controls = {
    delays: [{ id: 'GLOBAL-INPUT-LEDGER', days: 5 }],
    blockedJobIds: ['CLIMATE-SWARM-DEPLOY'],
    horizonDays: 220,
  };
  const browserReport = await page.evaluate(
    async ({ source, controls }) => {
      const { desk } = await import('./engine.mjs');
      return desk.analyzeBytes(source, controls);
    },
    { source: original.toString('utf8'), controls }
  );
  assert.deepEqual(browserReport, desk.analyzeBytes(original, controls));
  await page.locator('#delay-0').fill('5');
  await page.locator('#block-1').check();
  await page.locator('#horizon').fill('220');
  await page.locator('#calculate').click();
  assert.equal(
    await page.locator('[data-metric="scenario"] strong').textContent(),
    'Unknown'
  );
  assert.match(
    await page.locator('#trace').textContent(),
    /CLIMATE-SWARM-DEPLOY → INFRA-REGEN-DEPLOY/
  );
  const download = createOmniphoenixDownloader(page);
  assert.deepEqual(await download('#download-source'), original);
  const recovery = await download('#download-recovery');
  assert.deepEqual(desk.importRecovery(recovery).report, browserReport);
  const upload = async (id, data) =>
    page.locator(id).setInputFiles({
      name: 'input.json',
      mimeType: 'application/json',
      buffer: Buffer.from(data),
    });
  const waitError = () =>
    page.waitForFunction(
      () => document.querySelector('#status').dataset.state === 'error'
    );
  for (const invalid of ['1e2', '1.0', ' 1', '01', '365001']) {
    await page.locator('#delay-0').fill(invalid);
    assert.equal(await page.locator('#results').isVisible(), false);
    await page.locator('#calculate').click();
    await waitError();
    await page.locator('#language').click();
    assert.equal(await page.locator('#delay-0').inputValue(), invalid);
    assert.equal(await page.locator('#download-recovery').isDisabled(), true);
    await page.locator('#language').click();
  }
  for (const bad of [
    Buffer.concat([Buffer.from([239, 187, 191]), original]),
    Buffer.from([255]),
    Buffer.from('{"initiative":"a","initiative":"b"}'),
  ]) {
    await upload('#plan-file', bad);
    await waitError();
    assert.equal(await page.locator('#download-source').isDisabled(), true);
  }
  const tampered = JSON.parse(recovery);
  tampered.report.baseline.budget = '0';
  await upload('#recovery-file', JSON.stringify(tampered));
  await waitError();
  await upload('#recovery-file', recovery);
  await page.waitForFunction(
    () => document.querySelector('#status').dataset.state === 'imported'
  );
  assert.equal(await page.locator('#delay-0').inputValue(), '5');
  assert.equal(await page.locator('#block-1').isChecked(), true);
  // A delayed File read cannot restore a report after a newer control edit.
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        window.releaseOmniphoenixFile = async () =>
          resolve(await original.call(this));
      });
    };
    window.restoreOmniphoenixFile = () => {
      File.prototype.arrayBuffer = original;
    };
  });
  await upload('#plan-file', original);
  await page.waitForFunction(
    () => typeof window.releaseOmniphoenixFile === 'function'
  );
  await page.locator('#delay-0').fill('9');
  await page.evaluate(async () => {
    await window.releaseOmniphoenixFile();
    window.restoreOmniphoenixFile();
  });
  assert.equal(await page.locator('#delay-0').inputValue(), '9');
  assert.equal(await page.locator('#results').isVisible(), false);
  const max = Buffer.concat([
    original,
    Buffer.alloc(262144 - original.length, 32),
  ]);
  await upload('#plan-file', max);
  await page.waitForFunction(
    () => document.querySelector('#status').dataset.state === 'imported'
  );
  assert.deepEqual(await download('#download-source'), max);
  const maxRecovery = await download('#download-recovery');
  await upload('#recovery-file', maxRecovery);
  await page.waitForFunction(
    () => document.querySelector('#status').dataset.state === 'imported'
  );
  assert.deepEqual(await download('#download-source'), max);
  await page.locator('#reset').click();
  // Native textarea values normalize line endings. Control-only work must never
  // turn that display normalization into a different authoritative source.
  for (const separator of ['\r\n', '\r']) {
    const exact = Buffer.from(
      original.toString('utf8').replace(/\n/g, separator)
    );
    const hash = desk.analyzeBytes(exact).sourceSha256;
    for (const recoveryImport of [false, true]) {
      await upload(
        recoveryImport ? '#recovery-file' : '#plan-file',
        recoveryImport ? JSON.stringify(desk.exportRecovery(exact, {})) : exact
      );
      await page.waitForFunction(
        () => document.querySelector('#status').dataset.state === 'imported'
      );
      const assertExact = async () => {
        assert.equal(
          await page.locator('#fingerprints dd').first().textContent(),
          hash
        );
        assert.deepEqual(await download('#download-source'), exact);
      };
      await page.locator('#calculate').click();
      await assertExact();
      await page.locator('#delay-0').fill('5');
      await page.locator('#calculate').click();
      await assertExact();
      await page.locator('#block-1').check();
      await page.locator('#calculate').click();
      await assertExact();
      await page.locator('#horizon').fill('220');
      await page.locator('#calculate').click();
      await assertExact();
      const saved = desk.importRecovery(await download('#download-recovery'));
      assert.equal(saved.sourceText, exact.toString('utf8'));
      assert.equal(saved.report.sourceSha256, hash);
      const sourcePanel = page
        .locator('details')
        .filter({ has: page.locator('#source-text') });
      await sourcePanel.locator('summary').click();
      const edited = (await page.locator('#source-text').inputValue()) + ' ';
      await page.locator('#source-text').fill(edited);
      await page.locator('#calculate').click();
      assert.equal(
        await page.locator('#fingerprints dd').first().textContent(),
        desk.analyzeBytes(edited).sourceSha256
      );
      assert.deepEqual(await download('#download-source'), Buffer.from(edited));
      await sourcePanel.locator('summary').click();
    }
  }
  await page.locator('#reset').click();
  // Keyboard navigation begins at the skip link and reaches the language control.
  await page.locator('.skip').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  assert.match(await page.locator('#results-title').textContent(), /Comparer/);
  await page.locator('#delay-0').focus();
  await page.keyboard.type('7');
  await page.locator('#calculate').focus();
  await page.keyboard.press('Enter');
  await page.locator('#reset').click();
  for (const language of ['fr', 'en']) {
    if ((await page.locator('html').getAttribute('lang')) !== language)
      await page.locator('#language').click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        `${language} overflow at ${width}px`
      );
      if (width === 390 || width === 1440) {
        await a11y(`omniphoenix-${language}-${width}`);
        await page.screenshot({
          path: path.join(artifacts, `omniphoenix-${language}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  assert.ok(
    await page.evaluate(
      () => document.body.scrollWidth <= document.body.clientWidth
    ),
    'Omniphoenix 200% reflow'
  );
  await a11y('omniphoenix-200-percent');
  await page.screenshot({
    path: path.join(artifacts, 'omniphoenix-200-percent.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  for (const detail of await page.locator('details').all()) {
    await detail.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await detail.getAttribute('open'), '');
  }
  await a11y('omniphoenix-expanded');
  checks.push(
    'Omniphoenix: exact Node/browser parity; strict source/recovery imports; tamper, BOM, UTF-8 and lexical rejection; stale import invalidation; 256KiB source round-trip; EN/FR; keyboard; narrow and 200% reflow; Axe.'
  );
}
