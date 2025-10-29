import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stdout } from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioFromFile, runScenario } from './runDemo';

export const DEFAULT_SCENARIO_PATH = path.join(
  __dirname,
  '..',
  'scenario',
  'baseline.json',
);

export const DEFAULT_AUTOPILOT_BRIEF_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'owner-autopilot-brief.md',
);

type Summary = Awaited<ReturnType<typeof runScenario>>;

type AutopilotBrief = {
  scenarioId: string;
  title: string;
  mission: string;
  cadenceHours: number;
  dominanceScore: number;
  classification: Summary['ownerDominion']['classification'];
  dominanceSummary: string;
  guardrails: string[];
  commandSequence: Summary['ownerAutopilot']['commandSequence'];
  telemetry: Summary['ownerAutopilot']['telemetry'];
  shockResilienceScore: number;
  shockResilienceClassification: Summary['shockResilience']['classification'];
  shockResilienceSummary: string;
  shockResilienceDrivers: string[];
  shockResilienceRecommendations: string[];
  coverage: number;
  coverageNarrative: string;
  coverageDetail: Summary['ownerCommandPlan']['coverageDetail'];
  pauseCommand: string;
  resumeCommand: string;
  responseMinutes: number;
  targetResponseMinutes: number;
  safetyScore: number;
  controlScore: number;
  safetyMesh: {
    pauseReady: boolean;
    resumeReady: boolean;
    responseMinutes: number;
    targetResponseMinutes: number;
    safetyScore: number;
  };
  signals: string[];
  recommendedActions: string[];
};

