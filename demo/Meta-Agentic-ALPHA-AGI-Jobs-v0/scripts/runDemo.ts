import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const scenarioSchema = z.object({
  version: z.literal('alpha-1'),
  label: z.string(),
  description: z.string(),
  network: z.object({
    name: z.string(),
    chainId: z.number(),
    rpcUrl: z.string(),
    explorer: z.string(),
    deploymentRegistry: z.string(),
    timelock: z.string(),
  }),
  owner: z.object({
    operator: z.string(),
    governanceSafe: z.string(),
    treasury: z.string(),
    threshold: z.number().positive(),
    members: z.number().positive(),
    commands: z.array(
      z.object({
        id: z.string(),
        parameter: z.string(),
        script: z.string(),
        description: z.string(),
        category: z.string(),
      }),
    ),
    emergency: z.object({
      contacts: z.array(z.string()),
      responseMinutes: z.number().positive(),
      playbook: z.string(),
    }),
  }),
  safeguards: z.object({
    pauseScript: z.string(),
    resumeScript: z.string(),
    circuitBreakers: z.array(
      z.object({
        metric: z.string(),
        comparator: z.enum(['<', '<=', '>', '>=']),
        threshold: z.number(),
        action: z.string(),
        description: z.string(),
      }),
    ),
  }),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
      version: z.string(),
      owner: z.string(),
      status: z.enum(['active', 'pending-upgrade', 'paused', 'deprecated']),
      upgradeScript: z.string(),
      lastAudit: z.string().datetime({ message: 'lastAudit must be ISO-8601' }),
      description: z.string(),
    }),
  ),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ens: z.string(),
      kind: z.enum(['identify', 'outlearn', 'outthink', 'outdesign', 'outstrategise', 'outexecute']),
      capabilities: z.array(z.string()),
      reliability: z.number().min(0).max(1),
      costPerHour: z.number().positive(),
      maxParallel: z.number().positive(),
    }),
  ),
  validators: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ens: z.string(),
      stake: z.number().positive(),
      reliability: z.number().min(0).max(1),
      competencies: z.array(z.string()),
    }),
  ),
  opportunities: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      domain: z.string(),
      value: z.number().positive(),
      cost: z.number().positive(),
      risk: z.enum(['low', 'medium', 'high']),
      signalConfidence: z.number().min(0).max(1),
      complexity: z.number().min(0).max(1),
      durationHours: z.number().positive(),
      validatorQuorum: z.number().positive(),
      requiredAgents: z.array(z.string()),
      modules: z.array(z.string()),
      ownerApprovals: z.array(z.string()),
      outcomes: z.array(z.string()),
      kpis: z.object({
        roi: z.number().positive(),
        stability: z.number().min(0).max(1),
        automation: z.number().min(0).max(1),
      }),
    }),
  ),
  worldModel: z.object({
    simulations: z.array(
      z.object({
        name: z.string(),
        winRate: z.number().min(0).max(1),
        profitFactor: z.number().positive(),
        maxDrawdownBps: z.number().nonnegative(),
      }),
    ),
    curriculum: z.array(z.string()),
    modelFidelity: z.number().min(0).max(1),
  }),
  ci: z.object({
    commands: z.array(z.string()),
    status: z.enum(['green', 'failing', 'unknown']),
  }),
});

export type Scenario = z.infer<typeof scenarioSchema>;

const runOptionsSchema = z.object({
  capitalMultiplier: z.number().positive().default(1),
  automationBoost: z.number().positive().default(1),
  confidenceFloor: z.number().min(0).max(1).default(0.85),
});

export type RunOptions = z.infer<typeof runOptionsSchema>;

type Opportunity = Scenario['opportunities'][number];
type Agent = Scenario['agents'][number];
type Validator = Scenario['validators'][number];

type Assignment = {
  opportunityId: string;
  title: string;
  domain: string;
  leadAgent: Agent;
  supportingAgents: Agent[];
  validators: Validator[];
  expectedValue: number;
  expectedCost: number;
  projectedROI: number;
  automation: number;
  stability: number;
  risk: Opportunity['risk'];
  durationHours: number;
  ownerApprovals: string[];
  modules: string[];
  antifragilityGain: number;
};

