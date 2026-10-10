import assert from 'node:assert/strict';

const luminance = (color) => {
  const rgb = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  return rgb
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0
    );
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

async function assertLayout(page, label) {
  const result = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const identify = (element) =>
      element.id || element.textContent.trim().slice(0, 60);
    const interactive = [
      ...document.querySelectorAll(
        '.guide button, .guide a, .choice, .preferences button, .preferences a, .begin-guide'
      ),
    ].filter(visible);
    const header = [
      ...document.querySelectorAll('.header > *, .preferences > *'),
    ].filter(visible);
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      outside: [...interactive, ...header]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        })
        .map(identify),
      small: interactive
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map(identify),
    };
  });
  assert.ok(
    result.documentWidth <= result.width + 1,
    `${label}: ${JSON.stringify(result)}`
  );
  assert.deepEqual(
    result.outside,
    [],
    `${label}: controls stay in the viewport`
  );
  assert.deepEqual(result.small, [], `${label}: controls have 44px targets`);
}

async function setLarger(page, enabled) {
  if (
    ((await page.locator('#large-text').getAttribute('aria-pressed')) ===
      'true') !==
    enabled
  )
    await page.locator('#large-text').click();
}

export async function verifyStartVisual({ page, context, url, a11y, checks }) {
  const session = await context.newCDPSession(page);
  const progressKey = new URL(url).pathname + 'start-progress/v1';
  const fresh = async (route) => {
    if (!page.url().startsWith(url)) await page.goto(route);
    await page.evaluate((key) => sessionStorage.removeItem(key), progressKey);
    await page.goto(route);
  };
  let panels = 0;
  try {
    for (const lang of ['en', 'fr']) {
      const route = url + 'start/' + (lang === 'fr' ? 'fr/' : '');
      for (const standard of [16, 32]) {
        // Change Chromium's actual default font, not the site's font declarations.
        // This tests preferred font sizes and 200% text independently of reflow.
        await session.send('Page.setFontSizes', { fontSizes: { standard } });
        for (const enlarged of [false, true]) {
          for (const width of [320, 768, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await fresh(route);
            await setLarger(page, enlarged);
            const rootSize = await page.evaluate(() =>
              parseFloat(getComputedStyle(document.documentElement).fontSize)
            );
            assert.equal(rootSize, standard * (enlarged ? 1.375 : 1.125));
            const label = `${lang} width=${width} default-font=${standard} larger=${enlarged}`;
            for (const step of [0, 1, 2]) {
              if (step === 1) {
                await page.locator('[name="role"][value="buyer"]').check();
                await page.locator('#guide-next').click();
              }
              if (step === 2) {
                await page.locator('[data-preset="feature"]').click();
                await page.locator('#guide-next').click();
              }
              await assertLayout(page, `${label} step=${step}`);
              panels++;
            }
          }
        }
      }
      await page.setViewportSize({ width: 320, height: 1000 });
      for (const role of ['worker', 'reviewer', 'explorer']) {
        await fresh(route);
        await setLarger(page, true);
        await page.locator(`[name="role"][value="${role}"]`).check();
        for (const step of [1, 2]) {
          await page.locator('#guide-next').click();
          await assertLayout(
            page,
            `${lang} 200% + larger ${role} step=${step}`
          );
          panels++;
        }
      }
      await fresh(route);
      await setLarger(page, true);
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
        if (step === 1) {
          await page.locator('[name="role"][value="buyer"]').check();
          await page.locator('#guide-next').click();
        }
        if (step === 2) {
          await page.locator('[data-preset="research"]').click();
          await page.locator('#guide-next').click();
        }
        await assertLayout(page, `${lang} increased text spacing step=${step}`);
        panels++;
      }
      await session.send('Page.setFontSizes', { fontSizes: { standard: 16 } });
      await fresh(route);
      const jump = page.locator('.begin-guide');
      assert.equal(await jump.isVisible(), true);
      assert.equal(await jump.getAttribute('href'), '#guide');
      await jump.focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page
          .locator('[data-step="0"] h2')
          .evaluate((element) => element === document.activeElement),
        true
      );
      assert.ok(
        await page.locator('[data-step="0"] h2').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= innerHeight;
        })
      );
      await page.locator('[name="role"][value="buyer"]').focus();
      const ring = await page
        .locator('[name="role"][value="buyer"]')
        .evaluate((element) => ({
          outline: getComputedStyle(element).outlineColor,
          background: getComputedStyle(element.closest('.choice'))
            .backgroundColor,
          style: getComputedStyle(element).outlineStyle,
        }));
      assert.equal(ring.style, 'solid');
      assert.ok(
        contrast(ring.outline, ring.background) >= 3,
        `${lang} focus indicator contrast`
      );
      await a11y('onboarding-visual-' + lang);
      await page.keyboard.press('Space');
      await page.locator('#guide-next').click();
      await page
        .locator('#start-goal')
        .fill('A detailed public research comparison. '.repeat(40));
      await page.locator('#guide-next').click();
      await page.emulateMedia({ media: 'print' });
      const print = await page.locator('#goal-summary').evaluate((element) => ({
        color: getComputedStyle(element).color,
        maxHeight: getComputedStyle(element).maxHeight,
        overflow: getComputedStyle(element).overflow,
        scroll: element.scrollHeight,
        client: element.clientHeight,
      }));
      assert.equal(print.color, 'rgb(0, 0, 0)');
      assert.equal(print.maxHeight, 'none');
      assert.equal(print.overflow, 'visible');
      assert.ok(print.scroll <= print.client + 1);
      assert.equal(await page.locator('#planner-handoff').isVisible(), false);
      await page.emulateMedia({ media: 'screen' });
    }
    checks.push(
      `onboarding: ${panels} EN/FR panels at 320/768/1440px, browser font preferences, 200% text, larger text and custom spacing`
    );
    checks.push(
      'onboarding: contained headers, 44px controls, keyboard mobile guide link and contrasting focus indicators'
    );
    checks.push(
      'onboarding: complete printable brief with black text and no clipped scroll region'
    );
  } finally {
    await page.emulateMedia({ media: 'screen' });
    await session.send('Page.setFontSizes', { fontSizes: { standard: 16 } });
    await session.detach();
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
}
