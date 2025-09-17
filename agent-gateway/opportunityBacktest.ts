import {
  listOpportunityForecasts,
  type StoredOpportunityForecast,
} from './opportunities';
import {
  collectJobOutcomeDataset,
  type JobOutcomeEntry,
} from '../shared/trainingRecords';

function clampProbability(value: number | undefined | null): number {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  const parsed = Number(value);
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function difference(a: number | null, b: number | null): number | null {
  if (a === null || b === null) {
    return null;
  }
  return a - b;
}

function relativeError(
  predicted: number | null,
  actual: number | null
): number | null {
  if (predicted === null || actual === null) {
    return null;
  }
  if (actual === 0) {
    return null;
  }
  return (predicted - actual) / actual;
}

export interface OpportunityBacktestOptions {
  limit?: number;
  since?: Date | string | number;
  minConfidence?: number;
  maxAgeHours?: number;
  includeFailed?: boolean;
  successThreshold?: number;
}

export type OpportunityBacktestStatus =
  | 'evaluated'
  | 'no-candidate'
  | 'low-confidence'
  | 'missing-outcome'
  | 'stale';

export interface OpportunityBacktestRecord {
  jobId: string;
  storedAt: string;
  recordedAt?: string;
  category?: string;
  opportunityScore?: number;
  confidence?: number;
  predictedAgent?: string | null;
  predictedLabel?: string;
  predictedEnsName?: string;
  actualAgent?: string | null;
  agentMatched?: boolean | null;
  successProbability?: number | null;
  successPredicted?: boolean | null;
  successActual?: boolean | null;
  rewardProjected?: number | null;
  rewardActual?: number | null;
  rewardError?: number | null;
  netProjected?: number | null;
  netActual?: number | null;
  netError?: number | null;
  energyProjected?: number | null;
  energyActual?: number | null;
  energyError?: number | null;
  energyRelativeError?: number | null;
  latencyMs?: number | null;
  outcomeLatencyMs?: number | null;
  opportunityNotes: string[];
  outcomeNotes: string[];
  status: OpportunityBacktestStatus;
}

export interface OpportunityBacktestMetrics {
  samples: number;
  agentMatchRate: number | null;
  successAccuracy: number | null;
  successBrierScore: number | null;
  rewardMAE: number | null;
  rewardRMSE: number | null;
  netMAE: number | null;
  energyMAE: number | null;
  energyMAPE: number | null;
  averageConfidence: number | null;
  averageOpportunityScore: number | null;
}

export interface OpportunityBacktestSegment extends OpportunityBacktestMetrics {
  key: string;
  label: string;
}

export interface OpportunityBacktestReport {
  generatedAt: string;
  totalForecasts: number;
  evaluatedForecasts: number;
  ignoredLowConfidence: number;
  missingOutcomes: number;
  staleForecasts: number;
  metrics: OpportunityBacktestMetrics;
  segments: {
    byAgent: OpportunityBacktestSegment[];
    byCategory: OpportunityBacktestSegment[];
  };
  records: OpportunityBacktestRecord[];
}

interface StatsAccumulator {
  samples: number;
  agentMatches: number;
  successPredictions: number;
  successCorrect: number;
  successBrierSum: number;
  rewardAbsError: number;
  rewardSquaredError: number;
  rewardSamples: number;
  netAbsError: number;
  netSamples: number;
  energyAbsError: number;
  energyAbsPct: number;
  energySamples: number;
  confidenceSum: number;
  opportunityScoreSum: number;
}

interface SegmentAccumulator extends StatsAccumulator {
  label?: string;
}

function createStatsAccumulator(): StatsAccumulator {
  return {
    samples: 0,
    agentMatches: 0,
    successPredictions: 0,
    successCorrect: 0,
    successBrierSum: 0,
    rewardAbsError: 0,
    rewardSquaredError: 0,
    rewardSamples: 0,
    netAbsError: 0,
    netSamples: 0,
    energyAbsError: 0,
    energyAbsPct: 0,
    energySamples: 0,
    confidenceSum: 0,
    opportunityScoreSum: 0,
  };
}

function updateStats(
  stats: StatsAccumulator,
  record: OpportunityBacktestRecord
): void {
  stats.samples += 1;
  if (record.agentMatched) {
    stats.agentMatches += 1;
  }
  const probability = clampProbability(record.successProbability ?? null);
  if (
    record.successPredicted !== null &&
    record.successPredicted !== undefined &&
    record.successActual !== null &&
    record.successActual !== undefined
  ) {
    stats.successPredictions += 1;
    if (record.successPredicted === record.successActual) {
      stats.successCorrect += 1;
    }
    const actual = record.successActual ? 1 : 0;
    stats.successBrierSum += (probability - actual) ** 2;
  }

  if (record.rewardError !== null && record.rewardError !== undefined) {
    stats.rewardAbsError += Math.abs(record.rewardError);
    stats.rewardSquaredError += record.rewardError ** 2;
    stats.rewardSamples += 1;
  }

  if (record.netError !== null && record.netError !== undefined) {
    stats.netAbsError += Math.abs(record.netError);
    stats.netSamples += 1;
  }

  if (
    record.energyError !== null &&
    record.energyError !== undefined &&
    record.energyActual !== null &&
    record.energyActual !== undefined
  ) {
    stats.energyAbsError += Math.abs(record.energyError);
    if (record.energyActual !== 0) {
      stats.energyAbsPct += Math.abs(record.energyError / record.energyActual);
    }
    stats.energySamples += 1;
  }

  if (record.confidence !== null && record.confidence !== undefined) {
    stats.confidenceSum += record.confidence;
  }
  if (
    record.opportunityScore !== null &&
    record.opportunityScore !== undefined
  ) {
    stats.opportunityScoreSum += record.opportunityScore;
  }
}

function summariseStats(stats: StatsAccumulator): OpportunityBacktestMetrics {
  const agentMatchRate =
    stats.samples > 0 ? stats.agentMatches / stats.samples : null;
  const successAccuracy =
    stats.successPredictions > 0
      ? stats.successCorrect / stats.successPredictions
      : null;
  const successBrierScore =
    stats.successPredictions > 0
      ? stats.successBrierSum / stats.successPredictions
      : null;
  const rewardMAE =
    stats.rewardSamples > 0 ? stats.rewardAbsError / stats.rewardSamples : null;
  const rewardRMSE =
    stats.rewardSamples > 0
      ? Math.sqrt(stats.rewardSquaredError / stats.rewardSamples)
      : null;
  const netMAE =
    stats.netSamples > 0 ? stats.netAbsError / stats.netSamples : null;
  const energyMAE =
    stats.energySamples > 0 ? stats.energyAbsError / stats.energySamples : null;
  const energyMAPE =
    stats.energySamples > 0 ? stats.energyAbsPct / stats.energySamples : null;
  const averageConfidence =
    stats.samples > 0 ? stats.confidenceSum / stats.samples : null;
  const averageOpportunityScore =
    stats.samples > 0 ? stats.opportunityScoreSum / stats.samples : null;

  return {
    samples: stats.samples,
    agentMatchRate,
    successAccuracy,
    successBrierScore,
    rewardMAE,
    rewardRMSE,
    netMAE,
    energyMAE,
    energyMAPE,
    averageConfidence,
    averageOpportunityScore,
  };
}

function updateSegment(
  segments: Map<string, SegmentAccumulator>,
  key: string,
  label: string | undefined,
  record: OpportunityBacktestRecord
): void {
  const existing = segments.get(key);
  if (existing) {
    updateStats(existing, record);
    if (!existing.label && label) {
      existing.label = label;
    }
    return;
  }
  const acc: SegmentAccumulator = {
    ...createStatsAccumulator(),
    label,
  };
  updateStats(acc, record);
  segments.set(key, acc);
}

function evaluateForecast(
  forecast: StoredOpportunityForecast,
  outcome: JobOutcomeEntry | undefined,
  options: Required<Omit<OpportunityBacktestOptions, 'limit' | 'since'>>
): OpportunityBacktestRecord {
  const best = forecast.bestCandidate;
  if (!best) {
    return {
      jobId: forecast.jobId,
      storedAt: forecast.storedAt,
      category: forecast.category,
      opportunityNotes: [],
      outcomeNotes: [],
      status: 'no-candidate',
    };
  }

  const confidence = clampProbability(best.confidence ?? 0);
  if (confidence < options.minConfidence) {
    return {
      jobId: forecast.jobId,
      storedAt: forecast.storedAt,
      category: forecast.category,
      opportunityScore: best.opportunityScore,
      confidence,
      predictedAgent: best.agent,
      predictedLabel: best.label,
      predictedEnsName: best.ensName,
      opportunityNotes: best.notes ?? [],
      outcomeNotes: [],
      status: 'low-confidence',
    };
  }

  const storedAtTs = Date.parse(forecast.storedAt);
  if (!Number.isFinite(storedAtTs)) {
    throw new Error(`Invalid forecast timestamp for job ${forecast.jobId}`);
  }

  const now = Date.now();
  const latencyMs = now - storedAtTs;

  if (!outcome) {
    const hours = options.maxAgeHours;
    if (hours > 0 && latencyMs > hours * 60 * 60 * 1000) {
      return {
        jobId: forecast.jobId,
        storedAt: forecast.storedAt,
        category: forecast.category,
        opportunityScore: best.opportunityScore,
        confidence,
        predictedAgent: best.agent,
        predictedLabel: best.label,
        predictedEnsName: best.ensName,
        latencyMs,
        opportunityNotes: best.notes ?? [],
        outcomeNotes: [],
        status: 'stale',
      };
    }
    return {
      jobId: forecast.jobId,
      storedAt: forecast.storedAt,
      category: forecast.category,
      opportunityScore: best.opportunityScore,
      confidence,
      predictedAgent: best.agent,
      predictedLabel: best.label,
      predictedEnsName: best.ensName,
      latencyMs,
      opportunityNotes: best.notes ?? [],
      outcomeNotes: [],
      status: 'missing-outcome',
    };
  }

  const recordAtTs = Date.parse(outcome.record.recordedAt);
  const outcomeLatencyMs = Number.isFinite(recordAtTs)
    ? Math.max(0, recordAtTs - storedAtTs)
    : null;

  const rewardActual = toFiniteNumber(outcome.rewardValue);
  const energyActual = toFiniteNumber(
    outcome.efficiency.energyEstimate ??
      outcome.energySample?.energyEstimate ??
      null
  );
  const netActual =
    rewardActual !== null && energyActual !== null
      ? rewardActual - energyActual
      : rewardActual;

  const rewardProjected = toFiniteNumber(best.projectedReward);
  const netProjected = toFiniteNumber(best.projectedNet);
  const energyProjected = toFiniteNumber(best.expectedEnergy);

  const record: OpportunityBacktestRecord = {
    jobId: forecast.jobId,
    storedAt: forecast.storedAt,
    recordedAt: outcome.record.recordedAt,
    category: outcome.category ?? forecast.category,
    opportunityScore: best.opportunityScore,
    confidence,
    predictedAgent: best.agent,
    predictedLabel: best.label,
    predictedEnsName: best.ensName,
    actualAgent: outcome.record.agent?.toLowerCase() ?? null,
    agentMatched:
      outcome.record.agent && best.agent
        ? outcome.record.agent.toLowerCase() === best.agent.toLowerCase()
        : null,
    successProbability: clampProbability(best.successRate),
    successPredicted:
      best.successRate !== undefined && best.successRate !== null
        ? clampProbability(best.successRate) >= options.successThreshold
        : null,
    successActual: outcome.record.success,
    rewardProjected,
    rewardActual,
    rewardError: difference(rewardProjected, rewardActual),
    netProjected,
    netActual,
    netError: difference(netProjected, netActual),
    energyProjected,
    energyActual,
    energyError: difference(energyProjected, energyActual),
    energyRelativeError: relativeError(energyProjected, energyActual),
    latencyMs,
    outcomeLatencyMs,
    opportunityNotes: best.notes ?? [],
    outcomeNotes: outcome.energySample?.anomalies ?? [],
    status: 'evaluated',
  };

  return record;
}

function buildSegments(
  segments: Map<string, SegmentAccumulator>
): OpportunityBacktestSegment[] {
  const result: OpportunityBacktestSegment[] = [];
  for (const [key, accumulator] of segments.entries()) {
    const metrics = summariseStats(accumulator);
    result.push({
      key,
      label: accumulator.label ?? key,
      ...metrics,
    });
  }
  result.sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key));
  return result;
}

