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
  assert(summary.metrics.alphaCaptureVelocity > 0, 'Alpha capture velocity should be positive');
  assert.equal(
    summary.metrics.ownerSovereigntyLag,
    scenario.owner.emergency.responseMinutes,
    'Owner sovereignty lag mirrors emergency response window',
  );
  assert(summary.metrics.governanceDeterminism >= 0.6, 'Governance determinism should exceed 60%');
  assert(summary.knowledgeBase.opportunities.length === scenario.opportunities.length);
  assert(summary.executionLedger.every((entry) => entry.checksum.length === 64), 'Checksums should be SHA-256 hex values');
  assert(summary.ownerPlaybook.includes('Governance Safe'));
  assert.equal(summary.phaseMatrix.length, 6);
  assert(summary.mermaidPhaseFlow.includes('graph LR'), 'Phase flow diagram should be generated');

  await writeReports(summary, reportsDir);

  const summaryJson = JSON.parse(await fs.readFile(path.join(reportsDir, 'summary.json'), 'utf8'));
  assert.equal(summaryJson.totalOpportunities, scenario.opportunities.length);
  assert(summaryJson.automationCoverage > 0.85);
  assert(summaryJson.alphaCaptureVelocity > 0);

  const ownerControl = JSON.parse(await fs.readFile(path.join(reportsDir, 'owner-control.json'), 'utf8'));
  assert(ownerControl.controls.some((control: { parameter: string }) => control.parameter === 'globalPause'));

  const phaseMatrix = JSON.parse(await fs.readFile(path.join(reportsDir, 'phase-matrix.json'), 'utf8'));
  assert(Array.isArray(phaseMatrix));
  assert.equal(phaseMatrix.length, 6);
  const phaseFlow = await fs.readFile(path.join(reportsDir, 'phase-flow.mmd'), 'utf8');
  assert(phaseFlow.includes('Alpha Velocity'), 'Phase flow mermaid should annotate alpha velocity');

  await fs.rm(reportsDir, { recursive: true, force: true });
});
