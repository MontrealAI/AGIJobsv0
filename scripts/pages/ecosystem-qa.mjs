import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { ecosystem } from './ecosystem.mjs';

export async function verifyEcosystem({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const origin = new URL(url).origin;
  const token = ecosystem.token.address;
  const expected = ecosystem.suites.flatMap((suite) =>
    suite.contracts.map((contract) => ({
      name: contract.name,
      address: contract.address,
      href: contract.explorerUrl,
    }))
  );
  const failures = [];
  const completed = [];
  const viewport = page.viewportSize();
  const onConsole = (message) => {
    if (message.type() === 'error') failures.push(message.text());
  };
  const onPageError = (error) => failures.push(error.message);
  const onRequestFailed = (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`);
  const onRequest = (request) => {
    if (
      !request.url().startsWith(origin + '/') &&
      !request.url().startsWith('data:')
    )
      failures.push(`Unexpected external request: ${request.url()}`);
  };
  const onResponse = (response) => {
    if (response.url().startsWith(origin + '/') && response.status() >= 400)
      failures.push(`${response.status()}: ${response.url()}`);
  };
  const observe = (target) => {
    target.on('console', onConsole);
    target.on('pageerror', onPageError);
    target.on('requestfailed', onRequestFailed);
    target.on('request', onRequest);
    target.on('response', onResponse);
  };
  const unobserve = (target) => {
    target.off('console', onConsole);
    target.off('pageerror', onPageError);
    target.off('requestfailed', onRequestFailed);
    target.off('request', onRequest);
    target.off('response', onResponse);
  };
  const checkWidth = async (target, label) => {
    assert.equal(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      ),
      true,
      `${label}: no horizontal overflow`
    );
  };
  const checkContracts = async (target) => {
    assert.deepEqual(
      await target.locator('[data-contract-name]').evaluateAll((entries) =>
        entries.map((entry) => ({
          name: entry.dataset.contractName,
          address: entry.querySelector('code').textContent,
          href: entry.querySelector('a').href,
        }))
      ),
      expected
    );
    assert.equal(
      await target.locator('[data-contract-name]:visible').count(),
      29
    );
    assert.equal(
      await target.locator('#ecosystem-token-address').textContent(),
      token
    );
  };
  let noJS;
  let status = 'failed';
  observe(page);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin,
    });
    for (const route of ['', 'ecosystem/']) {
      await page.goto(url + route, { waitUntil: 'networkidle' });
      const copy = page.getByRole('button', {
        name: 'Copy token address',
        exact: true,
      });
      await copy.waitFor({ state: 'visible' });
      await copy.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () =>
          document.getElementById('copy-status').textContent ===
          'Token address copied to clipboard.'
      );
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        token
      );
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async () => {
              throw new DOMException(
                'Clipboard unavailable in test',
                'NotAllowedError'
              );
            },
          },
        });
      });
      await copy.waitFor({ state: 'visible' });
      await copy.click();
      await page.waitForFunction(
        () =>
          document.getElementById('copy-status').textContent ===
          'Token address selected. Use your keyboard or browser menu to copy.'
      );
      assert.equal(
        await page.evaluate(() => window.getSelection().toString()),
        token
      );
      completed.push(
        `${route || 'home'}: exact token copy and manual selection fallback`
      );
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url + 'ecosystem/', { waitUntil: 'networkidle' });
      await page.screenshot({
        path: path.join(artifacts, `ecosystem-${width}.png`),
        fullPage: true,
      });
      await checkContracts(page);
      await checkWidth(page, `ecosystem ${width}`);
      await a11y(`ecosystem-${width}`);
      await page.locator('.ecosystem-details summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page.locator('.ecosystem-details').getAttribute('open'),
        ''
      );
      await checkWidth(page, `ecosystem ${width} with operator details open`);
      await page.goto(url, { waitUntil: 'networkidle' });
      assert.equal(
        await page.locator('#hero-token-address').textContent(),
        token
      );
      await checkWidth(page, `home with token ${width}`);
      await page.locator('.ecosystem-hero-token').screenshot({
        path: path.join(artifacts, `ecosystem-home-token-${width}.png`),
      });
      completed.push(
        `${width}px: full directory, wrapping and keyboard disclosure`
      );
    }
    noJS = await context.browser().newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 1000 },
    });
    const fallback = await noJS.newPage();
    observe(fallback);
    for (const route of ['', 'ecosystem/']) {
      await fallback.goto(url + route, { waitUntil: 'networkidle' });
      assert.equal(
        await fallback.locator('.ecosystem-copy:visible').count(),
        0
      );
      await checkWidth(fallback, `no-JavaScript ${route || 'home'}`);
      if (route) {
        await checkContracts(fallback);
        for (const id of [
          'together',
          'example',
          'token',
          'contracts',
          'readiness',
        ])
          assert.equal(await fallback.locator(`#${id}`).isVisible(), true);
        await fallback.screenshot({
          path: path.join(artifacts, 'ecosystem-nojs-320.png'),
          fullPage: true,
        });
      } else {
        assert.equal(
          await fallback.locator('#hero-token-address').textContent(),
          token
        );
        assert.equal(
          await fallback.locator('.ecosystem-pair-link').isVisible(),
          true
        );
      }
    }
    const accessibility = await new AxeBuilder({ page: fallback })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    fs.writeFileSync(
      path.join(artifacts, 'accessibility-ecosystem-nojs.json'),
      JSON.stringify(accessibility.violations, null, 2)
    );
    assert.deepEqual(
      accessibility.violations,
      [],
      'ecosystem no-JavaScript accessibility'
    );
    completed.push(
      'no JavaScript: all 29 links, essential content, selectable token and hidden copy controls'
    );
    assert.deepEqual(failures, [], 'ecosystem console and network errors');
    status = 'passed';
    checks.push(...completed.map((check) => `ecosystem: ${check}`));
  } finally {
    if (status !== 'passed')
      await page
        .screenshot({
          path: path.join(artifacts, 'ecosystem-failure.png'),
          fullPage: true,
        })
        .catch(() => {});
    await noJS?.close();
    await context.clearPermissions();
    unobserve(page);
    fs.writeFileSync(
      path.join(artifacts, 'ecosystem-browser-report.json'),
      JSON.stringify(
        { status, contracts: expected.length, completed, failures },
        null,
        2
      )
    );
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: 'networkidle' });
  }
}
