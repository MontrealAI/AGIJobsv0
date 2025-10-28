import { NormalisedAlphaNodeConfig } from '../config';
import type { JobOpportunity } from './planner';

export interface WorldModelForecast {
  readonly jobId: string;
  readonly successProbability: number;
  readonly expectedReward: number;
  readonly expectedCost: number;
  readonly riskAdjustedValue: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface WorldModelSequence {
  readonly jobIds: readonly string[];
  readonly cumulativeValue: number;
  readonly confidence: number;
}

interface WorldModelState {
  readonly successRate: number;
  readonly uncertainty: number;
  readonly iterations: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function scoreTagSynergy(tags: readonly string[]): number {
  if (tags.length === 0) {
    return 0.05;
  }
  const premiumTags = new Set([
    'capital-markets',
    'governance',
    'biotech',
    'manufacturing',
    'energy-optimization',
    'resilience',
  ]);
  const overlap = tags.filter((tag) => premiumTags.has(tag)).length;
  return clamp(0.1 * overlap, 0, 0.35);
}

function describeForecast(forecast: WorldModelForecast): string {
  const successPct = Math.round(forecast.successProbability * 100);
  const confidencePct = Math.round(forecast.confidence * 100);
  return `Success ${successPct}% @ confidence ${confidencePct}% → risk-adjusted ${forecast.riskAdjustedValue.toFixed(2)}`;
}

export class AlphaWorldModel {
  private readonly params = this.config.ai.worldModel;
  private state: WorldModelState = {
    successRate: this.config.ai.worldModel.baselineSuccessRate,
    uncertainty: 0.25,
    iterations: 0,
  };

  constructor(private readonly config: NormalisedAlphaNodeConfig) {}

  forecast(
    job: JobOpportunity,
    step = 0,
    state: WorldModelState = this.state,
  ): WorldModelForecast {
    const synergyBonus = scoreTagSynergy(job.tags);
    const demandSignal = 1 - job.difficulty + synergyBonus;
    const successProbability = clamp(
      state.successRate + this.params.adaptationRate * demandSignal - job.risk * this.params.volatility + step * 0.015,
      0.05,
      0.99,
    );
    const expectedReward = clamp(job.reward, 0, Number.POSITIVE_INFINITY) * successProbability;
    const expectedCost = clamp(job.reward * (job.risk + 0.1) * this.params.volatility, 0, Number.POSITIVE_INFINITY);
    const riskAdjustedValue = expectedReward - expectedCost + synergyBonus * this.params.exploitationBias * job.reward;
    const confidence = clamp(1 - state.uncertainty - job.risk * 0.35 + synergyBonus, 0.05, 0.99);
    return {
      jobId: job.jobId,
      successProbability,
      expectedReward,
      expectedCost,
      riskAdjustedValue,
      confidence,
      rationale: describeForecast({
        jobId: job.jobId,
        successProbability,
        expectedReward,
        expectedCost,
        riskAdjustedValue,
        confidence,
        rationale: '',
      }),
    };
  }

  evaluate(
    opportunities: JobOpportunity[],
    horizon: number,
  ): {
    readonly forecasts: Map<string, WorldModelForecast>;
    readonly bestForecast?: WorldModelForecast;
    readonly sequence: WorldModelSequence;
  } {
    const forecasts = new Map<string, WorldModelForecast>();
    for (const job of opportunities) {
      forecasts.set(job.jobId, this.forecast(job));
    }
    const ordered = [...forecasts.values()].sort(
      (a, b) => b.riskAdjustedValue - a.riskAdjustedValue,
    );
    const bestForecast = ordered[0];
    const sequence = this.planSequence(opportunities, horizon);
    return { forecasts, bestForecast, sequence };
  }

  recordOutcome(_jobId: string, success: boolean, reward: number, difficulty: number): void {
    const adjustment = success ? 1 : 0;
    const rewardSignal = clamp(Math.log10(1 + Math.max(reward, 0)) / 6, 0, 0.35);
    const blendedSuccess =
      this.state.successRate * (1 - this.params.adaptationRate) +
      adjustment * this.params.adaptationRate * (1 - difficulty * 0.2 + rewardSignal * 0.3);
    const volatilityBump = success
      ? -0.05 - rewardSignal * 0.15
      : 0.07 + difficulty * 0.05 + rewardSignal * 0.08;
    this.state = {
      successRate: clamp(blendedSuccess, 0.05, 0.99),
      uncertainty: clamp(this.state.uncertainty + volatilityBump, 0.05, 0.6),
      iterations: this.state.iterations + 1,
    };
  }

  private planSequence(opportunities: JobOpportunity[], horizon: number): WorldModelSequence {
    const available = [...opportunities];
    const sequence: string[] = [];
    let cumulativeValue = 0;
    let confidence = 1;
    let state = { ...this.state };

    for (let step = 0; step < horizon; step += 1) {
      if (available.length === 0) {
        break;
      }
      const forecasts = available.map((job) => this.forecast(job, step, state));
      forecasts.sort((a, b) => b.riskAdjustedValue - a.riskAdjustedValue);
      const selected = forecasts[0];
      if (!selected || selected.riskAdjustedValue <= 0) {
        break;
      }
      sequence.push(selected.jobId);
      cumulativeValue += selected.riskAdjustedValue;
      confidence = Math.min(confidence, selected.confidence);
      state = this.simulateStep(state, selected);
      const index = available.findIndex((job) => job.jobId === selected.jobId);
      if (index >= 0) {
        available.splice(index, 1);
      }
    }

    return { jobIds: sequence, cumulativeValue, confidence };
  }

  private simulateStep(state: WorldModelState, forecast: WorldModelForecast): WorldModelState {
    const successRate = clamp(
      state.successRate * (1 - this.params.adaptationRate * 0.5) +
        forecast.successProbability * this.params.adaptationRate,
      0.05,
      0.99,
    );
    const uncertainty = clamp(
      state.uncertainty * (1 - this.params.adaptationRate * 0.4) +
        (1 - forecast.confidence) * this.params.adaptationRate,
      0.05,
      0.65,
    );
    return {
      successRate,
      uncertainty,
      iterations: state.iterations + 1,
    };
  }
}
