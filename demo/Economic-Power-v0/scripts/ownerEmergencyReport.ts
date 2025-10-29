import type { CoverageSurface, Summary } from './runDemo';

type EmergencyModule = {
  id: string;
  name: string;
  owner: string;
  custody: 'owner-controlled' | 'external';
  status: Summary['governanceLedger']['modules'][number]['status'];
  auditLagDays: number | null;
  upgradeScript: string;
  requiresAction: boolean;
  notes: string[];
};

type EmergencyCircuitBreaker = Summary['ownerCommandPlan']['circuitBreakers'][number];

type EmergencyUpgradePath = Summary['ownerCommandPlan']['upgradePaths'][number];

type EmergencyCommandProgram = {
  surface: CoverageSurface | 'automation';
  id: string;
  script: string;
  description: string;
};

type EmergencyConsoleBase = {
  scenarioId: string;
  title: string;
  generatedAt: string;
  threshold: string;
  governanceSafe: string;
  pauseCommand: string;
  resumeCommand: string;
  responseMinutes: number;
  targetResponseMinutes: number;
  safetyScore: number;
  controlScore: number;
  shockResilienceScore: number;
  shockClassification: Summary['shockResilience']['classification'];
  shockSummary: string;
  commandCoverage: number;
  emergencyContacts: string[];
  alertChannels: string[];
  circuitBreakers: EmergencyCircuitBreaker[];
  upgradePaths: EmergencyUpgradePath[];
  modules: EmergencyModule[];
  commandPrograms: EmergencyCommandProgram[];
  guardrails: string[];
  recommendedActions: string[];
  autopilotReady: boolean;
  autopilotNarrative: string;
  coverageDetail: Summary['ownerCommandPlan']['coverageDetail'];
};

export type EmergencyConsoleReport = EmergencyConsoleBase & {
  mermaid: string;
};

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

function generateEmergencyMermaid(base: EmergencyConsoleBase): string {
  const lines: string[] = ['graph TD'];
  const ownerLabel = escapeMermaidLabel(`Owner Multi-Sig ${base.threshold}`);
  lines.push(`  Owner["${ownerLabel}"]`);
  const pauseLabel = escapeMermaidLabel(base.pauseCommand);
  const resumeLabel = escapeMermaidLabel(base.resumeCommand);
  lines.push(`  Owner --> Pause["Pause ${pauseLabel}"]`);
  lines.push(`  Owner --> Resume["Resume ${resumeLabel}"]`);
  lines.push('  Owner --> Coverage["Command Coverage"]');
  lines.push('  Coverage --> Safety["Safety Mesh"]');
  lines.push('  Safety --> Alerts["Alert Mesh"]');
  lines.push('  Safety --> Contacts["Emergency Contacts"]');
  lines.push('  Owner --> Modules["Protocol Modules"]');

  const modules = base.modules.slice(0, 6);
  modules.forEach((module, index) => {
    const nodeId = `Module${index + 1}`;
    const prefix = module.requiresAction ? '⚠️ ' : '';
    const label = escapeMermaidLabel(`${prefix}${module.name}`);
    lines.push(`  Modules --> ${nodeId}["${label}"]`);
  });

  if (base.guardrails.length > 0) {
    lines.push('  Owner --> Guardrails["Guardrail Catalog"]');
    base.guardrails.slice(0, 4).forEach((guardrail, index) => {
      const nodeId = `Guardrail${index + 1}`;
      const label = escapeMermaidLabel(guardrail);
      lines.push(`  Guardrails --> ${nodeId}["${label}"]`);
    });
  }

  if (base.autopilotReady) {
    lines.push('  Owner --> Autopilot["Autopilot Ready"]');
  } else {
    lines.push('  Owner --> Autopilot["Autopilot Gated"]');
  }

  lines.push('  Owner --> Circuit["Circuit Breakers"]');
  base.circuitBreakers.slice(0, 4).forEach((breaker, index) => {
    const nodeId = `Circuit${index + 1}`;
    const label = escapeMermaidLabel(`${breaker.metric} ${breaker.comparator} ${breaker.threshold}`);
    lines.push(`  Circuit --> ${nodeId}["${label}"]`);
  });

  lines.push('  Autopilot --> Programs["Command Programs"]');
  base.commandPrograms.slice(0, 4).forEach((program, index) => {
    const nodeId = `Program${index + 1}`;
    const label = escapeMermaidLabel(`${program.surface.toUpperCase()}: ${program.id}`);
    lines.push(`  Programs --> ${nodeId}["${label}"]`);
  });

  return `${lines.join('\n')}\n`;
}

