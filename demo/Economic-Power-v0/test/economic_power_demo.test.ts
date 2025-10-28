import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';
import { loadScenarioFromFile, runScenario } from '../scripts/runDemo';
import './owner_programs.test';

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
    'Owner command coverage should confirm total command supremacy',
  );
  const coverageDetail = summary.ownerCommandPlan.coverageDetail;
  assert(coverageDetail, 'Coverage detail should be present');
  const coverageSurfaces = [
    'jobs',
    'validators',
    'stablecoinAdapters',
    'modules',
    'parameters',
    'pause',
    'resume',
    'treasury',
    'orchestrator',
  ];
  for (const surface of coverageSurfaces) {
    assert(surface in coverageDetail, `Coverage detail should include ${surface}`);
    assert.equal(
      coverageDetail[surface as keyof typeof coverageDetail],
      1,
      `Coverage for ${surface} should be complete`,
    );
  }
  assert(summary.metrics.sovereignControlScore >= 0.9, 'Sovereign control score should confirm custody');
  assert(
    summary.metrics.sovereignSafetyScore >= 0.95,
    'Sovereign safety mesh score should confirm unstoppable readiness',
  );
  assert.equal(
    summary.metrics.assertionPassRate,
    1,
    'Assertion pass rate should signal unstoppable verification deck',
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
  assert.deepEqual(
    summary.ownerSovereignty.alertChannels,
    scenario.observability.alertChannels,
    'Alert channel catalogue should mirror observability configuration',
  );
  assert.equal(
    summary.ownerSovereignty.circuitBreakers.length,
    scenario.safeguards.circuitBreakers.length,
    'Circuit breaker counts should align',
  );

  assert.equal(
    summary.sovereignSafetyMesh.safetyScore,
    summary.metrics.sovereignSafetyScore,
    'Safety mesh score should align with surfaced metric',
  );
  assert(summary.sovereignSafetyMesh.pauseReady, 'Pause command should be production ready');
  assert(summary.sovereignSafetyMesh.resumeReady, 'Resume command should be production ready');
  assert(
    summary.sovereignSafetyMesh.alertChannels.length ===
      scenario.observability.alertChannels.length,
    'Safety mesh should mirror configured alert channels',
  );
  assert(summary.sovereignSafetyMesh.notes.length === 0, 'Baseline scenario should have no outstanding safety notes');

  assert(summary.assertions.length >= 5, 'Should expose comprehensive assertion set');
  const coverageAssertion = summary.assertions.find(
    (assertion) => assertion.id === 'owner-command-dominance',
  );
  assert(coverageAssertion, 'Coverage assertion should be present');
  assert.equal(
    coverageAssertion.outcome,
    'pass',
    'Coverage assertion should pass once command catalog covers every surface',
  );
  assert(summary.assertions.every((assertion) => assertion.outcome === 'pass'));

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
  assert(!coverageAlert, 'Coverage gap alert should be eliminated once coverage reaches 100%');

  assert.equal(summary.commandCatalog.jobPrograms.length, scenario.commandCatalog.jobPrograms.length);
  assert.equal(summary.commandCatalog.validatorPrograms.length, scenario.commandCatalog.validatorPrograms.length);
  assert(summary.commandCatalog.treasuryPrograms.length > 0, 'Treasury programs should be catalogued');
  assert.equal(
    summary.ownerCommandPlan.jobPrograms.length,
    scenario.commandCatalog.jobPrograms.length,
  );
  assert.equal(
    summary.ownerCommandPlan.modulePrograms.length,
    scenario.commandCatalog.modulePrograms.length,
  );
  for (const job of scenario.jobs) {
    assert(
      summary.commandCatalog.jobPrograms.some((program) => program.target === job.id),
      `Command catalog should include program for job ${job.id}`,
    );
  }
  for (const validator of scenario.validators) {
    assert(
      summary.commandCatalog.validatorPrograms.some((program) => program.target === validator.id),
      `Command catalog should include program for validator ${validator.id}`,
    );
  }
  assert(summary.ownerCommandPlan.treasuryPrograms.length > 0, 'Owner plan should list treasury programs');
  assert(summary.ownerCommandPlan.orchestratorPrograms.length > 0, 'Owner plan should list orchestrator programs');
});

