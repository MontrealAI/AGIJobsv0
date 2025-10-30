import { DeterministicRandom } from './random';
import {
  AgentProfile,
  AssignmentContext,
  AssignmentOutcome,
  Experience,
  Job,
  PolicyConfig,
  RunMetrics,
  TrajectoryPoint
} from './types';
import { RewardComposer } from './reward';

interface PolicyState {
  weights: number[][];
  averageReward: number;
  experienceCount: number;
}

export interface EngineConfig {
  policy: PolicyConfig;
  rewardComposer: RewardComposer;
  maxAgents: number;
}

export const FEATURE_VECTOR_LENGTH = 16;

export class ExperienceEngine {
  private readonly policyState: PolicyState;
  private readonly buffer: Experience[] = [];
  private readonly rng: DeterministicRandom;

  constructor(private readonly config: EngineConfig, seed: number) {
    this.policyState = {
      weights: [],
      averageReward: 0,
      experienceCount: 0
    };
    this.rng = new DeterministicRandom(seed);
  }

  public selectAgent(context: AssignmentContext): {
    index: number;
    probabilities: number[];
    features: number[][];
  } {
    this.ensureWeights(context.agents.length, this.deriveFeatureLength(context));
    const featureVectors = context.agents.map((agent) => this.computeFeatures(context, agent));
    const logits = featureVectors.map((features, idx) => this.dotProduct(this.policyState.weights[idx], features));
    const policyProbabilities = this.softmax(logits, this.config.policy.temperature);

    const epsilon = clamp(this.config.policy.explorationEpsilon, 0, 1);
    const explore = this.rng.next() < epsilon;
    const behaviourProbabilities = explore
      ? Array.from({ length: context.agents.length }, () =>
          context.agents.length > 0 ? 1 / context.agents.length : 0
        )
      : policyProbabilities;
    const chosenRaw = explore
      ? Math.floor(this.rng.next() * context.agents.length)
      : this.weightedSample(policyProbabilities);
    const chosen = clamp(chosenRaw, 0, context.agents.length - 1);
    return { index: chosen, probabilities: behaviourProbabilities, features: featureVectors };
  }

  public recordExperience(experience: Experience): void {
    if (!experience || !experience.state || !experience.probabilities) {
      return;
    }
    this.buffer.push(experience);
    if (this.buffer.length > this.config.policy.experienceWindow) {
      this.buffer.shift();
    }
    this.updatePolicy();
  }

  public getDeterministicRandom(): DeterministicRandom {
    return this.rng;
  }

  private ensureWeights(agentCount: number, featureLength: number): void {
    const { weights } = this.policyState;
    while (weights.length < agentCount) {
      const entries = Array.from({ length: featureLength }, () => this.rng.nextBetween(-0.05, 0.05));
      weights.push(entries);
    }
    for (let i = 0; i < agentCount; i += 1) {
      if (weights[i].length !== featureLength) {
        weights[i] = Array.from({ length: featureLength }, () => this.rng.nextBetween(-0.05, 0.05));
      }
    }
  }

  private updatePolicy(): void {
    const { learningRate, batchSize, entropyWeight } = this.config.policy;
    if (this.buffer.length === 0) {
      return;
    }
    const sampleSize = Math.min(batchSize, this.buffer.length);
    const sample: Experience[] = [];
    for (let i = 0; i < sampleSize; i += 1) {
      const idx = Math.floor(this.rng.next() * this.buffer.length);
      sample.push(this.buffer[idx]);
    }

    for (const experience of sample) {
      if (!experience || !experience.state || !experience.probabilities) {
        continue;
      }
      const { state, action, reward, probabilities } = experience;
      this.policyState.experienceCount += 1;
      const alpha = 1 / this.policyState.experienceCount;
      this.policyState.averageReward =
        (1 - alpha) * this.policyState.averageReward + alpha * reward;
      const advantage = reward - this.policyState.averageReward;

      const logits = state.map((features, idx) =>
        this.dotProduct(this.policyState.weights[idx], features)
      );
      const policyProbabilities = this.softmax(logits, this.config.policy.temperature);
      const behaviourActionProbability = probabilities[action] ?? 0;
      const policyActionProbability = policyProbabilities[action] ?? 0;
      if (behaviourActionProbability <= 0) {
        continue;
      }
      const importanceWeight = policyActionProbability / behaviourActionProbability;
      const gradientBase = advantage * importanceWeight;

      for (let agentIdx = 0; agentIdx < state.length; agentIdx += 1) {
        const features = state[agentIdx];
        const prob = policyProbabilities[agentIdx];
        const indicator = agentIdx === action ? 1 : 0;
        const gradientScale = gradientBase * (indicator - prob);
        const entropyGrad = -entropyWeight * (Math.log(prob + 1e-9) + 1);
        for (let f = 0; f < features.length; f += 1) {
          const update = learningRate * (gradientScale * features[f] + entropyGrad);
          this.policyState.weights[agentIdx][f] += update;
        }
      }
    }
  }

