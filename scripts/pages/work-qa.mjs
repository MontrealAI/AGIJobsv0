import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function verifyWorkPlanner({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  await page.goto(url + 'work/', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#work-type option').count(), 10);
  assert.equal(
    await page.locator('[data-work-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Build work order' }).click();
  assert.match(
    await page.locator('#work-status').innerText(),
    /Scope.*required/
  );
  await page
    .getByLabel('Scope and measurable acceptance detail')
    .fill(
      'Compare every approved source, recompute each numerical total and report unknown values.'
    );
  await page
    .getByLabel('Approved source URLs')
    .fill('https://example.org/public-data');
  await page.getByLabel('Proposed reward ceiling (USDC)').fill('0.000001');
  for (const type of await page
    .locator('#work-type option')
    .evaluateAll((items) => items.map((x) => x.value))) {
    await page.getByLabel('Work category', { exact: true }).selectOption(type);
    await page.getByRole('button', { name: 'Build work order' }).click();
    const proposal = JSON.parse(await page.locator('#work-json').textContent());
    assert.equal(proposal.workType, type);
    assert.equal(proposal.commercialProposal.rewardBaseUnits, '1');
    assert.equal(proposal.evidence.productionApproved, false);
  }
  await page
    .getByLabel('Objective', { exact: true })
    .fill('<img src=x onerror=alert(1)>\n# Untrusted input');
  assert.equal(
    await page.locator('[data-work-download="task"]').isDisabled(),
    true
  );
  assert.equal(await page.locator('#work-preview').isVisible(), false);
  await page.getByRole('button', { name: 'Build work order' }).click();
  assert.equal(await page.locator('#work-json img').count(), 0);
  const proposal = JSON.parse(await page.locator('#work-json').textContent());
  for (const kind of ['proposal', 'task', 'handoff']) {
    const wait = page.waitForEvent('download');
    await page.locator(`[data-work-download="${kind}"]`).focus();
    await page.keyboard.press('Enter');
    const download = await wait;
    const bytes = fs.readFileSync(await download.path(), 'utf8');
    if (kind === 'proposal') assert.deepEqual(JSON.parse(bytes), proposal);
    else if (kind === 'task')
      assert.deepEqual(JSON.parse(bytes), proposal.task);
    else assert.match(bytes, /DRAFT\. Owner admission/);
  }
  await page
    .getByLabel('Approved source URLs')
    .fill('https://user:secret@example.org');
  await page.getByRole('button', { name: 'Build work order' }).click();
  assert.equal(
    await page.locator('[data-work-download="task"]').isDisabled(),
    true
  );
  assert.match(
    await page.locator('#work-status').innerText(),
    /without credentials/
  );
  await page
    .getByLabel('Approved source URLs')
    .fill('https://example.org/public-data');
  await page
    .getByLabel('Objective', { exact: true })
    .fill('Reproduce an approved public numerical result.');
  await page.getByRole('button', { name: 'Build work order' }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      `Planner overflow at ${width}`
    );
    await a11y(`work-${width}`);
    if (width === 390 || width === 1440) {
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: path.join(artifacts, `work-${width}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(artifacts, `work-${width}-top.png`),
      });
    }
  }
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Approved source URLs').inputValue(), '');
  assert.equal(
    await page.locator('[data-work-download="task"]').isDisabled(),
    true
  );
  const fallback = await context.browser().newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const nojs = await fallback.newPage();
    await nojs.goto(url + 'work/');
    assert.equal(await nojs.locator('.work-type-grid article').count(), 10);
    assert.equal(
      await nojs.getByRole('button', { name: 'Build work order' }).isDisabled(),
      true
    );
    assert.ok(
      await nojs
        .getByRole('link', { name: 'Execution guide' })
        .getAttribute('href')
    );
  } finally {
    await fallback.close();
  }
  checks.push(
    'work planner: all ten categories, exact money, schema downloads, stale-draft invalidation, injection, keyboard, mobile, accessibility and no-JavaScript guidance'
  );
}
