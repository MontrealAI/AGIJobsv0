import type { EnergyMetricRecord } from './telemetry';

export type EnergyTrendDirection = 'improving' | 'stable' | 'regressing';

export interface EnergyTrendOptions {
  lookbackMs?: number;
  sampleLimit?: number;
  minSamples?: number;
  slopeThreshold?: number;
  now?: number;
}

export interface AgentEnergyTrend {
  agent: string;
  sampleCount: number;
  averageEnergy: number;
  medianEnergy: number;
  averageEfficiency: number | null;
  efficiencyDelta: number | null;
  energyDelta: number;
  slopePerHour: number;
  direction: EnergyTrendDirection;
  successRate: number;
  anomalyRate: number;
  energyStdDev: number;
  startedAt: string;
  endedAt: string;
  firstJobId: string;
  latestJobId: string;
}

interface ResolvedRecord {
  record: EnergyMetricRecord;
  timestamp: number;
}

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_SAMPLE_LIMIT = 50;
const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_SLOPE_THRESHOLD = 25; // energy units per hour

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toTimestamp(record: EnergyMetricRecord): number | null {
  const end = record.finishedAt || record.startedAt;
  if (!end) {
    return null;
  }
  const ts = Date.parse(end);
  return Number.isFinite(ts) ? ts : null;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeSlope(times: number[], energies: number[]): number {
  const n = times.length;
  if (n === 0) return 0;
  const meanTime =
    times.reduce((acc, value) => acc + value, 0) / Math.max(1, n);
  const meanEnergy =
    energies.reduce((acc, value) => acc + value, 0) / Math.max(1, n);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const timeDiff = times[i] - meanTime;
    numerator += timeDiff * (energies[i] - meanEnergy);
    denominator += timeDiff * timeDiff;
  }
  if (denominator === 0) return 0;
  return numerator / denominator; // energy per millisecond
}

function evaluateDirection(
  slopePerHour: number,
  threshold: number,
  delta: number
): EnergyTrendDirection {
  if (slopePerHour <= -threshold || delta < 0) {
    return 'improving';
  }
  if (slopePerHour >= threshold || delta > 0) {
    return 'regressing';
  }
  return 'stable';
}

function computeEfficiencyDelta(efficiencies: number[]): number | null {
  if (efficiencies.length < 2) {
    return null;
  }
  const mid = Math.floor(efficiencies.length / 2);
  const firstHalf = efficiencies.slice(0, Math.max(1, mid));
  const secondHalf = efficiencies.slice(mid);
  const firstAvg = computeAverage(firstHalf);
  const secondAvg = computeAverage(secondHalf);
  return secondAvg - firstAvg;
}

export function computeEnergyTrends(
  records: EnergyMetricRecord[],
  options: EnergyTrendOptions = {}
): AgentEnergyTrend[] {
  const lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  const slopeThreshold = options.slopeThreshold ?? DEFAULT_SLOPE_THRESHOLD;
  const now = options.now ?? Date.now();

  const grouped = new Map<string, ResolvedRecord[]>();

  for (const record of records) {
    if (!record || typeof record.agent !== 'string') {
      continue;
    }
    if (!isFiniteNumber(record.energyEstimate)) {
      continue;
    }
    const timestamp = toTimestamp(record);
    if (timestamp === null) {
      continue;
    }
    if (Number.isFinite(lookbackMs) && lookbackMs > 0 && now - timestamp > lookbackMs) {
      continue;
    }
    const key = record.agent.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push({ record, timestamp });
  }

  const results: AgentEnergyTrend[] = [];

  for (const [agent, entries] of grouped.entries()) {
    entries.sort((a, b) => a.timestamp - b.timestamp);
    let sliced = entries;
    if (sampleLimit > 0 && entries.length > sampleLimit) {
      sliced = entries.slice(entries.length - sampleLimit);
    }
    if (sliced.length < minSamples) {
      continue;
    }

    const energies = sliced.map((entry) => entry.record.energyEstimate);
    const times = sliced.map((entry) => entry.timestamp - sliced[0].timestamp);
    const efficiencies = sliced
      .map((entry) => entry.record.efficiencyScore)
      .filter((value): value is number => isFiniteNumber(value ?? null));
    const successes = sliced.filter((entry) => entry.record.jobSuccess).length;
    const anomalies = sliced.filter(
      (entry) => Array.isArray(entry.record.anomalies) && entry.record.anomalies.length > 0
    ).length;

    const averageEnergy = computeAverage(energies);
    const medianEnergy = computeMedian(energies);
    const energyStdDev = computeStdDev(energies, averageEnergy);
    const slopePerMs = computeSlope(times, energies);
    const slopePerHour = slopePerMs * 3600000;
    const energyDelta = energies[energies.length - 1] - energies[0];
    const direction = evaluateDirection(slopePerHour, slopeThreshold, energyDelta);
    const averageEfficiency =
      efficiencies.length > 0 ? computeAverage(efficiencies) : null;
    const efficiencyDelta =
      efficiencies.length > 0 ? computeEfficiencyDelta(efficiencies) : null;

    const firstEntry = sliced[0];
    const lastEntry = sliced[sliced.length - 1];
    const successRate = successes / sliced.length;
    const anomalyRate = anomalies / sliced.length;

    results.push({
      agent,
      sampleCount: sliced.length,
      averageEnergy,
      medianEnergy,
      averageEfficiency,
      efficiencyDelta,
      energyDelta,
      slopePerHour,
      direction,
      successRate,
      anomalyRate,
      energyStdDev,
      startedAt: new Date(firstEntry.timestamp).toISOString(),
      endedAt: new Date(lastEntry.timestamp).toISOString(),
      firstJobId: firstEntry.record.jobId,
      latestJobId: lastEntry.record.jobId,
    });
  }

  results.sort((a, b) => {
    const severity = (value: EnergyTrendDirection): number => {
      switch (value) {
        case 'regressing':
          return 2;
        case 'stable':
          return 1;
        default:
          return 0;
      }
    };
    const diff = severity(b.direction) - severity(a.direction);
    if (diff !== 0) {
      return diff;
    }
    return Math.abs(b.slopePerHour) - Math.abs(a.slopePerHour);
  });

  return results;
}