export function buildEmergencyConsoleReport(summary: Summary): EmergencyConsoleReport {
  const quickActions = summary.ownerCommandPlan.quickActions;
  const autopilotReady =
    summary.ownerCommandPlan.commandCoverage >= 0.95 &&
    summary.metrics.sovereignSafetyScore >= 0.9 &&
    summary.metrics.sovereignControlScore >= 0.9 &&
    summary.metrics.shockResilienceScore >= 0.9;

  const autopilotNarrative = autopilotReady
    ? 'All emergency thresholds satisfied – autopilot can be engaged immediately.'
    : 'Increase coverage, custody, and safety mesh metrics before enabling autopilot cadence.';

  const modules: EmergencyModule[] = summary.governanceLedger.modules.map((module) => ({
    id: module.id,
    name: module.name,
    owner: module.owner,
    custody: module.custody,
    status: module.status,
    auditLagDays: module.auditLagDays,
    upgradeScript: module.upgradeScript,
    requiresAction:
      module.status !== 'active' || module.auditStale || module.custody === 'external',
    notes: [...module.notes],
  }));

  const surfaces: Array<[CoverageSurface, Summary['ownerCommandPlan']['jobPrograms']]> = [
    ['jobs', summary.ownerCommandPlan.jobPrograms],
    ['validators', summary.ownerCommandPlan.validatorPrograms],
    ['stablecoinAdapters', summary.ownerCommandPlan.adapterPrograms],
    ['modules', summary.ownerCommandPlan.modulePrograms],
    ['treasury', summary.ownerCommandPlan.treasuryPrograms],
    ['orchestrator', summary.ownerCommandPlan.orchestratorPrograms],
  ];

  const commandPrograms: EmergencyCommandProgram[] = [];
  for (const [surface, programs] of surfaces) {
    for (const program of programs) {
      commandPrograms.push({
        surface,
        id: program.id,
        script: program.script,
        description: program.description,
      });
    }
  }
  for (const command of summary.ownerAutopilot.commandSequence) {
    commandPrograms.push({
      surface: command.surface,
      id: command.programId,
      script: command.script,
      description: command.objective,
    });
  }

  const recommendedSet = new Set<string>([
    ...summary.ownerDominion.recommendedActions,
    ...summary.ownerControlSupremacy.recommendedActions,
    ...summary.shockResilience.recommendations,
  ]);
  const recommendedActions = uniqueOrdered(Array.from(recommendedSet));
  if (recommendedActions.length === 0) {
    recommendedActions.push('Maintain drills and guardrail rehearsals to preserve emergency dominance.');
  }

  const base: EmergencyConsoleBase = {
    scenarioId: summary.scenarioId,
    title: summary.title,
    generatedAt: summary.generatedAt,
    threshold: summary.ownerControl.threshold,
    governanceSafe: summary.ownerControl.governanceSafe,
    pauseCommand: quickActions.pause,
    resumeCommand: quickActions.resume,
    responseMinutes: quickActions.responseMinutes,
    targetResponseMinutes: summary.sovereignSafetyMesh.targetResponseMinutes,
    safetyScore: summary.metrics.sovereignSafetyScore,
    controlScore: summary.metrics.sovereignControlScore,
    shockResilienceScore: summary.metrics.shockResilienceScore,
    shockClassification: summary.shockResilience.classification,
    shockSummary: summary.shockResilience.summary,
    commandCoverage: summary.ownerCommandPlan.commandCoverage,
    emergencyContacts: uniqueOrdered(summary.ownerSovereignty.emergencyContacts),
    alertChannels: uniqueOrdered(summary.ownerSovereignty.alertChannels),
    circuitBreakers: summary.ownerCommandPlan.circuitBreakers.map((breaker) => ({ ...breaker })),
    upgradePaths: summary.ownerCommandPlan.upgradePaths.map((upgrade) => ({ ...upgrade })),
    modules,
    commandPrograms,
    guardrails: [...summary.ownerAutopilot.guardrails],
    recommendedActions,
    autopilotReady,
    autopilotNarrative,
    coverageDetail: { ...summary.ownerCommandPlan.coverageDetail },
  };

  return {
    ...base,
    mermaid: generateEmergencyMermaid(base),
  };
}

