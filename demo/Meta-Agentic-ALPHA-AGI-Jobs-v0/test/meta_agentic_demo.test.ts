import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadScenarioFromFile, runScenario, writeReports } from '../scripts/runDemo';

const scenarioPath = path.join(__dirname, '..', 'scenario', 'baseline.json');
const reportsDir = path.join(__dirname, '..', 'reports-test');

test('meta-agentic demo generates unstoppable economic intelligence artefacts', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);

  assert.equal(summary.assignments.length, scenario.opportunities.length);
  assert(summary.metrics.roiMultiplier > 6, 'ROI multiplier should exceed 6x to prove supernormal value');
  assert(summary.metrics.automationCoverage > 0.85, 'Automation coverage must exceed 85%');
  assert(summary.metrics.validatorConfidence > 0.95, 'Validator confidence should be above 95%');
  assert(summary.metrics.sovereignControlScore >= 0.7, 'Owner control score should stay within sovereign range');
  assert(summary.metrics.antifragilityIndex >= 0.8, 'Antifragility must be ≥0.8 to learn from shocks');
  assert(summary.metrics.ownerCommandCoverage >= 0.75, 'Owner command coverage must be ≥75%');
  assert(summary.knowledgeBase.opportunities.length === scenario.opportunities.length);
  assert(summary.executionLedger.every((entry) => entry.checksum.length === 64), 'Checksums should be SHA-256 hex values');
  assert(summary.ownerPlaybook.includes('Governance Safe'));

  await writeReports(summary, reportsDir);

  const summaryJson = JSON.parse(await fs.readFile(path.join(reportsDir, 'summary.json'), 'utf8'));
  assert.equal(summaryJson.totalOpportunities, scenario.opportunities.length);
  assert(summaryJson.automationCoverage > 0.85);

  const ownerControl = JSON.parse(await fs.readFile(path.join(reportsDir, 'owner-control.json'), 'utf8'));
  assert(ownerControl.controls.some((control: { parameter: string }) => control.parameter === 'globalPause'));

  await fs.rm(reportsDir, { recursive: true, force: true });
});
