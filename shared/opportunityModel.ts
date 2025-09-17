import { ethers } from 'ethers';
import agialpha from '../config/agialpha.json';
import type { EfficiencyBreakdown } from './efficiencyMetrics';

const TOKEN_DECIMALS = Number.isFinite(Number(agialpha.decimals))
  ? Number(agialpha.decimals)
  : 18;

function safeFormatUnits(value: bigint): number {
  try {
    return Number.parseFloat(ethers.formatUnits(value, TOKEN_DECIMALS));
  } catch {
    return 0;
  }
}

function round(value: number, precision = 6): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normaliseCategoryAffinity(
  jobCategory: string | undefined,
  candidateCategories: string[]
): number {
  if (!jobCategory) {
    return 0.5;
  }
  const key = jobCategory.trim().toLowerCase();
  if (!key) {
    return 0.5;
  }
  if (candidateCategories.length === 0) {
    return 0.3;
  }
  for (const category of candidateCategories) {
    const value = category.trim().toLowerCase();
    if (!value) continue;
    if (value === key) {
      return 1;
    }
    if (value.includes(key) || key.includes(value)) {
      return 0.75;
    }
  }
  return 0.35;
}

function toLowerSet(values: string[] | undefined): Set<string> {
  const set = new Set<string>();
  if (!values) return set;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return set;
}

export interface OpportunityCandidateInput {
  address: string;
  ensName?: string;
  label?: string;
  reputationScore: number;
  successRate: number;
  totalJobs: number;
  averageEnergy: number;
  averageDurationMs: number;
  stakeBalance?: bigint;
  categories: string[];
  thermodynamics?: EfficiencyBreakdown;
  matchScore?: number;
  reasons?: string[];
}

