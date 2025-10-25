import { test, expect } from '@playwright/test';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';

test.describe('Phase 8 dashboard happy path', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log(`console:${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`pageerror:${err.name}:${err.message}:${err.stack}`));
    await page.goto('/');
    await page.waitForSelector('[data-test-id="stat-card"]');
  });

  test('renders strategic metrics from manifest schema', async ({ page }) => {
    const dominance = page.locator('[data-test-id="stat-card"][data-stat-key="dominance-score"]');
    await expect(dominance).toContainText('Universal dominance score');
    await expect(dominance).toContainText('97.1 / 100');

    const monthlyFlow = page.locator('[data-test-id="stat-card"][data-stat-key="monthly-flow"]');
    await expect(monthlyFlow).toContainText('Monthly value flow');
    await expect(monthlyFlow).toContainText('$688.00B');

    const cadence = page.locator('[data-test-id="stat-card"][data-stat-key="improvement-cadence"]');
    await expect(cadence).toContainText('Improvement cadence');
    await expect(cadence).toContainText('2.00 h');

    const funding = page.locator('[data-test-id="stat-card"][data-stat-key="capital-coverage"]');
    await expect(funding).toContainText('Dominions funded');
    await expect(funding).toContainText('100.0%');
    await expect(funding).toContainText('$720.00B/yr');
  });

  test('renders sentinel lattice and capital streams from manifest', async ({ page }) => {
    const sentinelCards = page.locator('[data-test-id="sentinel-card"]');
    await expect(sentinelCards).toHaveCount(3);
    await expect(sentinelCards.first()).toContainText('Solar Shield Guardian');

    const streamCards = page.locator('[data-test-id="stream-card"]');
    await expect(streamCards).toHaveCount(3);
    await expect(streamCards.first()).toContainText('Climate Stabilization Endowment');

    const financeDomain = page.locator('[data-domain-slug="planetary-finance"]');
    await expect(financeDomain).toContainText('Funding $890.00B/yr');
    const financeStreams = financeDomain.locator('[data-test-id="domain-stream"]');
    await expect(financeStreams).toContainText('Planetary Resilience Fund');
  });

  test('surfaces emergency overrides pack', async ({ page }) => {
    const summary = page.locator('[data-test-id="emergency-summary"]');
    await expect(summary).toContainText('Circuit breaker ready');
    const download = page.locator('[data-test-id="emergency-download"]');
    await expect(download).toHaveAttribute('href', './output/phase8-emergency-overrides.json');
    const cards = page.locator('[data-test-id="emergency-card"]');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Pause all core modules');
    await expect(cards.nth(1)).toContainText('Restore core modules');

    const firstCalldata = cards.first().locator('[data-test-id="emergency-calldata"]');
    await expect(firstCalldata).toContainText('…');
    const toggle = cards.first().locator('[data-test-id="toggle-calldata"]');
    await toggle.click();
    await expect(firstCalldata).not.toContainText('…');
    await expect(firstCalldata).toHaveText(/^0x[0-9a-f]+$/i);
    await toggle.click();
    await expect(firstCalldata).toContainText('…');
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

  test('shows coverage alert, runbook guidance, and copy feedback', async ({ page }) => {
    const alerts = page.locator('[data-test-id="alert"]');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toContainText('Universal dominance secured');

    const tooltipButton = page.locator('[data-test-id="runbook-step"] .info-button').first();
    await tooltipButton.click();
    const tooltip = page.locator('[data-test-id="runbook-step"] .tooltip').first();
    await expect(tooltip).toHaveAttribute('data-visible', 'true');
    await expect(tooltip).toContainText('deterministic installs');

    const copyButton = page.locator('[data-test-id="copy-command"]').first();
    await copyButton.click();
    await expect(copyButton).toHaveAttribute('data-copy-state', 'copied');
    const feedback = page.locator('[data-test-id="copy-feedback"]').first();
    await expect(feedback).toContainText('Copied to clipboard');

    const downloadLink = page.locator('[data-test-id="runbook-download"]').first();
    await expect(downloadLink).toHaveAttribute('href', './output/phase8-orchestration-report.txt');

    const directivesLink = page.locator('[data-runbook-key="brief"] [data-test-id="runbook-download"]');
    await expect(directivesLink).toHaveAttribute('href', './output/phase8-governance-directives.md');

    const checklistLink = page.locator('[data-runbook-key="checklist"] [data-test-id="runbook-download"]');
    await expect(checklistLink).toHaveAttribute('href', './output/phase8-governance-checklist.md');

    const emergencyLink = page.locator('[data-runbook-key="emergency"] [data-test-id="runbook-download"]');
    await expect(emergencyLink).toHaveAttribute('href', './output/phase8-emergency-overrides.json');

    const scorecardLink = page.locator('[data-runbook-key="scorecard"] [data-test-id="runbook-download"]');
    await expect(scorecardLink).toHaveAttribute('href', './output/phase8-dominance-scorecard.json');
  });

  test('allows operators to swap manifests via upload', async ({ page }) => {
    const fixturePath = path.join(__dirname, 'fixtures', 'custom-manifest.json');
    await page.setInputFiles('[data-test-id="manifest-upload-input"]', fixturePath);

    const status = page.locator('[data-manifest-status]');
    await expect(status).toContainText('uploaded file');
    await expect(status).toContainText('custom-manifest.json');

    const monthlyFlow = page.locator('[data-test-id="stat-card"][data-stat-key="monthly-flow"]');
    await expect(monthlyFlow).toContainText('$2.00M');

    const feedback = page.locator('[data-manifest-feedback]');
    await expect(feedback).toContainText('Uploaded manifest applied to dashboard.');
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});

test('shows troubleshooting guidance when manifest fails to load', async ({ page }) => {
  await page.route('**/config/universal.value.manifest.json', (route) => {
    return route.fulfill({ status: 404, body: 'missing manifest' });
  });
  await page.goto('/');

  const errorPanel = page.locator('[data-test-id="error-panel"]');
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel).toContainText('Manifest unavailable');
  await expect(errorPanel).toContainText('Troubleshooting steps');
  await expect(errorPanel.locator('ol li')).toHaveCount(3);

  await expect(page.locator('main')).toBeHidden();
});
