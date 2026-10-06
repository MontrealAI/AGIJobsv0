import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  loadScenarioFromFile,
  runScenario,
  writeReports,
} from '../scripts/runDemo';

const scenarioPath = path.join(__dirname, '..', 'scenario', 'baseline.json');
const reportsDir = path.join(__dirname, '..', 'reports-test');

test('meta-agentic scenario produces reproducible projected metrics and preserved diagrams', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);

  assert.equal(summary.assignments.length, scenario.opportunities.length);
  assert(
    summary.metrics.roiMultiplier > 6,
    'Reference scenario projection remains reproducible; it is not realized value'
  );
  assert(
    summary.metrics.automationCoverage > 0.85,
    'Automation coverage must exceed 85%'
  );
  assert(
    summary.metrics.validatorConfidence > 0.95,
    'Validator confidence should be above 95%'
  );
  assert(
    summary.metrics.sovereignControlScore >= 0.7,
    'Owner control score should stay within sovereign range'
  );
  assert(
    summary.metrics.antifragilityIndex >= 0.8,
    'Antifragility must be ≥0.8 to learn from shocks'
  );
  assert(
    summary.metrics.ownerCommandCoverage >= 0.75,
    'Owner command coverage must be ≥75%'
  );
  assert(
    summary.metrics.alphaCaptureVelocity > 0,
    'Alpha capture velocity should be positive'
  );
  assert.equal(
    summary.metrics.ownerSovereigntyLag,
    scenario.owner.emergency.responseMinutes,
    'Owner sovereignty lag mirrors emergency response window'
  );
  assert(
    summary.metrics.governanceDeterminism >= 0.6,
    'Governance determinism should exceed 60%'
  );
  assert(
    summary.knowledgeBase.opportunities.length === scenario.opportunities.length
  );
  assert(
    summary.executionLedger.every((entry) => entry.checksum.length === 64),
    'Checksums should be SHA-256 hex values'
  );
  assert(summary.ownerPlaybook.includes('Governance Safe'));
  assert.equal(summary.phaseMatrix.length, 6);
  assert(
    summary.mermaidPhaseFlow.includes('graph LR'),
    'Phase flow diagram should be generated'
  );

  await writeReports(summary, reportsDir);

  const summaryJson = JSON.parse(
    await fs.readFile(path.join(reportsDir, 'summary.json'), 'utf8')
  );
  assert.equal(summaryJson.totalOpportunities, scenario.opportunities.length);
  assert(summaryJson.automationCoverage > 0.85);
  assert(summaryJson.alphaCaptureVelocity > 0);

  const ownerControl = JSON.parse(
    await fs.readFile(path.join(reportsDir, 'owner-control.json'), 'utf8')
  );
  assert(
    ownerControl.controls.some(
      (control: { parameter: string }) => control.parameter === 'globalPause'
    )
  );

  const phaseMatrix = JSON.parse(
    await fs.readFile(path.join(reportsDir, 'phase-matrix.json'), 'utf8')
  );
  assert(Array.isArray(phaseMatrix));
  assert.equal(phaseMatrix.length, 6);
  const phaseFlow = await fs.readFile(
    path.join(reportsDir, 'phase-flow.mmd'),
    'utf8'
  );
  assert(
    phaseFlow.includes('Alpha Velocity'),
    'Phase flow mermaid should annotate alpha velocity'
  );

  await fs.rm(reportsDir, { recursive: true, force: true });
});

test('validator quorum is independent of worker count and cannot be silently underfilled', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  scenario.opportunities[0].requiredAgents = [scenario.agents[0].id];
  scenario.opportunities[0].validatorQuorum = 2;
  const summary = await runScenario(scenario);
  assert.equal(summary.assignments[0].validators.length, 2);
  scenario.opportunities[0].validatorQuorum = scenario.validators.length + 1;
  await assert.rejects(runScenario(scenario), /Insufficient validators/);
});

test('invalid identities and owner thresholds are rejected before producing projections', async () => {
  for (const mutate of [
    (s: Awaited<ReturnType<typeof loadScenarioFromFile>>) => {
      s.agents[1].id = s.agents[0].id;
    },
    (s: Awaited<ReturnType<typeof loadScenarioFromFile>>) => {
      s.opportunities[0].requiredAgents = ['unknown'];
    },
    (s: Awaited<ReturnType<typeof loadScenarioFromFile>>) => {
      s.opportunities[0].modules = ['unknown'];
    },
    (s: Awaited<ReturnType<typeof loadScenarioFromFile>>) => {
      s.owner.threshold = s.owner.members + 1;
    },
  ]) {
    const scenario = await loadScenarioFromFile(scenarioPath);
    mutate(scenario);
    await assert.rejects(runScenario(scenario));
  }
});

test('large automation boosts stay bounded and invalid or overflowing inputs cannot generate misleading money', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario, { automationBoost: 100 });
  assert(
    summary.assignments.every((a) => a.automation <= 1 && a.expectedCost > 0)
  );
  assert.equal(summary.metrics.automationCoverage, 1);
  for (const automationBoost of [NaN, Infinity, 101, -1])
    await assert.rejects(runScenario(scenario, { automationBoost }));
  scenario.opportunities[0].value = Number.MAX_VALUE;
  await assert.rejects(runScenario(scenario));
});
