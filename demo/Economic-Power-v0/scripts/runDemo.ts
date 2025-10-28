import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const scenarioSchema = z.object({
  version: z.literal('1.0'),
  scenarioId: z.string(),
  title: z.string(),
  description: z.string(),
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
});

type Scenario = z.infer<typeof scenarioSchema>;

type Assignment = {
  jobId: string;
  jobName: string;
  agentId: string;
  agentName: string;
  agentEns: string;
  startHour: number;
  endHour: number;
  efficiency: number;
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

type Summary = {
  scenarioId: string;
  title: string;
  generatedAt: string;
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
  assignments: Assignment[];
  mermaidFlow: string;
  mermaidTimeline: string;
};

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
const BASELINE_UI_SUMMARY = path.join(
  __dirname,
  '..',
  'ui',
  'data',
  'default-summary.json',
);

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
  const base =
    0.78 +
    (averageReliability - 0.95) * 0.5 -
    averageRisk * 0.32 +
    breakerBonus +
    automationBonus;
  return Number(Math.min(0.995, Math.max(0.65, base)).toFixed(3));
}

function computeOwnerCommandCoverage(scenario: Scenario): number {
  const scripts = new Set<string>();
  for (const control of scenario.owner.controls) {
    scripts.add(control.script);
  }
  scripts.add(scenario.safeguards.pauseScript);
  scripts.add(scenario.safeguards.resumeScript);
  for (const circuit of scenario.safeguards.circuitBreakers) {
    scripts.add(circuit.action);
  }
  for (const upgrade of scenario.safeguards.upgradePaths) {
    scripts.add(upgrade.script);
  }
  const criticalSurfaces =
    scenario.jobs.length +
    scenario.validators.length +
    scenario.stablecoinAdapters.length +
    scenario.owner.controls.length +
    2;
  const coverage = scripts.size / Math.max(criticalSurfaces, 1);
  return Number(Math.min(1, coverage).toFixed(3));
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
  const requiredSkills = job.skills.length;
  const directMatches = job.skills.filter((skill) =>
    (agent.skills ?? []).includes(skill),
  ).length;
  const specializationMatches = job.skills.filter((skill) =>
    (agent.specializations ?? []).includes(skill),
  ).length;
  const matchRatio = requiredSkills
    ? (directMatches + specializationMatches * 0.7) / requiredSkills
    : 0;
  const availabilityScore = agent.availability;
  const reputationScore = agent.reputation / 100;
  const capacityPenalty = state.load / Math.max(agent.capacity, 1);
  const stochastic = pseudoRandom(`${agent.id}:${job.id}:match`) * 0.05;
  return (
    reputationScore * 0.5 +
    availabilityScore * 0.25 +
    matchRatio * 0.35 -
    capacityPenalty * 0.1 +
    stochastic
  );
}

function selectAgent(
  job: Scenario['jobs'][number],
  scenario: Scenario,
  agentStates: Map<string, AgentState>,
): { agent: Scenario['agents'][number]; state: AgentState } {
  const sorted = [...scenario.agents]
    .map((agent) => ({ agent, state: agentStates.get(agent.id)! }))
    .sort((a, b) =>
      computeAgentScore(job, b.agent, b.state) -
      computeAgentScore(job, a.agent, a.state),
    );
  return sorted[0];
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
  const synergy = job.skills.filter((skill) => agent.skills.includes(skill)).length /
    Math.max(job.skills.length, 1);
  const loadFactor = state.load / Math.max(agent.capacity, 1);
  const speedMultiplier = 1 - Math.min(synergy * 0.12, 0.25) + loadFactor * 0.06;
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

function synthesiseSummary(context: SimulationContext): Summary {
  const { scenario } = context;
  const assignmentConfidence =
    context.validatorConfidence / Math.max(context.assignments.length, 1);
  const automationScore = context.automationLift /
    Math.max(context.assignments.length, 1);
  const stabilityIndex = computeStabilityIndex(scenario, context);
  const ownerCoverage = computeOwnerCommandCoverage(scenario);
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    generatedAt: new Date().toISOString(),
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
    assignments: context.assignments,
    mermaidFlow: '',
    mermaidTimeline: '',
  };
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
  }

  const summary = synthesiseSummary(context);
  summary.mermaidFlow = generateMermaidFlow(summary, workingScenario);
  summary.mermaidTimeline = generateMermaidTimeline(summary);
  return summary;
}

async function writeOutputs(summary: Summary, outputDir: string): Promise<void> {
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
  };
  await fs.writeFile(
    path.join(outputDir, 'owner-sovereignty.json'),
    JSON.stringify(sovereigntyPlan, null, 2),
  );
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
  await writeOutputs(summary, argv.output);
  if (argv.ci) {
    compareWithBaseline(summary, BASELINE_UI_SUMMARY);
  }
  output.write(`\n✅ Economic Power summary written to ${argv.output}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Economic Power demo failed:', error);
    process.exitCode = 1;
  });
}
