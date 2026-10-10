import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openEditableDraft } from '../../website/assets/work-model.mjs';

export async function verifyStart({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const key = new URL(url).pathname + 'start-draft/v1';
  for (const lang of ['en', 'fr']) {
    await page.goto(url + 'start/' + (lang === 'fr' ? 'fr/' : ''));
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    await page.locator('#guide-next').click();
    assert.notEqual(await page.locator('#guide-status').innerText(), '');
    assert.equal(await page.locator('[data-step="0"]').isVisible(), true);
    await a11y('onboarding-' + lang);
    await page.locator('[name="role"][value="buyer"]').focus();
    await page.keyboard.press('Space');
    await page.locator('#guide-next').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page
        .locator('[data-step="1"] h2')
        .evaluate((el) => document.activeElement === el),
      true
    );
    await page.locator('#guide-next').click();
    assert.equal(
      await page.locator('#start-goal').getAttribute('aria-invalid'),
      'true'
    );
    await page.locator('[data-preset="feature"]').click();
    const preset = await page.locator('#start-goal').inputValue();
    assert.ok(preset.length > 40);
    await page
      .locator('#start-goal')
      .fill('<img src=x onerror=alert(1)> A public website request.');
    await page.locator('#guide-next').click();
    assert.equal(await page.locator('#goal-summary img').count(), 0);
    assert.match(await page.locator('#goal-summary').innerText(), /<img/);
    await page.locator('#guide-back').click();
    assert.match(await page.locator('#start-goal').inputValue(), /<img/);
    await page.locator('#start-goal').fill(preset);
    await page.locator('#guide-next').click();
    await a11y('onboarding-ready-' + lang);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-start-draft').click();
    const download = await downloadPromise;
    const saved = fs.readFileSync(await download.path(), 'utf8');
    const fields = openEditableDraft(saved);
    assert.equal(fields.goal, preset);
    assert.equal(fields.type, 'feature');
    assert.equal(fields.reward, '');
    assert.equal(fields.workerProfile, '');
    await page.locator('#planner-handoff').click();
    await page.waitForURL(url + 'work/#planner');
    assert.equal(await page.locator('#work-goal').inputValue(), preset);
    assert.equal(await page.locator('#work-type').inputValue(), 'feature');
    assert.equal(await page.locator('#work-reward').inputValue(), '');
    assert.equal(
      await page.locator('[data-work-download="task"]').isDisabled(),
      true
    );
    assert.equal(
      await page.evaluate((k) => sessionStorage.getItem(k), key),
      null
    );
    checks.push(
      'onboarding ' +
        lang +
        ': keyboard, validation, text safety, draft download and one-use handoff'
    );
  }
  for (const role of ['worker', 'reviewer', 'explorer']) {
    await page.goto(url + 'start/');
    await page.locator(`[name="role"][value="${role}"]`).check();
    await page.locator('#guide-next').click();
    assert.equal(
      await page.locator(`[data-detail="${role}"]`).isVisible(),
      true
    );
    await page.locator('#guide-next').click();
    const link = page.locator(`[data-result="${role}"] a`);
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(new URL(href, url).href);
    checks.push('onboarding route: ' + role);
  }
  await page.goto(url + 'start/');
  await page.locator('[name="role"][value="buyer"]').check();
  await page.locator('#guide-next').click();
  await page.locator('[data-preset="research"]').click();
  await page.locator('#guide-next').click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage blocked');
    };
  });
  await page.locator('#planner-handoff').click();
  assert.equal(await page.locator('#planner-fallback').isVisible(), true);
  assert.match(await page.locator('#guide-status').innerText(), /cannot carry/);
  assert.equal(page.url(), url + 'start/');
  await page.locator('#guide-restart').click();
  assert.equal(await page.locator('[data-step="0"]').isVisible(), true);
  await page.reload();
  assert.equal(await page.locator('#start-goal').inputValue(), '');
  await page.goto(url + 'work/#from-start');
  await page.waitForURL(url + 'work/#planner');
  assert.match(
    await page.locator('#work-status').innerText(),
    /No guided draft/
  );
  await page.evaluate(
    (k) =>
      sessionStorage.setItem(
        k,
        JSON.stringify({
          schema: 'agi-jobs-work-draft/v1',
          fields: { goal: 'Malformed' },
          approved: true,
        })
      ),
    key
  );
  await page.goto(url + 'start/');
  await page.goto(url + 'work/#from-start');
  await page.waitForURL(url + 'work/#planner');
  assert.match(
    await page.locator('#work-status').innerText(),
    /could not be opened/
  );
  assert.equal(
    await page.evaluate((k) => sessionStorage.getItem(k), key),
    null
  );
  checks.push(
    'onboarding: blocked storage, restart, refresh, missing and malformed transfer recovery'
  );
  for (const lang of ['en', 'fr']) {
    await page.goto(url + 'start/' + (lang === 'fr' ? 'fr/' : ''));
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const enlarged of [false, true]) {
        if (
          ((await page.locator('#large-text').getAttribute('aria-pressed')) ===
            'true') !==
          enlarged
        )
          await page.locator('#large-text').click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          true,
          `${lang} ${width} enlarged=${enlarged}`
        );
        const smallControls = await page
          .locator('.guide button:visible, .choice:visible')
          .evaluateAll(
            (items) =>
              items.filter((el) => el.getBoundingClientRect().height < 44)
                .length
          );
        assert.equal(smallControls, 0);
      }
      if (width === 390 || width === 1440) {
        await page.locator('#large-text').click();
        await page.screenshot({
          path: path.join(artifacts, `onboarding-${lang}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await a11y('onboarding-large-' + lang);
  }
  checks.push(
    'onboarding: EN/FR reflow at five widths, larger text and large controls'
  );
  const noJS = await context.browser().newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const fallback = await noJS.newPage();
    for (const lang of ['en', 'fr']) {
      await fallback.goto(url + 'start/' + (lang === 'fr' ? 'fr/' : ''));
      assert.equal(
        await fallback
          .locator('#guide-fallback .direct-links a:visible')
          .count(),
        4
      );
      assert.equal(await fallback.locator('#wizard').isVisible(), false);
      assert.equal(await fallback.locator('.faq details').count(), 5);
    }
  } finally {
    await noJS.close();
  }
  checks.push('onboarding: useful no-JavaScript routes in both languages');
  await page.setViewportSize({ width: 1440, height: 1050 });
}
