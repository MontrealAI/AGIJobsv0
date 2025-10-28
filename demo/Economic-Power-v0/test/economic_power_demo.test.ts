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
  assert.equal(
    summary.metrics.ownerCommandCoverage,
    1,
    'Owner command coverage should confirm total command coverage',
  );
  assert(summary.metrics.sovereignControlScore >= 0.9, 'Sovereign control score should confirm custody');
  assert(
    summary.metrics.economicDominanceIndex >= 0.92,
    'Economic dominance index should stay within unstoppable threshold',
  );
  assert.equal(
    summary.metrics.assertionPassRate,
    1,
    'Assertion pass rate should reflect complete pass signal',
  );

  const ownerParameters = summary.ownerControl.controls.map((control) => control.parameter);
  for (const control of scenario.owner.controls) {
    assert(ownerParameters.includes(control.parameter));
  }

  assert.equal(
    summary.ownerCommandPlan.commandCoverage,
    summary.metrics.ownerCommandCoverage,
    'Owner command plan coverage should match computed metric',
  );
  assert(summary.ownerCommandPlan.coverageNarrative.length > 0, 'Coverage narrative should be present');
  assert(summary.ownerCommandMermaid.includes('graph LR'), 'Owner command mermaid graph should render');
  assert.equal(
    summary.treasuryTrajectory.length,
    summary.assignments.length,
    'Treasury trajectory should include one entry per assignment',
  );
  for (const entry of summary.treasuryTrajectory) {
    assert(entry.treasuryAfterJob > 0, 'Treasury levels should remain positive');
    assert(entry.validatorConfidence > 0.9, 'Validator confidence checkpoints should stay high');
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

  assert(summary.assertions.length >= 5, 'Should expose comprehensive assertion set');
  const coverageAssertion = summary.assertions.find(
    (assertion) => assertion.id === 'owner-command-dominance',
  );
  assert(coverageAssertion, 'Coverage assertion should be present');
  assert.equal(
    coverageAssertion.outcome,
    'pass',
    'Coverage assertion should pass once command scripts cover all surfaces',
  );
  const otherAssertions = summary.assertions.filter(
    (assertion) => assertion.id !== 'owner-command-dominance',
  );
  assert(
    otherAssertions.every((assertion) => assertion.outcome === 'pass'),
    'All other assertions should continue to pass',
  );

  for (const assignment of summary.assignments) {
    assert(
      assignment.skillMatch >= 0.5,
      `Assignment ${assignment.jobId} should satisfy skill match threshold`,
    );
  }

  assert(summary.deployment.modules.length > 0, 'Deployment modules should be catalogued');
  assert(summary.deployment.modules.every((module) => module.owner === summary.ownerControl.governanceSafe));

  assert(summary.analysisTimestamp.length > 0, 'Analysis timestamp should be populated');
  assert(summary.executionTimestamp.length > 0, 'Execution timestamp should be populated');
  assert.equal(
    summary.governanceLedger.modules.length,
    scenario.modules.length,
    'Governance ledger should mirror module catalogue',
  );
  assert.equal(
    summary.governanceLedger.commandCoverage,
    summary.metrics.ownerCommandCoverage,
    'Ledger coverage should align with summary coverage metric',
  );
  assert.equal(
    summary.governanceLedger.analysisTimestamp,
    summary.analysisTimestamp,
    'Ledger analysis timestamp should match summary analysis window',
  );
  assert(summary.governanceLedger.alerts.length >= 1, 'Ledger should expose actionable alerts');
  const coverageAlert = summary.governanceLedger.alerts.find((alert) => alert.id === 'coverage-gap');
  assert(!coverageAlert, 'Coverage gap alert should be cleared when coverage reaches 100%');
  const pendingUpgradeAlert = summary.governanceLedger.alerts.find((alert) => alert.id === 'pending-upgrade');
  assert(pendingUpgradeAlert, 'Pending upgrade alert should be surfaced for queued modules');

  assert(summary.ownerCommandPlan.jobControls.length === scenario.jobs.length);
  assert(summary.ownerCommandPlan.validatorControls.length === scenario.validators.length);
  assert(summary.ownerCommandPlan.stablecoinControls.length === scenario.stablecoinAdapters.length);
  assert(summary.ownerCommandPlan.moduleControls.length === scenario.modules.length);
  for (const jobControl of summary.ownerCommandPlan.jobControls) {
    assert(jobControl.controls.length > 0, 'Each job should expose dedicated control scripts');
  }

  assert(summary.dominanceReport.components.length >= 3, 'Dominance report should expose weighted components');
  assert(summary.dominanceReport.crossChecks.length >= 3, 'Dominance report should include multiple cross-checks');
  assert(
    summary.dominanceReport.integrity.every((entry) => entry.outcome === 'pass'),
    'Dominance integrity checks should all pass for the baseline scenario',
  );
  assert.equal(
    summary.governanceLedger.dominanceIndex,
    summary.metrics.economicDominanceIndex,
    'Governance ledger should surface economic dominance index parity',
  );
  assert.equal(
    summary.governanceLedger.dominanceVerdict,
    summary.dominanceReport.verdict,
    'Governance ledger verdict should mirror dominance synthesis',
  );
});