type DemoSummary = {
  scenario: Scenario;
  metrics: {
    totalOpportunities: number;
    portfolioValue: number;
    capitalAtRisk: number;
    roiMultiplier: number;
    automationCoverage: number;
    validatorConfidence: number;
    detectionLeadHours: number;
    worldModelFidelity: number;
    ownerCommandCoverage: number;
    sovereignControlScore: number;
    antifragilityIndex: number;
    stabilityReserve: number;
    paybackHours: number;
    treasuryVelocity: number;
    alphaCaptureVelocity: number;
    ownerSovereigntyLag: number;
    governanceDeterminism: number;
    ciStatus: Scenario['ci']['status'];
  };
  assignments: Assignment[];
  ownerControl: {
    governanceSafe: string;
    operator: string;
    threshold: number;
    members: number;
    controls: Scenario['owner']['commands'];
    emergency: Scenario['owner']['emergency'];
    safeguards: Scenario['safeguards'];
    coverageScore: number;
  };
  mermaidArchitecture: string;
  mermaidTimeline: string;
  mermaidCoordination: string;
  mermaidPhaseFlow: string;
  ownerPlaybook: string;
  knowledgeBase: {
    opportunities: Array<{
      id: string;
      title: string;
      domain: string;
      linkedModules: string[];
      linkedAgents: string[];
      value: number;
      risk: string;
      outcomes: string[];
    }>;
    relationships: Array<{
      from: string;
      to: string;
      description: string;
    }>;
  };
  worldModel: Scenario['worldModel'];
  executionLedger: Array<{
    opportunityId: string;
    checksum: string;
    expectedValue: number;
    expectedCost: number;
    projectedROI: number;
    validators: string[];
    ownerApprovals: string[];
  }>;
  ci: Scenario['ci'];
  phaseMatrix: Array<{
    phase: Agent['kind'];
    title: string;
    agents: string[];
    averageReliability: number;
    maxParallel: number;
    activeOpportunities: number;
    opportunityValue: number;
    validatorSupport: number;
    automationSupport: number;
  }>;
  dashboard: {
    metrics: DemoSummary['metrics'];
    assignments: Array<{
      opportunityId: string;
      title: string;
      domain: string;
      projectedROI: number;
      automation: number;
      stability: number;
      durationHours: number;
    }>;
    owner: {
      governanceSafe: string;
      emergencyContacts: string[];
      responseMinutes: number;
      commands: Scenario['owner']['commands'];
    };
    ci: Scenario['ci'];
    phaseMatrix: DemoSummary['phaseMatrix'];
  };
};

const PHASE_SEQUENCE: Agent['kind'][] = [
  'identify',
  'outlearn',
  'outthink',
  'outdesign',
  'outstrategise',
  'outexecute',
];

const PHASE_LABELS: Record<Agent['kind'], string> = {
  identify: 'Identify',
  outlearn: 'Out-Learn',
  outthink: 'Out-Think',
  outdesign: 'Out-Design',
  outstrategise: 'Out-Strategise',
  outexecute: 'Out-Execute',
};

function getAgentsByIds(scenario: Scenario, ids: string[]): Agent[] {
  const agentMap = new Map(scenario.agents.map((agent) => [agent.id, agent] as const));
  return ids
    .map((id) => agentMap.get(id))
    .filter((agent): agent is Agent => Boolean(agent))
    .sort((a, b) => b.reliability - a.reliability);
}

function selectValidators(scenario: Scenario, quota: number): Validator[] {
  return [...scenario.validators]
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, quota);
}

function computeAntifragilityGain(opportunity: Opportunity): number {
  const complexityWeight = opportunity.complexity * 0.6;
  const confidenceWeight = opportunity.signalConfidence * 0.4;
  return Math.min(1, complexityWeight + confidenceWeight);
}

