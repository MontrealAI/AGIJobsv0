import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';
import { loadScenarioFromFile, runScenario } from '../scripts/runDemo';

const scenarioPath = path.join(__dirname, '..', 'scenario', 'baseline.json');

test('economic power simulation produces deterministic metrics', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);

  assert.equal(summary.metrics.totalJobs, scenario.jobs.length);
  assert.equal(summary.assignments.length, scenario.jobs.length);
  assert(summary.metrics.roiMultiplier > 1.0, 'ROI multiplier should exceed 1x');
  assert(summary.metrics.validatorConfidence > 0.9, 'Validator confidence should exceed 90%');
  assert(summary.metrics.paybackHours > 0, 'Payback hours should be positive');
  assert(summary.mermaidFlow.includes('graph TD'), 'Flow mermaid diagram should be rendered');
  assert(summary.mermaidTimeline.includes('gantt'), 'Timeline mermaid diagram should be rendered');
  assert(summary.metrics.stabilityIndex >= 0.65, 'Stability index should be within resilience band');
  assert(summary.metrics.ownerCommandCoverage > 0.2, 'Owner command coverage should be non-trivial');
  assert(summary.metrics.capitalVelocity > 0, 'Capital velocity should be positive');
  assert(summary.metrics.validatorUtilization <= 1, 'Validator utilisation is capped at 100%');
  assert(summary.metrics.treasuryRunwayDays > 0, 'Treasury runway should be positive');

  const ownerParameters = summary.ownerControl.controls.map((control) => control.parameter);
  for (const control of scenario.owner.controls) {
    assert(ownerParameters.includes(control.parameter));
  }

  assert.equal(
    summary.ownerSovereignty.pauseScript,
    scenario.safeguards.pauseScript,
    'Pause script should mirror scenario safeguards',
  );
  assert.equal(
    summary.ownerSovereignty.resumeScript,
    scenario.safeguards.resumeScript,
    'Resume script should mirror scenario safeguards',
  );
  assert.equal(
    summary.ownerSovereignty.circuitBreakers.length,
    scenario.safeguards.circuitBreakers.length,
    'Circuit breaker counts should align',
  );

  assert(summary.expansion.l2Bridges.length > 0, 'Expansion bridges should be populated');
  assert(summary.expansion.deploymentWaves.length > 0, 'Deployment waves should be present');
  assert(summary.mermaidExpansion.includes('graph TD'), 'Expansion mermaid diagram should be rendered');
});