export function buildAutopilotBrief(summary: Summary): AutopilotBrief {
  const autopilot = summary.ownerAutopilot;
  const dominion = summary.ownerDominion;
  const quickActions = summary.ownerCommandPlan.quickActions;
  const safetyMesh = summary.sovereignSafetyMesh;

  return {
    scenarioId: summary.scenarioId,
    title: summary.title,
    mission: autopilot.mission,
    cadenceHours: autopilot.cadenceHours,
    dominanceScore: autopilot.dominanceScore,
    classification: dominion.classification,
    dominanceSummary: dominion.summary,
    guardrails: [...autopilot.guardrails],
    commandSequence: [...autopilot.commandSequence],
    telemetry: { ...autopilot.telemetry },
    shockResilienceScore: summary.shockResilience.score,
    shockResilienceClassification: summary.shockResilience.classification,
    shockResilienceSummary: summary.shockResilience.summary,
    shockResilienceDrivers: [...summary.shockResilience.drivers],
    shockResilienceRecommendations: [...summary.shockResilience.recommendations],
    coverage: summary.ownerCommandPlan.commandCoverage,
    coverageNarrative: summary.ownerCommandPlan.coverageNarrative,
    coverageDetail: { ...summary.ownerCommandPlan.coverageDetail },
    pauseCommand: quickActions.pause,
    resumeCommand: quickActions.resume,
    responseMinutes: quickActions.responseMinutes,
    targetResponseMinutes: safetyMesh.targetResponseMinutes,
    safetyScore: summary.metrics.sovereignSafetyScore,
    controlScore: summary.metrics.sovereignControlScore,
    safetyMesh: {
      pauseReady: safetyMesh.pauseReady,
      resumeReady: safetyMesh.resumeReady,
      responseMinutes: safetyMesh.responseMinutes,
      targetResponseMinutes: safetyMesh.targetResponseMinutes,
      safetyScore: safetyMesh.safetyScore,
    },
    signals: [...dominion.signals],
    recommendedActions: dominion.recommendedActions.length
      ? [...dominion.recommendedActions]
      : ['Maintain autopilot cadence and guardrail coverage.'],
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function surfaceLabel(surface: keyof AutopilotBrief['coverageDetail']): string {
  const labels: Record<keyof AutopilotBrief['coverageDetail'], string> = {
    jobs: 'Job orchestration',
    validators: 'Validator sovereignty',
    stablecoinAdapters: 'Stablecoin adapters',
    modules: 'Protocol modules',
    parameters: 'Parameter overrides',
    pause: 'Pause command',
    resume: 'Resume command',
    treasury: 'Treasury programs',
    orchestrator: 'Orchestrator mesh',
  };
  return labels[surface];
}

export function renderAutopilotBrief(brief: AutopilotBrief): string {
  const lines: string[] = [];
  const cadence = brief.cadenceHours.toFixed(1);
  lines.push('# Economic Power Autopilot Brief');
  lines.push('');
  lines.push(`Scenario: ${brief.title} (${brief.scenarioId})`);
  lines.push(`Mission: ${brief.mission}`);
  lines.push('');
  lines.push(
    `Cadence: ${cadence}h • Dominance ${(brief.dominanceScore * 100).toFixed(1)}% (${brief.classification})`,
  );
  lines.push(`Control coverage: ${formatPercent(brief.coverage)} — ${brief.coverageNarrative}`);
  lines.push(`Safety mesh score: ${formatPercent(brief.safetyScore)} • Custody: ${formatPercent(brief.controlScore)}`);
  lines.push(brief.dominanceSummary);
  lines.push('');

  lines.push('## Guardrails');
  if (brief.guardrails.length === 0) {
    lines.push('- Guardrail catalog empty — add guardrails before enabling autopilot.');
  } else {
    for (const guardrail of brief.guardrails) {
      lines.push(`- ${guardrail}`);
    }
  }
  lines.push('');

  lines.push('## Command sequence');
  if (brief.commandSequence.length === 0) {
    lines.push('- No commands registered. Add programs to execute autopilot.');
  } else {
    brief.commandSequence.forEach((command, index) => {
      lines.push(
        `${index + 1}. [${command.surface.toUpperCase()}] ${command.script} — ${command.objective}`,
      );
    });
  }
  lines.push('');

  lines.push('## Safety mesh readiness');
  lines.push(`- Pause command: \`${brief.pauseCommand}\``);
  lines.push(`- Resume command: \`${brief.resumeCommand}\``);
  lines.push(
    `- Response cadence: ${brief.responseMinutes}m (target ≤ ${brief.targetResponseMinutes}m)`,
  );
  lines.push(
    `- Mesh status: pause ${brief.safetyMesh.pauseReady ? 'ready' : 'missing'}, resume ${
      brief.safetyMesh.resumeReady ? 'ready' : 'missing'
    }`,
  );
  lines.push(
    `- Safety score: ${formatPercent(brief.safetyMesh.safetyScore)} • Command coverage: ${formatPercent(
      brief.coverage,
    )}`,
  );
  lines.push('');

  lines.push('## Telemetry checkpoints');
  lines.push(
    `- Economic dominance index: ${formatPercent(
      brief.telemetry.economicDominanceIndex,
    )}`,
  );
  lines.push(`- Capital velocity: ${brief.telemetry.capitalVelocity.toFixed(2)} AGI/h`);
  lines.push(
    `- Global expansion readiness: ${formatPercent(brief.telemetry.globalExpansionReadiness)}`,
  );
  lines.push(`- Shock resilience: ${formatPercent(brief.telemetry.shockResilienceScore)}`);
  lines.push('');

  lines.push('## Shock resilience posture');
  lines.push(
    `- Score: ${formatPercent(brief.shockResilienceScore)} (${brief.shockResilienceClassification})`,
  );
  lines.push(`- Summary: ${brief.shockResilienceSummary}`);
  if (brief.shockResilienceDrivers.length > 0) {
    lines.push('- Drivers:');
    for (const driver of brief.shockResilienceDrivers) {
      lines.push(`  - ${driver}`);
    }
  }
  if (brief.shockResilienceRecommendations.length > 0) {
    lines.push('- Recommended actions:');
    for (const rec of brief.shockResilienceRecommendations) {
      lines.push(`  - ${rec}`);
    }
  }
  lines.push('');

  lines.push('## Dominance signals');
  if (brief.signals.length === 0) {
    lines.push('- No signals surfaced.');
  } else {
    for (const signal of brief.signals) {
      lines.push(`- ${signal}`);
    }
  }
  lines.push('');

  lines.push('## Coverage detail');
  const coverageEntries = Object.entries(brief.coverageDetail) as Array<[
    keyof AutopilotBrief['coverageDetail'],
    number,
  ]>;
  coverageEntries.forEach(([surface, value]) => {
    lines.push(`- ${surfaceLabel(surface)}: ${formatPercent(value)}`);
  });
  lines.push('');

  lines.push('## Recommended actions');
  for (const action of brief.recommendedActions) {
    lines.push(`- ${action}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export async function generateAutopilotBrief(
  scenarioPath: string,
): Promise<{ summary: Summary; brief: AutopilotBrief }> {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const summary = await runScenario(scenario);
  return { summary, brief: buildAutopilotBrief(summary) };
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      default: DEFAULT_SCENARIO_PATH,
      describe: 'Scenario JSON file to simulate',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON instead of markdown',
    })
    .option('save', {
      type: 'string',
      describe: 'Write the rendered briefing to a file',
    })
    .help()
    .parse();

  const scenarioPath = String(argv.scenario);
  const { brief } = await generateAutopilotBrief(scenarioPath);

  if (argv.json) {
    stdout.write(JSON.stringify({ brief }, null, 2));
    stdout.write('\n');
  } else {
    const rendered = renderAutopilotBrief(brief);
    stdout.write(rendered);
    if (argv.save) {
      const outputPath = path.resolve(String(argv.save));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, rendered);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Owner autopilot briefing failed:', error);
    process.exitCode = 1;
  });
}