function assignOpportunity(
  scenario: Scenario,
  opportunity: Opportunity,
  options: RunOptions,
): Assignment {
  const agents = getAgentsByIds(scenario, opportunity.requiredAgents);
  if (agents.length === 0) {
    throw new Error(`No agents available for opportunity ${opportunity.id}`);
  }

  const leadAgent = agents[0];
  const supportingAgents = agents.slice(1);
  const validators = selectValidators(scenario, Math.min(agents.length, opportunity.validatorQuorum));

  const automationFactor = opportunity.kpis.automation * options.automationBoost;
  const adjustedValue = opportunity.value * automationFactor;
  const adjustedCost = opportunity.cost * options.capitalMultiplier * (1 - automationFactor * 0.15);
  const projectedROI = adjustedValue / adjustedCost;
  const antifragilityGain = computeAntifragilityGain(opportunity);

  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    domain: opportunity.domain,
    leadAgent,
    supportingAgents,
    validators,
    expectedValue: adjustedValue,
    expectedCost: adjustedCost,
    projectedROI,
    automation: opportunity.kpis.automation,
    stability: opportunity.kpis.stability,
    risk: opportunity.risk,
    durationHours: opportunity.durationHours,
    ownerApprovals: opportunity.ownerApprovals,
    modules: opportunity.modules,
    antifragilityGain,
  };
}

function computeMetrics(scenario: Scenario, assignments: Assignment[]) {
  const totalValue = assignments.reduce((sum, assignment) => sum + assignment.expectedValue, 0);
  const totalCost = assignments.reduce((sum, assignment) => sum + assignment.expectedCost, 0);
  const totalDuration = assignments.reduce((sum, assignment) => sum + assignment.durationHours, 0);
  const portfolioProfit = totalValue - totalCost;
  const automationCoverage =
    assignments.reduce((sum, assignment) => sum + assignment.automation, 0) / assignments.length;
  const stabilityReserve = assignments.reduce(
    (sum, assignment) => sum + assignment.expectedCost * assignment.stability,
    0,
  );
  const weightedValidatorReliability =
    assignments.reduce(
      (sum, assignment) =>
        sum + assignment.validators.reduce((inner, validator) => inner + validator.reliability, 0),
      0,
    ) /
    assignments.reduce((sum, assignment) => sum + assignment.validators.length, 0);

  const detectionLeadHours =
    scenario.opportunities.reduce((sum, opportunity) => sum + opportunity.signalConfidence * 18, 0) /
    scenario.opportunities.length;

  const ownerCommandCoverage = Math.min(
    1,
    scenario.owner.commands.length / Math.max(5, scenario.modules.length + scenario.safeguards.circuitBreakers.length),
  );
  const sovereignControlScore = Math.min(
    1,
    ownerCommandCoverage * 0.35 +
      (scenario.owner.threshold / scenario.owner.members) * 0.25 +
      scenario.safeguards.circuitBreakers.length * 0.05 +
      scenario.ci.commands.length * 0.05 +
      0.3,
  );
  const antifragilityIndex = Math.min(
    1,
    assignments.reduce((sum, assignment) => sum + assignment.antifragilityGain, 0) / assignments.length * 0.6 +
      scenario.worldModel.modelFidelity * 0.4,
  );

  const paybackHours = totalCost === 0 ? 0 : (totalCost / totalValue) * assignments.reduce((sum, a) => sum + a.durationHours, 0);
  const treasuryVelocity = totalValue === 0 ? 0 : (totalValue - totalCost) / (totalCost || 1);
  const alphaCaptureVelocity = totalDuration === 0 ? 0 : portfolioProfit / totalDuration;
  const ownerSovereigntyLag = scenario.owner.emergency.responseMinutes;
  const governanceDeterminism = scenario.owner.members === 0 ? 0 : scenario.owner.threshold / scenario.owner.members;

  return {
    totalOpportunities: assignments.length,
    portfolioValue: totalValue,
    capitalAtRisk: totalCost,
    roiMultiplier: totalCost === 0 ? 0 : totalValue / totalCost,
    automationCoverage,
    validatorConfidence: weightedValidatorReliability,
    detectionLeadHours,
    worldModelFidelity: scenario.worldModel.modelFidelity,
    ownerCommandCoverage,
    sovereignControlScore,
    antifragilityIndex,
    stabilityReserve,
    paybackHours,
    treasuryVelocity,
    alphaCaptureVelocity,
    ownerSovereigntyLag,
    governanceDeterminism,
    ciStatus: scenario.ci.status,
  } as DemoSummary['metrics'];
}

