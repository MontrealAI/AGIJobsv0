import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => console.log(`console:${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`pageerror:${err.name}:${err.message}:${err.stack}`));
  await page.goto('/');
  await page.waitForSelector('[data-test-id="stat-card"]');
});

test('renders strategic metrics from manifest schema', async ({ page }) => {
  const monthlyFlow = page.locator('[data-test-id="stat-card"][data-stat-key="monthly-flow"]');
  await expect(monthlyFlow).toContainText('Monthly value flow');
  await expect(monthlyFlow).toContainText('$688.00B');

  const cadence = page.locator('[data-test-id="stat-card"][data-stat-key="improvement-cadence"]');
  await expect(cadence).toContainText('Improvement cadence');
  await expect(cadence).toContainText('2.00 h');
});

test('renders sentinel lattice and capital streams from manifest', async ({ page }) => {
  const sentinelCards = page.locator('[data-test-id="sentinel-card"]');
  await expect(sentinelCards).toHaveCount(3);
  await expect(sentinelCards.first()).toContainText('Solar Shield Guardian');

  const streamCards = page.locator('[data-test-id="stream-card"]');
  await expect(streamCards).toHaveCount(3);
  await expect(streamCards.first()).toContainText('Climate Stabilization Endowment');
});

test('renders mermaid diagram once manifest loads', async ({ page }) => {
  const diagram = page.locator('#mermaid-diagram');
  const status = await diagram.getAttribute('data-rendered');
  expect(['true', 'fallback']).toContain(status);
  if (status === 'true') {
    await expect(diagram.locator('svg')).toContainText('Guardian Council');
  } else {
    await expect(diagram).toContainText('Guardian Council');
  }
});

test('shows coverage alert and runbook enhancements', async ({ page }) => {
  const alerts = page.locator('[data-test-id="alert"]');
  await expect(alerts.first()).toContainText('Coverage shortfall detected');

  const tooltipButton = page.locator('[data-test-id="runbook-step"] .info-button').first();
  await tooltipButton.hover();
  const tooltip = page.locator('[data-test-id="runbook-step"] .tooltip').first();
  await expect(tooltip).toContainText('deterministic installs');

  const downloadLink = page.locator('[data-test-id="runbook-download"]').first();
  await expect(downloadLink).toHaveAttribute('href', './output/phase8-orchestration-report.txt');
});

test('has no detectable accessibility violations', async ({ page }) => {
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  const results = await axe.analyze();
  expect(results.violations).toEqual([]);
});
