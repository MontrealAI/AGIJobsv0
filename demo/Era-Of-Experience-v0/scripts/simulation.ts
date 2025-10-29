import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentProfile,
  ExperienceRecord,
  JobDefinition,
  JobOutcome,
  OwnerConsoleSnapshot,
  OwnerControlState,
  PolicySnapshot,
  SimulationConfig,
  SimulationReport,
  SimulationRunSummary,
} from './types';
import { composeActionId, composeStateId, loadRewardConfig, calculateReward } from './rewardComposer';
import { DeterministicRandom } from './random';
import { ExperienceTrainer } from './trainer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ScenarioStream extends JobDefinition {
  volume: number;
}

interface EraOfExperienceScenario {
  version: string;
  title: string;
  description: string;
  agents: AgentProfile[];
  jobStreams: ScenarioStream[];
  deterministicSeed: string;
  owner: {
    name: string;
    safe: string;
  };
}

const categorySkillMap: Record<string, string[]> = {
  'Quantitative Intelligence': ['deep-research', 'quant-analysis', 'mission-control'],
  'Narrative Experience': ['narrative-design', 'creative-labs', 'strategy'],
  'Global Expansion': ['market-expansion', 'operations', 'legal-compliance'],
  'Sentinel Automation': ['infrastructure', 'security', 'automation'],
};

function normalizeCategory(category: string): string {
  return categorySkillMap[category] ? category : Object.keys(categorySkillMap)[0];
}

function computeSkillMatch(agent: AgentProfile, job: JobDefinition): number {
  const normalized = normalizeCategory(job.category);
  const requiredSkills = categorySkillMap[normalized] ?? [];
  if (requiredSkills.length === 0) {
    return 0.5;
  }
  const matches = requiredSkills.filter((skill) => agent.specialization.includes(skill)).length;
  return matches / requiredSkills.length;
}

function simulateOutcome(
  random: DeterministicRandom,
  job: JobDefinition,
  agent: AgentProfile,
): { outcome: JobOutcome; skillMatch: number; sustainabilityOvershoot: number } {
  const skillMatch = computeSkillMatch(agent, job);
  const complexityPressure = Math.max(0, job.complexity / 10 - agent.adaptability * 0.5 - skillMatch * 0.4);
  const baseSuccess = agent.reliability * 0.55 + skillMatch * 0.3 + agent.adaptability * 0.15;
  const successProbability = Math.min(0.99, Math.max(0.2, baseSuccess - complexityPressure * 0.35));
  const success = random.next() < successProbability;
  const latencyNoise = 1 + (random.next() - 0.5) * 0.25;
  const durationHours = Math.max(1, job.latencyTargetHours * (1 + (1 - agent.velocity) * 0.4) * latencyNoise);
  const cost = agent.operatingCost * (1 + job.complexity / 20) * (success ? 1 : 1.15);
  const ratingBase = success ? 3.2 + skillMatch * 1.6 + agent.adaptability * 0.6 : 2 - skillMatch * 0.8;
  const ratingNoise = (random.next() - 0.5) * 0.6;
  const rating = Math.max(0, Math.min(5, ratingBase + ratingNoise));
  const valueMultiplier = success ? 0.7 + skillMatch * 0.6 + random.next() * 0.1 : random.next() * 0.2;
  const valueCaptured = job.value * valueMultiplier;
  const penalties = success ? 0 : job.reward * 0.35;
  const rewardPaid = success ? job.reward : job.reward * 0.4;
  const sustainabilityOvershoot = Math.max(0, agent.energyFootprint - job.sustainabilityTarget);

  return {
    outcome: {
      jobId: job.id,
      agentId: agent.id,
      success,
      durationHours,
      cost,
      rating,
      valueCaptured,
      penalties,
      rewardPaid,
    },
    skillMatch,
    sustainabilityOvershoot,
  };
}