function buildKnowledgeBase(scenario: Scenario, assignments: Assignment[]): DemoSummary['knowledgeBase'] {
  const opportunities = assignments.map((assignment) => ({
    id: assignment.opportunityId,
    title: assignment.title,
    domain: assignment.domain,
    linkedModules: assignment.modules,
    linkedAgents: [assignment.leadAgent.id, ...assignment.supportingAgents.map((agent) => agent.id)],
    value: assignment.expectedValue,
    risk: assignment.risk,
    outcomes: scenario.opportunities.find((opportunity) => opportunity.id === assignment.opportunityId)?.outcomes ?? [],
  }));

  const relationships = assignments.flatMap((assignment) => {
    const agentLinks = assignment.supportingAgents.map((agent) => ({
      from: agent.id,
      to: assignment.opportunityId,
      description: `${agent.name} supports ${assignment.title}`,
    }));
    const moduleLinks = assignment.modules.map((moduleId) => ({
      from: moduleId,
      to: assignment.opportunityId,
      description: `Module ${moduleId} powers ${assignment.title}`,
    }));
    return [...agentLinks, ...moduleLinks];
  });

  return {
    opportunities,
    relationships,
  };
}

function buildPhaseMatrix(scenario: Scenario, assignments: Assignment[]): DemoSummary['phaseMatrix'] {
  return PHASE_SEQUENCE.map((phase) => {
    const phaseAgents = scenario.agents.filter((agent) => agent.kind === phase);
    const agentIds = new Set(phaseAgents.map((agent) => agent.id));
    const relevantAssignments = assignments.filter(
      (assignment) =>
        agentIds.has(assignment.leadAgent.id) ||
        assignment.supportingAgents.some((agent) => agentIds.has(agent.id)),
    );

    const averageReliability =
      phaseAgents.length === 0
        ? 0
        : phaseAgents.reduce((sum, agent) => sum + agent.reliability, 0) / phaseAgents.length;
    const maxParallel = phaseAgents.reduce((max, agent) => Math.max(max, agent.maxParallel), 0);
    const opportunityValue = relevantAssignments.reduce((sum, assignment) => sum + assignment.expectedValue, 0);
    const validatorSupport =
      relevantAssignments.length === 0
        ? 0
        : relevantAssignments.reduce((sum, assignment) => sum + assignment.validators.length, 0) /
          relevantAssignments.length;
    const automationSupport =
      relevantAssignments.length === 0
        ? 0
        : relevantAssignments.reduce((sum, assignment) => sum + assignment.automation, 0) /
          relevantAssignments.length;

    return {
      phase,
      title: PHASE_LABELS[phase],
      agents: phaseAgents.map((agent) => `${agent.name} (${agent.ens})`),
      averageReliability,
      maxParallel,
      activeOpportunities: relevantAssignments.length,
      opportunityValue,
      validatorSupport,
      automationSupport,
    };
  });
}

function generateArchitectureMermaid(
  scenario: Scenario,
  assignments: Assignment[],
  metrics: DemoSummary['metrics'],
): string {
  const moduleNodes = scenario.modules
    .map((module) => `    ${module.id}[${module.name}\\n${module.version}]`)
    .join('\n');

  const opportunityEdges = assignments
    .map(
      (assignment) =>
        `    ${assignment.leadAgent.id} -->|leads| ${assignment.opportunityId}\n` +
        assignment.supportingAgents
          .map((agent) => `    ${agent.id} -->|supports| ${assignment.opportunityId}`)
          .join('\n'),
    )
    .join('\n');

  const moduleEdges = assignments
    .map((assignment) => assignment.modules.map((moduleId) => `    ${moduleId} --> ${assignment.opportunityId}`).join('\n'))
    .join('\n');

  return `graph TD
    owner[Owner Multi-Sig\\n${scenario.owner.governanceSafe}] --> orchestrator[Meta-Agentic Planner]
    orchestrator --> treasury[Treasury Manager]
    orchestrator --> governance[On-Chain Governance]
    treasury --> a2aBus
    governance --> a2aBus
${moduleNodes}
${opportunityEdges}
${moduleEdges}
    metrics[Metrics\\nROI ${metrics.roiMultiplier.toFixed(2)}x\\nAutomation ${(metrics.automationCoverage * 100).toFixed(1)}%]
    orchestrator --> metrics
`;
}

