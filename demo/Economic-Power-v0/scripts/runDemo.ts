import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { buildAutopilotBrief, renderAutopilotBrief } from './autopilotBrief';

const commandProgramSchema = z.object({
  id: z.string(),
  target: z.string(),
  script: z.string(),
  description: z.string(),
});

const commandCatalogSchema = z.object({
  jobPrograms: z.array(commandProgramSchema),
  validatorPrograms: z.array(commandProgramSchema),
  adapterPrograms: z.array(commandProgramSchema),
  modulePrograms: z.array(commandProgramSchema),
  treasuryPrograms: z.array(commandProgramSchema),
  orchestratorPrograms: z.array(commandProgramSchema),
});

const scenarioSchema = z.object({
  version: z.literal('1.0'),
  scenarioId: z.string(),
  title: z.string(),
  description: z.string(),
  analysisTimestamp: z
    .string()
    .datetime({ message: 'analysisTimestamp must be an ISO-8601 timestamp' })
    .optional(),
  network: z.object({
    name: z.string(),
    chainId: z.number(),
    rpcUrl: z.string(),
    explorer: z.string(),
    deploymentRegistry: z.string(),
  }),
  treasury: z.object({
    agiBalance: z.number(),
    stablecoinBalance: z.number(),
    operationsBuffer: z.number(),
    ownerSafe: z.string(),
  }),
  owner: z.object({
    operator: z.string(),
    governanceSafe: z.string(),
    threshold: z.number(),
    members: z.number(),
    controls: z.array(
      z.object({
        parameter: z.string(),
        current: z.union([z.number(), z.string()]),
        target: z.union([z.number(), z.string()]),
        script: z.string(),
        description: z.string(),
      }),
    ),
  }),
  agents: z.array(
    z.object({
      id: z.string(),
      ens: z.string(),
      name: z.string(),
      reputation: z.number(),
      availability: z.number(),
      capacity: z.number(),
      skills: z.array(z.string()),
      specializations: z.array(z.string()),
    }),
  ),
  validators: z.array(
    z.object({
      id: z.string(),
      ens: z.string(),
      name: z.string(),
      reliability: z.number(),
      stake: z.number(),
      competencies: z.array(z.string()),
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rewardAgi: z.number(),
      rewardStable: z.number(),
      economicValue: z.number(),
      skills: z.array(z.string()),
      executionHours: z.number(),
      validatorQuorum: z.number(),
      risk: z.enum(['low', 'medium', 'high']),
    }),
  ),
  stablecoinAdapters: z.array(
    z.object({
      name: z.string(),
      swapFeeBps: z.number(),
      slippageBps: z.number(),
    }),
  ),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
      version: z.string(),
      owner: z.string(),
      upgradeScript: z.string(),
      status: z.enum(['active', 'pending-upgrade', 'paused', 'deprecated']),
      description: z.string(),
      lastAudit: z.string().datetime({ message: 'lastAudit must be an ISO-8601 timestamp' }),
    }),
  ),
  automation: z.object({
    matchingEngine: z.string(),
    validatorOrchestrator: z.string(),
    notificationHub: z.string(),
  }),
  observability: z.object({
    dashboards: z.array(z.string()),
    alertChannels: z.array(z.string()),
  }),
  safeguards: z.object({
    pauseScript: z.string(),
    resumeScript: z.string(),
    responseMinutes: z.number().nonnegative(),
    emergencyContacts: z.array(z.string()),
    circuitBreakers: z.array(
      z.object({
        metric: z.string(),
        comparator: z.enum(['<', '<=', '>', '>=']),
        threshold: z.number(),
        action: z.string(),
        description: z.string(),
      }),
    ),
    upgradePaths: z.array(
      z.object({
        module: z.string(),
        script: z.string(),
        description: z.string(),
      }),
    ),
  }),
  commandCatalog: commandCatalogSchema,
});

type Scenario = z.infer<typeof scenarioSchema>;

type CommandProgram = z.infer<typeof commandProgramSchema>;
type CommandCatalog = z.infer<typeof commandCatalogSchema>;

const scenarioMetadata = new WeakMap<Scenario, { filePath: string }>();

type Assignment = {
  jobId: string;
  jobName: string;
  agentId: string;
  agentName: string;
  agentEns: string;
  startHour: number;
  endHour: number;
  efficiency: number;
  skillMatch: number;
  validatorIds: string[];
  validatorNames: string[];
  validatorConfidence: number;
  validatorStake: number;
  rewardAgi: number;
  rewardStable: number;
  netValue: number;
  economicValue: number;
  automationLift: number;
};

type Assertion = {
  id: string;
  title: string;
  outcome: 'pass' | 'fail';
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  metric?: number;
  target?: number;
  evidence: string[];
};

type GovernanceLedgerModule = {
  id: string;
  name: string;
  address: string;
  owner: string;
  custody: 'owner-controlled' | 'external';
  status: Scenario['modules'][number]['status'];
  upgradeScript: string;
  auditLagDays: number | null;
  auditStale: boolean;
  notes: string[];
};

type GovernanceAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  details: string[];
};

type GovernanceLedger = {
  analysisTimestamp: string;
  ownerSafe: string;
  governanceSafe: string;
  treasurySafe: string;
  threshold: number;
  commandCoverage: number;
  coverageNarrative: string;
  pauseScript: string;
  resumeScript: string;
  scripts: string[];
  modules: GovernanceLedgerModule[];
  alerts: GovernanceAlert[];
};

type OwnerAutopilotCommand = {
  programId: string;
  surface: CoverageSurface | 'automation';
  script: string;
  objective: string;
};

type OwnerAutopilot = {
  mission: string;
  cadenceHours: number;
  dominanceScore: number;
  guardrails: string[];
  narrative: string;
  telemetry: {
    economicDominanceIndex: number;
    capitalVelocity: number;
    globalExpansionReadiness: number;
    superIntelligenceIndex: number;
    shockResilienceScore: number;
    deploymentIntegrityScore: number;
  };
  commandSequence: OwnerAutopilotCommand[];
};

type OwnerDominionClassification =
  | 'total-dominion'
  | 'fortified'
  | 'elevated'
  | 'attention';

type OwnerDominionReport = {
  score: number;
  classification: OwnerDominionClassification;
  summary: string;
  guardrails: string[];
  readiness: {
    pauseReady: boolean;
    resumeReady: boolean;
    responseMinutes: number;
    coverage: number;
    safety: number;
    control: number;
  };
  coverageDetail: Record<CoverageSurface, number>;
  signals: string[];
  recommendedActions: string[];
};

type ShockResilienceClassification =
  | 'impregnable'
  | 'fortified'
  | 'resilient'
  | 'attention';

type ShockResilienceReport = {
  score: number;
  classification: ShockResilienceClassification;
  summary: string;
  drivers: string[];
  recommendations: string[];
  telemetry: {
    stabilityIndex: number;
    guardrailCoverage: number;
    riskFactor: number;
    emergencyContacts: number;
    alertChannels: number;
    bufferRatio: number;
    automationDensity: number;
  };
};

type GlobalExpansionPhase = {
  phase: string;
  horizonHours: number;
  focus: string;
  readiness: number;
  commands: string[];
  telemetryHooks: string[];
};

type EconomicDominanceReport = {
  analysisTimestamp: string;
  executionTimestamp: string;
  dominanceIndex: number;
  capitalVelocity: number;
  roiMultiplier: number;
  automationScore: number;
  sovereignSafetyScore: number;
  sovereignControlScore: number;
  shockResilienceScore: number;
  summary: string;
  recommendations: string[];
};

type OwnerControlSupremacyClassification =
  | 'total-supremacy'
  | 'fortified-supremacy'
  | 'elevated'
  | 'attention';

type ProgramCoverage = Record<
  'job' | 'validator' | 'adapter' | 'module' | 'treasury' | 'orchestrator',
  number
>;

type OwnerControlSupremacy = {
  index: number;
  classification: OwnerControlSupremacyClassification;
  summary: string;
  guardrailCoverage: number;
  programCoverage: ProgramCoverage;
  coverageDetail: Record<CoverageSurface, number>;
  quickActions: OwnerCommandPlan['quickActions'];
  signals: string[];
  recommendedActions: string[];
  mermaid: string;
};

type OwnerControlDrillStatus = 'ready' | 'fortify' | 'attention';

type OwnerControlDrill = {
  id: string;
  surface: CoverageSurface;
  label: string;
  coverage: number;
  status: OwnerControlDrillStatus;
  commands: string[];
  description: string;
  recommendedAction: string;
};

type OwnerControlDrillClassification =
  | 'total-control'
  | 'fortified'
  | 'reinforced'
  | 'attention';

type OwnerControlDrillReport = {
  readinessScore: number;
  classification: OwnerControlDrillClassification;
  summary: string;
  drills: OwnerControlDrill[];
  focusAreas: string[];
  directives: string[];
  mermaid: string;
};

type SuperIntelligenceClassification =
  | 'transcendent-dominion'
  | 'planetary-dominant'
  | 'ascendant'
  | 'formative';

type SuperIntelligenceReport = {
  index: number;
  classification: SuperIntelligenceClassification;
  narrative: string;
  drivers: string[];
  commandAssurance: string[];
  telemetry: {
    economicDominanceIndex: number;
    ownerSupremacyIndex: number;
    sovereignSafetyScore: number;
    automationScore: number;
    shockResilienceScore: number;
    globalExpansionReadiness: number;
  };
  mermaid: string;
};

type DeterministicProof = {
  version: '1.0';
  scenarioId: string;
  analysisTimestamp: string;
  generatedAt: string;
  executionTimestamp: string;
  summaryHash: string;
  metricsHash: string;
  assignmentsHash: string;
  commandCoverageHash: string;
  autopilotHash: string;
  governanceLedgerHash: string;
  assertionsHash: string;
  treasuryTrajectoryHash: string;
  sovereignSafetyMeshHash: string;
  superIntelligenceHash: string;
  deploymentIntegrityHash: string;
};

type DeterministicVerification = {
  version: '1.0';
  matches: boolean;
  mismatches: string[];
  proof: DeterministicProof;
  verificationProof: DeterministicProof;
};

export type Summary = {
  scenarioId: string;
  title: string;
  generatedAt: string;
  analysisTimestamp: string;
  executionTimestamp: string;
  metrics: {
    totalJobs: number;
    totalAgents: number;
    totalValidators: number;
    totalEscrowedAgi: number;
    totalStablecoinVolume: number;
    validatorRewardsAgi: number;
    ownerBufferContribution: number;
    treasuryAfterRun: number;
    roiMultiplier: number;
    netYield: number;
    paybackHours: number;
    throughputJobsPerDay: number;
    validatorConfidence: number;
    automationScore: number;
    riskMitigationScore: number;
    stabilityIndex: number;
    ownerCommandCoverage: number;
    ownerDominionScore: number;
    ownerControlSupremacyIndex: number;
    ownerControlDrillReadiness: number;
    sovereignControlScore: number;
    sovereignSafetyScore: number;
    assertionPassRate: number;
    economicDominanceIndex: number;
    capitalVelocity: number;
    globalExpansionReadiness: number;
    superIntelligenceIndex: number;
    shockResilienceScore: number;
    deploymentIntegrityScore: number;
  };
  ownerControl: {
    threshold: string;
    members: number;
    governanceSafe: string;
    controls: Scenario['owner']['controls'];
  };
  ownerSovereignty: {
    pauseScript: string;
    resumeScript: string;
    responseMinutes: number;
    emergencyContacts: Scenario['safeguards']['emergencyContacts'];
    circuitBreakers: Scenario['safeguards']['circuitBreakers'];
    upgradePaths: Scenario['safeguards']['upgradePaths'];
    alertChannels: Scenario['observability']['alertChannels'];
    shockResilienceScore?: number;
    shockResilienceClassification?: ShockResilienceClassification;
    shockResilienceSummary?: string;
  };
  commandCatalog: CommandCatalog;
  assignments: Assignment[];
  mermaidFlow: string;
  mermaidTimeline: string;
  ownerCommandMermaid: string;
    ownerCommandPlan: OwnerCommandPlan;
    ownerControlDrills: OwnerControlDrillReport;
    sovereignSafetyMesh: SovereignSafetyMesh;
  assertions: Assertion[];
  treasuryTrajectory: TrajectoryEntry[];
  deployment: {
    network: Scenario['network'];
    treasuryOwner: Scenario['treasury']['ownerSafe'];
    governanceSafe: Scenario['owner']['governanceSafe'];
    modules: Scenario['modules'];
    stablecoinAdapters: Scenario['stablecoinAdapters'];
    automation: Scenario['automation'];
    observability: Scenario['observability'];
  };
  deploymentIntegrity: DeploymentIntegrityReport;
  governanceLedger: GovernanceLedger;
  ownerAutopilot: OwnerAutopilot;
  ownerDominion: OwnerDominionReport;
  ownerControlSupremacy: OwnerControlSupremacy;
  superIntelligence: SuperIntelligenceReport;
  globalExpansionPlan: GlobalExpansionPhase[];
  shockResilience: ShockResilienceReport;
};

type SummaryWithSnapshot = Summary & {
  __scenarioSnapshot?: Scenario;
  __deploymentConfigPath?: string;
  __skipDeploymentVerification?: boolean;
};

type CoverageSurface =
  | 'jobs'
  | 'validators'
  | 'stablecoinAdapters'
  | 'modules'
  | 'parameters'
  | 'pause'
  | 'resume'
  | 'treasury'
  | 'orchestrator';

type CommandCoverage = {
  value: number;
  detail: Record<CoverageSurface, number>;
};

type OwnerCommandPlan = {
  quickActions: {
    pause: string;
    resume: string;
    responseMinutes: number;
  };
  parameterControls: Scenario['owner']['controls'];
  circuitBreakers: Scenario['safeguards']['circuitBreakers'];
  upgradePaths: Scenario['safeguards']['upgradePaths'];
  jobPrograms: CommandProgram[];
  validatorPrograms: CommandProgram[];
  adapterPrograms: CommandProgram[];
  modulePrograms: CommandProgram[];
  treasuryPrograms: CommandProgram[];
  orchestratorPrograms: CommandProgram[];
  commandCoverage: number;
  coverageNarrative: string;
  coverageDetail: Record<CoverageSurface, number>;
};

type SovereignSafetyMesh = {
  pauseReady: boolean;
  resumeReady: boolean;
  targetResponseMinutes: number;
  responseMinutes: number;
  responseScore: number;
  circuitBreakerScore: number;
  alertCoverageScore: number;
  coverageScore: number;
  scriptScore: number;
  safetyScore: number;
  alertChannels: string[];
  emergencyContacts: string[];
  notes: string[];
  shockResilienceScore?: number;
  shockClassification?: ShockResilienceClassification;
  shockSummary?: string;
};

const deploymentConfigSchema = z.object({
  network: z.string(),
  chainId: z.number(),
  explorerUrl: z.string().optional(),
  governance: z.string().optional(),
  agialpha: z.string().optional(),
  secureDefaults: z
    .object({
      pauseOnLaunch: z.boolean().optional(),
      maxJobDurationSeconds: z.number().optional(),
      validatorCommitWindowSeconds: z.number().optional(),
      validatorRevealWindowSeconds: z.number().optional(),
    })
    .optional(),
});

type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

type DeploymentIntegrityCheck = {
  id: string;
  label: string;
  status: 'pass' | 'attention';
  actual: string;
  expected: string;
  impact: string;
  recommendation?: string;
};

type DeploymentIntegrityCoverage = {
  chainId: number;
  jobDuration: number;
  moduleCustody: number;
  moduleStatus: number;
  auditFreshness: number;
  ownerCommand: number;
  sovereignControl: number;
  pauseReadiness: number;
  observability: number;
  validatorResponse: number;
};

type DeploymentIntegrityClassification =
  | 'immutable-dominion'
  | 'fortified'
  | 'reinforced'
  | 'attention';

type DeploymentIntegrityReport = {
  analysisTimestamp: string;
  configPath?: string;
  network: {
    name: string;
    chainId: number;
    explorer: string;
  };
  score: number;
  classification: DeploymentIntegrityClassification;
  summary: string;
  coverage: DeploymentIntegrityCoverage;
  checks: DeploymentIntegrityCheck[];
  recommendations: string[];
  notes: string[];
  mermaid: string;
};

type TrajectoryEntry = {
  step: number;
  jobId: string;
  jobName: string;
  startHour: number;
  endHour: number;
  treasuryAfterJob: number;
  cumulativeValue: number;
  cumulativeCost: number;
  netYield: number;
  validatorConfidence: number;
  automationLift: number;
};

function coverageNarrative(coverage: number): string {
  if (coverage >= 0.9) {
    return 'Owner multi-sig holds deterministic runbooks for every critical surface.';
  }
  if (coverage >= 0.6) {
    return 'Owner command surface is extensive; only non-critical modules remain delegated.';
  }
  if (coverage >= 0.4) {
    return 'Owner coverage spans the core loop with roadmap hooks for peripheral upgrades.';
  }
  return 'Coverage below defensive target – prioritise scripting additional command hooks.';
}

function buildOwnerCommandPlan(
  scenario: Scenario,
  coverage: CommandCoverage,
): OwnerCommandPlan {
  return {
    quickActions: {
      pause: scenario.safeguards.pauseScript,
      resume: scenario.safeguards.resumeScript,
      responseMinutes: scenario.safeguards.responseMinutes,
    },
    parameterControls: scenario.owner.controls,
    circuitBreakers: scenario.safeguards.circuitBreakers,
    upgradePaths: scenario.safeguards.upgradePaths,
    jobPrograms: scenario.commandCatalog.jobPrograms,
    validatorPrograms: scenario.commandCatalog.validatorPrograms,
    adapterPrograms: scenario.commandCatalog.adapterPrograms,
    modulePrograms: scenario.commandCatalog.modulePrograms,
    treasuryPrograms: scenario.commandCatalog.treasuryPrograms,
    orchestratorPrograms: scenario.commandCatalog.orchestratorPrograms,
    commandCoverage: coverage.value,
    coverageNarrative: coverageNarrative(coverage.value),
    coverageDetail: coverage.detail,
  };
}

const OWNER_CONTROL_SURFACE_LABELS: Record<CoverageSurface, string> = {
  jobs: 'Job orchestration',
  validators: 'Validator sovereignty',
  stablecoinAdapters: 'Stablecoin adapter',
  modules: 'Protocol module',
  parameters: 'Parameter override',
  pause: 'Emergency pause',
  resume: 'System resume',
  treasury: 'Treasury program',
  orchestrator: 'Orchestrator command',
};

const OWNER_CONTROL_SURFACE_DESCRIPTIONS: Record<CoverageSurface, string> = {
  jobs: 'Launch, assign, and close jobs from the owner multi-sig without developer intervention.',
  validators: 'Command validator committees, rotate quorums, and escalate disputes deterministically.',
  stablecoinAdapters: 'Upgrade and route fiat bridges to maintain low-slippage liquidity on demand.',
  modules: 'Promote immutable module upgrades and rehearse contract migrations under owner custody.',
  parameters: 'Override durations, quorums, and other runtime parameters through scripted programs.',
  pause: 'Trigger global pause drills to freeze execution instantly in the event of anomalies.',
  resume: 'Resume orchestrated operations after investigations, restoring state in a single command.',
  treasury: 'Move reserves, top up buffers, and stream rewards straight from the owner treasury safe.',
  orchestrator: 'Reconfigure the off-chain orchestrator mesh, scaling agents and automation in real time.',
};

