import assert from 'node:assert/strict';
import path from 'node:path';

async function layout(page, label) {
  const result = await page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll('a,button,summary,.example-checklist label'),
    ].filter(
      (el) =>
        el.getBoundingClientRect().height > 0 &&
        !el.classList.contains('skip-link')
    );
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      outside: controls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1;
        })
        .map((el) => el.textContent.trim()),
      small: controls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        })
        .map((el) => el.textContent.trim()),
    };
  });
  assert.deepEqual(result, { overflow: false, outside: [], small: [] }, label);
}

export async function verifyWelcomeExample({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const progressKey = new URL(url).pathname + 'start-progress/v1';
  // Retain a real valid guide draft across a trip through the practice example.
  await page.goto(url + 'start/');
  await page.evaluate((key) => sessionStorage.removeItem(key), progressKey);
  await page.reload();
  await page.locator('[name="role"][value="buyer"]').check();
  await page.locator('#guide-next').click();
  const goal =
    'Keep this existing request while exploring the beginner example.';
  await page.locator('#start-goal').fill(goal);
  const saved = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    progressKey
  );
  await page.locator('.try-example').click();
  await page.waitForURL(url + 'start/example/');

  for (const lang of ['en', 'fr']) {
    const route = url + 'start/' + (lang === 'fr' ? 'fr/' : '') + 'example/';
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(route);
    const messages = JSON.parse(
      await page.locator('#example').getAttribute('data-messages')
    );
    assert.equal(await page.locator('[data-example-step]:visible').count(), 1);
    assert.equal(await page.locator('#example-back').isVisible(), false);
    await a11y('beginner-request-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `beginner-${lang}-request.png`),
      fullPage: true,
    });
    await page.locator('#example-next').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page
        .locator('[data-example-step="1"] h2')
        .evaluate((el) => el === document.activeElement),
      true
    );
    assert.equal(
      await page.locator('[data-example-panel="after"]').isVisible(),
      true
    );
    await page.locator('[data-example-preview="before"]').focus();
    await page.keyboard.press('Space');
    assert.equal(
      await page.locator('[data-example-panel="before"]').isVisible(),
      true
    );
    assert.equal(
      await page.locator('[data-example-panel="after"]').isVisible(),
      false
    );
    assert.equal(
      await page
        .locator('[data-example-preview="before"]')
        .getAttribute('aria-pressed'),
      'true'
    );
    await a11y('beginner-original-' + lang);
    await page.locator('[data-example-preview="after"]').click();
    await a11y('beginner-delivery-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `beginner-${lang}-delivery.png`),
      fullPage: true,
    });
    await page.locator('#example-next').click();
    assert.equal(await page.locator('#example-result').innerText(), '');
    await page.locator('#example-check').click();
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.none
    );
    await page.locator('#example-check-0').focus();
    await page.keyboard.press('Space');
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.changed
    );
    await page.locator('#example-check').click();
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.some.replace('{count}', '1')
    );
    await page.locator('#example-check-1').check();
    await page.locator('#example-check-2').check();
    await page.locator('#example-check').click();
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.all
    );
    await page.locator('#example-check-2').uncheck();
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.changed
    );
    await page.locator('#example-check').click();
    assert.equal(
      await page.locator('#example-result').innerText(),
      messages.some.replace('{count}', '2')
    );
    await page.locator('#example-back').click();
    await page.locator('#example-next').click();
    assert.equal(await page.locator('#example-check-0').isChecked(), true);
    assert.equal(await page.locator('#example-check-2').isChecked(), false);
    await a11y('beginner-review-' + lang);
    await page.locator('.example-next a').click();
    await page.locator('#wizard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start-goal').inputValue(), goal);
    assert.equal(
      await page.evaluate((key) => sessionStorage.getItem(key), progressKey),
      saved
    );

    const session = await context.newCDPSession(page);
    try {
      for (const standard of [16, 32]) {
        await session.send('Page.setFontSizes', { fontSizes: { standard } });
        for (const width of [320, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(route);
          await page.locator('#example-large-text').click();
          for (const step of [0, 1, 2]) {
            await page.locator(`[data-example-go="${step}"]`).click();
            await layout(
              page,
              `${lang}: step ${step}, width ${width}, default font ${standard}, larger text`
            );
          }
        }
      }
      await session.send('Page.setFontSizes', { fontSizes: { standard: 16 } });
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.goto(route);
      await page.locator('#example-large-text').click();
      await page.evaluate(() => {
        const sheet = document.styleSheets[0];
        sheet.insertRule(
          '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
          sheet.cssRules.length
        );
        sheet.insertRule(
          'p { margin-bottom: 2em !important; }',
          sheet.cssRules.length
        );
      });
      for (const step of [0, 1, 2]) {
        await page.locator(`[data-example-go="${step}"]`).click();
        await layout(page, `${lang}: increased text spacing, step ${step}`);
      }
      await a11y('beginner-enlarged-' + lang);
      await page.goto(route + '#example-step-1');
      await page
        .locator('[data-example-step="1"]')
        .waitFor({ state: 'visible' });
      assert.equal(
        await page.locator('[data-example-step="1"]').isVisible(),
        true
      );
      await page.reload();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.begin-example').focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page
          .locator('[data-example-step="1"] h2')
          .evaluate((el) => el === document.activeElement),
        true
      );
      await page.screenshot({
        path: path.join(artifacts, `beginner-${lang}-mobile.png`),
        fullPage: true,
      });
      await page.emulateMedia({ forcedColors: 'active' });
      await layout(page, `${lang}: forced colors`);
      await page.emulateMedia({ forcedColors: 'none' });
    } finally {
      await session.send('Page.setFontSizes', { fontSizes: { standard: 16 } });
      await session.detach();
    }
  }
  const noJS = await context.browser().newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const fallback = await noJS.newPage();
    for (const lang of ['en', 'fr']) {
      await fallback.goto(
        url + 'start/' + (lang === 'fr' ? 'fr/' : '') + 'example/'
      );
      assert.equal(
        await fallback.locator('[data-example-step]:visible').count(),
        3
      );
      assert.equal(
        await fallback.locator('[data-example-panel]:visible').count(),
        2
      );
      assert.equal(await fallback.locator('.example-next a').isVisible(), true);
      assert.equal(await fallback.locator('#example-check').isVisible(), false);
      await layout(fallback, `${lang}: no JavaScript`);
    }
  } finally {
    await noJS.close();
  }
  checks.push(
    'beginner example: EN/FR request → delivery → review, keyboard focus, before/after switch, zero/partial/all selections and stale feedback removal'
  );
  checks.push(
    'beginner example: existing draft preserved, no-JavaScript reading, 320/768/1440px, 200% browser text, larger text, custom spacing, 44px targets and forced colors'
  );
}