function expandJobs(
  scenario: EraOfExperienceScenario,
  random: DeterministicRandom,
): { jobs: JobDefinition[]; totalVolume: number } {
  const jobs: JobDefinition[] = [];
  for (const stream of scenario.jobStreams) {
    for (let i = 0; i < stream.volume; i += 1) {
      const rewardNoise = 1 + (random.next() - 0.5) * 0.1;
      const valueNoise = 1 + (random.next() - 0.5) * 0.15;
      jobs.push({
        id: `${stream.id}-${i + 1}`,
        category: stream.category,
        complexity: stream.complexity,
        value: Math.max(50, stream.value * valueNoise),
        reward: Math.max(25, stream.reward * rewardNoise),
        latencyTargetHours: stream.latencyTargetHours,
        criticality: stream.criticality,
        experienceRequired: stream.experienceRequired,
        sustainabilityTarget: stream.sustainabilityTarget,
      });
    }
  }
  return { jobs, totalVolume: jobs.length };
}

function createBaselineSummary(
  jobs: JobDefinition[],
  agents: AgentProfile[],
  random: DeterministicRandom,
  rewardConfig: Awaited<ReturnType<typeof loadRewardConfig>>,
): SimulationRunSummary {
  let completedJobs = 0;
  let failedJobs = 0;
  let grossMerchandiseValue = 0;
  let totalRewardPaid = 0;
  let totalCost = 0;
  let totalRating = 0;
  let totalLatency = 0;
  let sustainabilityPenalty = 0;
  const timeline: SimulationRunSummary['timeline'] = [];

  const experiences: ExperienceRecord[] = [];

  for (const job of jobs) {
    const chosen = selectBaselineAgent(job, agents);
    const { outcome, sustainabilityOvershoot } = simulateOutcome(random, job, chosen);
    const rewardSignal = calculateReward(rewardConfig, job, outcome, chosen);
    totalRewardPaid += outcome.rewardPaid;
    totalCost += outcome.cost + outcome.penalties;
    totalRating += outcome.rating;
    totalLatency += outcome.durationHours;
    sustainabilityPenalty += sustainabilityOvershoot;
    grossMerchandiseValue += outcome.valueCaptured;
    if (outcome.success) {
      completedJobs += 1;
    } else {
      failedJobs += 1;
    }
    timeline.push({
      jobId: job.id,
      agentId: chosen.id,
      reward: outcome.rewardPaid,
      rewardSignal,
      success: outcome.success,
    });
    experiences.push({
      stateId: composeStateId(job),
      actionId: composeActionId(chosen),
      reward: rewardSignal,
      timestamp: Date.now(),
      details: { job, agent: chosen, outcome },
    });
  }

  const totalJobs = jobs.length;
  const averageLatencyHours = totalLatency / totalJobs;
  const averageCost = totalCost / totalJobs;
  const averageRating = totalRating / totalJobs;
  const roi = (grossMerchandiseValue - totalCost - totalRewardPaid) / Math.max(totalCost + totalRewardPaid, 1);
  const sustainabilityScore = Math.max(0, 1 - sustainabilityPenalty / Math.max(totalJobs, 1));

  return {
    label: 'Experience-Native Baseline',
    totalJobs,
    completedJobs,
    failedJobs,
    grossMerchandiseValue,
    totalRewardPaid,
    averageLatencyHours,
    averageCost,
    averageRating,
    roi,
    successRate: completedJobs / totalJobs,
    sustainabilityScore,
    timeline,
  };
}

function selectBaselineAgent(job: JobDefinition, agents: AgentProfile[]): AgentProfile {
  let bestAgent = agents[0];
  let bestScore = scoreBaselineAgent(job, bestAgent);
  for (let i = 1; i < agents.length; i += 1) {
    const candidate = agents[i];
    const score = scoreBaselineAgent(job, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestAgent = candidate;
    }
  }
  return bestAgent;
}

function scoreBaselineAgent(_job: JobDefinition, agent: AgentProfile): number {
  return agent.reliability - agent.operatingCost * 0.02;
}

