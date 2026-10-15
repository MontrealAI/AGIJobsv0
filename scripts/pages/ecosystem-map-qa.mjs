import assert from 'node:assert/strict';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

export async function verifyEcosystemMap({ page, artifacts, checks }) {
  const original = page.viewportSize();
  const map = page.locator('#ecosystem-map');
  const links = map.locator('.ecosystem-card a');
  assert.deepEqual(
    await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href'))
    ),
    [
      'https://montrealai.github.io/AGI-Alpha-Agent-v0/',
      '#explore',
      'https://montrealai.github.io/AGIJobManager/',
      'https://montrealai.github.io/AGI-Fleet-Linux/start.html',
    ]
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const scale of [1, 2]) {
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = `${100 * scale}%`;
      }, scale);
      assert.equal(
        await map.evaluate(
          (element) => element.scrollWidth <= element.clientWidth
        ),
        true,
        `${width}px/${scale}: ecosystem reflows`
      );
      for (const link of await links.all()) {
        await link.focus();
        assert.equal(
          await link.evaluate((element) => element === document.activeElement),
          true
        );
        const box = await link.boundingBox();
        assert.ok(
          box.height >= 44 && box.x >= 0 && box.x + box.width <= width,
          `${width}px/${scale}: visible keyboard target`
        );
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    const result = await new AxeBuilder({ page })
      .include('#ecosystem-map')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      result.violations,
      [],
      `${width}px: ecosystem accessibility`
    );
    if ([320, 1440].includes(width))
      await map.screenshot({
        path: path.join(artifacts, `ecosystem-map-${width}.png`),
        animations: 'disabled',
        style: '.site-header, .skip-link { visibility: hidden !important; }',
      });
  }
  await page.setViewportSize(original);
  checks.push(
    'four-project map: exact routes, keyboard, 320–1440 reflow, 200% text and WCAG checks'
  );
}
