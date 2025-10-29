import { NormalisedAlphaNodeConfig } from '../config';
import { JobOpportunity } from './planner';

export interface WorldModelStep {
  readonly step: number;
  readonly jobId: string;
  readonly success: boolean;
  readonly baseReward: number;
  readonly adjustedReturn: number;
  readonly cumulativeReturn: number;
}

export interface WorldModelPath {
  readonly totalReturn: number;
  readonly steps: readonly WorldModelStep[];
}

export interface WorldModelProjection {
  readonly expectedReturn: number;
  readonly downsideRisk: number;
  readonly volatility: number;
  readonly valueAtRisk: number;
  readonly conditionalValueAtRisk: number;
  readonly percentile10: number;
  readonly percentile50: number;
  readonly percentile90: number;
  readonly bestPath: WorldModelPath | null;
  readonly worstPath: WorldModelPath | null;
  readonly simulations: number;
  readonly horizon: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function hashOpportunity(opportunity: JobOpportunity): number {
  let hash = 0x811c9dc5;
  const update = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  };
  for (const char of opportunity.jobId) {
    update(char.charCodeAt(0));
  }
  update(Math.floor(opportunity.reward * 1_000));
  update(Math.floor(opportunity.difficulty * 10_000));
  update(Math.floor(opportunity.risk * 10_000));
  for (const tag of opportunity.tags) {
    for (const char of tag) {
      update(char.charCodeAt(0));
    }
  }
  return hash >>> 0;
}

function computeSeed(
  baseSeed: number,
  opportunities: readonly JobOpportunity[],
  selectedJobId: string | null | undefined
): number {
  let seed = baseSeed >>> 0;
  for (const opportunity of opportunities) {
    seed ^= hashOpportunity(opportunity);
  }
  if (selectedJobId) {
    for (const char of selectedJobId) {
      seed = Math.imul(seed ^ char.charCodeAt(0), 0x45d9f3b);
      seed >>>= 0;
    }
  }
  return seed >>> 0;
}

function computeWeight(
  opportunity: JobOpportunity,
  riskAversion: number,
  selectedJobId: string | null | undefined
): number {
  const base = Math.max(opportunity.reward, 0.01) * (1 - riskAversion * opportunity.risk);
  const favour = selectedJobId && opportunity.jobId === selectedJobId ? 1.35 : 1;
  return Math.max(base * favour, 0.001);
}

function pickOpportunity(
  opportunities: readonly JobOpportunity[],
  rng: () => number,
  riskAversion: number,
  selectedJobId: string | null | undefined
): JobOpportunity {
  const weights = opportunities.map((opportunity) =>
    computeWeight(opportunity, riskAversion, selectedJobId)
  );
  const total = weights.reduce((acc, value) => acc + value, 0);
  const roll = rng() * total;
  let cumulative = 0;
  for (let index = 0; index < opportunities.length; index += 1) {
    cumulative += weights[index];
    if (roll <= cumulative) {
      return opportunities[index];
    }
  }
  return opportunities[opportunities.length - 1];
}

export class AlphaWorldModel {
  private readonly config: NormalisedAlphaNodeConfig['ai']['worldModel'];

  constructor(config: NormalisedAlphaNodeConfig) {
    this.config = config.ai.worldModel;
  }

  project(
    opportunities: readonly JobOpportunity[],
    selectedJobId?: string | null
  ): WorldModelProjection {
    if (opportunities.length === 0) {
      return {
        expectedReturn: 0,
        downsideRisk: 0,
        volatility: 0,
        valueAtRisk: 0,
        conditionalValueAtRisk: 0,
        percentile10: 0,
        percentile50: 0,
        percentile90: 0,
        bestPath: null,
        worstPath: null,
        simulations: this.config.simulations,
        horizon: this.config.horizon,
      };
    }

    const seed = computeSeed(this.config.seed, opportunities, selectedJobId ?? null);
    const rng = mulberry32(seed);
    const totals: number[] = [];
    const allPaths: WorldModelPath[] = [];
    let sum = 0;
    let sumSquares = 0;
    let downsideCount = 0;

    for (let simulation = 0; simulation < this.config.simulations; simulation += 1) {
      let total = 0;
      const steps: WorldModelStep[] = [];
      for (let step = 0; step < this.config.horizon; step += 1) {
        const opportunity = pickOpportunity(
          opportunities,
          rng,
          this.config.riskAversion,
          selectedJobId ?? null
        );
        const successProbability = Math.max(0, Math.min(1, 1 - opportunity.risk));
        const success = rng() <= successProbability;
        const reward = opportunity.reward;
        const riskPenalty = success ? 1 - this.config.riskAversion * opportunity.risk : -this.config.riskAversion;
        const adjusted = reward * riskPenalty;
        const discounted = adjusted * Math.pow(this.config.discountFactor, step);
        total += discounted;
        steps.push({
          step,
          jobId: opportunity.jobId,
          success,
          baseReward: reward,
          adjustedReturn: discounted,
          cumulativeReturn: total,
        });
      }
      totals.push(total);
      sum += total;
      sumSquares += total * total;
      if (total < 0) {
        downsideCount += 1;
      }
      allPaths.push({ totalReturn: total, steps });
    }

    const expectedReturn = totals.length > 0 ? sum / totals.length : 0;
    const meanSquare = totals.length > 0 ? sumSquares / totals.length : 0;
    const variance = Math.max(meanSquare - expectedReturn * expectedReturn, 0);
    const volatility = Math.sqrt(variance);
    const downsideRisk = totals.length > 0 ? downsideCount / totals.length : 0;

    const sorted = [...totals].sort((a, b) => a - b);
    const pickPercentile = (percentile: number): number => {
      if (sorted.length === 0) {
        return 0;
      }
      const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.round(percentile * (sorted.length - 1)))
      );
      return sorted[index];
    };
    const percentile10 = pickPercentile(0.1);
    const percentile50 = pickPercentile(0.5);
    const percentile90 = pickPercentile(0.9);

    const cutIndex = Math.max(1, Math.floor(sorted.length * 0.1));
    const tailSlice = sorted.slice(0, cutIndex);
    const conditionalValueAtRisk =
      tailSlice.length > 0
        ? tailSlice.reduce((acc, value) => acc + value, 0) / tailSlice.length
        : percentile10;

    let bestPath: WorldModelPath | null = null;
    let worstPath: WorldModelPath | null = null;
    for (const path of allPaths) {
      if (!bestPath || path.totalReturn > bestPath.totalReturn) {
        bestPath = path;
      }
      if (!worstPath || path.totalReturn < worstPath.totalReturn) {
        worstPath = path;
      }
    }

    return {
      expectedReturn,
      downsideRisk,
      volatility,
      valueAtRisk: percentile10,
      conditionalValueAtRisk,
      percentile10,
      percentile50,
      percentile90,
      bestPath,
      worstPath,
      simulations: this.config.simulations,
      horizon: this.config.horizon,
    };
  }
}