function aggregateSummary(
  jobs: JobDefinition[],
  agents: AgentProfile[],
  random: DeterministicRandom,
  config: SimulationConfig,
  ownerControls: OwnerControlState,
  rewardConfig: Awaited<ReturnType<typeof loadRewardConfig>>,
): { summary: SimulationRunSummary; experiences: ExperienceRecord[]; checkpoints: PolicySnapshot[] } {
  const trainer = new ExperienceTrainer(config);
  const experiences: ExperienceRecord[] = [];
  const timeline: SimulationRunSummary['timeline'] = [];
  let completedJobs = 0;
  let failedJobs = 0;
  let grossMerchandiseValue = 0;
  let totalRewardPaid = 0;
  let totalCost = 0;
  let totalRating = 0;
  let totalLatency = 0;
  let sustainabilityPenalty = 0;

  const epsilon = ownerControls.paused ? 0 : ownerControls.exploration ?? config.epsilon;

  for (let i = 0; i < Math.min(config.horizon, jobs.length); i += 1) {
    const job = jobs[i];
    const stateId = composeStateId(job);
    const policy = trainer.getPolicy();
    const chosen = ownerControls.paused ? selectBaselineAgent(job, agents) : policy.selectAction(stateId, agents, epsilon);
    const { outcome, sustainabilityOvershoot } = simulateOutcome(random, job, chosen);
    const rewardSignal = calculateReward(rewardConfig, job, outcome, chosen);
    const experience: ExperienceRecord = {
      stateId,
      actionId: composeActionId(chosen),
      reward: rewardSignal,
      timestamp: Date.now() + i,
      details: { job, agent: chosen, outcome },
    };
    experiences.push(experience);
    trainer.integrate(experience);
    trainer.train(config.batchSize);
    if (i % 40 === 0) {
      trainer.maybeCheckpoint(`Policy update after ${i + 1} experiences`);
    }
    totalRewardPaid += outcome.rewardPaid;
    totalCost += outcome.cost + outcome.penalties;
    totalRating += outcome.rating;
    totalLatency += outcome.durationHours;
    sustainabilityPenalty += sustainabilityOvershoot;
    grossMerchandiseValue += outcome.valueCaptured;
    if (outcome.success) {
      completedJobs += 1;
    } else {
      failedJobs += 1;
    }
    timeline.push({
      jobId: job.id,
      agentId: chosen.id,
      reward: outcome.rewardPaid,
      rewardSignal,
      success: outcome.success,
    });
  }

  const totalJobs = Math.min(config.horizon, jobs.length);
  const averageLatencyHours = totalLatency / totalJobs;
  const averageCost = totalCost / totalJobs;
  const averageRating = totalRating / totalJobs;
  const roi = (grossMerchandiseValue - totalCost - totalRewardPaid) / Math.max(totalCost + totalRewardPaid, 1);
  const sustainabilityScore = Math.max(0, 1 - sustainabilityPenalty / Math.max(totalJobs, 1));

  return {
    summary: {
      label: 'Experience-Native RL System',
      totalJobs,
      completedJobs,
      failedJobs,
      grossMerchandiseValue,
      totalRewardPaid,
      averageLatencyHours,
      averageCost,
      averageRating,
      roi,
      successRate: completedJobs / totalJobs,
      sustainabilityScore,
      timeline,
    },
    experiences,
    checkpoints: trainer.getCheckpoints(),
  };
}

function buildMermaidFlow(report: SimulationReport, scenario: EraOfExperienceScenario): string {
  return `graph TD
    A["🌐 Experience Streams (${scenario.title})"] --> B["🎛️ Orchestrator Policy"]
    B -->|Baseline| C["${report.baseline.completedJobs} Baseline Completions"]
    B -->|RL Adaptive| D["${report.rlEnhanced.completedJobs} Experience-Native Wins"]
    D --> E["📈 GMV ${report.rlEnhanced.grossMerchandiseValue.toFixed(1)}"]
    E --> F["💡 Reward Composer"]
    F --> G["🧠 Experience Buffer (${report.rlEnhanced.totalJobs} events)"]
    G --> H["⚙️ Trainer + Policy Updates"]
    H --> B
    F --> I["🛰️ Owner Controls"]
    I -->|Exploration ${report.ownerConsole.controls.exploration.toFixed(2)}| B
  `;
}

function buildMermaidValueStream(report: SimulationReport): string {
  return `graph LR
    Jobs[Job Streams] --> Policy[Adaptive Policy]
    Policy --> Success[Success Rate ${(report.rlEnhanced.successRate * 100).toFixed(1)}%]
    Policy --> Latency[Latency Δ ${report.improvement.avgLatencyDelta.toFixed(2)}h]
    Success --> GMV[GMV Lift ${(report.improvement.gmvLiftPct * 100).toFixed(1)}%]
    GMV --> ROI[ROI Δ ${report.improvement.roiDelta.toFixed(2)}]
    ROI --> Owner[Owner Consoles]
    Owner --> Sentinel[Sentinel Safeguards]
    Sentinel --> Policy
  `;
}

