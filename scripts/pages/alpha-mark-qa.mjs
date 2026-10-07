import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function verifyAlphaMark({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  await page.goto(url + 'experiments/alpha-agi-mark/', {
    waitUntil: 'networkidle',
  });
  assert.equal(await page.locator('#mark-type option').count(), 10);
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /Scope.*required/
  );
  await page
    .getByLabel('Scope and measurable acceptance detail')
    .fill(
      'Reproduce every public source total with a tolerance of 0.001 and show units.'
    );
  await page
    .getByLabel('Approved source URLs')
    .fill('https://example.org/public-data');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(await page.locator('#mark-candidate').innerText(), '8');
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /Preparation incomplete/
  );
  assert.equal(
    await page.locator('[data-mark-download="plan"]').isDisabled(),
    false
  );
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );
  assert.equal(
    JSON.parse(await page.locator('#mark-json').textContent()).proposal,
    null
  );
  const incompleteDownload = page.waitForEvent('download');
  await page.locator('[data-mark-download="plan"]').click();
  const incomplete = await incompleteDownload;
  assert.equal(
    JSON.parse(fs.readFileSync(await incomplete.path(), 'utf8')).proposal,
    null
  );
  for (const name of ['authorityPlanned', 'inputsPlanned', 'reviewPlanned'])
    await page.locator(`[name="${name}"]`).check();
  assert.equal(await page.locator('#alpha-mark-result').isVisible(), false);
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    false
  );
  const initial = JSON.parse(await page.locator('#mark-json').textContent());
  for (const kind of ['plan', 'proposal', 'task']) {
    const wait = page.waitForEvent('download');
    await page.locator(`[data-mark-download="${kind}"]`).focus();
    await page.keyboard.press('Enter');
    const download = await wait;
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(
      saved,
      kind === 'task'
        ? initial.proposal.task
        : kind === 'proposal'
        ? initial.proposal
        : initial
    );
  }
  await page.getByLabel('Workers', { exact: true }).fill('10000');
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(await page.locator('#mark-candidate').innerText(), '8');
  await page.getByLabel('Daily reward budget (USDC)').fill('1499.999999');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(await page.locator('#mark-candidate').innerText(), '0');
  assert.match(
    await page.locator('#mark-bottleneck').innerText(),
    /reward budget/
  );
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /No complete job fits/
  );
  for (const kind of ['proposal', 'task'])
    assert.equal(
      await page.locator(`[data-mark-download="${kind}"]`).isDisabled(),
      true
    );
  assert.equal(
    await page.locator('[data-mark-download="plan"]').isDisabled(),
    false
  );
  assert.equal(
    JSON.parse(await page.locator('#mark-json').textContent()).proposal,
    null
  );
  await page.getByLabel('Daily reward budget (USDC)').fill('1000001');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /Daily reward budget/
  );
  assert.equal(
    await page.locator('[data-mark-download="plan"]').isDisabled(),
    true
  );
  await page.getByLabel('Daily reward budget (USDC)').fill('15000');
  await page.getByLabel('Minutes per reviewer / day').fill('45');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(await page.locator('#mark-candidate').innerText(), '2');
  await page.getByLabel('Minutes per reviewer / day').fill('120');
  await page
    .getByLabel('Objective', { exact: true })
    .fill('<img src=x onerror=alert(1)> Buyer objective');
  await page
    .getByLabel('Work category', { exact: true })
    .selectOption('feature');
  assert.equal(
    await page.getByLabel('Objective', { exact: true }).inputValue(),
    '<img src=x onerror=alert(1)> Buyer objective'
  );
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.equal(await page.locator('#mark-json img').count(), 0);
  await page
    .getByRole('button', { name: "Use category's suggested objective" })
    .click();
  assert.equal(await page.locator('#alpha-mark-result').isVisible(), false);
  await page
    .getByLabel('Approved source URLs')
    .fill('https://user:secret@example.org');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /without credentials/
  );
  assert.equal(
    await page.locator('[data-mark-download="plan"]').isDisabled(),
    true
  );
  await page
    .getByLabel('Approved source URLs')
    .fill('https://example.org/public-data');
  await page.getByLabel('Workers', { exact: true }).fill('8');
  await page
    .getByLabel('Work category', { exact: true })
    .selectOption('science');
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  await page.locator('[name="reviewPlanned"]').uncheck();
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );
  await page.locator('[name="reviewPlanned"]').check();
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      `Alpha Mark overflow at ${width}px`
    );
    if ([390, 1440].includes(width)) {
      await a11y(`alpha-mark-${width}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(artifacts, `alpha-mark-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Approved source URLs').inputValue(), '');
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Load an example mission' }).click();
  assert.equal(
    await page.getByLabel('Work category', { exact: true }).inputValue(),
    'docs'
  );
  assert.match(
    await page
      .getByLabel('Scope and measurable acceptance detail')
      .inputValue(),
    /disposable local environment/
  );
  await page.getByRole('button', { name: 'Calculate mission draft' }).click();
  assert.match(
    await page.locator('#alpha-mark-status').innerText(),
    /Preparation incomplete/
  );
  assert.equal(
    await page.locator('[data-mark-download="task"]').isDisabled(),
    true
  );

  const browser = context.browser();
  const offline = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await offline.newPage();
  await fallback.goto(url + 'experiments/alpha-agi-mark/');
  assert.match(
    await fallback.locator('noscript').innerText(),
    /needs JavaScript/
  );
  assert.equal(
    await fallback
      .getByRole('button', { name: 'Calculate mission draft' })
      .isDisabled(),
    true
  );
  assert.ok(
    await fallback
      .getByRole('link', { name: 'Guided tour and original diagrams' })
      .isVisible()
  );
  await offline.close();
  checks.push(
    'Alpha Mark: exact USDC arithmetic, complete per-reviewer assignments, prerequisite and zero-capacity export gating, compatible downloads, stale-state invalidation, input injection, keyboard activation, 5 widths, WCAG A/AA and no-JavaScript fallback'
  );
}