  private computeFeatures(context: AssignmentContext, agent: AgentProfile): number[] {
    const { job, market } = context;
    const complexityPressure = job.complexity * (1 + market.volatility * 0.3);
    const urgency = Math.max(0, 1 - job.deadlineHours / 72);
    const enterpriseSignal = job.enterprise ? 1 : 0;
    const criticalSignal = job.critical ? 1 : 0;
    const adaptabilityGap = agent.adaptivity - market.regulatoryFriction;
    const stakeSignal = Math.log1p(agent.stake / 100000);
    const themeVector = encodeTheme(job.theme);
    return [
      job.value / 8000,
      complexityPressure,
      urgency,
      enterpriseSignal,
      criticalSignal,
      agent.skill,
      agent.speed,
      agent.reliability,
      1 - agent.cost,
      adaptabilityGap,
      stakeSignal,
      market.demandPulse,
      market.volatility,
      ...themeVector
    ];
  }

  private deriveFeatureLength(context: AssignmentContext): number {
    return FEATURE_VECTOR_LENGTH;
  }

  private dotProduct(a: number[], b: number[]): number {
    let result = 0;
    for (let i = 0; i < a.length; i += 1) {
      result += a[i] * b[i];
    }
    return result;
  }

  private softmax(logits: number[], temperature: number): number[] {
    const temp = Math.max(temperature, 1e-3);
    const maxLogit = Math.max(...logits);
    const exps = logits.map((logit) => Math.exp((logit - maxLogit) / temp));
    const sum = exps.reduce((acc, value) => acc + value, 0);
    return exps.map((value) => value / (sum || 1));
  }

  private weightedSample(probabilities: number[]): number {
    const r = this.rng.next();
    let cumulative = 0;
    for (let i = 0; i < probabilities.length; i += 1) {
      cumulative += probabilities[i];
      if (r <= cumulative) {
        return i;
      }
    }
    return probabilities.length - 1;
  }
}

export function simulateOutcome(
  context: AssignmentContext,
  agent: AgentProfile,
  rng: DeterministicRandom,
  rewardComposer: RewardComposer,
  selectedFeatures: number[][],
  actionIndex: number,
  probabilities: number[]
): AssignmentOutcome {
  const { job, market } = context;
  const themeAffinity =
    job.theme === 'innovation'
      ? agent.skill * 0.28 + agent.adaptivity * 0.22
      : job.theme === 'compliance'
        ? agent.reliability * 0.35 + agent.adaptivity * 0.2
        : agent.speed * 0.33 + agent.skill * 0.18;
  const synergy =
    agent.skill * 0.42 +
    agent.reliability * 0.38 +
    agent.adaptivity * (job.enterprise ? 0.36 : 0.22) +
    agent.speed * (job.critical ? 0.35 : 0.22) +
    themeAffinity -
    job.complexity * 0.6;
  const riskSurface = job.complexity * (1.25 + market.volatility * 0.55) - agent.reliability * 1.1;
  const probabilityNoise = (rng.next() - 0.5) * 0.3;
  const successProbability = clamp(
    0.18 + synergy * 0.22 - riskSurface * 0.4 + market.demandPulse * 0.12 + probabilityNoise,
    0.05,
    0.98
  );
  const success = rng.next() < successProbability;

  const baseDuration = 6 + job.complexity * 38;
  const speedGain = 1 - agent.speed * 0.65 - agent.adaptivity * 0.2;
  const durationNoise = (rng.next() - 0.5) * market.volatility * 10;
  const duration = Math.max(1.5, baseDuration * Math.max(0.3, speedGain) + durationNoise);

  const costPressure = 0.85 + Math.max(0, job.complexity - agent.adaptivity * 0.55) * 0.8 + (job.theme === 'compliance' ? 0.12 : 0);
  const reliabilityPremium = success
    ? Math.max(0.25, 1 - agent.reliability * 0.8)
    : 1 + (1 - agent.reliability) * 0.65;
  const themeModifier = job.theme === 'innovation' ? 0.78 : job.theme === 'velocity' ? 0.9 : 1.05;
  const cost = agent.cost * 420 * costPressure * reliabilityPremium * themeModifier;
  const satisfaction = success
    ? clamp(agent.skill * 0.55 + agent.adaptivity * 0.25 + (1 - duration / 90) * 0.25, 0, 1)
    : clamp(agent.adaptivity * 0.3 + agent.reliability * 0.25 - job.complexity * 0.2, 0.05, 0.6);

  const experience: Experience = {
    jobId: job.id,
    state: selectedFeatures,
    action: actionIndex,
    probabilities,
    reward: 0,
    metrics: {
      success,
      durationHours: duration,
      cost,
      satisfaction,
      value: job.value
    }
  };

  const assignment: AssignmentOutcome = {
    agent,
    success,
    durationHours: duration,
    cost,
    satisfaction,
    reward: 0,
    experience
  };
  assignment.reward = rewardComposer.calculate(assignment);
  assignment.experience.reward = assignment.reward;
  return assignment;
}

