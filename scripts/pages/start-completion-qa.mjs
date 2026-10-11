import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function verifyStartCompletion({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const progressKey = new URL(url).pathname + 'start-progress/v1';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(url).origin,
  });
  for (const lang of ['en', 'fr']) {
    await page.goto(url + 'start/' + (lang === 'fr' ? 'fr/' : ''));
    await page.evaluate((key) => sessionStorage.removeItem(key), progressKey);
    await page.reload();
    await page.locator('#wizard').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#saved-draft-tools').getAttribute('open'),
      null
    );
    assert.equal(
      await page.locator('#open-start-draft-button').isVisible(),
      false
    );
    await page.locator('#step-help > summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-help-step="0"]').isVisible(), true);
    await page.locator('#saved-draft-tools > summary').focus();
    await page.keyboard.press('Space');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#open-start-draft-button').click();
    await (await chooserPromise).setFiles([]);
    await page.locator('[name="role"][value="buyer"]').check();
    await page.locator('#guide-next').click();
    assert.equal(
      await page
        .locator('[data-help-step="1"][data-help-role="buyer"]')
        .isVisible(),
      true
    );
    const goal =
      lang === 'en'
        ? '  Compare three public tools.\nKeep this exact text: <b>my request</b>.  '
        : '  Comparer trois outils publics.\nGarder ce texte exact : <b>ma demande</b>.  ';
    await page.locator('#start-goal').fill(goal);
    await page.locator('#guide-next').click();
    assert.equal(
      await page
        .locator('[data-help-step="2"][data-help-role="buyer"]')
        .isVisible(),
      true
    );
    await page.locator('#copy-start-brief').click();
    await page.waitForFunction(
      () => !document.getElementById('copy-start-brief').disabled
    );
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes(goal));
    assert.equal(await page.locator('#copy-brief-fallback').isVisible(), false);
    assert.match(
      await page.locator('#guide-status').innerText(),
      lang === 'en' ? /Copied/ : /Copié/
    );
    await page.locator('#brief-save-options > summary').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-readable-brief').click();
    const download = await downloadPromise;
    assert.equal(fs.readFileSync(await download.path(), 'utf8'), copied);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise((_, reject) => {
              window.__rejectGuideCopy = reject;
            }),
        },
      });
    });
    await page.locator('#copy-start-brief').click();
    await page.waitForFunction(
      () => typeof window.__rejectGuideCopy === 'function'
    );
    await page.locator('#edit-start-brief').click();
    assert.equal(
      await page
        .locator('#start-goal')
        .evaluate((el) => el === document.activeElement),
      true
    );
    assert.equal(await page.locator('#start-goal').inputValue(), goal);
    const revised = goal + '\nRevised / Modifié.';
    await page.locator('#start-goal').fill(revised);
    await page.evaluate(() =>
      window.__rejectGuideCopy(new Error('Clipboard unavailable'))
    );
    await page.waitForFunction(
      () => !document.getElementById('copy-start-brief').disabled
    );
    assert.equal(await page.locator('#copy-brief-fallback').isVisible(), false);
    assert.equal(await page.locator('#guide-status').innerText(), '');
    assert.equal(await page.locator('#start-goal').inputValue(), revised);
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      })
    );
    await page.locator('#guide-next').click();
    await page.locator('#copy-start-brief').click();
    await page.locator('#copy-brief-fallback').waitFor({ state: 'visible' });
    const fallback = await page.locator('#copy-brief-text').inputValue();
    assert.equal(fallback, copied.replace(goal, revised));
    assert.deepEqual(
      await page.locator('#copy-brief-text').evaluate((el) => ({
        readOnly: el.readOnly,
        focused: document.activeElement === el,
        selected: el.value.slice(el.selectionStart, el.selectionEnd),
      })),
      { readOnly: true, focused: true, selected: fallback }
    );
    assert.equal(await page.locator('#goal-summary b').count(), 0);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.locator('#large-text').click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      true
    );
    await a11y('onboarding-copy-fallback-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `onboarding-completion-${lang}.png`),
      fullPage: true,
    });
    await page.locator('#guide-restart').click();
    assert.equal(await page.locator('#copy-brief-text').inputValue(), '');
    await page.locator('[name="role"][value="explorer"]').check();
    await page.locator('#guide-next').click();
    assert.equal(
      await page
        .locator('[data-help-step="1"][data-help-role="other"]')
        .isVisible(),
      true
    );
    await page.locator('#guide-next').click();
    assert.equal(
      await page
        .locator('[data-help-step="2"][data-help-role="other"]')
        .isVisible(),
      true
    );
    checks.push(
      `onboarding ${lang}: keyboard disclosures, real clipboard/download parity, exact editing, unavailable clipboard fallback and stale-copy recovery`
    );
  }
  await context.clearPermissions();
  await page.setViewportSize({ width: 1440, height: 1050 });
}