function generateTimelineMermaid(assignments: Assignment[]): string {
  const ganttRows = assignments
    .map(
      (assignment, index) =>
        `      ${assignment.title.replace(/ /g, '_')} :active, phase${index}, ${index * 6}, ${assignment.durationHours}`,
    )
    .join('\n');

  return `gantt
    title Meta-Agentic α-AGI Jobs Execution Timeline
    dateFormat  X
    axisFormat  %Hh
    section Opportunities
${ganttRows}
`;
}

function generateCoordinationMermaid(assignments: Assignment[]): string {
  const edges = assignments
    .map((assignment) =>
      assignment.supportingAgents
        .map((agent) => `    ${assignment.leadAgent.id} --- ${agent.id}`)
        .concat(assignment.validators.map((validator) => `    ${assignment.leadAgent.id} --- ${validator.id}`))
        .join('\n'),
    )
    .join('\n');

  return `graph LR
    a2aBus((A2A Protocol))
${assignments
  .map((assignment) => `    ${assignment.leadAgent.id} --> ${assignment.opportunityId}
    ${assignment.opportunityId} --> a2aBus`)
  .join('\n')}
${edges}
`;
}

function generatePhaseFlowMermaid(
  phaseMatrix: DemoSummary['phaseMatrix'],
  metrics: DemoSummary['metrics'],
): string {
  const nodes = phaseMatrix
    .map(
      (entry) =>
        `    ${entry.phase}[${entry.title}\\nAgents ${entry.agents.length}\\nReliability ${(entry.averageReliability * 100).toFixed(1)}%]`,
    )
    .join('\n');

  const edges = PHASE_SEQUENCE.slice(0, -1)
    .map((phase, index) => {
      const nextPhase = PHASE_SEQUENCE[index + 1];
      const nextEntry = phaseMatrix.find((entry) => entry.phase === nextPhase);
      const label = nextEntry
        ? `α ${(nextEntry.automationSupport * 100).toFixed(0)}% · validators ${nextEntry.validatorSupport.toFixed(1)}`
        : 'handoff';
      return `    ${phase} -->|${label}| ${nextPhase}`;
    })
    .join('\n');

  return `graph LR
${nodes}
${edges}
    roi[Portfolio ROI ${metrics.roiMultiplier.toFixed(2)}x\\nAlpha Velocity $${metrics.alphaCaptureVelocity.toFixed(0)}/h]
    outexecute --> roi
  `;
}

function buildOwnerPlaybook(summary: DemoSummary): string {
  const lines = [
    '# Meta-Agentic Owner Command Playbook',
    '',
    `- **Governance Safe**: ${summary.ownerControl.governanceSafe} (threshold ${summary.ownerControl.threshold} of ${summary.ownerControl.members})`,
    `- **Automation Coverage**: ${(summary.metrics.automationCoverage * 100).toFixed(1)}%`,
    `- **Sovereign Control Score**: ${(summary.metrics.sovereignControlScore * 100).toFixed(1)}%`,
    `- **Alpha Capture Velocity**: $${summary.metrics.alphaCaptureVelocity.toFixed(0)}/h`,
    `- **Owner Response Lag**: ${summary.metrics.ownerSovereigntyLag} minutes`,
    `- **Governance Determinism**: ${(summary.metrics.governanceDeterminism * 100).toFixed(1)}%`,
    '',
    '## Immediate Actions',
    ...summary.ownerControl.controls.map((control) => `- \`${control.parameter}\` → ${control.description} — \`${control.script}\``),
    '',
    '## Emergency Contacts',
    ...summary.ownerControl.emergency.contacts.map((contact) => `- ${contact}`),
    '',
    `- **Response Window**: ${summary.ownerControl.emergency.responseMinutes} minutes`,
    '',
    '## Safeguards',
    `- Pause: \`${summary.ownerControl.safeguards.pauseScript}\``,
    `- Resume: \`${summary.ownerControl.safeguards.resumeScript}\``,
    ...summary.ownerControl.safeguards.circuitBreakers.map(
      (breaker) => `- ${breaker.metric} ${breaker.comparator} ${breaker.threshold} → ${breaker.action} (${breaker.description})`,
    ),
    '',
    '## World Model & CI',
    `- Model Fidelity: ${(summary.metrics.worldModelFidelity * 100).toFixed(1)}%`,
    `- CI Status: ${summary.ci.status.toUpperCase()} via ${summary.ci.commands.join(', ')}`,
    '',
    '## Opportunity Overview',
    ...summary.assignments.map(
      (assignment) =>
        `- **${assignment.title}** (${assignment.domain}) – ROI ${assignment.projectedROI.toFixed(2)}x, automation ${(assignment.automation * 100).toFixed(1)}%, approvals ${assignment.ownerApprovals.join(', ')}`,
    ),
    '',
    '## Phase Matrix',
    ...summary.phaseMatrix.map(
      (entry) =>
        `- **${entry.title}** → ${entry.agents.length} agents, reliability ${(entry.averageReliability * 100).toFixed(1)}%, automation ${(entry.automationSupport * 100).toFixed(1)}%, opportunities ${entry.activeOpportunities}`,
    ),
  ];

  return lines.join('\n');
}

