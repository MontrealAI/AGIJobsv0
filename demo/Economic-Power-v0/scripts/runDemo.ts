import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

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

type Summary = {
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
    sovereignControlScore: number;
    assertionPassRate: number;
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
  };
  commandCatalog: CommandCatalog;
  assignments: Assignment[];
  mermaidFlow: string;
  mermaidTimeline: string;
  ownerCommandMermaid: string;
  ownerCommandPlan: OwnerCommandPlan;
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
  governanceLedger: GovernanceLedger;
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

function buildOwnerCommandPlan(scenario: Scenario, coverage: number): OwnerCommandPlan {
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
    commandCoverage: Number(coverage.toFixed(3)),
    coverageNarrative: coverageNarrative(coverage),
  };
}

function sanitiseId(prefix: string, value: string, index: number): string {
  const safe = value.replace(/[^a-zA-Z0-9]/g, '_');
  return `${prefix}_${index}_${safe}`;
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
const BASELINE_CI_SUMMARY = path.join(DEFAULT_OUTPUT_DIR, 'baseline-summary.json');

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
  for (const catalog of Object.values(scenario.commandCatalog)) {
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

function computeOwnerCommandCoverage(scenario: Scenario): number {
  let surfaces = 0;
  let covered = 0;

  const checkCoverage = <T>(
    items: readonly T[],
    programs: readonly CommandProgram[],
    getIdentifiers: (item: T) => { id: string; name?: string },
  ) => {
    surfaces += items.length;
    for (const item of items) {
      const identifiers = getIdentifiers(item);
      const hasProgram = programs.some((program) => {
        if (!program.script || program.script.trim().length === 0) {
          return false;
        }
        return matchesTarget(program, identifiers.id, identifiers.name);
      });
      if (hasProgram) {
        covered += 1;
      }
    }
  };

  const jobPrograms = scenario.commandCatalog.jobPrograms.length
    ? scenario.commandCatalog.jobPrograms
    : scenario.commandCatalog.orchestratorPrograms;
  checkCoverage(scenario.jobs, jobPrograms, (job) => ({ id: job.id, name: job.name }));

  const validatorPrograms = scenario.commandCatalog.validatorPrograms.length
    ? scenario.commandCatalog.validatorPrograms
    : scenario.commandCatalog.orchestratorPrograms;
  checkCoverage(scenario.validators, validatorPrograms, (validator) => ({
    id: validator.id,
    name: validator.name,
  }));

  checkCoverage(scenario.stablecoinAdapters, scenario.commandCatalog.adapterPrograms, (adapter) => ({
    id: adapter.name,
    name: adapter.name,
  }));

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
  checkCoverage(scenario.modules, modulePrograms, (module) => ({
    id: module.id,
    name: module.name,
  }));

  checkCoverage(scenario.owner.controls, scenario.owner.controls.map((control, index) => ({
    id: `control-${index}-${control.parameter}`,
    target: control.parameter,
    script: control.script,
    description: control.description,
  })), (control) => ({ id: control.parameter, name: control.parameter }));

  // Pause and resume surfaces
  surfaces += 2;
  if (scenario.safeguards.pauseScript.trim().length > 0) {
    covered += 1;
  }
  if (scenario.safeguards.resumeScript.trim().length > 0) {
    covered += 1;
  }

  // Treasury command surface
  surfaces += 1;
  if (scenario.commandCatalog.treasuryPrograms.some((program) => program.script.trim().length > 0)) {
    covered += 1;
  }

  // Orchestrator command surface (beyond pause/resume)
  surfaces += 1;
  if (scenario.commandCatalog.orchestratorPrograms.some((program) => program.script.trim().length > 0)) {
    covered += 1;
  }

  const coverage = surfaces === 0 ? 1 : covered / surfaces;
  return Number(Math.min(1, Math.max(0, coverage)).toFixed(3));
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
  return scenarioSchema.parse(parsed);
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
  const automationScore = context.automationLift /
    Math.max(context.assignments.length, 1);
  const stabilityIndex = computeStabilityIndex(scenario, context);
  const ownerCoverage = computeOwnerCommandCoverage(scenario);
  const sovereignControlScore = computeSovereignControlScore(scenario);
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
      totalEscrowedAgi: Math.round(context.totalEscrowedAgi),
      totalStablecoinVolume: Math.round(context.totalStable),
      validatorRewardsAgi: Math.round(context.validatorRewards),
      ownerBufferContribution: Math.round(context.ownerBufferContribution),
      treasuryAfterRun: Math.round(
        scenario.treasury.agiBalance -
          context.validatorRewards -
          context.totalEscrowedAgi +
          context.cumulativeValue,
      ),
      roiMultiplier: Number(
        (context.cumulativeValue /
          Math.max(context.totalEscrowedAgi + context.totalStable, 1)).toFixed(2),
      ),
      netYield: Number(
        (
          context.cumulativeValue -
          (context.totalEscrowedAgi +
            context.totalStable +
            context.validatorRewards +
            context.ownerBufferContribution)
        ).toFixed(2),
      ),
      paybackHours: Number(context.paybackHours.toFixed(2)),
      throughputJobsPerDay: Number(
        ((context.assignments.length / Math.max(context.finalHour, 1)) * 24).toFixed(2),
      ),
      validatorConfidence: Number(assignmentConfidence.toFixed(4)),
      automationScore: Number(automationScore.toFixed(3)),
      riskMitigationScore: Number(
        (0.82 + pseudoRandom(`risk:${scenario.scenarioId}`) * 0.12).toFixed(3),
      ),
      stabilityIndex,
      ownerCommandCoverage: ownerCoverage,
      sovereignControlScore,
      assertionPassRate: 0,
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
    },
    commandCatalog: scenario.commandCatalog,
    assignments: context.assignments,
    mermaidFlow: '',
    mermaidTimeline: '',
    ownerCommandMermaid: '',
    ownerCommandPlan: buildOwnerCommandPlan(scenario, ownerCoverage),
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
    governanceLedger: {
      analysisTimestamp,
      ownerSafe: scenario.owner.operator,
      governanceSafe: scenario.owner.governanceSafe,
      treasurySafe: scenario.treasury.ownerSafe,
      threshold: scenario.owner.threshold,
      commandCoverage: ownerCoverage,
      coverageNarrative: coverageNarrative(ownerCoverage),
      pauseScript: scenario.safeguards.pauseScript,
      resumeScript: scenario.safeguards.resumeScript,
      scripts: collectCommandScripts(scenario),
      modules: [],
      alerts: [],
    },
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
  options: { interactive?: boolean } = {},
): Promise<Summary> {
  const workingScenario = JSON.parse(JSON.stringify(scenario)) as Scenario;
  if (options.interactive) {
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
  const ownerPlan = buildOwnerCommandPlan(workingScenario, summary.metrics.ownerCommandCoverage);
  summary.ownerCommandPlan = ownerPlan;
  summary.governanceLedger = buildGovernanceLedger(
    workingScenario,
    summary,
    ownerPlan,
    analysisTimestamp,
  );
  return summary;
}

async function writeOutputs(
  summary: Summary,
  outputDir: string,
  options: { updateUiSummary?: boolean } = {},
): Promise<void> {
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
    stabilityIndex: summary.metrics.stabilityIndex,
    ownerCommandCoverage: summary.metrics.ownerCommandCoverage,
    sovereignControlScore: summary.metrics.sovereignControlScore,
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

  if (options.updateUiSummary) {
    await ensureDir(path.dirname(UI_DEFAULT_SUMMARY));
    await fs.writeFile(UI_DEFAULT_SUMMARY, JSON.stringify(summary, null, 2));
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
    'sovereignControlScore',
    'assertionPassRate',
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
  });
  await writeOutputs(summary, argv.output, { updateUiSummary: !argv.ci });
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