function parseSince(value: OpportunityBacktestOptions['since']): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  const parsed = new Date(value);
  const ts = parsed.getTime();
  return Number.isFinite(ts) ? ts : null;
}

export async function buildOpportunityBacktest(
  options: OpportunityBacktestOptions = {}
): Promise<OpportunityBacktestReport> {
  const sinceTs = parseSince(options.since);
  const limit =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const forecasts = await listOpportunityForecasts(limit);
  const filtered = forecasts.filter((forecast) => {
    if (!sinceTs) {
      return true;
    }
    const timestamp = Date.parse(forecast.storedAt);
    return Number.isFinite(timestamp) ? timestamp >= sinceTs : true;
  });

  const dataset = await collectJobOutcomeDataset({
    since: options.since,
    includeFailed: options.includeFailed !== false,
  });
  const outcomeByJob = new Map<string, JobOutcomeEntry>();
  for (const entry of dataset.records) {
    outcomeByJob.set(entry.record.jobId, entry);
  }

  const evaluated: OpportunityBacktestRecord[] = [];
  const overallStats = createStatsAccumulator();
  const segmentByAgent = new Map<string, SegmentAccumulator>();
  const segmentByCategory = new Map<string, SegmentAccumulator>();

  let ignoredLowConfidence = 0;
  let missingOutcomes = 0;
  let staleForecasts = 0;

  const defaults: Required<
    Omit<OpportunityBacktestOptions, 'limit' | 'since'>
  > = {
    minConfidence: options.minConfidence ?? 0.2,
    maxAgeHours: options.maxAgeHours ?? 24,
    includeFailed: options.includeFailed ?? true,
    successThreshold: options.successThreshold ?? 0.55,
  };

  const records: OpportunityBacktestRecord[] = [];
  for (const forecast of filtered) {
    const outcome = outcomeByJob.get(forecast.jobId);
    const record = evaluateForecast(forecast, outcome, defaults);
    records.push(record);
    if (record.status === 'low-confidence') {
      ignoredLowConfidence += 1;
      continue;
    }
    if (record.status === 'missing-outcome') {
      missingOutcomes += 1;
      continue;
    }
    if (record.status === 'stale') {
      staleForecasts += 1;
      continue;
    }
    if (record.status !== 'evaluated') {
      continue;
    }

    updateStats(overallStats, record);
    evaluated.push(record);

    if (record.predictedAgent) {
      updateSegment(
        segmentByAgent,
        record.predictedAgent.toLowerCase(),
        record.predictedLabel ??
          record.predictedEnsName ??
          record.predictedAgent,
        record
      );
    }

    const categoryKey = (record.category ?? 'uncategorized').toLowerCase();
    updateSegment(
      segmentByCategory,
      categoryKey,
      record.category ?? 'uncategorized',
      record
    );
  }

  const metrics = summariseStats(overallStats);

  return {
    generatedAt: new Date().toISOString(),
    totalForecasts: filtered.length,
    evaluatedForecasts: evaluated.length,
    ignoredLowConfidence,
    missingOutcomes,
    staleForecasts,
    metrics,
    segments: {
      byAgent: buildSegments(segmentByAgent),
      byCategory: buildSegments(segmentByCategory),
    },
    records,
  };
}
