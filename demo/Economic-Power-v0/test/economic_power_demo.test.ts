import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';
import { loadScenarioFromFile, runScenario } from '../scripts/runDemo';
import { buildAutopilotBrief, renderAutopilotBrief } from '../scripts/ownerAutopilot';
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
  assert(
    summary.metrics.ownerDominionScore >= 0.95,
    'Owner dominion score should confirm total dominion control',
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
  assert(
    summary.metrics.economicDominanceIndex >= 0.9,
    'Economic dominance index should confirm unstoppable economic leverage',
  );
  assert(
    summary.metrics.capitalVelocity > 0,
    'Capital velocity should remain positive to evidence treasury acceleration',
  );
  assert(
    summary.metrics.globalExpansionReadiness >= 0.9,
    'Global expansion readiness should exceed 90% to unlock planetary rollout',
  );
  assert(
    summary.metrics.shockResilienceScore >= 0.95,
    'Shock resilience score should confirm impregnable defence posture',
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
  assert.equal(
    summary.shockResilience.score,
    summary.metrics.shockResilienceScore,
    'Shock resilience summary should align with surfaced metric',
  );
  assert(
    summary.shockResilience.drivers.length >= 3,
    'Shock resilience drivers should enumerate the defensive factors',
  );
  assert(
    summary.shockResilience.recommendations.length >= 1,
    'Shock resilience recommendations should guide owner action',
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
    summary.ownerSovereignty.shockResilienceScore,
    summary.metrics.shockResilienceScore,
    'Owner sovereignty manifest should surface the shock resilience score',
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
  assert.equal(
    summary.sovereignSafetyMesh.shockResilienceScore,
    summary.metrics.shockResilienceScore,
    'Safety mesh metadata should track shock resilience score',
  );
  assert.equal(
    summary.sovereignSafetyMesh.shockClassification,
    summary.shockResilience.classification,
    'Safety mesh classification should align with shock resilience classification',
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
  const shockAssertion = summary.assertions.find((assertion) => assertion.id === 'shock-resilience');
  assert(shockAssertion, 'Shock resilience assertion should be generated');
  assert.equal(shockAssertion?.outcome, 'pass');

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
  assert(
    summary.governanceLedger.alerts.every((alert) => alert.id !== 'shock-resilience-gap'),
    'Shock resilience should not degrade governance ledger state in baseline scenario',
  );

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

  assert(summary.shockResilience.summary.length > 0, 'Shock resilience summary narrative should be populated');
  assert(
    summary.ownerAutopilot.telemetry.shockResilienceScore === summary.metrics.shockResilienceScore,
    'Autopilot telemetry should mirror shock resilience metric',
  );

  assert(summary.ownerAutopilot.commandSequence.length > 0, 'Owner autopilot should propose deterministic command sequence');
  assert(summary.ownerAutopilot.cadenceHours >= 6, 'Owner autopilot cadence should stay within operational bounds');
  assert(
    summary.ownerAutopilot.guardrails.some((guardrail) => guardrail.includes(summary.ownerSovereignty.pauseScript)),
    'Autopilot guardrails should include pause command',
  );
  assert.equal(
    summary.ownerDominion.score,
    summary.metrics.ownerDominionScore,
    'Owner dominion report score should mirror surfaced metric',
  );
  assert.equal(
    summary.ownerDominion.classification,
    'total-dominion',
    'Baseline dominion classification should be total-dominion',
  );
  assert(
    summary.ownerDominion.guardrails.length >= summary.ownerAutopilot.guardrails.length,
    'Dominion guardrail list should mirror autopilot guardrails',
  );
  assert(
    summary.ownerDominion.recommendedActions.length >= 1,
    'Dominion recommendations should provide actionable guidance',
  );
  assert(
    summary.ownerDominion.signals.length >= 3,
    'Dominion signals should expose composite telemetry',
  );
  assert(
    summary.ownerControlSupremacy.index >= 0.97,
    'Owner control supremacy index should confirm absolute supremacy',
  );
  assert.equal(
    summary.ownerControlSupremacy.classification,
    'total-supremacy',
    'Baseline supremacy classification should be total-supremacy',
  );
  assert.equal(
    summary.metrics.ownerControlSupremacyIndex,
    Number(summary.ownerControlSupremacy.index.toFixed(3)),
    'Supremacy metric should mirror surfaced index',
  );
  assert(
    summary.ownerControlSupremacy.signals.length >= 5,
    'Owner control supremacy signals should surface multi-signal telemetry',
  );
  assert(
    summary.ownerControlSupremacy.recommendedActions.length >= 1,
    'Owner control supremacy should recommend sustaining guardrails',
  );
  assert(
    summary.ownerControlSupremacy.mermaid.includes('graph LR'),
    'Owner control supremacy mermaid graph should be rendered',
  );
  assert.equal(
    summary.ownerAutopilot.telemetry.economicDominanceIndex,
    summary.metrics.economicDominanceIndex,
    'Autopilot telemetry should mirror summary dominance metric',
  );
  assert.equal(
    summary.ownerAutopilot.telemetry.globalExpansionReadiness,
    summary.metrics.globalExpansionReadiness,
    'Autopilot telemetry should mirror expansion readiness metric',
  );
  assert(summary.globalExpansionPlan.length >= 3, 'Global expansion plan should include multi-phase roadmap');
  assert(
    summary.globalExpansionPlan.every((phase) => phase.commands.length > 0),
    'Every expansion phase should enumerate executable commands',
  );
  assert(
    summary.globalExpansionPlan.some((phase) => phase.phase.includes('Planetary')),
    'Expansion plan should culminate in planetary scale phase',
  );
});

test('owner autopilot briefing surfaces guardrails and command cadence', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);
  const brief = buildAutopilotBrief(summary);

  assert.equal(brief.scenarioId, summary.scenarioId);
  assert.equal(brief.guardrails.length, summary.ownerAutopilot.guardrails.length);
  assert.equal(brief.commandSequence.length, summary.ownerAutopilot.commandSequence.length);
  assert.equal(brief.coverage, summary.ownerCommandPlan.commandCoverage);
  assert.equal(brief.pauseCommand, summary.ownerCommandPlan.quickActions.pause);
  assert.equal(brief.resumeCommand, summary.ownerCommandPlan.quickActions.resume);
  assert(brief.recommendedActions.length >= 1, 'Brief should include recommended actions');
  assert.equal(brief.shockResilienceScore, summary.metrics.shockResilienceScore);
  assert.equal(brief.shockResilienceClassification, summary.shockResilience.classification);

  const rendered = renderAutopilotBrief(brief);
  assert(rendered.includes('Economic Power Autopilot Brief'));
  assert(rendered.includes('## Guardrails'));
  assert(rendered.includes('## Command sequence'));
  assert(rendered.includes('## Safety mesh readiness'));
  assert(rendered.includes('## Telemetry checkpoints'));
  assert(rendered.includes('## Shock resilience posture'));
  assert(rendered.includes('## Dominance signals'));
  assert(rendered.includes('## Recommended actions'));
  assert(rendered.includes(brief.pauseCommand));
  assert(rendered.includes(brief.resumeCommand));
});