export function renderEmergencyConsoleReport(report: EmergencyConsoleReport): string {
  const lines: string[] = [];
  lines.push('# Emergency Authority Console');
  lines.push('');
  lines.push(`Scenario **${report.title}** (${report.scenarioId})`);
  lines.push(`Generated at ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push('');
  lines.push('## Immediate control commands');
  lines.push(`- Pause: \`${report.pauseCommand}\``);
  lines.push(`- Resume: \`${report.resumeCommand}\``);
  lines.push(
    `- Response cadence: ${report.responseMinutes} minutes (target ≤ ${report.targetResponseMinutes} minutes)`,
  );
  lines.push(
    `- Autopilot status: ${report.autopilotReady ? 'READY' : 'GATED'} — ${report.autopilotNarrative}`,
  );
  lines.push('');

  lines.push('## Safety and custody metrics');
  lines.push(`- Safety mesh: ${formatPercent(report.safetyScore)}`);
  lines.push(`- Custody supremacy: ${formatPercent(report.controlScore)}`);
  lines.push(`- Shock resilience: ${formatPercent(report.shockResilienceScore)} (${report.shockClassification})`);
  lines.push(`- Command coverage: ${formatPercent(report.commandCoverage)}`);
  lines.push('');

  lines.push('## Alert mesh & emergency contacts');
  if (report.alertChannels.length === 0) {
    lines.push('- Alert mesh pending – configure alert channels immediately.');
  } else {
    for (const channel of report.alertChannels) {
      lines.push(`- Alert channel: ${channel}`);
    }
  }
  if (report.emergencyContacts.length === 0) {
    lines.push('- Emergency contact roster empty – populate responder list.');
  } else {
    for (const contact of report.emergencyContacts) {
      lines.push(`- Emergency contact: ${contact}`);
    }
  }
  lines.push('');

  lines.push('## Circuit breaker catalogue');
  if (report.circuitBreakers.length === 0) {
    lines.push('- No circuit breakers registered. Authorise breakers to preserve defence posture.');
  } else {
    for (const breaker of report.circuitBreakers) {
      lines.push(
        `- ${breaker.metric} ${breaker.comparator} ${breaker.threshold} → \`${breaker.action}\` (${breaker.description})`,
      );
    }
  }
  lines.push('');

  lines.push('## Modules requiring attention');
  const requiringAction = report.modules.filter((module) => module.requiresAction);
  if (requiringAction.length === 0) {
    lines.push('- All modules green – custody and audits current.');
  } else {
    for (const module of requiringAction) {
      const notes = module.notes.length > 0 ? module.notes.join('; ') : 'Action required';
      const lag =
        typeof module.auditLagDays === 'number' ? `${module.auditLagDays.toFixed(1)} day lag` : 'Unknown lag';
      lines.push(`- ${module.name} (${module.owner}) — ${notes} • ${lag} • upgrade via \`${module.upgradeScript}\``);
    }
  }
  lines.push('');

  lines.push('## Deterministic emergency programs');
  if (report.commandPrograms.length === 0) {
    lines.push('- Program catalog empty – publish deterministic scripts for every surface.');
  } else {
    for (const program of report.commandPrograms.slice(0, 12)) {
      lines.push(`- [${program.surface.toUpperCase()}] \`${program.script}\` – ${program.description}`);
    }
    if (report.commandPrograms.length > 12) {
      lines.push(`- …and ${report.commandPrograms.length - 12} additional programs online.`);
    }
  }
  lines.push('');

  lines.push('## Recommended owner actions');
  for (const action of report.recommendedActions) {
    lines.push(`- ${action}`);
  }
  lines.push('');

  lines.push('```mermaid');
  lines.push(report.mermaid.trim());
  lines.push('```');
  lines.push('');

  lines.push(`> Shock summary: ${report.shockSummary}`);

  return `${lines.join('\n')}\n`;
}