export interface OpportunityJobContext {
  jobId: string;
  reward: bigint;
  stake: bigint;
  fee: bigint;
  category?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface CandidateProjection {
  agent: string;
  ensName?: string;
  label?: string;
  opportunityScore: number;
  matchScore: number;
  successRate: number;
  expectedReward: number;
  projectedReward: number;
  projectedNet: number;
  expectedEnergy: number;
  energyPenalty: number;
  rewardDensity: number;
  thermodynamicScore: number;
  efficiency: number;
  confidence: number;
  sampleSize: number;
  expectedDurationMs?: number;
  stakeAdequate: boolean;
  stakeCoverage: number;
  stakeShortfallRaw: string;
  stakeShortfallValue: number;
  stakeBalanceRaw: string;
  stakeBalanceValue: number;
  reasons: string[];
  notes: string[];
}

export interface JobOpportunityForecast {
  jobId: string;
  generatedAt: string;
  rewardRaw: string;
  rewardValue: number;
  stakeRaw: string;
  stakeValue: number;
  feeRaw: string;
  feeValue: number;
  category?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  candidateCount: number;
  candidates: CandidateProjection[];
  bestCandidate?: CandidateProjection;
  recommendations: string[];
}

interface ProjectionContext {
  rewardValue: number;
  stakeValue: number;
  feeValue: number;
  rewardRaw: bigint;
  stakeRaw: bigint;
  feeRaw: bigint;
  jobCategory?: string;
}

function computeCandidateProjection(
  context: ProjectionContext,
  candidate: OpportunityCandidateInput
): CandidateProjection {
  const matchScore = clamp(candidate.matchScore ?? 0, 0, 1);
  const categoryAffinity = normaliseCategoryAffinity(
    context.jobCategory,
    candidate.categories
  );

  const thermo = candidate.thermodynamics;
  const sampleSize = Math.max(0, thermo?.jobs ?? 0, candidate.totalJobs ?? 0);
  const successRate = clamp(
    typeof thermo?.successRate === 'number'
      ? thermo.successRate
      : candidate.successRate,
    0,
    1
  );
  const expectedReward = Math.max(
    0,
    typeof thermo?.averageReward === 'number'
      ? thermo.averageReward
      : context.rewardValue || context.feeValue || 0
  );
  const expectedEnergy = Math.max(
    0,
    typeof thermo?.averageEnergy === 'number'
      ? thermo.averageEnergy
      : candidate.averageEnergy
  );
  const thermodynamicScore = clamp(thermo?.efficiencyScore ?? 0, 0, 1);
  const rewardDensity =
    expectedEnergy > 0 ? expectedReward / expectedEnergy : 0;
  const projectedReward = successRate * expectedReward;
  const energyPenalty =
    Math.log1p(expectedEnergy) *
    (context.rewardValue > 0
      ? Math.min(0.2, context.rewardValue * 0.05)
      : 0.05);
  const projectedNet = Math.max(0, projectedReward - energyPenalty);
  const efficiency = expectedEnergy > 0 ? projectedReward / expectedEnergy : 0;
  const reputationComponent = clamp(candidate.reputationScore, 0, 1);
  const sampleConfidence = sampleSize > 0 ? Math.min(1, sampleSize / 25) : 0;
  const confidence = round(
    sampleConfidence * 0.5 +
      successRate * 0.2 +
      matchScore * 0.15 +
      reputationComponent * 0.15,
    6
  );
  const densityScore = clamp(rewardDensity / 10, 0, 1);
  const netScore = clamp(
    projectedNet /
      Math.max(
        1,
        context.rewardValue > 0 ? context.rewardValue : expectedReward
      ),
    0,
    1
  );
  const opportunityScore = round(
    matchScore * 0.2 +
      successRate * 0.15 +
      thermodynamicScore * 0.1 +
      densityScore * 0.1 +
      netScore * 0.2 +
      reputationComponent * 0.1 +
      categoryAffinity * 0.05 +
      confidence * 0.1,
    6
  );

  const stakeBalance = candidate.stakeBalance ?? 0n;
  const stakeBalanceValue = safeFormatUnits(stakeBalance);
  const stakeRequiredRaw = context.stakeRaw;
  const stakeShortfallRaw =
    stakeRequiredRaw > stakeBalance ? stakeRequiredRaw - stakeBalance : 0n;
  const stakeShortfallValue = safeFormatUnits(stakeShortfallRaw);
  const stakeAdequate = stakeShortfallRaw === 0n;
  const stakeCoverage =
    context.stakeValue > 0
      ? clamp(stakeBalanceValue / context.stakeValue, 0, 1)
      : 1;

  const notes = new Set<string>();
  if (!stakeAdequate) notes.add('stake-shortfall');
  if (successRate < 0.5) notes.add('low-success-rate');
  if (confidence < 0.35) notes.add('low-confidence');
  if (thermodynamicScore < 0.3) notes.add('thermo-risk');
  if (expectedEnergy > 15000) notes.add('high-energy');
  if (projectedNet <= 0 && context.rewardValue > 0) notes.add('negative-net');
  const expectedDuration = Number.isFinite(candidate.averageDurationMs)
    ? Math.max(0, candidate.averageDurationMs)
    : undefined;
  if (expectedDuration !== undefined && expectedDuration > 30 * 60 * 1000) {
    notes.add('long-duration');
  }

  const reasonSet = new Set<string>(candidate.reasons || []);
  reasonSet.add(`opportunity:${opportunityScore.toFixed(3)}`);
  if (!stakeAdequate) {
    reasonSet.add('stake-insufficient');
  }

  return {
    agent: candidate.address.toLowerCase(),
    ensName: candidate.ensName,
    label: candidate.label,
    opportunityScore,
    matchScore,
    successRate: round(successRate, 6),
    expectedReward: round(expectedReward, 6),
    projectedReward: round(projectedReward, 6),
    projectedNet: round(projectedNet, 6),
    expectedEnergy: round(expectedEnergy, 6),
    energyPenalty: round(energyPenalty, 6),
    rewardDensity: round(rewardDensity, 6),
    thermodynamicScore: round(thermodynamicScore, 6),
    efficiency: round(efficiency, 6),
    confidence,
    sampleSize,
    expectedDurationMs: expectedDuration,
    stakeAdequate,
    stakeCoverage: round(stakeCoverage, 6),
    stakeShortfallRaw: stakeShortfallRaw.toString(),
    stakeShortfallValue: round(stakeShortfallValue, 6),
    stakeBalanceRaw: stakeBalance.toString(),
    stakeBalanceValue: round(stakeBalanceValue, 6),
    reasons: Array.from(reasonSet),
    notes: Array.from(notes),
  };
}

function deriveRecommendations(forecast: JobOpportunityForecast): string[] {
  const recommendations = new Set<string>();
  if (!forecast.bestCandidate) {
    recommendations.add('no-eligible-agent');
    if (forecast.rewardValue <= 0) {
      recommendations.add('skip-zero-reward');
    }
    return Array.from(recommendations);
  }
  const top = forecast.bestCandidate;
  if (!top.stakeAdequate) {
    recommendations.add(`increase-stake:${top.agent}`);
  }
  if (top.notes.includes('high-energy')) {
    recommendations.add(`optimize-energy:${top.agent}`);
  }
  if (top.notes.includes('low-confidence')) {
    recommendations.add(`collect-training-data:${top.agent}`);
  }
  if (top.projectedNet <= 0 && forecast.rewardValue > 0) {
    recommendations.add('seek-external-agent');
  }
  if (forecast.rewardValue <= 0) {
    recommendations.add('skip-low-reward');
  }
  return Array.from(recommendations);
}

export function buildOpportunityForecast(
  context: OpportunityJobContext,
  candidates: OpportunityCandidateInput[]
): JobOpportunityForecast {
  const rewardValue = safeFormatUnits(context.reward);
  const stakeValue = safeFormatUnits(context.stake);
  const feeValue = safeFormatUnits(context.fee);
  const projectionContext: ProjectionContext = {
    rewardValue,
    stakeValue,
    feeValue,
    rewardRaw: context.reward,
    stakeRaw: context.stake,
    feeRaw: context.fee,
    jobCategory: context.category,
  };

  const projections = candidates.map((candidate) =>
    computeCandidateProjection(projectionContext, candidate)
  );
  projections.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const bestCandidate = projections[0];

  let metadata: Record<string, unknown> | undefined = context.metadata
    ? { ...context.metadata }
    : undefined;
  if (context.tags && context.tags.length > 0) {
    const tagSet = Array.from(toLowerSet(context.tags));
    if (tagSet.length > 0) {
      if (metadata) {
        metadata.tags = tagSet;
      } else {
        metadata = { tags: tagSet };
      }
    }
  }

  const forecast: JobOpportunityForecast = {
    jobId: context.jobId,
    generatedAt: new Date().toISOString(),
    rewardRaw: context.reward.toString(),
    rewardValue: round(rewardValue, 6),
    stakeRaw: context.stake.toString(),
    stakeValue: round(stakeValue, 6),
    feeRaw: context.fee.toString(),
    feeValue: round(feeValue, 6),
    category: context.category,
    metadata,
    tags: context.tags,
    candidateCount: projections.length,
    candidates: projections,
    bestCandidate,
    recommendations: [],
  };

  forecast.recommendations = deriveRecommendations(forecast);
  return forecast;
}