function buildExecutionLedger(assignments: Assignment[]): DemoSummary['executionLedger'] {
  return assignments.map((assignment) => ({
    opportunityId: assignment.opportunityId,
    checksum: crypto
      .createHash('sha256')
      .update(`${assignment.opportunityId}:${assignment.expectedValue}:${assignment.projectedROI}`)
      .digest('hex'),
    expectedValue: assignment.expectedValue,
    expectedCost: assignment.expectedCost,
    projectedROI: assignment.projectedROI,
    validators: assignment.validators.map((validator) => validator.id),
    ownerApprovals: assignment.ownerApprovals,
  }));
}

function buildDashboard(summary: DemoSummary): DemoSummary['dashboard'] {
  return {
    metrics: summary.metrics,
    assignments: summary.assignments.map((assignment) => ({
      opportunityId: assignment.opportunityId,
      title: assignment.title,
      domain: assignment.domain,
      projectedROI: assignment.projectedROI,
      automation: assignment.automation,
      stability: assignment.stability,
      durationHours: assignment.durationHours,
    })),
    owner: {
      governanceSafe: summary.ownerControl.governanceSafe,
      emergencyContacts: summary.ownerControl.emergency.contacts,
      responseMinutes: summary.ownerControl.emergency.responseMinutes,
      commands: summary.ownerControl.controls,
    },
    ci: summary.ci,
    phaseMatrix: summary.phaseMatrix,
  };
}

export async function loadScenarioFromFile(filePath: string): Promise<Scenario> {
  const file = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(file);
  return scenarioSchema.parse(json);
}

export async function runScenario(
  scenario: Scenario,
  partialOptions: Partial<RunOptions> = {},
): Promise<DemoSummary> {
  const options = runOptionsSchema.parse(partialOptions);
  const filteredOpportunities = scenario.opportunities.filter(
    (opportunity) => opportunity.signalConfidence >= options.confidenceFloor,
  );

  if (filteredOpportunities.length === 0) {
    throw new Error('No opportunities meet the confidence floor. Lower the threshold or enrich the scenario.');
  }

  const assignments = filteredOpportunities.map((opportunity) => assignOpportunity(scenario, opportunity, options));
  const metrics = computeMetrics(scenario, assignments);
  const phaseMatrix = buildPhaseMatrix(scenario, assignments);
  const ownerControl = {
    governanceSafe: scenario.owner.governanceSafe,
    operator: scenario.owner.operator,
    threshold: scenario.owner.threshold,
    members: scenario.owner.members,
    controls: scenario.owner.commands,
    emergency: scenario.owner.emergency,
    safeguards: scenario.safeguards,
    coverageScore: metrics.ownerCommandCoverage,
  } as DemoSummary['ownerControl'];

  const summary: DemoSummary = {
    scenario,
    metrics,
    assignments,
    ownerControl,
    mermaidArchitecture: generateArchitectureMermaid(scenario, assignments, metrics),
    mermaidTimeline: generateTimelineMermaid(assignments),
    mermaidCoordination: generateCoordinationMermaid(assignments),
    mermaidPhaseFlow: generatePhaseFlowMermaid(phaseMatrix, metrics),
    ownerPlaybook: '',
    knowledgeBase: buildKnowledgeBase(scenario, assignments),
    worldModel: scenario.worldModel,
    executionLedger: buildExecutionLedger(assignments),
    ci: scenario.ci,
    phaseMatrix,
    dashboard: undefined as unknown as DemoSummary['dashboard'],
  };

  summary.ownerPlaybook = buildOwnerPlaybook(summary);
  summary.dashboard = buildDashboard(summary);
  return summary;
}