function buildOwnerConsole(report: SimulationReport): OwnerConsoleSnapshot {
  const failureRate = 1 - report.rlEnhanced.successRate;
  const gmvTrend = report.improvement.gmvLiftPct;
  const latencyTrend = report.improvement.avgLatencyDelta;
  const sentinelActivated = failureRate > 0.25;
  const recommendedActions = [
    gmvTrend > 0.05
      ? 'Maintain elevated exploration to continue compounding GMV lift.'
      : 'Tighten exploration until GMV growth accelerates again.',
    latencyTrend < 0
      ? 'Celebrate latency wins and propagate policy snapshot to production orchestrators.'
      : 'Use owner pause lever to recalibrate policy weights for latency-sensitive streams.',
    sentinelActivated
      ? 'Sentinel triggered: dispatch emergency review and temporarily reduce exploration to 5%.'
      : 'Sentinels green: continue autopilot with daily checkpoint review.',
  ];

  const actionableMermaid = `graph TD
    Owner[Owner Safe]\n -->|Set Exploration| Control[Exploration ${(report.ownerConsole.controls.exploration * 100).toFixed(0)}%]
    Owner -->|Pause Toggle| Pause[Paused ${report.ownerConsole.controls.paused ? 'Yes' : 'No'}]
    Owner -->|Reward Override| Reward[Dynamic Reward Composer]
    Control --> Sentinel[Sentinel Envelope]
    Sentinel --> Policy[Adaptive Policy]
    Reward --> Policy
  `;

  return {
    controls: report.ownerConsole.controls,
    recommendedActions,
    safeguardStatus: {
      failureRate,
      gmvTrend,
      latencyTrend,
      sentinelActivated,
    },
    actionableMermaid,
  };
}

export async function loadScenario(relativePath: string): Promise<EraOfExperienceScenario> {
  const absolute = path.isAbsolute(relativePath) ? relativePath : path.join(__dirname, '..', relativePath);
  const data = await readFile(absolute, 'utf8');
  const parsed = JSON.parse(data) as EraOfExperienceScenario;
  return parsed;
}

export async function runExperienceDemo(
  scenario: EraOfExperienceScenario,
  config: SimulationConfig,
  ownerControls: OwnerControlState,
): Promise<SimulationReport> {
  const rewardConfig = await loadRewardConfig(ownerControls.rewardOverrides);
  const random = new DeterministicRandom(scenario.deterministicSeed);
  const { jobs } = expandJobs(scenario, random);
  const baselineRandom = new DeterministicRandom(`${scenario.deterministicSeed}-baseline`);
  const baselineSummary = createBaselineSummary(jobs, scenario.agents, baselineRandom, rewardConfig);
  const rlRandom = new DeterministicRandom(`${scenario.deterministicSeed}-rl`);
  const rl = aggregateSummary(jobs, scenario.agents, rlRandom, config, ownerControls, rewardConfig);

  const improvement = {
    gmvDelta: rl.summary.grossMerchandiseValue - baselineSummary.grossMerchandiseValue,
    gmvLiftPct:
      (rl.summary.grossMerchandiseValue - baselineSummary.grossMerchandiseValue) /
      Math.max(baselineSummary.grossMerchandiseValue, 1),
    roiDelta: rl.summary.roi - baselineSummary.roi,
    successRateDelta: rl.summary.successRate - baselineSummary.successRate,
    avgLatencyDelta: rl.summary.averageLatencyHours - baselineSummary.averageLatencyHours,
  };

  const report: SimulationReport = {
    baseline: baselineSummary,
    rlEnhanced: rl.summary,
    improvement,
    experienceLogSample: rl.experiences.slice(-25),
    policySnapshots: rl.checkpoints,
    mermaidFlow: '',
    mermaidValueStream: '',
    ownerConsole: {
      controls: ownerControls,
      recommendedActions: [],
      safeguardStatus: {
        failureRate: 0,
        gmvTrend: 0,
        latencyTrend: 0,
        sentinelActivated: false,
      },
      actionableMermaid: '',
    },
  };

  report.mermaidFlow = buildMermaidFlow(report, scenario);
  report.mermaidValueStream = buildMermaidValueStream(report);
  report.ownerConsole = buildOwnerConsole(report);

  return report;
}
