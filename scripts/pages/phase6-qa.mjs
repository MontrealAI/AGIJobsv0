import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function verifyPhase6({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  await page.goto(url + 'experiments/phase6/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('5 configured domains loaded')
  );
  assert.equal(await page.locator('#planning-domains fieldset').count(), 5);
  assert.equal(await page.locator('#domain-grid .domain-card').count(), 5);
  assert.equal(await page.locator('#calldata-grid .domain-card').count(), 31);
  assert.equal(await page.locator('#mermaid-original svg').count(), 1);
  assert.equal(await page.locator('#mermaid-diagram svg').count(), 1);
  assert.match(
    await page.locator('#original-source').textContent(),
    /Domains -->\|events\| Subgraph/
  );
  assert.match(await page.locator('#dynamic-source').textContent(), /Domain4/);
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.equal(await page.locator('#wave-candidates').innerText(), '8');
  assert.equal(
    await page.locator('[data-wave-download="plan"]').isDisabled(),
    false
  );
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  assert.match(
    await page.locator('#wave-status').innerText(),
    /three operator preparation/
  );
  for (const name of ['authority', 'sources', 'review'])
    await page.locator(`[name="${name}"]`).check();
  assert.equal(await page.locator('#wave-result').isVisible(), false);
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  const plan = JSON.parse(await page.locator('#wave-json').textContent());
  let proposal;
  for (const kind of ['plan', 'proposal', 'task']) {
    const wait = page.waitForEvent('download');
    await page.locator(`[data-wave-download="${kind}"]`).focus();
    await page.keyboard.press('Enter');
    const downloaded = JSON.parse(
      fs.readFileSync(await (await wait).path(), 'utf8')
    );
    if (kind === 'plan') assert.deepEqual(downloaded, plan);
    if (kind === 'proposal') {
      proposal = downloaded;
      assert.equal(downloaded.authorization.execute, false);
      assert.equal(downloaded.phase6.domain, 'finance');
    }
    if (kind === 'task') assert.deepEqual(downloaded, proposal.task);
  }
  await page.getByLabel('Planning state · finance').selectOption('paused');
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.match(
    await page.locator('#wave-status').innerText(),
    /candidate slot/
  );
  assert.equal(
    JSON.parse(await page.locator('#wave-json').textContent()).domains[0]
      .candidateJobs,
    0
  );
  await page.getByLabel('Example task domain').selectOption('climate');
  await page.getByLabel('Execution route').selectOption('work');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    false
  );
  await page.getByLabel('Proposed reward budget (USDC)').fill('99.999999');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.equal(await page.locator('#wave-candidates').innerText(), '0');
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  await page.getByLabel('Proposed reward budget (USDC)').fill('1000');
  await page.getByLabel('Independent reviewers', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.equal(await page.locator('#wave-candidates').innerText(), '0');
  await page.getByLabel('Independent reviewers', { exact: true }).fill('2');
  await page.getByLabel('Assigned workers · finance').fill('-1');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.match(await page.locator('#wave-status').innerText(), /whole number/);
  assert.equal(
    await page.locator('[data-wave-download="plan"]').isDisabled(),
    true
  );
  await page.getByLabel('Assigned workers · finance').fill('4');
  await page.getByLabel('Worker profile name').fill('<img src=x>');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  assert.match(
    await page.locator('#wave-status').innerText(),
    /Worker profile/
  );
  assert.equal(await page.locator('#wave-status img').count(), 0);
  await page.getByLabel('Worker profile name').fill('research');
  await page.getByRole('button', { name: 'Calculate dispatch draft' }).click();
  for (const panel of await page.locator('#snapshot > details').all()) {
    await panel.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await panel.getAttribute('open'), '');
  }
  await a11y('phase6-expanded');
  for (const panel of await page.locator('#snapshot > details').all()) {
    await panel.locator('summary').focus();
    await page.keyboard.press('Enter');
  }
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      `Phase 6 overflow at ${width}px`
    );
    if ([390, 1440].includes(width)) {
      await a11y(`phase6-${width}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(artifacts, `phase6-${width}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(artifacts, `phase6-${width}-viewport.png`),
      });
      if (width === 1440) {
        await page.locator('#planner').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(artifacts, 'phase6-planner-viewport.png'),
        });
      }
    }
  }
  await page
    .getByRole('button', { name: 'Reload configuration preview' })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('5 configured domains loaded')
  );
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  assert.equal(await page.locator('#wave-result').isVisible(), false);
  assert.equal(await page.locator('#mermaid-original svg').count(), 1);
  assert.equal(await page.locator('#mermaid-diagram svg').count(), 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[name="authority"]').isChecked(), false);
  assert.equal(
    await page.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  const brokenContext = await context.browser().newContext();
  const broken = await brokenContext.newPage();
  await broken.goto(url + 'experiments/phase6/', { waitUntil: 'networkidle' });
  await broken
    .getByRole('button', { name: 'Calculate dispatch draft' })
    .click();
  assert.equal(
    await broken.locator('[data-wave-download="plan"]').isDisabled(),
    false
  );
  await broken.route('**/config/domains.phase6.json', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.domains[0].operations.maxActiveJobs = 1.5;
    await route.fulfill({ response, json: config });
  });
  await broken
    .getByRole('button', { name: 'Reload configuration preview' })
    .click();
  await broken.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('Preview unavailable')
  );
  assert.match(
    await broken.locator('#preview-status').innerText(),
    /safe integer/
  );
  assert.equal(await broken.locator('#snapshot').isVisible(), false);
  assert.equal(
    await broken.locator('[data-wave-download="plan"]').isDisabled(),
    true
  );
  assert.equal(
    await broken
      .getByRole('button', { name: 'Calculate dispatch draft' })
      .isDisabled(),
    true
  );
  await broken.unroute('**/config/domains.phase6.json');
  await broken.route('**/config/domains.phase6.json', async (route) => {
    const response = await route.fetch();
    const text = await response.text();
    await route.fulfill({
      response,
      body: text.replace('"scenario":', '"scenario":{},"scenario":'),
    });
  });
  await broken
    .getByRole('button', { name: 'Reload configuration preview' })
    .click();
  await broken.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('Preview unavailable')
  );
  assert.match(
    await broken.locator('#preview-status').innerText(),
    /duplicate/i
  );
  await broken.unroute('**/config/domains.phase6.json');
  await broken
    .getByRole('button', { name: 'Reload configuration preview' })
    .click();
  await broken.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('5 configured domains loaded')
  );
  assert.equal(
    await broken
      .getByRole('button', { name: 'Calculate dispatch draft' })
      .isDisabled(),
    false
  );
  assert.equal(
    await broken.locator('[data-wave-download="plan"]').isDisabled(),
    true
  );
  await broken.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    })
  );
  await broken
    .getByRole('button', { name: 'Copy configured map source' })
    .click();
  assert.match(
    await broken.locator('#preview-status').innerText(),
    /Clipboard unavailable/
  );
  await brokenContext.close();
  const variantContext = await context.browser().newContext();
  const variantPage = await variantContext.newPage();
  const variantErrors = [];
  variantPage.on('pageerror', (error) => variantErrors.push(error.message));
  let variantMode = 'lifecycles';
  await variantPage.route('**/config/domains.phase6.json', async (route) => {
    const response = await route.fetch();
    const cfg = await response.json();
    if (variantMode === 'minimal') {
      const domain = cfg.domains[0];
      await route.fulfill({
        response,
        json: {
          global: { manifestURI: cfg.global.manifestURI },
          domains: [
            {
              slug: domain.slug,
              name: domain.name,
              manifestURI: domain.manifestURI,
              validationModule: domain.validationModule,
              subgraph: domain.subgraph,
            },
          ],
        },
      });
      return;
    }
    cfg.domains[0].lifecycle = 'sunset';
    cfg.domains[0].sunsetPlan = {
      reason: 'Retire after independent review.',
      handoffDomains: ['health'],
    };
    cfg.domains[1].lifecycle = 'experimental';
    cfg.domains[1].active = true;
    for (const domain of cfg.domains) {
      domain.telemetry.resilienceBps = 10000;
      domain.telemetry.automationBps = 10000;
    }
    delete cfg.domains[2].telemetry;
    delete cfg.domains[3].infrastructureControl;
    delete cfg.global.guards;
    await route.fulfill({ response, json: cfg });
  });
  await variantPage.goto(url + 'experiments/phase6/', {
    waitUntil: 'networkidle',
  });
  await variantPage.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('5 configured domains loaded')
  );
  for (const slug of ['finance', 'health']) {
    assert.equal(
      await variantPage.getByLabel('Planning state · ' + slug).isDisabled(),
      true
    );
    assert.equal(
      await variantPage.getByLabel('Planning state · ' + slug).inputValue(),
      'paused'
    );
  }
  await variantPage
    .getByRole('button', { name: 'Calculate dispatch draft' })
    .click();
  const variantPlan = JSON.parse(
    await variantPage.locator('#wave-json').textContent()
  );
  assert.deepEqual(
    variantPlan.domains.slice(0, 2).map((domain) => domain.candidateJobs),
    [0, 0]
  );
  const labels = await variantPage
    .locator('#calldata-grid h3')
    .allTextContents();
  assert.deepEqual(
    labels.filter((label) => label.includes('(finance)')),
    ['removeDomain(finance)']
  );
  assert.ok(!labels.includes('setDomainTelemetry(logistics)'));
  assert.ok(!labels.includes('setDomainInfrastructure(climate)'));
  assert.ok(!labels.includes('setGlobalGuards(GlobalGuards)'));
  const metrics = await variantPage.locator('#global-summary').textContent();
  assert.match(metrics, /Resilience floor coverage: 80.0%/);
  assert.match(metrics, /Automation floor coverage: 80.0%/);
  assert.match(metrics, /1 missing/);
  variantMode = 'minimal';
  await variantPage
    .getByRole('button', { name: 'Reload configuration preview' })
    .click();
  await variantPage.waitForFunction(() =>
    document
      .querySelector('#preview-status')
      .textContent.includes('1 configured domains loaded')
  );
  assert.deepEqual(
    await variantPage.locator('#calldata-grid h3').allTextContents(),
    [
      'setGlobalConfig(GlobalConfig)',
      'registerDomain(finance)',
      'updateDomain(finance)',
    ]
  );
  assert.equal(
    await variantPage.getByLabel('Planning state · finance').isDisabled(),
    true
  );
  await variantPage
    .getByRole('button', { name: 'Calculate dispatch draft' })
    .click();
  assert.equal(await variantPage.locator('#wave-candidates').innerText(), '0');
  assert.equal(
    await variantPage.locator('[data-wave-download="task"]').isDisabled(),
    true
  );
  assert.doesNotMatch(
    await variantPage.locator('#snapshot').textContent(),
    /undefined|floor coverage: 100/
  );
  assert.match(
    await variantPage.locator('#domain-grid').textContent(),
    /180s sync cadence/
  );
  assert.deepEqual(variantErrors, []);
  await variantContext.close();
  const offline = await context
    .browser()
    .newContext({ javaScriptEnabled: false });
  const fallback = await offline.newPage();
  await fallback.goto(url + 'experiments/phase6/');
  assert.equal(
    await fallback
      .getByRole('button', { name: 'Calculate dispatch draft' })
      .isDisabled(),
    true
  );
  assert.match(
    await fallback.locator('noscript').innerText(),
    /JavaScript is disabled/
  );
  assert.match(
    await fallback.locator('#mermaid-original').innerText(),
    /Subgraph/
  );
  assert.ok(
    await fallback
      .getByRole('link', { name: 'Sources & original guides' })
      .isVisible()
  );
  await offline.close();
  checks.push(
    'Phase 6: five-domain fair allocation, zero-reviewer and exact-USDC bounds, pauses, prepared synthetic tasks, exact downloads, stale/reloaded drafts, two preserved maps, minimal/experimental/sunset/missing-telemetry configuration variants, fail-closed invalid configuration and retry, clipboard recovery, keyboard, 5 widths, WCAG A/AA and no-JavaScript fallback'
  );
}