export function baselineSelection(context: AssignmentContext): number {
  let bestIndex = 0;
  let bestScore = -Infinity;
  context.agents.forEach((agent, idx) => {
    const urgencyPenalty = context.job.deadlineHours < 24 ? 0.1 : 0;
    const base = context.job.value / 1000;
    const score = base + agent.skill * 0.4 + agent.speed * 0.35 - agent.cost * 0.5 - urgencyPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  });
  return bestIndex;
}

export function updateRunMetrics(
  metrics: RunMetrics,
  outcome: AssignmentOutcome,
  reward: number,
  index: number
): TrajectoryPoint {
  metrics.gmv += outcome.success ? outcome.experience.metrics.value : 0;
  metrics.cost += outcome.cost;
  if (outcome.success) {
    metrics.successes += 1;
  } else {
    metrics.failures += 1;
  }
  metrics.averageLatency += (outcome.durationHours - metrics.averageLatency) / (metrics.successes + metrics.failures);
  metrics.averageSatisfaction +=
    (outcome.satisfaction - metrics.averageSatisfaction) / (metrics.successes + metrics.failures);
  metrics.rewardAverage += (reward - metrics.rewardAverage) / (metrics.successes + metrics.failures);
  const delta = reward - metrics.rewardAverage;
  metrics.rewardVolatility += (delta * delta - metrics.rewardVolatility) / (metrics.successes + metrics.failures);
  metrics.learningSignalDensity = Math.min(1, metrics.successes / Math.max(1, metrics.failures + metrics.successes));
  metrics.autonomyLift =
    0.5 * (metrics.rewardAverage + 1.5) + 0.25 * (metrics.learningSignalDensity + 0.2) + 0.25 * (1 - metrics.rewardVolatility);
  metrics.roi = metrics.gmv / Math.max(1, metrics.cost);

  return {
    jobId: outcome.experience.jobId,
    cumulativeGMV: metrics.gmv,
    cumulativeCost: metrics.cost,
    runningROI: metrics.roi,
    success: outcome.success,
    selectedAgent: outcome.agent.id,
    reward
  };
}

export function createEmptyMetrics(): RunMetrics {
  return {
    gmv: 0,
    cost: 0,
    successes: 0,
    failures: 0,
    averageLatency: 0,
    averageSatisfaction: 0,
    roi: 0,
    autonomyLift: 0,
    rewardAverage: 0,
    rewardVolatility: 0,
    learningSignalDensity: 0
  };
}

function encodeTheme(theme: string): [number, number, number] {
  switch (theme) {
    case 'innovation':
      return [1, 0, 0];
    case 'compliance':
      return [0, 1, 0];
    case 'velocity':
    default:
      return [0, 0, 1];
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (min === max) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