export async function writeReports(summary: DemoSummary, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const files: Array<[string, string]> = [
    ['summary.json', JSON.stringify(summary.metrics, null, 2)],
    ['owner-control.json', JSON.stringify(summary.ownerControl, null, 2)],
    ['knowledge-base.json', JSON.stringify(summary.knowledgeBase, null, 2)],
    ['phase-matrix.json', JSON.stringify(summary.phaseMatrix, null, 2)],
    ['world-model.json', JSON.stringify(summary.worldModel, null, 2)],
    ['execution-ledger.json', JSON.stringify(summary.executionLedger, null, 2)],
    ['ci-status.json', JSON.stringify(summary.ci, null, 2)],
    ['dashboard.json', JSON.stringify(summary.dashboard, null, 2)],
    ['architecture.mmd', summary.mermaidArchitecture],
    ['timeline.mmd', summary.mermaidTimeline],
    ['coordination.mmd', summary.mermaidCoordination],
    ['phase-flow.mmd', summary.mermaidPhaseFlow],
    ['owner-playbook.md', summary.ownerPlaybook],
  ];

  await Promise.all(files.map(([name, content]) => fs.writeFile(path.join(outputDir, name), content, 'utf8')));
}

async function promptForRunOptions(defaults: RunOptions): Promise<RunOptions> {
  const rl = readline.createInterface({ input, output });

  const capitalMultiplierAnswer = await rl.question(
    `Capital multiplier (default ${defaults.capitalMultiplier}): `,
  );
  const automationBoostAnswer = await rl.question(`Automation boost (default ${defaults.automationBoost}): `);
  const confidenceFloorAnswer = await rl.question(
    `Confidence floor between 0 and 1 (default ${defaults.confidenceFloor}): `,
  );
  rl.close();

  const capitalMultiplier = capitalMultiplierAnswer ? Number(capitalMultiplierAnswer) : defaults.capitalMultiplier;
  const automationBoost = automationBoostAnswer ? Number(automationBoostAnswer) : defaults.automationBoost;
  const confidenceFloor = confidenceFloorAnswer ? Number(confidenceFloorAnswer) : defaults.confidenceFloor;

  return runOptionsSchema.parse({ capitalMultiplier, automationBoost, confidenceFloor });
}

export async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      describe: 'Path to the scenario JSON file',
      default: path.join(__dirname, '..', 'scenario', 'baseline.json'),
    })
    .option('out', {
      type: 'string',
      describe: 'Directory where reports will be written',
      default: path.join(__dirname, '..', 'reports'),
    })
    .option('interactive', {
      type: 'boolean',
      describe: 'Prompt for multipliers and thresholds',
      default: false,
    })
    .option('capitalMultiplier', {
      type: 'number',
      describe: 'Override capital intensity multiplier',
    })
    .option('automationBoost', {
      type: 'number',
      describe: 'Override automation boost factor',
    })
    .option('confidenceFloor', {
      type: 'number',
      describe: 'Minimum signal confidence required',
    })
    .help()
    .parseAsync();

  const scenarioPath = path.resolve(argv.scenario as string);
  const outputDir = path.resolve(argv.out as string);
  const scenario = await loadScenarioFromFile(scenarioPath);

  let options: RunOptions = runOptionsSchema.parse({
    capitalMultiplier: argv.capitalMultiplier,
    automationBoost: argv.automationBoost,
    confidenceFloor: argv.confidenceFloor,
  });

  if (argv.interactive) {
    options = await promptForRunOptions(options);
  }

  const summary = await runScenario(scenario, options);
  await writeReports(summary, outputDir);

  // eslint-disable-next-line no-console
  console.log(`Meta-Agentic α-AGI Jobs Demo reports generated in ${outputDir}`);
  // eslint-disable-next-line no-console
  console.log(
    `Portfolio ROI: ${summary.metrics.roiMultiplier.toFixed(2)}x | Automation coverage ${(summary.metrics.automationCoverage * 100).toFixed(1)}%`,
  );
}

if (require.main === module) {
  void main();
}