function gatherCommandsForSurface(
  surface: CoverageSurface,
  plan: OwnerCommandPlan,
  scenario: Scenario,
): string[] {
  switch (surface) {
    case 'jobs':
      return plan.jobPrograms.map((program) => program.script);
    case 'validators':
      return plan.validatorPrograms.map((program) => program.script);
    case 'stablecoinAdapters':
      return plan.adapterPrograms.map((program) => program.script);
    case 'modules':
      return [
        ...plan.modulePrograms.map((program) => program.script),
        ...scenario.safeguards.upgradePaths.map((upgrade) => upgrade.script),
        ...scenario.modules.map((module) => module.upgradeScript),
      ];
    case 'parameters':
      return plan.parameterControls.map((control) => control.script);
    case 'pause':
      return [plan.quickActions.pause];
    case 'resume':
      return [plan.quickActions.resume];
    case 'treasury':
      return plan.treasuryPrograms.map((program) => program.script);
    case 'orchestrator':
      return plan.orchestratorPrograms.map((program) => program.script);
    default:
      return [];
  }
}

function uniqueCommands(commands: string[]): string[] {
  const unique = new Set<string>();
  for (const command of commands) {
    const trimmed = command.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

function classifyOwnerControlDrillStatus(
  coverage: number,
): OwnerControlDrillStatus {
  if (coverage >= 0.95) {
    return 'ready';
  }
  if (coverage >= 0.8) {
    return 'fortify';
  }
  return 'attention';
}

function drillRecommendation(
  status: OwnerControlDrillStatus,
  label: string,
): string {
  const lowerLabel = label.toLowerCase();
  switch (status) {
    case 'ready':
      return `${label} drill verified by Economic Power CI – continue rehearsals via the owner multi-sig.`;
    case 'fortify':
      return `Expand ${lowerLabel} drill coverage with additional deterministic commands until parity is achieved.`;
    case 'attention':
    default:
      return `Author and verify missing ${lowerLabel} command scripts before escalating production load.`;
  }
}

function classifyOwnerControlDrillScore(
  score: number,
): { classification: OwnerControlDrillClassification; summary: string } {
  if (score >= 0.98) {
    return {
      classification: 'total-control',
      summary:
        'Every control drill is rehearsed, scripted, and validated – the owner multi-sig commands the entire economic lattice.',
    };
  }
  if (score >= 0.9) {
    return {
      classification: 'fortified',
      summary:
        'Control drills are fortified across the stack – top up remaining rehearsals to reach unstoppable total control.',
    };
  }
  if (score >= 0.75) {
    return {
      classification: 'reinforced',
      summary:
        'Control drills are reinforced but still rely on selective scripts – expand rehearsals to cover every surface.',
    };
  }
  return {
    classification: 'attention',
    summary:
      'Control drills require immediate attention – script and validate missing programs before scaling new workloads.',
  };
}

function buildOwnerControlDrills(
  scenario: Scenario,
  plan: OwnerCommandPlan,
  coverage: CommandCoverage,
): OwnerControlDrillReport {
  const surfaces = (Object.keys(coverage.detail) as CoverageSurface[]).map((surface) => {
    const coverageValue = coverage.detail[surface];
    const label = OWNER_CONTROL_SURFACE_LABELS[surface];
    const commands = uniqueCommands(
      gatherCommandsForSurface(surface, plan, scenario),
    );
    const status = classifyOwnerControlDrillStatus(coverageValue);
    return {
      id: surface,
      surface,
      label: `${label} drill`,
      coverage: coverageValue,
      status,
      commands,
      description: OWNER_CONTROL_SURFACE_DESCRIPTIONS[surface],
      recommendedAction: drillRecommendation(status, label),
    } satisfies OwnerControlDrill;
  });

  surfaces.sort((a, b) => {
    if (a.coverage === b.coverage) {
      return a.label.localeCompare(b.label);
    }
    return a.coverage - b.coverage;
  });

  const readinessScore = Number(
    (
      surfaces.reduce((total, drill) => total + drill.coverage, 0) /
      Math.max(surfaces.length, 1)
    ).toFixed(3),
  );
  const { classification, summary } = classifyOwnerControlDrillScore(readinessScore);
  const readyCount = surfaces.filter((drill) => drill.status === 'ready').length;
  const flagged = surfaces.filter((drill) => drill.status !== 'ready');
  const focusAreas =
    surfaces.length === 0
      ? ['No control surfaces detected – configure owner command catalog to retain unstoppable custody.']
      : surfaces
          .slice(0, Math.min(3, surfaces.length))
          .map(
            (drill) =>
              `${drill.label} – ${(drill.coverage * 100).toFixed(1)}% coverage (${drill.status.toUpperCase()})`,
          );
  const directives =
    surfaces.length === 0
      ? ['Authorise deterministic owner programs to unlock control drills.']
      : [
          `Keep ${readyCount}/${surfaces.length} drills locked at unstoppable readiness through weekly owner autopilot verification.`,
        ];
  if (flagged.length > 0) {
    for (const drill of flagged) {
      directives.push(`${drill.label}: ${drill.recommendedAction}`);
    }
  } else {
    directives.push(
      'Rotate pause, resume, treasury, and orchestrator drills through the owner autopilot program every 24 hours to preserve unstoppable command coverage.',
    );
  }
  directives.push('Archive rehearsal proofs inside the governance safe to maintain immutable auditability.');
  const mermaid = generateOwnerControlDrillMermaid({ readinessScore, classification, drills: surfaces });
  return {
    readinessScore,
    classification,
    summary,
    drills: surfaces,
    focusAreas,
    directives,
    mermaid,
  };
}

function sanitiseId(prefix: string, value: string, index: number): string {
  const safe = value.replace(/[^a-zA-Z0-9]/g, '_');
  return `${prefix}_${index}_${safe}`;
}

function generateOwnerControlDrillMermaid(report: {
  readinessScore: number;
  classification: OwnerControlDrillClassification;
  drills: OwnerControlDrill[];
}): string {
  const rootId = 'OwnerDrillAuthority';
  const readinessId = 'DrillReadinessGauge';
  const lines = [
    'graph TD',
    `    ${rootId}["Owner Multi-Sig Drill Authority"]`,
    `    ${readinessId}["Readiness ${(report.readinessScore * 100).toFixed(1)}%\\n${report.classification.replace(/-/g, ' ')}"]`,
    `    ${rootId} --> ${readinessId}`,
  ];
  report.drills.forEach((drill, index) => {
    const id = sanitiseId('Drill', drill.id, index);
    const label = `${drill.label}\\n${(drill.coverage * 100).toFixed(1)}% • ${drill.status.toUpperCase()}`;
    lines.push(`    ${id}["${label}"]`);
    lines.push(`    ${readinessId} --> ${id}`);
    lines.push(`    class ${id} drill-${drill.status};`);
  });
  lines.push('    classDef readinessRoot fill:#0f172a,stroke:#0f172a,color:#38bdf8;');
  lines.push('    classDef readinessGauge fill:#1e3a8a,stroke:#1e40af,color:#f8fafc;');
  lines.push('    classDef drill-ready fill:#15803d,stroke:#14532d,color:#f0fdf4;');
  lines.push('    classDef drill-fortify fill:#b45309,stroke:#92400e,color:#fffbeb;');
  lines.push('    classDef drill-attention fill:#b91c1c,stroke:#7f1d1d,color:#fef2f2;');
  lines.push(`    class ${rootId} readinessRoot;`);
  lines.push(`    class ${readinessId} readinessGauge;`);
  return `${lines.join('\n')}\n`;
}

function generateOwnerControlDrillMarkdown(report: OwnerControlDrillReport): string {
  const lines: string[] = [
    '# Owner Control Drill Readiness',
    '',
    `- **Readiness Score:** ${(report.readinessScore * 100).toFixed(1)}% (${report.classification.replace(/-/g, ' ')})`,
    `- **Summary:** ${report.summary}`,
    '',
    '## Focus surfaces',
    '',
  ];
  const focusEntries = report.focusAreas.length > 0 ? report.focusAreas : ['No focus areas detected.'];
  for (const focus of focusEntries) {
    lines.push(`- ${focus}`);
  }
  lines.push('', '## Directives', '');
  const directiveEntries = report.directives.length > 0 ? report.directives : ['No directives surfaced.'];
  for (const directive of directiveEntries) {
    lines.push(`- ${directive}`);
  }
  lines.push('', '## Drill catalogue', '');
  lines.push('| Drill | Coverage | Status | Commands | Recommended action |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const drill of report.drills) {
    const preview = drill.commands.slice(0, 3).map((command) => `\`${command.replace(/\|/g, '\\|')}\``);
    const remainder = drill.commands.length - preview.length;
    const commandCell =
      preview.length === 0
        ? '_No commands surfaced_'
        : remainder > 0
        ? `${preview.join('<br />')}<br /><em>+${remainder} more</em>`
        : preview.join('<br />');
    lines.push(
      `| ${drill.label.replace(/\|/g, '\\|')} | ${(drill.coverage * 100).toFixed(1)}% | ${drill.status.toUpperCase()} | ${commandCell} | ${drill.recommendedAction.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('', '_Generated by AGI Jobs Economic Power orchestration._', '');
  return `${lines.join('\n')}\n`;
}

function generateOwnerCommandMermaid(summary: Summary, scenario: Scenario): string {
  const ownerNodeId = 'OwnerMultiSig';
  const ownerNode = `${ownerNodeId}["Owner Multi-Sig (${summary.ownerControl.threshold})"]`;
  const pauseNodeId = 'PauseCommand';
  const resumeNodeId = 'ResumeCommand';
  const pauseNode = `${pauseNodeId}["Pause • ${summary.ownerSovereignty.pauseScript}"]`;
  const resumeNode = `${resumeNodeId}["Resume • ${summary.ownerSovereignty.resumeScript}"]`;
  const coverageNodeId = 'CoverageGauge';
  const coverageNode = `${coverageNodeId}["Coverage ${(summary.metrics.ownerCommandCoverage * 100).toFixed(1)}%"]`;

  const parameterNodes = summary.ownerControl.controls.map((control, index) => {
    const id = sanitiseId('Parameter', control.parameter, index);
    const label = `${control.parameter}\\n${control.current} → ${control.target}`;
    const node = `${id}["${label}\\n${control.script}"]`;
    const edge = `    ${ownerNodeId} -->|Run| ${id}`;
    return { node, edge };
  });

  const upgradeNodes = summary.ownerSovereignty.upgradePaths.map((upgrade, index) => {
    const id = sanitiseId('Upgrade', upgrade.module, index);
    const node = `${id}["${upgrade.module} Upgrade\\n${upgrade.script}"]`;
    const edge = `    ${ownerNodeId} -->|Promote| ${id}`;
    return { node, edge };
  });

  const moduleNodes = scenario.modules.map((module, index) => {
    const id = sanitiseId('Module', module.id, index);
    const node = `${id}["${module.name}\\n${module.address.slice(0, 10)}…"]`;
    const edge = `    ${ownerNodeId} -->|Custody| ${id}`;
    return { node, edge };
  });

  const jobProgramNodes = summary.ownerCommandPlan.jobPrograms.map((program, index) => {
    const id = sanitiseId('JobProgram', program.id, index);
    const node = `${id}["Job • ${program.target}\\n${program.script}"]`;
    const edge = `    ${ownerNodeId} -->|Launch| ${id}`;
    return { node, edge };
  });

  const validatorProgramNodes = summary.ownerCommandPlan.validatorPrograms.map((program, index) => {
    const id = sanitiseId('ValidatorProgram', program.id, index);
    const node = `${id}["Validator • ${program.target}\\n${program.script}"]`;
    const edge = `    ${ownerNodeId} -->|Command| ${id}`;
    return { node, edge };
  });

  const adapterProgramNodes = summary.ownerCommandPlan.adapterPrograms.map((program, index) => {
    const id = sanitiseId('AdapterProgram', program.id, index);
    const node = `${id}["Adapter • ${program.target}\\n${program.script}"]`;
    const edge = `    ${ownerNodeId} -->|Bridge| ${id}`;
    return { node, edge };
  });

  const treasuryProgramNodes = summary.ownerCommandPlan.treasuryPrograms.map((program, index) => {
    const id = sanitiseId('TreasuryProgram', program.id, index);
    const node = `${id}["Treasury • ${program.target}\\n${program.script}"]`;
    const edge = `    ${ownerNodeId} -->|Fund| ${id}`;
    return { node, edge };
  });

  const orchestratorProgramNodes = summary.ownerCommandPlan.orchestratorPrograms.map((program, index) => {
    const id = sanitiseId('OrchestratorProgram', program.id, index);
    const node = `${id}["Orchestrator • ${program.target}\\n${program.script}"]`;
    const edge = `    ${ownerNodeId} -->|Direct| ${id}`;
    return { node, edge };
  });

  const breakerNodes = summary.ownerSovereignty.circuitBreakers.map((breaker, index) => {
    const id = sanitiseId('Breaker', breaker.metric, index);
    const label = `${breaker.metric} ${breaker.comparator} ${breaker.threshold}`;
    const node = `${id}["${label}\\n${breaker.action}"]`;
    const edge = `    ${id} -->|Triggers| ${pauseNodeId}`;
    return { node, edge };
  });

  const nodes = [ownerNode, pauseNode, resumeNode, coverageNode]
    .concat(parameterNodes.map((entry) => entry.node))
    .concat(upgradeNodes.map((entry) => entry.node))
    .concat(jobProgramNodes.map((entry) => entry.node))
    .concat(validatorProgramNodes.map((entry) => entry.node))
    .concat(adapterProgramNodes.map((entry) => entry.node))
    .concat(treasuryProgramNodes.map((entry) => entry.node))
    .concat(orchestratorProgramNodes.map((entry) => entry.node))
    .concat(moduleNodes.map((entry) => entry.node))
    .concat(breakerNodes.map((entry) => entry.node));

  const edges = [
    `    ${ownerNodeId} -->|Verify| ${coverageNodeId}`,
    `    ${ownerNodeId} -->|Pause| ${pauseNodeId}`,
    `    ${ownerNodeId} -->|Resume| ${resumeNodeId}`,
  ]
    .concat(parameterNodes.map((entry) => entry.edge))
    .concat(upgradeNodes.map((entry) => entry.edge))
    .concat(jobProgramNodes.map((entry) => entry.edge))
    .concat(validatorProgramNodes.map((entry) => entry.edge))
    .concat(adapterProgramNodes.map((entry) => entry.edge))
    .concat(treasuryProgramNodes.map((entry) => entry.edge))
    .concat(orchestratorProgramNodes.map((entry) => entry.edge))
    .concat(moduleNodes.map((entry) => entry.edge))
    .concat(breakerNodes.map((entry) => entry.edge));

  return `graph LR\n    ${nodes.join('\n    ')}\n${edges.join('\n')}`;
}

function generateDeploymentIntegrityMermaid({
  scenario,
  summary,
  coverage,
  config,
  score,
  classification,
}: {
  scenario: Scenario;
  summary: Summary;
  coverage: DeploymentIntegrityCoverage;
  config: DeploymentConfig | null;
  score: number;
  classification: DeploymentIntegrityClassification;
}): string {
  const ownerNodeId = 'DeploymentOwner';
  const configNodeId = 'DeploymentConfig';
  const safetyNodeId = 'DeploymentSafety';
  const observabilityNodeId = 'DeploymentObservability';
  const metricsNodeId = 'DeploymentScore';
  const dashboards = scenario.observability?.dashboards?.length ?? 0;
  const alerts = scenario.observability?.alertChannels?.length ?? 0;
  const lines: string[] = [
    'graph LR',
    `    ${configNodeId}["${escapeMermaidLabel(
      `Config ${config?.network ?? scenario.network.name}\\nChain ${config?.chainId ?? scenario.network.chainId}`,
    )}"]`,
    `    ${ownerNodeId}["${escapeMermaidLabel(
      `Owner Multi-Sig\\n${scenario.owner.governanceSafe.slice(0, 10)}…`,
    )}"]`,
    `    ${safetyNodeId}["${escapeMermaidLabel(
      `Safety Mesh\\nResponse ${summary.ownerSovereignty.responseMinutes}m`,
    )}"]`,
    `    ${observabilityNodeId}["${escapeMermaidLabel(
      `Observability\\nDashboards ${dashboards} • Alerts ${alerts}`,
    )}"]`,
    `    ${metricsNodeId}["${escapeMermaidLabel(
      `Integrity ${(score * 100).toFixed(1)}%\\n${classification.replace(/-/g, ' ')}`,
    )}"]`,
    `    ${configNodeId} -->|Defaults| ${ownerNodeId}`,
    `    ${ownerNodeId} -->|Custody| ${safetyNodeId}`,
    `    ${ownerNodeId} -->|Telemetry| ${observabilityNodeId}`,
    `    ${ownerNodeId} --> ${metricsNodeId}`,
  ];
  scenario.modules.forEach((module, index) => {
    const moduleId = sanitiseId('IntegrityModule', module.id ?? module.name, index);
    const moduleLabel = `${module.name}\\n${module.status.replace(/-/g, ' ')}`;
    lines.push(`    ${moduleId}["${escapeMermaidLabel(moduleLabel)}"]`);
    lines.push(`    ${ownerNodeId} -->|${module.owner.slice(0, 10)}…| ${moduleId}`);
    if (config) {
      lines.push(`    ${configNodeId} --> ${moduleId}`);
    }
    const moduleClass =
      module.status === 'active'
        ? 'module-active'
        : module.status === 'pending-upgrade'
        ? 'module-pending'
        : module.status === 'paused'
        ? 'module-paused'
        : 'module-deprecated';
    lines.push(`    class ${moduleId} ${moduleClass};`);
  });
  lines.push('    classDef module-active fill:#0f172a,stroke:#0f172a,color:#38bdf8;');
  lines.push('    classDef module-pending fill:#1f2937,stroke:#f59e0b,color:#fef3c7;');
  lines.push('    classDef module-paused fill:#7f1d1d,stroke:#b91c1c,color:#fee2e2;');
  lines.push('    classDef module-deprecated fill:#374151,stroke:#4b5563,color:#d1d5db;');
  lines.push('    classDef config-root fill:#312e81,stroke:#4338ca,color:#e0e7ff;');
  lines.push('    classDef owner-root fill:#0f766e,stroke:#0d9488,color:#ecfdf5;');
  lines.push('    classDef score-root fill:#581c87,stroke:#7e22ce,color:#ede9fe;');
  lines.push(`    class ${configNodeId} config-root;`);
  lines.push(`    class ${ownerNodeId} owner-root;`);
  lines.push(`    class ${metricsNodeId} score-root;`);
  return `${lines.join('\n')}\n`;
}

function computeDeploymentIntegrity(
  summary: Summary,
  scenario: Scenario,
  options: { config?: DeploymentConfig | null; configPath?: string | null },
): DeploymentIntegrityReport {
  const { config = null, configPath = null } = options;
  const analysisTimestamp = summary.analysisTimestamp;
  const modules = scenario.modules ?? [];
  const ownerAddresses = new Set(
    [scenario.owner.governanceSafe, scenario.owner.operator, scenario.treasury.ownerSafe]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase()),
  );
  const ownedModules = modules.filter((module) => ownerAddresses.has(module.owner.toLowerCase())).length;
  const moduleCustodyCoverage = modules.length === 0 ? 1 : ownedModules / modules.length;
  const moduleStatusCoverage =
    modules.length === 0
      ? 1
      : modules.reduce((total, module) => total + moduleStatusWeight(module.status), 0) /
        Math.max(modules.length, 1);
  const auditScores = modules.map((module) =>
    computeAuditFreshnessScore(module.lastAudit, analysisTimestamp),
  );
  const auditCoverage = auditScores.length
    ? auditScores.reduce((total, value) => total + value, 0) / auditScores.length
    : 1;
  const longestJobHours = scenario.jobs.reduce(
    (max, job) => Math.max(max, job.executionHours),
    0,
  );
  const durationControl = scenario.owner.controls.find((control) => control.parameter === 'jobDuration');
  const durationTargetValue = (() => {
    if (!durationControl) return undefined;
    if (typeof durationControl.target === 'number') return Number(durationControl.target);
    const parsed = Number.parseFloat(String(durationControl.target));
    return Number.isFinite(parsed) ? parsed : undefined;
  })();
  const configDurationHours =
    config?.secureDefaults?.maxJobDurationSeconds != null
      ? config.secureDefaults.maxJobDurationSeconds / 3600
      : undefined;
  const effectiveDurationCap = Math.max(
    durationTargetValue ?? configDurationHours ?? longestJobHours,
    longestJobHours,
  );
  const jobCompliance =
    scenario.jobs.length === 0
      ? 1
      : scenario.jobs.filter((job) => job.executionHours <= effectiveDurationCap).length /
        Math.max(scenario.jobs.length, 1);
  const dashboards = scenario.observability?.dashboards?.length ?? 0;
  const alerts = scenario.observability?.alertChannels?.length ?? 0;
  const dashboardScore = dashboards >= 2 ? 1 : dashboards / Math.max(2, 1);
  const alertScore = alerts >= 2 ? 1 : alerts / Math.max(2, 1);
  const observabilityScore = (dashboardScore + alertScore) / 2;
  const pauseAvailability = summary.sovereignSafetyMesh.pauseReady ? 1 : 0.4;
  const resumeAvailability = summary.sovereignSafetyMesh.resumeReady ? 1 : 0.4;
  const pauseReadiness = (pauseAvailability + resumeAvailability) / 2;
  const commitMinutes = config?.secureDefaults?.validatorCommitWindowSeconds
    ? config.secureDefaults.validatorCommitWindowSeconds / 60
    : undefined;
  const revealMinutes = config?.secureDefaults?.validatorRevealWindowSeconds
    ? config.secureDefaults.validatorRevealWindowSeconds / 60
    : undefined;
  let validatorTarget = Math.max(commitMinutes ?? 0, revealMinutes ?? 0);
  if (!Number.isFinite(validatorTarget) || validatorTarget < 5) {
    validatorTarget = 15;
  }
  const validatorResponse = computeValidatorResponseScore(
    summary.ownerSovereignty.responseMinutes,
    validatorTarget,
  );
  const chainIdCoverage = config
    ? config.chainId === scenario.network.chainId
      ? 1
      : 0
    : 0.7;
  const coverage: DeploymentIntegrityCoverage = {
    chainId: Number(clamp01(chainIdCoverage).toFixed(3)),
    jobDuration: Number(clamp01(jobCompliance).toFixed(3)),
    moduleCustody: Number(clamp01(moduleCustodyCoverage).toFixed(3)),
    moduleStatus: Number(clamp01(moduleStatusCoverage).toFixed(3)),
    auditFreshness: Number(clamp01(auditCoverage).toFixed(3)),
    ownerCommand: Number(clamp01(summary.metrics.ownerCommandCoverage).toFixed(3)),
    sovereignControl: Number(clamp01(summary.metrics.sovereignControlScore).toFixed(3)),
    pauseReadiness: Number(clamp01(pauseReadiness).toFixed(3)),
    observability: Number(clamp01(observabilityScore).toFixed(3)),
    validatorResponse: Number(clamp01(validatorResponse).toFixed(3)),
  };
  const coverageValues = Object.values(coverage);
  const score = Number(
    (
      coverageValues.reduce((total, value) => total + value, 0) /
      Math.max(coverageValues.length, 1)
    ).toFixed(3),
  );
  const { classification, summary: classificationSummary } = classifyDeploymentIntegrity(score);
  const jobComplianceCount =
    scenario.jobs.length === 0
      ? 0
      : scenario.jobs.filter((job) => job.executionHours <= effectiveDurationCap).length;
  const pendingModules = modules.filter((module) => module.status !== 'active').length;
  const freshAudits = auditScores.filter((value) => value >= 0.95).length;
  const chainStatus = coverage.chainId >= 0.99;
  const checks: DeploymentIntegrityCheck[] = [
    {
      id: 'chain-alignment',
      label: 'Mainnet chain alignment',
      status: chainStatus ? 'pass' : 'attention',
      actual: config
        ? `Scenario ${scenario.network.chainId} vs Config ${config.chainId}`
        : `Scenario ${scenario.network.chainId}`,
      expected: config ? `${config.chainId}` : 'Deployment config required',
      impact: 'Ensures orchestration targets the same mainnet deployment registry as production contracts.',
      recommendation: chainStatus
        ? undefined
        : 'Synchronise scenario network metadata with the deployment config before promoting additional work.',
    },
    {
      id: 'job-duration',
      label: 'Job duration compliance',
      status: coverage.jobDuration >= 0.95 ? 'pass' : 'attention',
      actual: `${jobComplianceCount}/${scenario.jobs.length || 0} jobs ≤ ${effectiveDurationCap.toFixed(1)}h`,
      expected: `≤ ${effectiveDurationCap.toFixed(1)}h window`,
      impact: 'Protects validator commitment windows and treasury velocity.',
      recommendation:
        coverage.jobDuration >= 0.95
          ? undefined
          : 'Execute the owner parameter program to enforce the job duration ceiling prior to scaling throughput.',
    },
    {
      id: 'module-custody',
      label: 'Module custody control',
      status: coverage.moduleCustody >= 0.95 ? 'pass' : 'attention',
      actual: `${ownedModules}/${modules.length || 0} modules under owner custody`,
      expected: `All modules owned by ${scenario.owner.governanceSafe}`,
      impact: 'Guarantees every production contract remains under owner multi-sig authority.',
      recommendation:
        coverage.moduleCustody >= 0.95
          ? undefined
          : 'Migrate outstanding modules into the owner multi-sig before onboarding new employers.',
    },
    {
      id: 'module-status',
      label: 'Module upgrade posture',
      status: coverage.moduleStatus >= 0.95 ? 'pass' : 'attention',
      actual: pendingModules === 0 ? 'All modules active' : `${pendingModules} module upgrades pending`,
      expected: 'Active or staged upgrades',
      impact: 'Verifies upgrade sequencing and prevents stale modules from powering production flows.',
      recommendation:
        coverage.moduleStatus >= 0.95
          ? undefined
          : 'Execute queued upgrade scripts via owner:update-all to complete the hardened deployment bundle.',
    },
    {
      id: 'audit-freshness',
      label: 'Audit freshness',
      status: coverage.auditFreshness >= 0.9 ? 'pass' : 'attention',
      actual: `${freshAudits}/${modules.length || 0} module audits within the freshness target`,
      expected: 'All audits within 120 days',
      impact: 'Confirms auditors have recently reviewed every immutable module.',
      recommendation:
        coverage.auditFreshness >= 0.9
          ? undefined
          : 'Schedule follow-up audits for any module exceeding the freshness window before accepting new capital.',
    },
    {
      id: 'owner-command',
      label: 'Owner command coverage',
      status: coverage.ownerCommand >= 0.95 ? 'pass' : 'attention',
      actual: `Coverage ${formatPercent(coverage.ownerCommand)}`,
      expected: '≥ 95% owner command coverage',
      impact: 'Demonstrates the owner multi-sig can orchestrate every surface without developer intervention.',
      recommendation:
        coverage.ownerCommand >= 0.95
          ? undefined
          : 'Authorise missing deterministic programs to restore total owner command supremacy.',
    },
    {
      id: 'sovereign-control',
      label: 'Sovereign control score',
      status: coverage.sovereignControl >= 0.95 ? 'pass' : 'attention',
      actual: `Custody ${formatPercent(coverage.sovereignControl)}`,
      expected: '≥ 95% custody control',
      impact: 'Ensures treasury and core modules remain under explicit owner safe authority.',
      recommendation:
        coverage.sovereignControl >= 0.95
          ? undefined
          : 'Rotate any externally owned modules into the multi-sig custody set before scaling.',
    },
    {
      id: 'pause-readiness',
      label: 'Pause and resume readiness',
      status: coverage.pauseReadiness >= 0.95 ? 'pass' : 'attention',
      actual: `Pause ${summary.sovereignSafetyMesh.pauseReady ? 'ready' : 'pending'} • Resume ${summary.sovereignSafetyMesh.resumeReady ? 'ready' : 'pending'}`,
      expected: 'Immediate pause and resume',
      impact: 'Confirms the owner multi-sig can freeze and restore contracts on demand.',
      recommendation:
        coverage.pauseReadiness >= 0.95
          ? undefined
          : 'Rehearse pause/resume drills via owner:system-pause and owner:update-all to tighten response cadence.',
    },
    {
      id: 'observability',
      label: 'Observability coverage',
      status: coverage.observability >= 0.9 ? 'pass' : 'attention',
      actual: `Dashboards ${dashboards} • Alerts ${alerts}`,
      expected: '≥2 dashboards and ≥2 alert channels',
      impact: 'Guarantees monitoring can surface anomalies across the economic mesh instantly.',
      recommendation:
        coverage.observability >= 0.9
          ? undefined
          : 'Add redundant dashboards or alert routes to preserve continuous telemetry.',
    },
    {
      id: 'validator-response',
      label: 'Validator response alignment',
      status: coverage.validatorResponse >= 0.9 ? 'pass' : 'attention',
      actual: `Response ${summary.ownerSovereignty.responseMinutes}m vs target ≤ ${validatorTarget.toFixed(1)}m`,
      expected: `≤ ${validatorTarget.toFixed(1)} minutes`,
      impact: 'Keeps commit–reveal cycles within deterministic response windows.',
      recommendation:
        coverage.validatorResponse >= 0.9
          ? undefined
          : 'Accelerate incident response drills or tighten automation to meet validator window targets.',
    },
  ];
  const recommendations = checks
    .filter((check) => check.status !== 'pass' && check.recommendation)
    .map((check) => check.recommendation as string);
  if (recommendations.length === 0) {
    recommendations.push('Maintain immutable custody cadence and refresh module audits on the existing schedule.');
  }
  const notes: string[] = [
    `Owner multi-sig: ${scenario.owner.governanceSafe}`,
    `Treasury safe: ${scenario.treasury.ownerSafe}`,
    `Longest job window: ${longestJobHours.toFixed(1)}h`,
    `Validator quorum max: ${scenario.jobs.reduce(
      (max, job) => Math.max(max, job.validatorQuorum),
      0,
    )}`,
  ];
  if (configPath) {
    notes.push(`Deployment config: ${configPath}`);
  }
  if (config?.secureDefaults?.maxJobDurationSeconds) {
    notes.push(
      `Secure max job: ${(config.secureDefaults.maxJobDurationSeconds / 3600).toFixed(1)}h`,
    );
  }
  if (config?.secureDefaults?.validatorCommitWindowSeconds) {
    notes.push(
      `Commit window: ${(config.secureDefaults.validatorCommitWindowSeconds / 60).toFixed(1)}m`,
    );
  }
  if (config?.secureDefaults?.validatorRevealWindowSeconds) {
    notes.push(
      `Reveal window: ${(config.secureDefaults.validatorRevealWindowSeconds / 60).toFixed(1)}m`,
    );
  }
  const mermaid = generateDeploymentIntegrityMermaid({
    scenario,
    summary,
    coverage,
    config,
    score,
    classification,
  });
  return {
    analysisTimestamp,
    configPath: configPath ?? undefined,
    network: {
      name: scenario.network.name,
      chainId: scenario.network.chainId,
      explorer: scenario.network.explorer,
    },
    score,
    classification,
    summary: classificationSummary,
    coverage,
    checks,
    recommendations,
    notes,
    mermaid,
  };
}

function generateOwnerCommandMarkdown(summary: Summary): string {
  const lines: string[] = [];
  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  lines.push('# Owner Command Playbook');
  lines.push('');
  lines.push(
    'Generated for analysis window ' +
      new Date(summary.analysisTimestamp).toLocaleString('en-US', { timeZone: 'UTC' }) +
      ' • executed ' +
      new Date(summary.executionTimestamp).toLocaleString('en-US', { timeZone: 'UTC' }) +
      ' (UTC)',
  );
  lines.push('');
  lines.push(
    'Command coverage: ' +
      (summary.ownerCommandPlan.commandCoverage * 100).toFixed(1) +
      '% — ' +
      summary.ownerCommandPlan.coverageNarrative,
  );
  lines.push('');
  lines.push('## Coverage detail');
  lines.push('');
  const surfaceLabels: Record<CoverageSurface, string> = {
    jobs: 'Job programs',
    validators: 'Validator programs',
    stablecoinAdapters: 'Stablecoin adapters',
    modules: 'Protocol modules',
    parameters: 'Parameter overrides',
    pause: 'Emergency pause',
    resume: 'Resume procedure',
    treasury: 'Treasury playbooks',
    orchestrator: 'Orchestrator mesh',
  };
  for (const [surface, ratio] of Object.entries(summary.ownerCommandPlan.coverageDetail) as [
    CoverageSurface,
    number,
  ][]) {
    lines.push(
      `- ${surfaceLabels[surface]}: ${(ratio * 100).toFixed(1)}% coverage`,
    );
  }
  lines.push('');
  lines.push('## Quick actions');
  lines.push('');
  lines.push('- **Pause execution:** `' + summary.ownerCommandPlan.quickActions.pause + '`');
  lines.push('- **Resume execution:** `' + summary.ownerCommandPlan.quickActions.resume + '`');
  lines.push(
    '- **Median operator response time:** ' +
      summary.ownerCommandPlan.quickActions.responseMinutes +
      ' minutes',
  );
  lines.push('');
  lines.push('## Parameter controls');
  lines.push('');
  for (const control of summary.ownerCommandPlan.parameterControls) {
    lines.push(
      '- `' +
        control.parameter +
        '`: ' +
        control.current +
        ' → ' +
        control.target +
        ' via `' +
        control.script +
        '` — ' +
        control.description,
    );
  }
  lines.push('');
  lines.push('## Circuit breakers');
  lines.push('');
  for (const breaker of summary.ownerCommandPlan.circuitBreakers) {
    lines.push(
      '- ' +
        breaker.metric +
        ' ' +
        breaker.comparator +
        ' ' +
        breaker.threshold +
        ': run `' +
        breaker.action +
        '` — ' +
        breaker.description,
    );
  }
  lines.push('');
  lines.push('## Upgrade routes');
  lines.push('');
  for (const upgrade of summary.ownerCommandPlan.upgradePaths) {
    lines.push('- ' + upgrade.module + ': `' + upgrade.script + '` — ' + upgrade.description);
  }
  lines.push('');
  lines.push('## Job orchestration programs');
  lines.push('');
  if (summary.ownerCommandPlan.jobPrograms.length === 0) {
    lines.push('- No job programs defined. Expand command coverage to sustain autonomy.');
  } else {
    for (const program of summary.ownerCommandPlan.jobPrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Validator sovereignty programs');
  lines.push('');
  if (summary.ownerCommandPlan.validatorPrograms.length === 0) {
    lines.push('- No validator programs defined. Authorise validator overrides immediately.');
  } else {
    for (const program of summary.ownerCommandPlan.validatorPrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Stablecoin adapter programs');
  lines.push('');
  if (summary.ownerCommandPlan.adapterPrograms.length === 0) {
    lines.push('- No adapter programs defined. Create swap/bridge runbooks for resilience.');
  } else {
    for (const program of summary.ownerCommandPlan.adapterPrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Module supremacy programs');
  lines.push('');
  if (summary.ownerCommandPlan.modulePrograms.length === 0) {
    lines.push('- No module programs defined. Map upgrade hooks to preserve sovereignty.');
  } else {
    for (const program of summary.ownerCommandPlan.modulePrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Treasury command programs');
  lines.push('');
  if (summary.ownerCommandPlan.treasuryPrograms.length === 0) {
    lines.push('- No treasury programs defined. Script liquidity and buffer maintenance.');
  } else {
    for (const program of summary.ownerCommandPlan.treasuryPrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Orchestrator command programs');
  lines.push('');
  if (summary.ownerCommandPlan.orchestratorPrograms.length === 0) {
    lines.push('- No orchestrator programs defined. Provision command mesh for automation.');
  } else {
    for (const program of summary.ownerCommandPlan.orchestratorPrograms) {
      lines.push('- ' + program.target + ': `' + program.script + '` — ' + program.description);
    }
  }
  lines.push('');
  lines.push('## Capital trajectory checkpoints');
  lines.push('');
  for (const entry of summary.treasuryTrajectory) {
    const treasuryFormatted = formatter.format(entry.treasuryAfterJob);
    const netYieldFormatted = formatter.format(entry.netYield);
    lines.push(
      '- Step ' +
        entry.step +
        ' • ' +
        entry.jobName +
        ': treasury ' +
        treasuryFormatted +
        ' AGI, net yield ' +
        netYieldFormatted +
        ' AGI',
    );
  }
  lines.push('');
  lines.push('All commands are multi-sig ready and validated by deterministic CI.');
  lines.push('');
  lines.push('## Governance ledger alerts');
  lines.push('');
  if (summary.governanceLedger.alerts.length === 0) {
    lines.push('- All governance surfaces are green.');
  } else {
    for (const alert of summary.governanceLedger.alerts) {
      lines.push(
        `- [${alert.severity.toUpperCase()}] ${alert.summary} (${alert.details.join('; ')})`,
      );
    }
  }
  lines.push('');
  lines.push('## Custody ledger');
  lines.push('');
  for (const module of summary.governanceLedger.modules) {
    const notes = module.notes.length > 0 ? ` — ${module.notes.join(', ')}` : '';
    const auditLag =
      module.auditLagDays === null ? 'unknown audit lag' : `${module.auditLagDays} days since audit`;
    lines.push(
      `- ${module.name}: ${module.custody}, status ${module.status}, ${auditLag}${notes}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function buildOwnerAutopilot(summary: Summary, scenario: Scenario): OwnerAutopilot {
  const cadenceBase = summary.metrics.paybackHours /
    Math.max(summary.metrics.totalJobs, 1);
  const cadenceHours = Number(Math.max(6, Math.min(24, cadenceBase || 0)).toFixed(1));
  const guardrails = [
    `Pause • ${summary.ownerSovereignty.pauseScript}`,
    `Resume • ${summary.ownerSovereignty.resumeScript}`,
    ...summary.ownerSovereignty.circuitBreakers.map(
      (breaker) =>
        `${breaker.metric} ${breaker.comparator} ${breaker.threshold} → ${breaker.action}`,
    ),
    `Control drills ${(summary.ownerControlDrills.readinessScore * 100).toFixed(1)}% (${summary.ownerControlDrills.classification})`,
  ];
  const sequence: OwnerAutopilotCommand[] = [];
  const surfaces: Array<{
    surface: CoverageSurface | 'automation';
    programs: CommandProgram[];
  }> = [
    { surface: 'jobs', programs: summary.ownerCommandPlan.jobPrograms },
    { surface: 'validators', programs: summary.ownerCommandPlan.validatorPrograms },
    { surface: 'stablecoinAdapters', programs: summary.ownerCommandPlan.adapterPrograms },
    { surface: 'modules', programs: summary.ownerCommandPlan.modulePrograms },
    { surface: 'treasury', programs: summary.ownerCommandPlan.treasuryPrograms },
    { surface: 'orchestrator', programs: summary.ownerCommandPlan.orchestratorPrograms },
  ];
  for (const entry of surfaces) {
    for (const program of entry.programs.slice(0, 2)) {
      sequence.push({
        programId: program.id,
        surface: entry.surface,
        script: program.script,
        objective: program.description,
      });
    }
  }
  if (sequence.length === 0) {
    for (const program of scenario.commandCatalog.modulePrograms.slice(0, 3)) {
      sequence.push({
        programId: program.id,
        surface: 'modules',
        script: program.script,
        objective: program.description,
      });
    }
  }
  const narrative =
    'Autopilot cycles every ' +
    `${cadenceHours.toFixed(1)}h to refresh capital, validator posture, and orchestrator coverage while preserving ` +
    `${(summary.metrics.shockResilienceScore * 100).toFixed(1)}% shock resilience (${summary.shockResilience.classification}).`;
  return {
    mission: 'Sustain unstoppable economic acceleration with deterministic owner oversight.',
    cadenceHours,
    dominanceScore: summary.metrics.economicDominanceIndex,
    guardrails,
    narrative,
    telemetry: {
      economicDominanceIndex: summary.metrics.economicDominanceIndex,
      capitalVelocity: summary.metrics.capitalVelocity,
      globalExpansionReadiness: summary.metrics.globalExpansionReadiness,
      superIntelligenceIndex: summary.metrics.superIntelligenceIndex,
      shockResilienceScore: summary.metrics.shockResilienceScore,
      deploymentIntegrityScore: summary.metrics.deploymentIntegrityScore,
    },
    commandSequence: sequence,
  };
}

function classifyOwnerDominion(
  score: number,
): { classification: OwnerDominionClassification; summary: string } {
  if (score >= 0.95) {
    return {
      classification: 'total-dominion',
      summary:
        'Owner multi-sig exerts absolute dominion – every command, pause, and upgrade is scripted and rehearsed.',
    };
  }
  if (score >= 0.85) {
    return {
      classification: 'fortified',
      summary:
        'Owner control fabric is fortified with high safety mesh readiness – expand guardrails to reach total dominion.',
    };
  }
  if (score >= 0.7) {
    return {
      classification: 'elevated',
      summary:
        'Owner retains elevated authority – prioritise additional command scripts and safety rehearsals to harden custody.',
    };
  }
  return {
    classification: 'attention',
    summary:
      'Owner dominion requires immediate attention – script missing surfaces and accelerate safety drill coverage.',
  };
}

function buildOwnerDominion(summary: Summary): OwnerDominionReport {
  const { ownerDominionScore, ownerCommandCoverage, sovereignControlScore, sovereignSafetyScore } =
    summary.metrics;
  const { classification, summary: classificationSummary } = classifyOwnerDominion(ownerDominionScore);
  const coverageDetail = summary.ownerCommandPlan.coverageDetail;
  const guardrails = summary.ownerAutopilot.guardrails ?? [];
  const readiness = {
    pauseReady: summary.sovereignSafetyMesh.pauseReady,
    resumeReady: summary.sovereignSafetyMesh.resumeReady,
    responseMinutes: summary.sovereignSafetyMesh.responseMinutes,
    coverage: ownerCommandCoverage,
    safety: sovereignSafetyScore,
    control: sovereignControlScore,
  };

  const recommendedActions: string[] = [];
  const incompleteSurfaces = Object.entries(coverageDetail).filter(([, value]) =>
    typeof value === 'number' ? value < 1 : false,
  );
  if (incompleteSurfaces.length > 0) {
    recommendedActions.push(
      `Script deterministic programs for ${
        incompleteSurfaces
          .map(([surface]) => surface)
          .join(', ')
      } to achieve full coverage.`,
    );
  }
  if (!summary.sovereignSafetyMesh.pauseReady) {
    recommendedActions.push('Authorise pause command in multi-sig catalog.');
  }
  if (!summary.sovereignSafetyMesh.resumeReady) {
    recommendedActions.push('Define deterministic resume procedure.');
  }
  if (
    summary.sovereignSafetyMesh.responseMinutes >
    summary.sovereignSafetyMesh.targetResponseMinutes
  ) {
    recommendedActions.push('Shorten incident response drills to beat target response window.');
  }
  const pendingDrills = summary.ownerControlDrills.drills.filter(
    (drill) => drill.status !== 'ready',
  );
  if (pendingDrills.length > 0) {
    recommendedActions.push(
      `Promote ${pendingDrills.map((drill) => drill.label).join(', ')} to ready status with deterministic drill rehearsals.`,
    );
  }
  if (guardrails.length < 3) {
    recommendedActions.push('Publish additional guardrails to cover treasury, validators, and orchestrator cadence.');
  }
  if (summary.metrics.shockResilienceScore < 0.95) {
    recommendedActions.push(
      summary.shockResilience.recommendations[0] ??
        'Escalate guardrail and buffer programs to elevate shock resilience beyond 95%.',
    );
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push('Maintain autopilot cadence and periodic drills to preserve total dominion.');
  }

  const signals = [
    `Command coverage ${(ownerCommandCoverage * 100).toFixed(1)}%`,
    `Safety mesh ${(sovereignSafetyScore * 100).toFixed(1)}%`,
    `Custody ${(sovereignControlScore * 100).toFixed(1)}%`,
    `Guardrails ${guardrails.length}`,
    `Response ${summary.sovereignSafetyMesh.responseMinutes}m`,
    `Control drills ${(summary.ownerControlDrills.readinessScore * 100).toFixed(1)}% (${summary.ownerControlDrills.classification})`,
    `Shock resilience ${(summary.metrics.shockResilienceScore * 100).toFixed(1)}% (${summary.shockResilience.classification})`,
  ];

  return {
    score: ownerDominionScore,
    classification,
    summary: classificationSummary,
    guardrails,
    readiness,
    coverageDetail,
    signals,
    recommendedActions,
  };
}

function formatPercent(value: number, decimals = 1): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(decimals)}%`;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function moduleStatusWeight(
  status: Scenario['modules'][number]['status'],
): number {
  switch (status) {
    case 'active':
      return 1;
    case 'pending-upgrade':
      return 0.9;
    case 'paused':
      return 0.4;
    case 'deprecated':
      return 0.1;
    default:
      return 0.5;
  }
}

function computeAuditFreshnessScore(
  lastAudit: string,
  analysisTimestamp: string,
  targetDays = 120,
): number {
  const auditDate = new Date(lastAudit);
  const analysisDate = new Date(analysisTimestamp);
  if (Number.isNaN(auditDate.getTime()) || Number.isNaN(analysisDate.getTime())) {
    return 0.5;
  }
  const diffMs = Math.max(analysisDate.getTime() - auditDate.getTime(), 0);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= targetDays) {
    return 1;
  }
  if (diffDays <= targetDays * 1.5) {
    return 0.85;
  }
  if (diffDays <= targetDays * 2) {
    return 0.6;
  }
  return 0.3;
}

function computeValidatorResponseScore(
  responseMinutes: number,
  targetMinutes: number,
): number {
  if (responseMinutes <= targetMinutes) {
    return 1;
  }
  if (responseMinutes <= targetMinutes * 1.5) {
    return 0.85;
  }
  if (responseMinutes <= targetMinutes * 2) {
    return 0.7;
  }
  if (responseMinutes <= targetMinutes * 3) {
    return 0.5;
  }
  return 0.3;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

function computeProgramCoverage(catalog: CommandCatalog): ProgramCoverage {
  return {
    job: catalog.jobPrograms.length > 0 ? 1 : 0,
    validator: catalog.validatorPrograms.length > 0 ? 1 : 0,
    adapter: catalog.adapterPrograms.length > 0 ? 1 : 0,
    module: catalog.modulePrograms.length > 0 ? 1 : 0,
    treasury: catalog.treasuryPrograms.length > 0 ? 1 : 0,
    orchestrator: catalog.orchestratorPrograms.length > 0 ? 1 : 0,
  };
}

function classifyOwnerControlSupremacy(
  index: number,
): { classification: OwnerControlSupremacyClassification; summary: string } {
  if (index >= 0.97) {
    return {
      classification: 'total-supremacy',
      summary:
        'Owner multi-sig commands every surface with rehearsed guardrails – supremacy is absolute and unstoppable.',
    };
  }
  if (index >= 0.9) {
    return {
      classification: 'fortified-supremacy',
      summary:
        'Owner supremacy is fortified across command, custody, and safety – expand scripts to reach total supremacy.',
    };
  }
  if (index >= 0.8) {
    return {
      classification: 'elevated',
      summary:
        'Owner retains elevated command authority – script missing guardrails to close remaining gaps.',
    };
  }
  return {
    classification: 'attention',
    summary:
      'Owner supremacy requires immediate action – authorise programs and incident drills to reclaim absolute control.',
  };
}

function classifyDeploymentIntegrity(
  score: number,
): { classification: DeploymentIntegrityClassification; summary: string } {
  if (score >= 0.97) {
    return {
      classification: 'immutable-dominion',
      summary:
        'Deployment lattice anchored to Ethereum mainnet with immutable owner custody, fresh audits, and rehearsed safety mesh.',
    };
  }
  if (score >= 0.9) {
    return {
      classification: 'fortified',
      summary:
        'Deployment posture fortified – execute remaining upgrades and guardrail drills to crystallise immutable dominion.',
    };
  }
  if (score >= 0.8) {
    return {
      classification: 'reinforced',
      summary:
        'Deployment fabric reinforced – align outstanding custody, audit, or response targets to achieve fortified posture.',
    };
  }
  return {
    classification: 'attention',
    summary:
      'Deployment verification requires immediate attention – reconcile chain metadata, safety drills, and module custody before scaling.',
  };
}

function generateOwnerControlSupremacyMermaid(
  summary: Summary,
  index: number,
  coverageDetail: Record<CoverageSurface, number>,
  programCoverage: ProgramCoverage,
  guardrailCoverage: number,
): string {
  const lines: string[] = [];
  lines.push('graph LR');
  lines.push(
    `  OWNER["Owner Multi-Sig • Supremacy ${formatPercent(index)}"]`,
  );
  lines.push(
    `  OWNER --> Coverage["Command Coverage ${formatPercent(summary.metrics.ownerCommandCoverage)}"]`,
  );
  lines.push(
    `  OWNER --> Custody["Custody ${formatPercent(summary.metrics.sovereignControlScore)}"]`,
  );
  lines.push(
    `  OWNER --> Safety["Safety Mesh ${formatPercent(summary.metrics.sovereignSafetyScore)}"]`,
  );
  lines.push(
    `  OWNER --> Guardrails["Guardrail Coverage ${formatPercent(guardrailCoverage)}"]`,
  );
  lines.push(
    `  OWNER --> Response["Response ${summary.ownerCommandPlan.quickActions.responseMinutes}m"]`,
  );

  const surfaceLabels: Record<CoverageSurface, string> = {
    jobs: 'Job orchestration',
    validators: 'Validator sovereignty',
    stablecoinAdapters: 'Stablecoin adapters',
    modules: 'Protocol modules',
    parameters: 'Parameter overrides',
    pause: 'Emergency pause',
    resume: 'Emergency resume',
    treasury: 'Treasury programs',
    orchestrator: 'Orchestrator mesh',
  };
  let surfaceIndex = 0;
  const coverageEntries = Object.entries(coverageDetail) as Array<[
    CoverageSurface,
    number,
  ]>;
  for (const [surface, value] of coverageEntries) {
    const nodeId = sanitiseId('Surface', surface, surfaceIndex++);
    const label = `${surfaceLabels[surface as CoverageSurface]} ${formatPercent(value)}`;
    lines.push(`  Coverage --> ${nodeId}["${escapeMermaidLabel(label)}"]`);
  }

  const programLabels: Record<keyof ProgramCoverage, string> = {
    job: 'Job programs',
    validator: 'Validator programs',
    adapter: 'Adapter programs',
    module: 'Module programs',
    treasury: 'Treasury programs',
    orchestrator: 'Orchestrator programs',
  };
  const programEntries = Object.entries(programCoverage) as Array<[
    keyof ProgramCoverage,
    number,
  ]>;
  let programIndex = 0;
  for (const [category, value] of programEntries) {
    const nodeId = sanitiseId('Program', category, programIndex++);
    const label = `${programLabels[category as keyof ProgramCoverage]} ${formatPercent(value)}`;
    lines.push(`  Guardrails --> ${nodeId}["${escapeMermaidLabel(label)}"]`);
  }

  const pauseLabel = escapeMermaidLabel(`Pause ${summary.ownerCommandPlan.quickActions.pause}`);
  const resumeLabel = escapeMermaidLabel(`Resume ${summary.ownerCommandPlan.quickActions.resume}`);
  lines.push(`  Response --> Pause["${pauseLabel}"]`);
  lines.push(`  Response --> Resume["${resumeLabel}"]`);
  return `${lines.join('\n')}\n`;
}

function buildOwnerControlSupremacy(summary: Summary): OwnerControlSupremacy {
  const coverageDetail = summary.ownerCommandPlan.coverageDetail;
  const coverageValues = Object.values(coverageDetail);
  const coverageAverage =
    coverageValues.reduce((acc, value) => acc + value, 0) /
    Math.max(coverageValues.length, 1);
  const guardrailTarget = summary.ownerSovereignty.circuitBreakers.length + 2; // pause + resume
  const guardrailCoverage = guardrailTarget === 0
    ? 1
    : Math.min(summary.ownerAutopilot.guardrails.length / guardrailTarget, 1);
  const programCoverage = computeProgramCoverage(summary.commandCatalog);
  const programEntries = Object.entries(programCoverage) as Array<[
    keyof ProgramCoverage,
    number,
  ]>;
  const programCoverageScore =
    programEntries.reduce((acc, [, value]) => acc + value, 0) /
    Math.max(programEntries.length, 1);
  const responseTarget = summary.sovereignSafetyMesh.targetResponseMinutes;
  const quickActions = summary.ownerCommandPlan.quickActions;
  const quickActionScore =
    responseTarget <= 0
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            1 -
              Math.max(0, quickActions.responseMinutes - responseTarget) /
                Math.max(responseTarget, 1),
          ),
        );
  const drillReadiness = summary.ownerControlDrills.readinessScore;

  const coverageScore = summary.metrics.ownerCommandCoverage;
  const controlScore = summary.metrics.sovereignControlScore;
  const safetyScore = summary.metrics.sovereignSafetyScore;

  const indexRaw =
    0.28 * coverageScore +
    0.12 * coverageAverage +
    0.2 * controlScore +
    0.13 * safetyScore +
    0.1 * guardrailCoverage +
    0.05 * programCoverageScore +
    0.05 * quickActionScore +
    0.07 * drillReadiness;
  const index = Number(Math.min(1, Math.max(0, indexRaw)).toFixed(4));
  const { classification, summary: classificationSummary } = classifyOwnerControlSupremacy(index);

  const scriptedSurfaces = programEntries.filter(([, value]) => value === 1).length;
  const signals = [
    `Coverage ${formatPercent(coverageScore)}`,
    `Surface average ${formatPercent(coverageAverage)}`,
    `Custody ${formatPercent(controlScore)}`,
    `Safety ${formatPercent(safetyScore)}`,
    `Guardrails ${formatPercent(guardrailCoverage)}`,
    `Response ${quickActions.responseMinutes}m (target ≤ ${responseTarget}m)`,
    `Control drills ${formatPercent(drillReadiness)}`,
    `${scriptedSurfaces}/${programEntries.length} program surfaces scripted`,
  ];

  const recommendedActions: string[] = [];
  const coverageEntries = Object.entries(coverageDetail) as Array<[
    CoverageSurface,
    number,
  ]>;
  for (const [surface, value] of coverageEntries) {
    if (value < 1) {
      recommendedActions.push(`Authorise additional programs for ${surface} surface to close supremacy gap.`);
    }
  }
  if (guardrailCoverage < 1) {
    recommendedActions.push('Publish guardrails covering every circuit breaker and treasury command.');
  }
  for (const [category, value] of programEntries) {
    if (value < 1) {
      recommendedActions.push(`Add deterministic programs for ${category} category to secure supremacy.`);
    }
  }
  const pendingDrills = summary.ownerControlDrills.drills.filter(
    (drill) => drill.status !== 'ready',
  );
  if (pendingDrills.length > 0) {
    recommendedActions.push(
      `Elevate ${pendingDrills.map((drill) => drill.label).join(', ')} drills to ready status to preserve supremacy.`,
    );
  }
  if (quickActionScore < 1) {
    recommendedActions.push('Accelerate incident response drills to beat the target response window.');
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push('Supremacy absolute – maintain guardrail rehearsals to preserve total control.');
  }

  const mermaid = generateOwnerControlSupremacyMermaid(
    summary,
    index,
    coverageDetail,
    programCoverage,
    guardrailCoverage,
  );

  return {
    index,
    classification,
    summary: classificationSummary,
    guardrailCoverage,
    programCoverage,
    coverageDetail,
    quickActions,
    signals,
    recommendedActions,
    mermaid,
  };
}

function classifySuperIntelligence(index: number): {
  classification: SuperIntelligenceClassification;
  summary: string;
} {
  if (index >= 0.96) {
    return {
      classification: 'transcendent-dominion',
      summary:
        'The owner multi-sig directs a civilisation-scale AGI lattice with unstoppable command authority, capital velocity, and risk absorption.',
    };
  }
  if (index >= 0.9) {
    return {
      classification: 'planetary-dominant',
      summary:
        'Automation, safety mesh, and treasury firepower already surpass planetary demand – only incremental guardrails remain before total transcendence.',
    };
  }
  if (index >= 0.75) {
    return {
      classification: 'ascendant',
      summary:
        'The engine is accelerating toward unstoppable scale; expand scripted coverage and validator depth to eliminate the remaining choke points.',
    };
  }
  return {
    classification: 'formative',
    summary:
      'Foundational loops are online, but the owner must authorise additional guardrails, automation, and custody to unlock superintelligent leverage.',
  };
}

function buildSuperIntelligence(summary: Summary): SuperIntelligenceReport {
  const metrics = summary.metrics;
  const supremacyIndex = summary.ownerControlSupremacy.index;
  const weights = {
    economicDominance: 0.2,
    ownerSupremacy: 0.2,
    sovereignSafety: 0.18,
    automation: 0.14,
    shockResilience: 0.14,
    globalExpansion: 0.08,
    sovereignControl: 0.06,
  } as const;

  const indexRaw =
    metrics.economicDominanceIndex * weights.economicDominance +
    supremacyIndex * weights.ownerSupremacy +
    metrics.sovereignSafetyScore * weights.sovereignSafety +
    metrics.automationScore * weights.automation +
    metrics.shockResilienceScore * weights.shockResilience +
    metrics.globalExpansionReadiness * weights.globalExpansion +
    metrics.sovereignControlScore * weights.sovereignControl;
  const index = Number(Math.min(1, Math.max(0, indexRaw)).toFixed(4));
  const { classification, summary: narrative } = classifySuperIntelligence(index);

  const drivers = [
    `Economic dominance ${(metrics.economicDominanceIndex * 100).toFixed(1)}% confirming runaway value capture.`,
    `Owner supremacy ${(supremacyIndex * 100).toFixed(1)}% with guardrail coverage ${(summary.ownerControlSupremacy.guardrailCoverage * 100).toFixed(1)}% keeping every lever under direct command.`,
    `Sovereign safety ${(metrics.sovereignSafetyScore * 100).toFixed(1)}% across ${summary.sovereignSafetyMesh.alertChannels.length} alert channels and ${summary.sovereignSafetyMesh.emergencyContacts.length} emergency contacts.`,
    `Automation mesh ${(metrics.automationScore * 100).toFixed(1)}% orchestrating agents without human delay.`,
    `Shock resilience ${(metrics.shockResilienceScore * 100).toFixed(1)}% ensuring capital velocity persists under failure scenarios.`,
  ];

  const commandAssurance = [
    `Command coverage ${(summary.ownerCommandPlan.commandCoverage * 100).toFixed(1)}% across ${Object.keys(summary.ownerCommandPlan.coverageDetail).length} sovereign surfaces.`,
    `Program supremacy guarantees ${(summary.ownerControlSupremacy.programCoverage.treasury * 100).toFixed(1)}% treasury control and ${(summary.ownerControlSupremacy.programCoverage.orchestrator * 100).toFixed(1)}% orchestrator automation.`,
    `Global expansion readiness ${(metrics.globalExpansionReadiness * 100).toFixed(1)}% unlocks immediate replication across jurisdictions.`,
  ];

  const mermaidLines = [
    'graph LR',
    `  EconomicDominance["Economic Dominance ${(metrics.economicDominanceIndex * 100).toFixed(1)}%"] --> Apex["Superintelligence ${(index * 100).toFixed(1)}%"]`,
    `  OwnerSupremacy["Owner Supremacy ${(supremacyIndex * 100).toFixed(1)}%"] --> Apex`,
    `  SovereignSafety["Sovereign Safety ${(metrics.sovereignSafetyScore * 100).toFixed(1)}%"] --> Apex`,
    `  Automation["Automation ${(metrics.automationScore * 100).toFixed(1)}%"] --> Apex`,
    `  ShockResilience["Shock Resilience ${(metrics.shockResilienceScore * 100).toFixed(1)}%"] --> Apex`,
    `  GlobalExpansion["Global Expansion ${(metrics.globalExpansionReadiness * 100).toFixed(1)}%"] --> Apex`,
  ];

  return {
    index,
    classification,
    narrative,
    drivers,
    commandAssurance,
    telemetry: {
      economicDominanceIndex: metrics.economicDominanceIndex,
      ownerSupremacyIndex: supremacyIndex,
      sovereignSafetyScore: metrics.sovereignSafetyScore,
      automationScore: metrics.automationScore,
      shockResilienceScore: metrics.shockResilienceScore,
      globalExpansionReadiness: metrics.globalExpansionReadiness,
    },
    mermaid: `${mermaidLines.join('\n')}\n`,
  };
}

function buildGlobalExpansionPlan(
  summary: Summary,
  scenario: Scenario,
): GlobalExpansionPhase[] {
  const readiness = summary.metrics.globalExpansionReadiness;
  const roi = summary.metrics.roiMultiplier;
  const validatorConfidence = summary.metrics.validatorConfidence;
  const automationScore = summary.metrics.automationScore;
  const commandCoverage = summary.metrics.ownerCommandCoverage;
  const phaseOneCommands = summary.ownerCommandPlan.jobPrograms
    .slice(0, 2)
    .map((program) => program.script);
  const phaseTwoCommands = summary.ownerCommandPlan.modulePrograms
    .slice(0, 2)
    .map((program) => program.script);
  const phaseThreeCommands = summary.ownerCommandPlan.treasuryPrograms
    .slice(0, 2)
    .map((program) => program.script);
  const basePlan: GlobalExpansionPhase[] = [
    {
      phase: 'Phase I – Testnet Supremacy',
      horizonHours: 72,
      focus: 'Execute deterministic pilots across L2 testnets and validate automation resilience.',
      readiness: Number(Math.min(1, readiness + 0.02).toFixed(3)),
      commands:
        phaseOneCommands.length > 0
          ? phaseOneCommands
          : ['npm run demo:economic-power -- --scenario testnet'],
      telemetryHooks: [
        `validatorConfidence>${(validatorConfidence * 100).toFixed(1)}%`,
        `automationScore>${automationScore.toFixed(3)}`,
      ],
    },
    {
      phase: 'Phase II – Mainnet Pilot Cohort',
      horizonHours: 240,
      focus: 'Promote core modules to mainnet with guardian oversight and slashing-enabled validation.',
      readiness: Number(Math.min(1, readiness + 0.05).toFixed(3)),
      commands:
        phaseTwoCommands.length > 0
          ? phaseTwoCommands
          : [summary.ownerSovereignty.pauseScript, summary.ownerSovereignty.resumeScript],
      telemetryHooks: [
        `ROI>${roi.toFixed(2)}x`,
        `coverage>${(commandCoverage * 100).toFixed(1)}%`,
      ],
    },
    {
      phase: 'Phase III – Planetary Expansion Mesh',
      horizonHours: 720,
      focus: 'Scale autonomous job mesh across global regions with treasury-backed liquidity surges.',
      readiness: Number(Math.min(1, readiness + 0.08).toFixed(3)),
      commands:
        phaseThreeCommands.length > 0
          ? phaseThreeCommands
          : ['npm run owner:program -- --program orchestrator-latency-reset'],
      telemetryHooks: [
        `capitalVelocity>${summary.metrics.capitalVelocity.toFixed(2)}/h`,
        `dominance>${(summary.metrics.economicDominanceIndex * 100).toFixed(1)}%`,
      ],
    },
  ];
  if (scenario.safeguards.upgradePaths.length > 0) {
    basePlan.push({
      phase: 'Phase IV – Governance Acceleration',
      horizonHours: 1440,
      focus: 'Transfer upgrade keys to community DAO with scripted multi-sig failsafes.',
      readiness: Number(Math.min(1, readiness + 0.1).toFixed(3)),
      commands: scenario.safeguards.upgradePaths.map((upgrade) => upgrade.script),
      telemetryHooks: [
        `governance-safe=${summary.ownerControl.governanceSafe}`,
        `alerts=${summary.governanceLedger.alerts.length}`,
      ],
    });
  }
  return basePlan;
}

function buildEconomicDominanceReport(summary: Summary): EconomicDominanceReport {
  const recommendations: string[] = [];
  if (summary.metrics.capitalVelocity < 40) {
    recommendations.push('Accelerate treasury cycling by executing `npm run owner:parameters` to tighten jobDuration.');
  }
  if (summary.metrics.economicDominanceIndex < 0.9) {
    recommendations.push('Increase validator quorums or deploy additional automation modules to push dominance > 90%.');
  }
  if (summary.metrics.shockResilienceScore < 0.9) {
    recommendations.push(summary.shockResilience.recommendations[0]);
  }
  if (recommendations.length === 0) {
    recommendations.push('Maintain current cadence; dominance metrics exceed unstoppable thresholds.');
  }
  return {
    analysisTimestamp: summary.analysisTimestamp,
    executionTimestamp: summary.executionTimestamp,
    dominanceIndex: summary.metrics.economicDominanceIndex,
    capitalVelocity: summary.metrics.capitalVelocity,
    roiMultiplier: summary.metrics.roiMultiplier,
    automationScore: summary.metrics.automationScore,
    sovereignSafetyScore: summary.metrics.sovereignSafetyScore,
    sovereignControlScore: summary.metrics.sovereignControlScore,
    shockResilienceScore: summary.metrics.shockResilienceScore,
    summary:
      'Economic dominance index blends ROI, automation, sovereignty, and safety mesh readiness to evidence unstoppable scale.',
    recommendations,
  };
}

function generateGlobalExpansionMarkdown(summary: Summary): string {
  const lines: string[] = [];
  lines.push('# Global Expansion Autopilot Plan');
  lines.push('');
  lines.push(`Scenario: ${summary.title}`);
  lines.push(
    `Generated ${new Date(summary.executionTimestamp).toISOString()} • Dominance ${(summary.metrics.economicDominanceIndex * 100).toFixed(1)}%`,
  );
  lines.push('');
  for (const phase of summary.globalExpansionPlan) {
    lines.push(`## ${phase.phase}`);
    lines.push('');
    lines.push(`- Horizon: ${phase.horizonHours}h`);
    lines.push(`- Focus: ${phase.focus}`);
    lines.push(`- Readiness: ${(phase.readiness * 100).toFixed(1)}%`);
    lines.push(`- Commands: ${phase.commands.join(', ')}`);
    lines.push(`- Telemetry hooks: ${phase.telemetryHooks.join(', ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function generateGlobalExpansionMermaid(phases: GlobalExpansionPhase[]): string {
  const lines = phases
    .map((phase, index) => {
      const status = phase.readiness >= 0.9 ? 'done' : phase.readiness >= 0.75 ? 'active' : 'crit';
      return `    ${phase.phase.replace(/[^a-zA-Z0-9]/g, '_')} :${status}, phase_${index}, ${phase.horizonHours}h`;
    })
    .join('\n');
  return `gantt\n    title Global Expansion Cadence\n    dateFormat  X\n${lines}`;
}

function generateOwnerAutopilotMermaid(autopilot: OwnerAutopilot): string {
  const header = 'graph TD';
  const missionNode = 'Mission[Mission Control]';
  const cadenceNode = `Cadence[Cadence ${autopilot.cadenceHours.toFixed(1)}h]`;
  const guardrailNodes = autopilot.guardrails.map((guardrail, index) => {
    const id = `Guardrail_${index}`;
    return { id, label: guardrail };
  });
  const commandNodes = autopilot.commandSequence.map((command, index) => {
    const id = `Command_${index}`;
    const label = `${command.surface.toUpperCase()} • ${command.script}`;
    return { id, label, objective: command.objective };
  });
  const lines: string[] = [header, `    ${missionNode} --> ${cadenceNode}`];
  for (const guardrail of guardrailNodes) {
    lines.push(`    ${cadenceNode.split('[')[0]} --> ${guardrail.id}[${guardrail.label}]`);
  }
  for (const command of commandNodes) {
    lines.push(`    ${cadenceNode.split('[')[0]} --> ${command.id}[${command.label}]`);
  }
  if (commandNodes.length > 0) {
    const objectives = commandNodes
      .map((command) => `    ${command.id} --> Objective_${command.id}[${command.objective}]`)
      .join('\n');
    if (objectives) {
      lines.push(objectives);
    }
  }
  return lines.join('\n');
}

const DEFAULT_SCENARIO = path.join(
  __dirname,
  '..',
  'scenario',
  'baseline.json',
);

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'reports');
const DEFAULT_SUMMARY_FILE = path.join(DEFAULT_OUTPUT_DIR, 'summary.json');
const DEFAULT_FLOW_FILE = path.join(DEFAULT_OUTPUT_DIR, 'flow.mmd');
const DEFAULT_TIMELINE_FILE = path.join(DEFAULT_OUTPUT_DIR, 'timeline.mmd');
const UI_DEFAULT_SUMMARY = path.join(__dirname, '..', 'ui', 'data', 'default-summary.json');
const UI_DETERMINISTIC_PROOF = path.join(
  __dirname,
  '..',
  'ui',
  'data',
  'deterministic-proof.json',
);
const UI_DETERMINISTIC_VERIFICATION = path.join(
  __dirname,
  '..',
  'ui',
  'data',
  'deterministic-verification.json',
);
const BASELINE_CI_SUMMARY = path.join(DEFAULT_OUTPUT_DIR, 'baseline-summary.json');
const DETERMINISTIC_VERSION = '1.0';

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalStringify(item));
    return `[${items.join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const serialised = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${canonicalStringify(val)}`)
    .join(',');
  return `{${serialised}}`;
}

function hashObject(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function pseudoRandom(seed: string): number {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const slice = hash.slice(0, 12);
  const int = parseInt(slice, 16);
  const max = Number.parseInt('ffffffffffff', 16);
  return int / max;
}

type AgentState = {
  availableAt: number;
  load: number;
};

type SimulationContext = {
  scenario: Scenario;
  assignments: Assignment[];
  totalEscrowedAgi: number;
  totalStable: number;
  validatorRewards: number;
  ownerBufferContribution: number;
  cumulativeValue: number;
  cumulativeCost: number;
  paybackHours: number;
  finalHour: number;
  validatorConfidence: number;
  automationLift: number;
};

function computeStabilityIndex(
  scenario: Scenario,
  context: SimulationContext,
): number {
  const riskWeights: Record<Scenario['jobs'][number]['risk'], number> = {
    low: 0.18,
    medium: 0.42,
    high: 0.68,
  };
  const averageRisk =
    scenario.jobs.reduce((acc, job) => acc + riskWeights[job.risk], 0) /
    Math.max(scenario.jobs.length, 1);
  const averageReliability =
    scenario.validators.reduce((acc, validator) => acc + validator.reliability, 0) /
    Math.max(scenario.validators.length, 1);
  const breakerBonus = scenario.safeguards.circuitBreakers.length * 0.015;
  const automationBonus =
    (context.automationLift / Math.max(context.assignments.length, 1)) * 0.04;
  const activeModules = scenario.modules.filter(
    (module) => module.status === 'active',
  ).length;
  const activeRatio = activeModules / Math.max(scenario.modules.length, 1);
  const now = Date.now();
  const auditFreshness =
    scenario.modules.reduce((acc, module) => {
      const parsed = Date.parse(module.lastAudit);
      if (Number.isNaN(parsed)) {
        return acc;
      }
      const daysSince = (now - parsed) / (1000 * 60 * 60 * 24);
      const freshness = Math.max(0, 1 - Math.min(daysSince / 180, 1));
      return acc + freshness;
    }, 0) / Math.max(scenario.modules.length, 1);
  const moduleBonus = activeRatio * 0.03 + auditFreshness * 0.02;
  const base =
    0.78 +
    (averageReliability - 0.95) * 0.5 -
    averageRisk * 0.32 +
    breakerBonus +
    automationBonus;
  const withModules = base + moduleBonus;
  return Number(Math.min(0.995, Math.max(0.65, withModules)).toFixed(3));
}

function collectCommandScripts(scenario: Scenario): string[] {
  const scripts = new Set<string>();
  for (const control of scenario.owner.controls) {
    scripts.add(control.script);
  }
  scripts.add(scenario.safeguards.pauseScript);
  scripts.add(scenario.safeguards.resumeScript);
  for (const module of scenario.modules) {
    scripts.add(module.upgradeScript);
  }
  for (const circuit of scenario.safeguards.circuitBreakers) {
    scripts.add(circuit.action);
  }
  for (const upgrade of scenario.safeguards.upgradePaths) {
    scripts.add(upgrade.script);
  }
  const catalogs = Object.values(scenario.commandCatalog) as CommandProgram[][];
  for (const catalog of catalogs) {
    for (const program of catalog) {
      scripts.add(program.script);
    }
  }
  return Array.from(scripts).sort();
}

function matchesTarget(
  program: CommandProgram,
  id: string,
  name?: string,
): boolean {
  const target = program.target.trim().toLowerCase();
  if (target === '*' || target === 'all') {
    return true;
  }
  if (target === id.toLowerCase()) {
    return true;
  }
  if (name && target === name.toLowerCase()) {
    return true;
  }
  return false;
}

function computeOwnerCommandCoverage(scenario: Scenario): CommandCoverage {
  const detail: Record<CoverageSurface, { covered: number; total: number }> = {
    jobs: { covered: 0, total: 0 },
    validators: { covered: 0, total: 0 },
    stablecoinAdapters: { covered: 0, total: 0 },
    modules: { covered: 0, total: 0 },
    parameters: { covered: 0, total: 0 },
    pause: { covered: 0, total: 0 },
    resume: { covered: 0, total: 0 },
    treasury: { covered: 0, total: 0 },
    orchestrator: { covered: 0, total: 0 },
  };

  let surfaces = 0;
  let covered = 0;

  const registerCoverage = <T>(
    surface: CoverageSurface,
    items: readonly T[],
    programs: readonly CommandProgram[],
    getIdentifiers: (item: T) => { id: string; name?: string },
  ) => {
    for (const item of items) {
      detail[surface].total += 1;
      surfaces += 1;
      const identifiers = getIdentifiers(item);
      const hasProgram = programs.some((program) => {
        if (!program.script || program.script.trim().length === 0) {
          return false;
        }
        return matchesTarget(program, identifiers.id, identifiers.name);
      });
      if (hasProgram) {
        detail[surface].covered += 1;
        covered += 1;
      }
    }
  };

  const jobPrograms = scenario.commandCatalog.jobPrograms.length
    ? scenario.commandCatalog.jobPrograms
    : scenario.commandCatalog.orchestratorPrograms;
  registerCoverage('jobs', scenario.jobs, jobPrograms, (job) => ({
    id: job.id,
    name: job.name,
  }));

  const validatorPrograms = scenario.commandCatalog.validatorPrograms.length
    ? scenario.commandCatalog.validatorPrograms
    : scenario.commandCatalog.orchestratorPrograms;
  registerCoverage('validators', scenario.validators, validatorPrograms, (validator) => ({
    id: validator.id,
    name: validator.name,
  }));

  registerCoverage(
    'stablecoinAdapters',
    scenario.stablecoinAdapters,
    scenario.commandCatalog.adapterPrograms,
    (adapter) => ({
      id: adapter.name,
      name: adapter.name,
    }),
  );

  const modulePrograms: CommandProgram[] = [
    ...scenario.commandCatalog.modulePrograms,
    ...scenario.safeguards.upgradePaths.map((upgrade, index) => ({
      id: `upgrade-path-${index}-${upgrade.module}`,
      target: upgrade.module,
      script: upgrade.script,
      description: upgrade.description,
    })),
    ...scenario.modules.map((module, index) => ({
      id: `module-upgrade-${index}-${module.id}`,
      target: module.id,
      script: module.upgradeScript,
      description: module.description,
    })),
  ];
  registerCoverage('modules', scenario.modules, modulePrograms, (module) => ({
    id: module.id,
    name: module.name,
  }));

  registerCoverage(
    'parameters',
    scenario.owner.controls,
    scenario.owner.controls.map((control, index) => ({
      id: `control-${index}-${control.parameter}`,
      target: control.parameter,
      script: control.script,
      description: control.description,
    })),
    (control) => ({ id: control.parameter, name: control.parameter }),
  );

  const applyBinaryCoverage = (surface: CoverageSurface, isCovered: boolean) => {
    detail[surface].total += 1;
    surfaces += 1;
    if (isCovered) {
      detail[surface].covered += 1;
      covered += 1;
    }
  };

  applyBinaryCoverage('pause', scenario.safeguards.pauseScript.trim().length > 0);
  applyBinaryCoverage('resume', scenario.safeguards.resumeScript.trim().length > 0);

  applyBinaryCoverage(
    'treasury',
    scenario.commandCatalog.treasuryPrograms.some((program) => program.script.trim().length > 0),
  );

  applyBinaryCoverage(
    'orchestrator',
    scenario.commandCatalog.orchestratorPrograms.some((program) => program.script.trim().length > 0),
  );

  const detailRatios = Object.fromEntries(
    (Object.keys(detail) as CoverageSurface[]).map((surface) => {
      const value = detail[surface];
      if (value.total === 0) {
        return [surface, 1];
      }
      return [surface, Number((value.covered / value.total).toFixed(3))];
    }),
  ) as Record<CoverageSurface, number>;

  const coverage = surfaces === 0 ? 1 : Number((covered / surfaces).toFixed(3));
  return { value: coverage, detail: detailRatios };
}

function computeSovereignControlScore(scenario: Scenario): number {
  if (scenario.modules.length === 0) {
    return 1;
  }
  const governanceOwners = new Set([
    scenario.owner.governanceSafe.toLowerCase(),
    scenario.owner.operator.toLowerCase(),
    scenario.treasury.ownerSafe.toLowerCase(),
  ]);
  let controlled = 0;
  for (const module of scenario.modules) {
    const moduleOwner = module.owner.toLowerCase();
    if (governanceOwners.has(moduleOwner) && module.status !== 'deprecated') {
      controlled += 1;
    }
  }
  const controlScore = controlled / Math.max(scenario.modules.length, 1);
  return Number(Math.min(1, Math.max(0, controlScore)).toFixed(3));
}

function computeSovereignSafetyMesh(
  scenario: Scenario,
  coverage: CommandCoverage,
  commandScripts: string[],
): SovereignSafetyMesh {
  const pauseReady = scenario.safeguards.pauseScript.trim().length > 0;
  const resumeReady = scenario.safeguards.resumeScript.trim().length > 0;
  const targetResponseMinutes = 15;
  const responseMinutes = Math.max(scenario.safeguards.responseMinutes, 0);
  const responseScoreBase =
    responseMinutes <= targetResponseMinutes
      ? 1
      : 1 - (responseMinutes - targetResponseMinutes) / (targetResponseMinutes * 2 || 1);
  const responseScore = Number(Math.max(0.4, Math.min(1, responseScoreBase)).toFixed(3));

  const circuitBreakerScore = Number(
    (
      scenario.safeguards.circuitBreakers.length === 0
        ? 0.5
        : Math.min(1, 0.7 + scenario.safeguards.circuitBreakers.length * 0.08)
    ).toFixed(3),
  );

  const alertCoverageScore = Number(
    (
      scenario.observability.alertChannels.length === 0
        ? 0.5
        : Math.min(1, 0.75 + scenario.observability.alertChannels.length * 0.08)
    ).toFixed(3),
  );

  const coverageSurfaces: CoverageSurface[] = [
    'pause',
    'resume',
    'treasury',
    'modules',
    'parameters',
  ];
  const coverageScore = Number(
    (
      coverageSurfaces.reduce((acc, surface) => acc + (coverage.detail[surface] ?? 0), 0) /
      Math.max(coverageSurfaces.length, 1)
    ).toFixed(3),
  );

  const scriptScoreBase = commandScripts.length / 20;
  const numericScriptScore = Number(
    Math.min(1, Math.max(0.4, scriptScoreBase)).toFixed(3),
  );

  const safetyScoreRaw =
    ((pauseReady ? 1 : 0.5) +
      (resumeReady ? 1 : 0.5) +
      responseScore +
      circuitBreakerScore +
      alertCoverageScore +
      coverageScore +
      numericScriptScore) /
    7;
  const safetyScore = Number(Math.min(1, Math.max(0, safetyScoreRaw)).toFixed(3));

  const notes: string[] = [];
  if (!pauseReady) {
    notes.push('Authorise an emergency pause script before production.');
  }
  if (!resumeReady) {
    notes.push('Define a deterministic resume command for incident recovery.');
  }
  if (responseMinutes > targetResponseMinutes) {
    notes.push('Response window exceeds defensive target – shorten multi-sig paging runbook.');
  }
  if (scenario.safeguards.circuitBreakers.length === 0) {
    notes.push('Add at least one circuit breaker to guard treasury velocity.');
  }
  if (scenario.observability.alertChannels.length === 0) {
    notes.push('Configure alert channels to broadcast incidents instantly.');
  }
  if (coverageScore < 1) {
    notes.push('Expand command coverage to reach absolute custody on every surface.');
  }

  return {
    pauseReady,
    resumeReady,
    targetResponseMinutes,
    responseMinutes,
    responseScore,
    circuitBreakerScore,
    alertCoverageScore,
    coverageScore,
    scriptScore: numericScriptScore,
    safetyScore,
    alertChannels: scenario.observability.alertChannels,
    emergencyContacts: scenario.safeguards.emergencyContacts,
    notes,
  };
}

function classifyShockResilience(
  score: number,
): { classification: ShockResilienceClassification; summary: string } {
  if (score >= 0.95) {
    return {
      classification: 'impregnable',
      summary:
        'Shockwaves are fully absorbed – treasury buffers, guardrails, and automation form an impregnable shield.',
    };
  }
  if (score >= 0.88) {
    return {
      classification: 'fortified',
      summary:
        'Infrastructure is fortified against exogenous shocks – expand redundancy to achieve impregnable status.',
    };
  }
  if (score >= 0.78) {
    return {
      classification: 'resilient',
      summary:
        'System is resilient but can further harden buffers, alerts, or automation density to deflect extreme scenarios.',
    };
  }
  return {
    classification: 'attention',
    summary:
      'Shock defences require immediate attention – reinforce emergency contacts, buffers, and guardrail coverage.',
  };
}

function computeShockResilience(
  scenario: Scenario,
  context: SimulationContext,
  coverage: CommandCoverage,
  safetyMesh: SovereignSafetyMesh,
  stabilityIndex: number,
): ShockResilienceReport {
  const riskWeights: Record<Scenario['jobs'][number]['risk'], number> = {
    low: 0.3,
    medium: 0.6,
    high: 0.85,
  };
  const averageRisk =
    scenario.jobs.reduce((acc, job) => acc + riskWeights[job.risk], 0) /
    Math.max(scenario.jobs.length, 1);
  const riskFactor = Math.max(0, 1 - averageRisk * 0.45);
  const guardrailCoverage =
    safetyMesh.safetyScore * 0.6 +
    Math.min(1, coverage.value) * 0.4;
  const emergencyContacts = scenario.safeguards.emergencyContacts.length;
  const alertChannels = scenario.observability.alertChannels.length;
  const bufferRatio =
    scenario.treasury.agiBalance <= 0
      ? 0
      : scenario.treasury.operationsBuffer /
        Math.max(scenario.treasury.agiBalance, 1);
  const automationDensity =
    context.assignments.length === 0
      ? 0
      : context.automationLift / Math.max(context.assignments.length, 1);
  const automationContribution = Math.min(
    0.12,
    automationDensity * 0.05 + context.validatorConfidence * 0.03,
  );

  const score = Number(
    Math.min(
      0.999,
      Math.max(
        0.65,
        0.11 +
          0.32 * stabilityIndex +
          0.22 * guardrailCoverage +
          0.16 * riskFactor +
          Math.min(0.12, bufferRatio * 0.5) +
          Math.min(0.08, emergencyContacts * 0.02) +
          Math.min(0.06, alertChannels * 0.02) +
          automationContribution,
      ),
    ).toFixed(3),
  );

  const { classification, summary } = classifyShockResilience(score);

  const drivers = [
    `Stability index ${(stabilityIndex * 100).toFixed(1)}%`,
    `Guardrail coverage ${(guardrailCoverage * 100).toFixed(1)}%`,
    `Risk dampening ${(riskFactor * 100).toFixed(1)}%`,
    `Emergency depth ${emergencyContacts} contact(s)`,
    `Alert mesh ${alertChannels} channel(s)`,
    `Operations buffer ${(bufferRatio * 100).toFixed(1)}% of treasury`,
    `Automation density ${(automationDensity * 100).toFixed(1)}%`,
  ];

  const recommendations: string[] = [];
  if (emergencyContacts < 3) {
    recommendations.push('Add additional emergency contacts to maintain 3+ escalation routes.');
  }
  if (alertChannels < 2) {
    recommendations.push('Provision redundant alert channels (e.g., PagerDuty + SMS) for shock broadcasts.');
  }
  if (bufferRatio < 0.1) {
    recommendations.push('Increase operations buffer to at least 10% of AGI treasury for liquidity resilience.');
  }
  if (automationDensity < 0.75) {
    recommendations.push('Deploy further automation runbooks to keep automation density above 75%.');
  }
  if (classification !== 'impregnable') {
    recommendations.push('Execute guardrail and emergency drills to elevate shock resilience to impregnable.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Maintain drill cadence and telemetry mirroring to preserve impregnable resilience.');
  }

  return {
    score,
    classification,
    summary,
    drivers,
    recommendations,
    telemetry: {
      stabilityIndex,
      guardrailCoverage,
      riskFactor,
      emergencyContacts,
      alertChannels,
      bufferRatio,
      automationDensity,
    },
  };
}

function buildGovernanceLedger(
  scenario: Scenario,
  summary: Summary,
  ownerPlan: OwnerCommandPlan,
  analysisTimestamp: string,
): GovernanceLedger {
  const scripts = collectCommandScripts(scenario);
  const governanceOwners = new Set([
    scenario.owner.governanceSafe.toLowerCase(),
    scenario.owner.operator.toLowerCase(),
    scenario.treasury.ownerSafe.toLowerCase(),
  ]);
  const parsedAnalysis = new Date(analysisTimestamp);
  const referenceDate = Number.isNaN(parsedAnalysis.getTime())
    ? new Date(summary.generatedAt)
    : parsedAnalysis;

  const modules: GovernanceLedgerModule[] = scenario.modules.map((module) => {
    const moduleOwner = module.owner.toLowerCase();
    const custody: GovernanceLedgerModule['custody'] = governanceOwners.has(moduleOwner)
      ? 'owner-controlled'
      : 'external';
    const auditDate = new Date(module.lastAudit);
    let auditLagDays: number | null = null;
    if (!Number.isNaN(auditDate.getTime())) {
      const diffMs = Math.max(referenceDate.getTime() - auditDate.getTime(), 0);
      auditLagDays = Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(1));
    }
    const auditStale = auditLagDays !== null && auditLagDays > 90;
    const notes: string[] = [];
    if (module.status === 'pending-upgrade') {
      notes.push('Pending upgrade');
    }
    if (auditStale) {
      notes.push('Audit refresh required');
    }
    if (custody === 'external') {
      notes.push('Custody outside owner multi-sig');
    }
    return {
      id: module.id,
      name: module.name,
      address: module.address,
      owner: module.owner,
      custody,
      status: module.status,
      upgradeScript: module.upgradeScript,
      auditLagDays,
      auditStale,
      notes,
    };
  });

  const alerts: GovernanceAlert[] = [];
  if (summary.metrics.ownerCommandCoverage < 0.9) {
    alerts.push({
      id: 'coverage-gap',
      severity: 'warning',
      summary: 'Command coverage below 90% – script additional surfaces to reach full control.',
      details: [
        `Coverage ${(summary.metrics.ownerCommandCoverage * 100).toFixed(1)}%`,
        'Add scripts for remaining modules, validators, or adapters to close the gap.',
      ],
    });
  }

  const externalModules = modules.filter((module) => module.custody === 'external');
  if (externalModules.length > 0) {
    alerts.push({
      id: 'external-custody',
      severity: 'critical',
      summary: `External custody detected for ${externalModules.length} module(s).`,
      details: externalModules.map((module) => `${module.name} → ${module.owner}`),
    });
  }

  const staleModules = modules.filter((module) => module.auditStale);
  if (staleModules.length > 0) {
    alerts.push({
      id: 'stale-audit',
      severity: 'warning',
      summary: `Audit refresh required for ${staleModules.length} module(s).`,
      details: staleModules.map((module) => {
        const lag = module.auditLagDays === null ? 'unknown' : `${module.auditLagDays} days`;
        return `${module.name} • Last audit ${lag} ago`;
      }),
    });
  }

  const pendingUpgradeModules = modules.filter((module) => module.status === 'pending-upgrade');
  if (pendingUpgradeModules.length > 0) {
    alerts.push({
      id: 'pending-upgrade',
      severity: 'info',
      summary: `Queued upgrades ready for ${pendingUpgradeModules.length} module(s).`,
      details: pendingUpgradeModules.map(
        (module) => `${module.name} • Execute ${module.upgradeScript} to promote`,
      ),
    });
  }

  if (summary.metrics.sovereignControlScore < 1) {
    alerts.push({
      id: 'sovereign-score',
      severity: 'warning',
      summary: 'Sovereign control score below 100% – migrate remaining modules to owner safes.',
      details: [`Score ${(summary.metrics.sovereignControlScore * 100).toFixed(1)}%`],
    });
  }

  if (summary.sovereignSafetyMesh.safetyScore < 0.95) {
    alerts.push({
      id: 'safety-mesh',
      severity: summary.sovereignSafetyMesh.safetyScore < 0.85 ? 'critical' : 'warning',
      summary: 'Sovereign safety mesh requires reinforcement to hit unstoppable thresholds.',
      details: [
        `Score ${(summary.sovereignSafetyMesh.safetyScore * 100).toFixed(1)}%`,
        ...summary.sovereignSafetyMesh.notes,
      ],
    });
  }

  if (!summary.sovereignSafetyMesh.pauseReady || !summary.sovereignSafetyMesh.resumeReady) {
    alerts.push({
      id: 'pause-resume-gap',
      severity: 'critical',
      summary: 'Pause/resume scripts missing – define deterministic runbooks immediately.',
      details: [
        `Pause ready: ${summary.sovereignSafetyMesh.pauseReady ? 'yes' : 'no'}`,
        `Resume ready: ${summary.sovereignSafetyMesh.resumeReady ? 'yes' : 'no'}`,
      ],
    });
  }

  if (summary.sovereignSafetyMesh.alertChannels.length === 0) {
    alerts.push({
      id: 'alert-channel-gap',
      severity: 'warning',
      summary: 'No alert channels configured for incident broadcast.',
      details: ['Configure PagerDuty, Slack, SMS, or equivalent notification routes.'],
    });
  }

  return {
    analysisTimestamp: referenceDate.toISOString(),
    ownerSafe: scenario.owner.operator,
    governanceSafe: scenario.owner.governanceSafe,
    treasurySafe: scenario.treasury.ownerSafe,
    threshold: scenario.owner.threshold,
    commandCoverage: summary.metrics.ownerCommandCoverage,
    coverageNarrative: ownerPlan.coverageNarrative,
    pauseScript: scenario.safeguards.pauseScript,
    resumeScript: scenario.safeguards.resumeScript,
    scripts,
    modules,
    alerts,
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function loadScenarioFromFile(filePath: string): Promise<Scenario> {
  const data = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(data);
  const scenario = scenarioSchema.parse(parsed);
  scenarioMetadata.set(scenario, { filePath: path.resolve(filePath) });
  return scenario;
}

function getScenarioFilePath(scenario: Scenario): string | undefined {
  const meta = scenarioMetadata.get(scenario);
  return meta?.filePath;
}

function resolveDeploymentConfigPath(
  scenario: Scenario,
  override?: string,
): string | null {
  const candidate = override ?? scenario.network?.deploymentRegistry;
  if (!candidate) {
    return null;
  }
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  const scenarioPath = getScenarioFilePath(scenario);
  if (scenarioPath) {
    const scenarioRelative = path.resolve(path.dirname(scenarioPath), candidate);
    if (existsSync(scenarioRelative)) {
      return scenarioRelative;
    }
  }
  const cwdRelative = path.resolve(process.cwd(), candidate);
  if (existsSync(cwdRelative)) {
    return cwdRelative;
  }
  return cwdRelative;
}

async function loadDeploymentConfig(
  configPath: string,
): Promise<DeploymentConfig | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return deploymentConfigSchema.parse(parsed);
  } catch (error) {
    console.warn('Unable to load deployment config:', error);
    return null;
  }
}

function computeAgentScore(
  agent: Scenario['agents'][number],
  job: Scenario['jobs'][number],
  state: AgentState,
): number {
  const requiredSkills = Math.max(job.skills.length, 1);
  const skillSet = agent.skills ?? [];
  const specializationSet = agent.specializations ?? [];
  const directMatches = job.skills.filter((skill) => skillSet.includes(skill)).length;
  const specializationMatches = job.skills.filter((skill) =>
    specializationSet.includes(skill),
  ).length;
  const skillCoverage = Math.min(
    1,
    (directMatches + specializationMatches * 0.5) / requiredSkills,
  );
  const availabilityScore = agent.availability;
  const reputationScore = agent.reputation / 100;
  const capacityPenalty = state.load / Math.max(agent.capacity, 1);
  const backlogPenalty = state.availableAt
    ? Math.min(state.availableAt / Math.max(job.executionHours, 1), 0.3)
    : 0;
  const zeroMatchPenalty = directMatches === 0 ? 0.45 : 0;
  const stochastic = pseudoRandom(`${agent.id}:${job.id}:match`) * 0.05;
  if (skillCoverage === 0) {
    return -1 + stochastic - backlogPenalty;
  }
  return (
    skillCoverage * 0.6 +
    reputationScore * 0.2 +
    availabilityScore * 0.12 -
    capacityPenalty * 0.08 -
    backlogPenalty -
    zeroMatchPenalty +
    stochastic
  );
}

function selectAgent(
  job: Scenario['jobs'][number],
  scenario: Scenario,
  agentStates: Map<string, AgentState>,
): { agent: Scenario['agents'][number]; state: AgentState } {
  let best:
    | { agent: Scenario['agents'][number]; state: AgentState; score: number }
    | undefined;
  for (const agent of scenario.agents) {
    const state = agentStates.get(agent.id);
    if (!state) continue;
    const score = computeAgentScore(agent, job, state);
    if (!best || score > best.score) {
      best = { agent, state, score };
    }
  }
  if (!best) {
    const fallbackAgent = scenario.agents[0];
    return { agent: fallbackAgent, state: agentStates.get(fallbackAgent.id)! };
  }
  return { agent: best.agent, state: best.state };
}

function selectValidators(
  job: Scenario['jobs'][number],
  scenario: Scenario,
): { validators: Scenario['validators']; confidence: number; stake: number } {
  const validators = [...scenario.validators]
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, job.validatorQuorum);
  const confidence =
    validators.reduce((acc, validator) => acc + validator.reliability, 0) /
      Math.max(validators.length, 1) +
    pseudoRandom(`validator:${job.id}`) * 0.01;
  const stake = validators.reduce((acc, validator) => acc + validator.stake, 0);
  return { validators, confidence, stake };
}

function deriveAssignment(
  job: Scenario['jobs'][number],
  agent: Scenario['agents'][number],
  state: AgentState,
  validatorSet: ReturnType<typeof selectValidators>,
): Assignment {
  const requiredSkills = Math.max(job.skills.length, 1);
  const skillSet = agent.skills ?? [];
  const specializationSet = agent.specializations ?? [];
  const directMatches = job.skills.filter((skill) => skillSet.includes(skill)).length;
  const specializationMatches = job.skills.filter((skill) =>
    specializationSet.includes(skill),
  ).length;
  const skillMatch = Math.min(
    1,
    (directMatches + specializationMatches * 0.5) / requiredSkills,
  );
  const loadFactor = state.load / Math.max(agent.capacity, 1);
  const speedMultiplier = 1 - Math.min(skillMatch * 0.12, 0.25) + loadFactor * 0.06;
  const duration = job.executionHours * Math.max(speedMultiplier, 0.65);
  const start = Math.max(state.availableAt, 0);
  const end = start + duration;
  const automationLift = 0.82 + pseudoRandom(`automation:${job.id}`) * 0.1;
  const validatorReward = job.rewardAgi * 0.08;
  const ownerBuffer = job.rewardAgi * 0.02;
  const netValue =
    job.economicValue -
    (job.rewardAgi + job.rewardStable + validatorReward + ownerBuffer);
  return {
    jobId: job.id,
    jobName: job.name,
    agentId: agent.id,
    agentName: agent.name,
    agentEns: agent.ens,
    startHour: start,
    endHour: end,
    efficiency: 1 / Math.max(speedMultiplier, 0.65),
    skillMatch,
    validatorIds: validatorSet.validators.map((validator) => validator.id),
    validatorNames: validatorSet.validators.map((validator) => validator.name),
    validatorConfidence: validatorSet.confidence,
    validatorStake: validatorSet.stake,
    rewardAgi: job.rewardAgi,
    rewardStable: job.rewardStable,
    netValue,
    economicValue: job.economicValue,
    automationLift,
  };
}

function updateState(
  agentStates: Map<string, AgentState>,
  agentId: string,
  end: number,
): void {
  const state = agentStates.get(agentId);
  if (!state) return;
  state.availableAt = end;
  state.load = Math.max(state.load - 1, 0);
}

function engageAgent(agentStates: Map<string, AgentState>, agentId: string): void {
  const state = agentStates.get(agentId);
  if (!state) return;
  state.load += 1;
}

function generateMermaidFlow(
  summary: Summary,
  scenario: Scenario,
): string {
  const ownerNode = `OwnerSafe[Owner Multi-Sig\\nThreshold ${summary.ownerControl.threshold}]`;
  const orchestratorNode = 'Orchestrator[Economic Power Orchestrator]';
  const stablecoinNode = 'StablecoinAdapter[Stablecoin Adapter]';
  const treasuryNode = 'Treasury[Treasury Escrow Vault]';
  const nodes = summary.assignments
    .map(
      (assignment) =>
        `Job_${assignment.jobId.replace(/[^a-zA-Z0-9]/g, '_')}[${assignment.jobName}]`,
    )
    .join('\n    ');
  const edges = summary.assignments
    .map((assignment) => {
      const jobNode = `Job_${assignment.jobId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const agentNode = `Agent_${assignment.agentId.replace(/[^a-zA-Z0-9]/g, '_')}[${assignment.agentName}]`;
      const validatorNode = `ValidatorSet_${assignment.jobId.replace(/[^a-zA-Z0-9]/g, '_')}[Validator Constellation\\n${assignment.validatorNames.join(', ')}]`;
      return `    ${orchestratorNode.split('[')[0]} -->|Posts| ${jobNode}\n    ${jobNode} -->|Executes| ${agentNode}\n    ${jobNode} -->|Validates| ${validatorNode}`;
    })
    .join('\n');
  return `graph TD\n    ${ownerNode} -->|Configures| ${orchestratorNode}\n    ${ownerNode} -->|Funds| ${treasuryNode}\n    ${treasuryNode} -->|Swaps| ${stablecoinNode}\n    ${stablecoinNode} -->|Escrow| ${orchestratorNode}\n    ${orchestratorNode}\n    ${nodes ? `    ${nodes}\n` : ''}${edges}`;
}

function generateMermaidTimeline(summary: Summary): string {
  const lines = summary.assignments
    .map((assignment) => {
      const start = assignment.startHour.toFixed(1);
      const end = assignment.endHour.toFixed(1);
      return `    section ${assignment.jobName}\n      ${assignment.agentName} :active, ${assignment.jobId}, ${start}h, ${(
        assignment.endHour - assignment.startHour
      ).toFixed(1)}h`;
    })
    .join('\n');
  return `gantt\n    title Economic Power Execution Timeline\n    dateFormat X\n${lines}`;
}

function synthesiseSummary(
  context: SimulationContext,
  analysisTimestamp: string,
  executionTimestamp: string,
): Summary {
  const { scenario } = context;
  const assignmentConfidence =
    context.validatorConfidence / Math.max(context.assignments.length, 1);
  const automationCoverageRaw =
    context.automationLift / Math.max(context.assignments.length, 1);
  const automationCoverage = Number(automationCoverageRaw.toFixed(3));
  const stabilityIndex = computeStabilityIndex(scenario, context);
  const ownerCoverage = computeOwnerCommandCoverage(scenario);
  const sovereignControlScore = computeSovereignControlScore(scenario);
  const commandScripts = collectCommandScripts(scenario);
  const sovereignSafetyMesh = computeSovereignSafetyMesh(
    scenario,
    ownerCoverage,
    commandScripts,
  );
  const ownerCommandPlan = buildOwnerCommandPlan(scenario, ownerCoverage);
  const ownerControlDrills = buildOwnerControlDrills(
    scenario,
    ownerCommandPlan,
    ownerCoverage,
  );
  const shockResilience = computeShockResilience(
    scenario,
    context,
    ownerCoverage,
    sovereignSafetyMesh,
    stabilityIndex,
  );
  const sovereignSafetyMeshWithShock: SovereignSafetyMesh = {
    ...sovereignSafetyMesh,
    shockResilienceScore: shockResilience.score,
    shockClassification: shockResilience.classification,
    shockSummary: shockResilience.summary,
  };
  const totalEscrowedAgi = Math.round(context.totalEscrowedAgi);
  const totalStablecoinVolume = Math.round(context.totalStable);
  const validatorRewards = Math.round(context.validatorRewards);
  const ownerBufferContribution = Math.round(context.ownerBufferContribution);
  const treasuryAfterRun = Math.round(
    scenario.treasury.agiBalance -
      context.validatorRewards -
      context.totalEscrowedAgi +
      context.cumulativeValue,
  );
  const roiRaw =
    context.cumulativeValue /
    Math.max(context.totalEscrowedAgi + context.totalStable, 1);
  const roiMultiplier = Number(roiRaw.toFixed(2));
  const netYield = Number(
    (
      context.cumulativeValue -
      (context.totalEscrowedAgi +
        context.totalStable +
        context.validatorRewards +
        context.ownerBufferContribution)
    ).toFixed(2),
  );
  const capitalVelocity = Number(
    (
      context.cumulativeValue /
      Math.max(context.finalHour <= 0 ? 1 : context.finalHour, 1)
    ).toFixed(2),
  );
  const dominanceIndex = Number(
    Math.min(
      1,
      0.1 +
        0.25 * Math.min(roiRaw / 4, 1) +
        0.15 * automationCoverageRaw +
        0.15 * stabilityIndex +
        0.15 * ownerCoverage.value +
        0.15 * sovereignControlScore +
        0.15 * sovereignSafetyMesh.safetyScore,
    ).toFixed(3),
  );
  const globalExpansionReadiness = Number(
    Math.min(
      1,
      0.2 * Math.min(capitalVelocity / 40, 1) +
        0.2 * automationCoverageRaw +
        0.2 * ownerCoverage.value +
        0.2 * sovereignControlScore +
        0.2 * sovereignSafetyMesh.safetyScore,
    ).toFixed(3),
  );
  const ownerDominionScore = Number(
    (
      0.4 * ownerCoverage.value +
      0.3 * sovereignSafetyMesh.safetyScore +
      0.3 * sovereignControlScore
    ).toFixed(3),
  );
  const riskMitigationScore = Number(
    (0.82 + pseudoRandom(`risk:${scenario.scenarioId}`) * 0.12).toFixed(3),
  );
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    generatedAt: analysisTimestamp,
    analysisTimestamp,
    executionTimestamp,
    metrics: {
      totalJobs: scenario.jobs.length,
      totalAgents: scenario.agents.length,
      totalValidators: scenario.validators.length,
      totalEscrowedAgi,
      totalStablecoinVolume,
      validatorRewardsAgi: validatorRewards,
      ownerBufferContribution,
      treasuryAfterRun,
      roiMultiplier,
      netYield,
      paybackHours: Number(context.paybackHours.toFixed(2)),
      throughputJobsPerDay: Number(
        ((context.assignments.length / Math.max(context.finalHour, 1)) * 24).toFixed(2),
      ),
      validatorConfidence: Number(assignmentConfidence.toFixed(4)),
      automationScore: automationCoverage,
      riskMitigationScore,
      stabilityIndex,
      ownerCommandCoverage: ownerCoverage.value,
      ownerDominionScore,
      ownerControlSupremacyIndex: 0,
      ownerControlDrillReadiness: ownerControlDrills.readinessScore,
      sovereignControlScore,
      sovereignSafetyScore: sovereignSafetyMesh.safetyScore,
      assertionPassRate: 0,
      economicDominanceIndex: dominanceIndex,
      capitalVelocity,
      globalExpansionReadiness,
      superIntelligenceIndex: 0,
      shockResilienceScore: shockResilience.score,
      deploymentIntegrityScore: 0,
    },
    ownerControl: {
      threshold: `${scenario.owner.threshold}-of-${scenario.owner.members}`,
      members: scenario.owner.members,
      governanceSafe: scenario.owner.governanceSafe,
      controls: scenario.owner.controls,
    },
    ownerSovereignty: {
      pauseScript: scenario.safeguards.pauseScript,
      resumeScript: scenario.safeguards.resumeScript,
      responseMinutes: scenario.safeguards.responseMinutes,
      emergencyContacts: scenario.safeguards.emergencyContacts,
      circuitBreakers: scenario.safeguards.circuitBreakers,
      upgradePaths: scenario.safeguards.upgradePaths,
      alertChannels: scenario.observability.alertChannels,
      shockResilienceScore: shockResilience.score,
      shockResilienceClassification: shockResilience.classification,
      shockResilienceSummary: shockResilience.summary,
    },
    commandCatalog: scenario.commandCatalog,
    assignments: context.assignments,
    mermaidFlow: '',
    mermaidTimeline: '',
    ownerCommandMermaid: '',
    ownerCommandPlan,
    ownerControlDrills,
    sovereignSafetyMesh: sovereignSafetyMeshWithShock,
    assertions: [],
    treasuryTrajectory: [],
    deployment: {
      network: scenario.network,
      treasuryOwner: scenario.treasury.ownerSafe,
      governanceSafe: scenario.owner.governanceSafe,
      modules: scenario.modules,
      stablecoinAdapters: scenario.stablecoinAdapters,
      automation: scenario.automation,
      observability: scenario.observability,
    },
    deploymentIntegrity: {
      analysisTimestamp,
      configPath: undefined,
      network: {
        name: scenario.network.name,
        chainId: scenario.network.chainId,
        explorer: scenario.network.explorer,
      },
      score: 0,
      classification: 'attention',
      summary: 'Deployment integrity placeholder – verification pending.',
      coverage: {
        chainId: 0,
        jobDuration: 0,
        moduleCustody: 0,
        moduleStatus: 0,
        auditFreshness: 0,
        ownerCommand: 0,
        sovereignControl: 0,
        pauseReadiness: 0,
        observability: 0,
        validatorResponse: 0,
      },
      checks: [],
      recommendations: [],
      notes: [],
      mermaid: '',
    },
    governanceLedger: {
      analysisTimestamp,
      ownerSafe: scenario.owner.operator,
      governanceSafe: scenario.owner.governanceSafe,
      treasurySafe: scenario.treasury.ownerSafe,
      threshold: scenario.owner.threshold,
      commandCoverage: ownerCoverage.value,
      coverageNarrative: coverageNarrative(ownerCoverage.value),
      pauseScript: scenario.safeguards.pauseScript,
      resumeScript: scenario.safeguards.resumeScript,
      scripts: commandScripts,
      modules: [],
      alerts: [],
    },
    ownerAutopilot: {
      mission: 'placeholder',
      cadenceHours: 0,
      dominanceScore: dominanceIndex,
      guardrails: [],
      narrative: '',
      telemetry: {
        economicDominanceIndex: dominanceIndex,
        capitalVelocity,
        globalExpansionReadiness,
        superIntelligenceIndex: 0,
        shockResilienceScore: shockResilience.score,
        deploymentIntegrityScore: 0,
      },
      commandSequence: [],
    },
    ownerDominion: {
      score: ownerDominionScore,
      classification: classifyOwnerDominion(ownerDominionScore).classification,
      summary: 'Owner dominion placeholder – autopilot guardrails pending synthesis.',
      guardrails: [],
      readiness: {
        pauseReady: sovereignSafetyMeshWithShock.pauseReady,
        resumeReady: sovereignSafetyMeshWithShock.resumeReady,
        responseMinutes: sovereignSafetyMeshWithShock.responseMinutes,
        coverage: ownerCoverage.value,
        safety: sovereignSafetyMeshWithShock.safetyScore,
        control: sovereignControlScore,
      },
      coverageDetail: ownerCoverage.detail,
      signals: [],
      recommendedActions: [],
    },
    ownerControlSupremacy: {
      index: 0,
      classification: 'attention',
      summary: 'Owner supremacy placeholder – guardrails and coverage synthesis pending.',
      guardrailCoverage: 0,
      programCoverage: computeProgramCoverage(scenario.commandCatalog),
      coverageDetail: ownerCoverage.detail,
      quickActions: {
        pause: scenario.safeguards.pauseScript,
        resume: scenario.safeguards.resumeScript,
        responseMinutes: scenario.safeguards.responseMinutes,
      },
      signals: [],
      recommendedActions: [],
      mermaid: '',
    },
    superIntelligence: {
      index: 0,
      classification: 'formative',
      narrative: 'Superintelligence index pending computation.',
      drivers: [],
      commandAssurance: [],
      telemetry: {
        economicDominanceIndex: dominanceIndex,
        ownerSupremacyIndex: 0,
        sovereignSafetyScore: sovereignSafetyMesh.safetyScore,
        automationScore: automationCoverage,
        shockResilienceScore: shockResilience.score,
        globalExpansionReadiness,
      },
      mermaid: '',
    },
    globalExpansionPlan: [],
    shockResilience,
  };
}

function computeAssertions(
  scenario: Scenario,
  summary: Summary,
): Assertion[] {
  const assertions: Assertion[] = [];

  const coverage = summary.metrics.ownerCommandCoverage;
  const ownerOutcome = coverage >= 0.9 ? 'pass' : 'fail';
  assertions.push({
    id: 'owner-command-dominance',
    title: 'Owner multi-sig commands every economic lever',
    outcome: ownerOutcome,
    severity: 'critical',
    summary:
      ownerOutcome === 'pass'
        ? 'Coverage exceeds 90%, ensuring deterministic owner runbooks across modules, pause hooks, and parameter updates.'
        : 'Coverage below 90% – authorise additional scripts before promoting to production.',
    metric: Number(coverage.toFixed(3)),
    target: 0.9,
    evidence: [
      `controls=${summary.ownerControl.controls.length}`,
      `modules=${summary.deployment.modules.length}`,
      `coverage=${coverage.toFixed(3)}`,
    ],
  });

  const governanceOwners = new Set([
    summary.ownerControl.governanceSafe.toLowerCase(),
    scenario.owner.operator.toLowerCase(),
    summary.deployment.treasuryOwner.toLowerCase(),
  ]);
  const uncontrolledModules = summary.deployment.modules.filter((module) =>
    !governanceOwners.has(module.owner.toLowerCase()),
  );
  const custodyRatio =
    (summary.deployment.modules.length - uncontrolledModules.length) /
    Math.max(summary.deployment.modules.length, 1);
  assertions.push({
    id: 'sovereign-custody',
    title: 'All modules sit under governed safes',
    outcome: uncontrolledModules.length === 0 ? 'pass' : 'fail',
    severity: 'critical',
    summary:
      uncontrolledModules.length === 0
        ? 'Every module remains under the owner multi-sig or treasury guardian.'
        : `Modules outside custody: ${uncontrolledModules
            .map((module) => module.name)
            .join(', ')}`,
    metric: Number(custodyRatio.toFixed(3)),
    target: 1,
    evidence: summary.deployment.modules.map(
      (module) => `${module.name}:${module.owner}`,
    ),
  });

  const skillFailures = summary.assignments.filter((assignment) => assignment.skillMatch < 0.6);
  const lowestSkillMatch = summary.assignments.reduce(
    (acc, assignment) => Math.min(acc, assignment.skillMatch),
    1,
  );
  assertions.push({
    id: 'skill-alignment',
    title: 'Job to agent skill alignment remains above 60%',
    outcome: skillFailures.length === 0 ? 'pass' : 'fail',
    severity: 'warning',
    summary:
      skillFailures.length === 0
        ? 'All assignments meet the skill-match threshold, confirming intelligent routing.'
        : `Assignments below threshold: ${skillFailures
            .map((assignment) => assignment.jobName)
            .join(', ')}`,
    target: 0.6,
    metric: Number(lowestSkillMatch.toFixed(3)),
    evidence: summary.assignments.map(
      (assignment) => `${assignment.jobId}:${assignment.skillMatch.toFixed(2)}`,
    ),
  });

  const quorumBreaches = summary.assignments.filter((assignment) => {
    const job = scenario.jobs.find((entry) => entry.id === assignment.jobId);
    return (
      !job ||
      assignment.validatorIds.length < job.validatorQuorum ||
      assignment.validatorConfidence < 0.9
    );
  });
  assertions.push({
    id: 'validator-strength',
    title: 'Validator quorums and confidence exceed defensive floor',
    outcome: quorumBreaches.length === 0 ? 'pass' : 'fail',
    severity: 'critical',
    summary:
      quorumBreaches.length === 0
        ? 'Validator sets satisfy quorum requirements with >90% confidence.'
        : `Validator gaps detected on: ${quorumBreaches
            .map((assignment) => assignment.jobName)
            .join(', ')}`,
    target: 0.9,
    metric: Number(summary.metrics.validatorConfidence.toFixed(3)),
    evidence: summary.assignments.map((assignment) => {
      const job = scenario.jobs.find((entry) => entry.id === assignment.jobId);
      const required = job ? job.validatorQuorum : 0;
      return `${assignment.jobId}:quorum=${assignment.validatorIds.length}/${required};confidence=${assignment.validatorConfidence.toFixed(3)}`;
    }),
  });

  const shockOutcome = summary.metrics.shockResilienceScore >= 0.9 ? 'pass' : 'fail';
  assertions.push({
    id: 'shock-resilience',
    title: 'Shock resilience remains at fortified threshold or higher',
    outcome: shockOutcome,
    severity: 'critical',
    summary:
      shockOutcome === 'pass'
        ? 'Shock defences surpass the fortified threshold ensuring economic continuity under stress.'
        : `Shock resilience below fortified band – ${summary.shockResilience.recommendations[0]}`,
    target: 0.9,
    metric: Number(summary.metrics.shockResilienceScore.toFixed(3)),
    evidence: summary.shockResilience.drivers,
  });

  const treasuryStress = summary.treasuryTrajectory.some(
    (entry) => entry.treasuryAfterJob <= 0,
  );
  const treasuryPositive = summary.metrics.treasuryAfterRun > 0 && !treasuryStress;
  assertions.push({
    id: 'treasury-resilience',
    title: 'Treasury remains solvent after every execution step',
    outcome: treasuryPositive ? 'pass' : 'fail',
    severity: 'critical',
    summary: treasuryPositive
      ? 'Treasury balance stays positive throughout the execution timeline.'
      : 'Treasury dipped below zero – inspect capital buffers.',
    metric: Number(summary.metrics.treasuryAfterRun.toFixed(2)),
    target: 0,
    evidence: summary.treasuryTrajectory.map(
      (entry) => `${entry.jobId}:${entry.treasuryAfterJob.toFixed(2)}`,
    ),
  });

  const automationOutcome = summary.metrics.automationScore >= 0.82 ? 'pass' : 'fail';
  assertions.push({
    id: 'automation-dominance',
    title: 'Automation loop exceeds 82% coverage',
    outcome: automationOutcome,
    severity: 'info',
    summary:
      automationOutcome === 'pass'
        ? 'Automation score surpasses the autonomy target – human intervention remains optional.'
        : 'Automation score below guardrail – expand orchestration coverage.',
    metric: Number(summary.metrics.automationScore.toFixed(3)),
    target: 0.82,
    evidence: [`automationScore=${summary.metrics.automationScore.toFixed(3)}`],
  });

  return assertions;
}

function updateNetMetrics(context: SimulationContext, assignment: Assignment): void {
  context.totalEscrowedAgi += assignment.rewardAgi;
  context.totalStable += assignment.rewardStable;
  const validatorReward = assignment.rewardAgi * 0.08;
  const ownerBuffer = assignment.rewardAgi * 0.02;
  context.validatorRewards += validatorReward;
  context.ownerBufferContribution += ownerBuffer;
  context.cumulativeCost += assignment.rewardAgi + assignment.rewardStable + validatorReward + ownerBuffer;
  context.cumulativeValue += assignment.economicValue;
  context.finalHour = Math.max(context.finalHour, assignment.endHour);
  context.validatorConfidence += assignment.validatorConfidence;
  context.automationLift += assignment.automationLift;
  if (context.paybackHours === 0 && context.cumulativeValue >= context.cumulativeCost) {
    context.paybackHours = assignment.endHour;
  }
}

export async function runScenario(
  scenario: Scenario,
  options: {
    interactive?: boolean;
    deploymentConfigPath?: string | null;
    skipDeploymentVerification?: boolean;
  } = {},
): Promise<Summary> {
  const { interactive = false, deploymentConfigPath = undefined, skipDeploymentVerification = false } =
    options;
  const workingScenario = JSON.parse(JSON.stringify(scenario)) as Scenario;
  if (interactive) {
    const rl = readline.createInterface({ input, output });
    const multiplierAnswer = await rl.question(
      'Enter desired economic multiplier (default 1.0, press Enter to keep baseline): ',
    );
    const multiplier = Number(multiplierAnswer.trim()) || 1;
    workingScenario.jobs = workingScenario.jobs.map((job) => ({
      ...job,
      economicValue: job.economicValue * multiplier,
    }));
    const quorumAnswer = await rl.question(
      'Enter validator quorum uplift (e.g. +1, default 0): ',
    );
    const quorumDelta = Number(quorumAnswer.trim()) || 0;
    workingScenario.jobs = workingScenario.jobs.map((job) => ({
      ...job,
      validatorQuorum: Math.max(job.validatorQuorum + quorumDelta, 1),
    }));
    await rl.close();
  }

  const resolvedDeploymentConfigPath = resolveDeploymentConfigPath(
    scenario,
    deploymentConfigPath ?? undefined,
  );
  const deploymentConfig =
    skipDeploymentVerification || !resolvedDeploymentConfigPath
      ? null
      : await loadDeploymentConfig(resolvedDeploymentConfigPath);

  const agentStates = new Map<string, AgentState>();
  for (const agent of workingScenario.agents) {
    agentStates.set(agent.id, { availableAt: 0, load: 0 });
  }

  const assignments: Assignment[] = [];
  const context: SimulationContext = {
    scenario: workingScenario,
    assignments,
    totalEscrowedAgi: 0,
    totalStable: 0,
    validatorRewards: 0,
    ownerBufferContribution: 0,
    cumulativeValue: 0,
    cumulativeCost: 0,
    paybackHours: 0,
    finalHour: 0,
    validatorConfidence: 0,
    automationLift: 0,
  };

  const trajectory: TrajectoryEntry[] = [];

  const sortedJobs = [...workingScenario.jobs].sort(
    (a, b) => b.economicValue - a.economicValue,
  );

  for (const job of sortedJobs) {
    const { agent, state } = selectAgent(job, workingScenario, agentStates);
    engageAgent(agentStates, agent.id);
    const validatorSet = selectValidators(job, workingScenario);
    const assignment = deriveAssignment(job, agent, state, validatorSet);
    assignments.push(assignment);
    updateState(agentStates, agent.id, assignment.endHour);
    updateNetMetrics(context, assignment);

    const treasuryAfterJob =
      workingScenario.treasury.agiBalance -
      context.validatorRewards -
      context.totalEscrowedAgi +
      context.cumulativeValue;
    const netYield =
      context.cumulativeValue -
      (context.totalEscrowedAgi +
        context.totalStable +
        context.validatorRewards +
        context.ownerBufferContribution);
    trajectory.push({
      step: trajectory.length + 1,
      jobId: assignment.jobId,
      jobName: assignment.jobName,
      startHour: Number(assignment.startHour.toFixed(2)),
      endHour: Number(assignment.endHour.toFixed(2)),
      treasuryAfterJob: Number(treasuryAfterJob.toFixed(2)),
      cumulativeValue: Number(context.cumulativeValue.toFixed(2)),
      cumulativeCost: Number(context.cumulativeCost.toFixed(2)),
      netYield: Number(netYield.toFixed(2)),
      validatorConfidence: Number(assignment.validatorConfidence.toFixed(4)),
      automationLift: Number(assignment.automationLift.toFixed(4)),
    });
  }

  const executionTimestamp = new Date().toISOString();
  const analysisTimestamp = workingScenario.analysisTimestamp ?? executionTimestamp;
  const summary = synthesiseSummary(context, analysisTimestamp, executionTimestamp);
  summary.mermaidFlow = generateMermaidFlow(summary, workingScenario);
  summary.mermaidTimeline = generateMermaidTimeline(summary);
  summary.ownerCommandMermaid = generateOwnerCommandMermaid(summary, workingScenario);
  summary.treasuryTrajectory = trajectory;
  summary.assertions = computeAssertions(workingScenario, summary);
  const passCount = summary.assertions.filter((assertion) => assertion.outcome === 'pass').length;
  const passRate = summary.assertions.length
    ? passCount / summary.assertions.length
    : 1;
  summary.metrics.assertionPassRate = Number(passRate.toFixed(3));
  const ownerPlan = summary.ownerCommandPlan;
  summary.governanceLedger = buildGovernanceLedger(
    workingScenario,
    summary,
    ownerPlan,
    analysisTimestamp,
  );
  summary.ownerAutopilot = buildOwnerAutopilot(summary, workingScenario);
  summary.ownerDominion = buildOwnerDominion(summary);
  summary.ownerControlSupremacy = buildOwnerControlSupremacy(summary);
  summary.metrics.ownerControlSupremacyIndex = Number(
    summary.ownerControlSupremacy.index.toFixed(3),
  );
  summary.superIntelligence = buildSuperIntelligence(summary);
  summary.metrics.superIntelligenceIndex = Number(
    summary.superIntelligence.index.toFixed(3),
  );
  summary.ownerAutopilot.telemetry.superIntelligenceIndex = summary.superIntelligence.index;
  summary.globalExpansionPlan = buildGlobalExpansionPlan(summary, workingScenario);
  summary.deploymentIntegrity = computeDeploymentIntegrity(summary, workingScenario, {
    config: deploymentConfig,
    configPath: resolvedDeploymentConfigPath,
  });
  summary.metrics.deploymentIntegrityScore = Number(
    summary.deploymentIntegrity.score.toFixed(3),
  );
  summary.ownerAutopilot.telemetry.deploymentIntegrityScore =
    summary.metrics.deploymentIntegrityScore;
  const snapshot = JSON.parse(JSON.stringify(workingScenario)) as Scenario;
  Object.defineProperty(summary, '__scenarioSnapshot', {
    value: snapshot,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(summary, '__deploymentConfigPath', {
    value: resolvedDeploymentConfigPath ?? undefined,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(summary, '__skipDeploymentVerification', {
    value: skipDeploymentVerification,
    enumerable: false,
    configurable: false,
  });
  return summary;
}

const DETERMINISTIC_FIELDS: Array<keyof DeterministicProof> = [
  'summaryHash',
  'metricsHash',
  'assignmentsHash',
  'commandCoverageHash',
  'autopilotHash',
  'governanceLedgerHash',
  'assertionsHash',
  'treasuryTrajectoryHash',
  'sovereignSafetyMeshHash',
  'superIntelligenceHash',
  'deploymentIntegrityHash',
];

export function buildDeterministicProof(summary: Summary): DeterministicProof {
  const assignmentsProjection = summary.assignments.map((assignment) => ({
    jobId: assignment.jobId,
    agentId: assignment.agentId,
    validatorIds: [...assignment.validatorIds],
    rewardAgi: assignment.rewardAgi,
    rewardStable: assignment.rewardStable,
    netValue: assignment.netValue,
    automationLift: assignment.automationLift,
    efficiency: assignment.efficiency,
    skillMatch: assignment.skillMatch,
    startHour: assignment.startHour,
    endHour: assignment.endHour,
  }));
  const commandProjection = {
    quickActions: summary.ownerCommandPlan.quickActions,
    commandCoverage: summary.ownerCommandPlan.commandCoverage,
    coverageDetail: summary.ownerCommandPlan.coverageDetail,
  };
  const autopilotProjection = {
    mission: summary.ownerAutopilot.mission,
    cadenceHours: summary.ownerAutopilot.cadenceHours,
    dominanceScore: summary.ownerAutopilot.dominanceScore,
    telemetry: summary.ownerAutopilot.telemetry,
    guardrails: summary.ownerAutopilot.guardrails,
    commandSequence: summary.ownerAutopilot.commandSequence,
  };
  const proof: DeterministicProof = {
    version: DETERMINISTIC_VERSION,
    scenarioId: summary.scenarioId,
    analysisTimestamp: summary.analysisTimestamp,
    generatedAt: summary.generatedAt,
    executionTimestamp: summary.executionTimestamp,
    summaryHash: hashObject({
      metrics: summary.metrics,
      assignments: assignmentsProjection,
      ownerDominion: summary.ownerDominion,
      ownerControlSupremacy: summary.ownerControlSupremacy,
      superIntelligence: summary.superIntelligence,
      shockResilience: summary.shockResilience,
      governanceLedger: summary.governanceLedger,
      commandPlan: commandProjection,
      globalExpansionPlan: summary.globalExpansionPlan,
      assertions: summary.assertions,
      treasuryTrajectory: summary.treasuryTrajectory,
    }),
    metricsHash: hashObject(summary.metrics),
    assignmentsHash: hashObject(assignmentsProjection),
    commandCoverageHash: hashObject(commandProjection),
    autopilotHash: hashObject(autopilotProjection),
    governanceLedgerHash: hashObject(summary.governanceLedger),
    assertionsHash: hashObject(summary.assertions),
    treasuryTrajectoryHash: hashObject(summary.treasuryTrajectory),
    sovereignSafetyMeshHash: hashObject(summary.sovereignSafetyMesh),
    superIntelligenceHash: hashObject(summary.superIntelligence),
    deploymentIntegrityHash: hashObject(summary.deploymentIntegrity),
  };
  return proof;
}

export async function verifyDeterminism(
  scenario: Scenario,
  summary: Summary,
): Promise<DeterministicVerification> {
  const carrier = summary as SummaryWithSnapshot;
  const scenarioForVerification = carrier.__scenarioSnapshot ?? scenario;
  const skipDeploymentVerification = carrier.__skipDeploymentVerification ?? false;
  const verificationSummary = await runScenario(scenarioForVerification, {
    deploymentConfigPath: carrier.__deploymentConfigPath ?? undefined,
    skipDeploymentVerification,
  });
  const proof = buildDeterministicProof(summary);
  const verificationProof = buildDeterministicProof(verificationSummary);
  const mismatches: string[] = [];
  for (const field of DETERMINISTIC_FIELDS) {
    if (proof[field] !== verificationProof[field]) {
      mismatches.push(`${field} mismatch`);
    }
  }
  return {
    version: DETERMINISTIC_VERSION,
    matches: mismatches.length === 0,
    mismatches,
    proof,
    verificationProof,
  };
}

async function writeOutputs(
  summary: Summary,
  outputDir: string,
  options: { updateUiSummary?: boolean; deterministicVerification?: DeterministicVerification } = {},
): Promise<void> {
  const { updateUiSummary = false, deterministicVerification } = options;
  await ensureDir(outputDir);
  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  await fs.writeFile(path.join(outputDir, 'flow.mmd'), summary.mermaidFlow);
  await fs.writeFile(path.join(outputDir, 'timeline.mmd'), summary.mermaidTimeline);
  const ownerMatrix = {
    governanceSafe: summary.ownerControl.governanceSafe,
    threshold: summary.ownerControl.threshold,
    controls: summary.ownerControl.controls,
  };
  await fs.writeFile(
    path.join(outputDir, 'owner-control.json'),
    JSON.stringify(ownerMatrix, null, 2),
  );
  const sovereigntyPlan = {
    pauseScript: summary.ownerSovereignty.pauseScript,
    resumeScript: summary.ownerSovereignty.resumeScript,
    responseMinutes: summary.ownerSovereignty.responseMinutes,
    emergencyContacts: summary.ownerSovereignty.emergencyContacts,
    circuitBreakers: summary.ownerSovereignty.circuitBreakers,
    upgradePaths: summary.ownerSovereignty.upgradePaths,
    alertChannels: summary.ownerSovereignty.alertChannels,
    stabilityIndex: summary.metrics.stabilityIndex,
    ownerCommandCoverage: summary.metrics.ownerCommandCoverage,
    sovereignControlScore: summary.metrics.sovereignControlScore,
    sovereignSafetyScore: summary.metrics.sovereignSafetyScore,
    shockResilienceScore: summary.metrics.shockResilienceScore,
    shockResilienceClassification: summary.shockResilience.classification,
    shockResilienceSummary: summary.shockResilience.summary,
  };
  await fs.writeFile(
    path.join(outputDir, 'owner-sovereignty.json'),
    JSON.stringify(sovereigntyPlan, null, 2),
  );
  const deploymentMap = {
    network: summary.deployment.network,
    treasuryOwner: summary.deployment.treasuryOwner,
    governanceSafe: summary.deployment.governanceSafe,
    modules: summary.deployment.modules,
    stablecoinAdapters: summary.deployment.stablecoinAdapters,
    automation: summary.deployment.automation,
    observability: summary.deployment.observability,
    sovereignControlScore: summary.metrics.sovereignControlScore,
  };
  await fs.writeFile(
    path.join(outputDir, 'deployment-map.json'),
    JSON.stringify(deploymentMap, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'deployment-integrity.json'),
    JSON.stringify(summary.deploymentIntegrity, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'deployment-integrity.mmd'),
    `${summary.deploymentIntegrity.mermaid.trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-command.mmd'),
    `${summary.ownerCommandMermaid.trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-governance-ledger.json'),
    JSON.stringify(summary.governanceLedger, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'treasury-trajectory.json'),
    JSON.stringify(summary.treasuryTrajectory, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'assertions.json'),
    JSON.stringify(summary.assertions, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-command-plan.md'),
    generateOwnerCommandMarkdown(summary),
  );

  await fs.writeFile(
    path.join(outputDir, 'owner-control-drills.json'),
    JSON.stringify(summary.ownerControlDrills, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-control-drills.mmd'),
    `${summary.ownerControlDrills.mermaid.trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-control-drills.md'),
    generateOwnerControlDrillMarkdown(summary.ownerControlDrills),
  );

  const commandChecklist = {
    generatedAt: summary.generatedAt,
    coverage: summary.ownerCommandPlan.commandCoverage,
    coverageNarrative: summary.ownerCommandPlan.coverageNarrative,
    surfaces: summary.ownerCommandPlan.coverageDetail,
  };
  await fs.writeFile(
    path.join(outputDir, 'owner-command-checklist.json'),
    JSON.stringify(commandChecklist, null, 2),
  );

  await fs.writeFile(
    path.join(outputDir, 'sovereign-safety-mesh.json'),
    JSON.stringify(summary.sovereignSafetyMesh, null, 2),
  );

  await fs.writeFile(
    path.join(outputDir, 'economic-dominance.json'),
    JSON.stringify(buildEconomicDominanceReport(summary), null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-autopilot.json'),
    JSON.stringify(summary.ownerAutopilot, null, 2),
  );
  const autopilotBrief = buildAutopilotBrief(summary);
  await fs.writeFile(
    path.join(outputDir, 'owner-autopilot-brief.md'),
    renderAutopilotBrief(autopilotBrief),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-autopilot.mmd'),
    `${generateOwnerAutopilotMermaid(summary.ownerAutopilot).trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-dominion.json'),
    JSON.stringify(summary.ownerDominion, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-control-supremacy.json'),
    JSON.stringify(summary.ownerControlSupremacy, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'owner-control-supremacy.mmd'),
    `${summary.ownerControlSupremacy.mermaid.trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'super-intelligence.json'),
    JSON.stringify(summary.superIntelligence, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'super-intelligence.mmd'),
    `${summary.superIntelligence.mermaid.trimEnd()}\n`,
  );
  await fs.writeFile(
    path.join(outputDir, 'shock-resilience.json'),
    JSON.stringify(summary.shockResilience, null, 2),
  );
  await fs.writeFile(
    path.join(outputDir, 'global-expansion-plan.md'),
    generateGlobalExpansionMarkdown(summary),
  );
  await fs.writeFile(
    path.join(outputDir, 'global-expansion.mmd'),
    `${generateGlobalExpansionMermaid(summary.globalExpansionPlan).trimEnd()}\n`,
  );

  if (deterministicVerification) {
    await fs.writeFile(
      path.join(outputDir, 'deterministic-proof.json'),
      JSON.stringify(deterministicVerification.proof, null, 2),
    );
    await fs.writeFile(
      path.join(outputDir, 'deterministic-verification.json'),
      JSON.stringify(deterministicVerification, null, 2),
    );
  }

  if (updateUiSummary) {
    await ensureDir(path.dirname(UI_DEFAULT_SUMMARY));
    await fs.writeFile(UI_DEFAULT_SUMMARY, JSON.stringify(summary, null, 2));
    if (deterministicVerification) {
      await fs.writeFile(
        UI_DETERMINISTIC_PROOF,
        JSON.stringify(deterministicVerification.proof, null, 2),
      );
      await fs.writeFile(
        UI_DETERMINISTIC_VERIFICATION,
        JSON.stringify(deterministicVerification, null, 2),
      );
    }
  }
}

function compareWithBaseline(summary: Summary, baselinePath: string): void {
  let baselineRaw: string;
  try {
    baselineRaw = require('node:fs').readFileSync(baselinePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read baseline summary at ${baselinePath}: ${error}`);
  }
  const baseline = JSON.parse(baselineRaw) as Summary;
  const metricsToCheck: Array<keyof Summary['metrics']> = [
    'totalEscrowedAgi',
    'totalStablecoinVolume',
    'validatorRewardsAgi',
    'ownerBufferContribution',
    'roiMultiplier',
    'netYield',
    'paybackHours',
    'throughputJobsPerDay',
    'validatorConfidence',
    'automationScore',
    'stabilityIndex',
    'ownerCommandCoverage',
    'ownerDominionScore',
    'ownerControlSupremacyIndex',
    'ownerControlDrillReadiness',
    'sovereignControlScore',
    'sovereignSafetyScore',
    'assertionPassRate',
    'economicDominanceIndex',
    'capitalVelocity',
    'globalExpansionReadiness',
    'superIntelligenceIndex',
    'shockResilienceScore',
  ];
  const tolerance = 0.05;
  for (const metric of metricsToCheck) {
    const expected = baseline.metrics[metric];
    const actual = summary.metrics[metric];
    const delta = Math.abs(expected - actual);
    const relative = Math.abs(delta / (Math.abs(expected) + 1e-6));
    if (relative > tolerance) {
      throw new Error(
        `Metric drift detected for ${metric}: expected ${expected}, received ${actual}`,
      );
    }
  }
}

export async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      describe: 'Path to scenario JSON file',
      default: DEFAULT_SCENARIO,
    })
    .option('output', {
      type: 'string',
      describe: 'Directory where generated reports will be stored',
      default: DEFAULT_OUTPUT_DIR,
    })
    .option('interactive', {
      type: 'boolean',
      default: false,
      describe: 'Enable interactive parameter tuning',
    })
    .option('deployment-config', {
      type: 'string',
      describe: 'Override path to deployment config JSON used for verification',
    })
    .option('skip-deployment-verification', {
      type: 'boolean',
      default: false,
      describe: 'Skip deployment config verification checks',
    })
    .option('ci', {
      type: 'boolean',
      default: false,
      describe: 'Enable CI validation mode',
    })
    .help()
    .parse();

  const scenario = await loadScenarioFromFile(argv.scenario);
  const summary = await runScenario(scenario, {
    interactive: argv.interactive,
    deploymentConfigPath: argv['deployment-config'],
    skipDeploymentVerification: argv['skip-deployment-verification'],
  });
  const deterministicVerification = await verifyDeterminism(scenario, summary);
  if (!deterministicVerification.matches) {
    throw new Error(
      `Deterministic verification failed: ${deterministicVerification.mismatches.join(', ')}`,
    );
  }
  await writeOutputs(summary, argv.output, {
    updateUiSummary: !argv.ci,
    deterministicVerification,
  });
  if (argv.ci) {
    compareWithBaseline(summary, BASELINE_CI_SUMMARY);
  }
  output.write(`\n✅ Economic Power summary written to ${argv.output}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Economic Power demo failed:', error);
    process.exitCode = 1;
  });
}
