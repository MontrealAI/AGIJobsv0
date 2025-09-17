import {
  DEFAULT_MAX_ENERGY_SCORE,
  DEFAULT_MIN_EFFICIENCY_SCORE,
} from './metrics';
import {
  EnergyInsightsSnapshot,
  JobEnergyInsight,
  getEnergyInsightsSnapshot,
} from '../../shared/energyInsights';

export type EnergyPolicySource = 'category' | 'global';

type SnapshotProvider = () => EnergyInsightsSnapshot;

export interface EnergyPolicyOptions {
  efficiencyFloor?: number;
  energyCeiling?: number;
  efficiencyStdMultiplier?: number;
  energyStdMultiplier?: number;
  efficiencyBias?: number;
  energyBias?: number;
  lookbackJobs?: number;
  refreshIntervalMs?: number;
  fallbackToGlobal?: boolean;
  anomalyProfitWeight?: number;
  volatilityProfitWeight?: number;
  baseProfitMargin?: number;
  maxProfitMargin?: number;
  snapshotProvider?: SnapshotProvider;
}

export interface CategoryEnergyThresholds {
  category: string;
  source: EnergyPolicySource;
  minEfficiencyScore: number;
  maxEnergyScore: number;
  recommendedProfitMargin: number;
  baseProfitMargin: number;
  anomalyRate: number;
  energyMean: number;
  energyStdDev: number;
  efficiencyMean: number;
  efficiencyStdDev: number;
  confidence: number;
  dataPoints: number;
  updatedAt: string;
}

interface ResolvedEnergyPolicyOptions {
  efficiencyFloor: number;
  energyCeiling: number;
  efficiencyStdMultiplier: number;
  energyStdMultiplier: number;
  efficiencyBias: number;
  energyBias: number;
  lookbackJobs: number;
  refreshIntervalMs: number;
  fallbackToGlobal: boolean;
  anomalyProfitWeight: number;
  volatilityProfitWeight: number;
  maxProfitMargin: number;
}

const DEFAULT_OPTIONS: ResolvedEnergyPolicyOptions & {
  baseProfitMargin: number;
} = {
  efficiencyFloor: DEFAULT_MIN_EFFICIENCY_SCORE,
  energyCeiling: DEFAULT_MAX_ENERGY_SCORE,
  efficiencyStdMultiplier: 0.5,
  energyStdMultiplier: 1.5,
  efficiencyBias: 0.9,
  energyBias: 1.1,
  lookbackJobs: 50,
  refreshIntervalMs: 30_000,
  fallbackToGlobal: true,
  anomalyProfitWeight: 0.4,
  volatilityProfitWeight: 0.2,
  maxProfitMargin: 5,
  baseProfitMargin: 0.05,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitiseNumber(value: unknown, fallback: number, min = 0): number {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  if (value < min) {
    return min;
  }
  return value;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function standardDeviation(values: number[], average: number): number {
  if (values.length <= 1) return 0;
  const variance =
    values.reduce((acc, value) => acc + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseCategory(category: string): string {
  return category.trim().toLowerCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function filterNumeric(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

export class EnergyPolicy {
  private readonly options: ResolvedEnergyPolicyOptions;

  private readonly snapshotProvider: SnapshotProvider;

  private baseProfitMargin: number;

  private snapshot: EnergyInsightsSnapshot | null = null;

  private lastRefreshMs = 0;

  constructor(options: EnergyPolicyOptions = {}) {
    this.options = {
      efficiencyFloor: sanitiseNumber(
        options.efficiencyFloor,
        DEFAULT_OPTIONS.efficiencyFloor,
        0
      ),
      energyCeiling: sanitiseNumber(
        options.energyCeiling,
        DEFAULT_OPTIONS.energyCeiling,
        0
      ),
      efficiencyStdMultiplier: sanitiseNumber(
        options.efficiencyStdMultiplier,
        DEFAULT_OPTIONS.efficiencyStdMultiplier,
        0
      ),
      energyStdMultiplier: sanitiseNumber(
        options.energyStdMultiplier,
        DEFAULT_OPTIONS.energyStdMultiplier,
        0
      ),
      efficiencyBias: sanitiseNumber(
        options.efficiencyBias,
        DEFAULT_OPTIONS.efficiencyBias,
        0.01
      ),
      energyBias: sanitiseNumber(
        options.energyBias,
        DEFAULT_OPTIONS.energyBias,
        0.01
      ),
      lookbackJobs: Math.max(
        1,
        Math.trunc(
          sanitiseNumber(options.lookbackJobs, DEFAULT_OPTIONS.lookbackJobs, 1)
        )
      ),
      refreshIntervalMs: Math.max(
        1000,
        Math.trunc(
          sanitiseNumber(
            options.refreshIntervalMs,
            DEFAULT_OPTIONS.refreshIntervalMs,
            1000
          )
        )
      ),
      fallbackToGlobal:
        options.fallbackToGlobal ?? DEFAULT_OPTIONS.fallbackToGlobal,
      anomalyProfitWeight: sanitiseNumber(
        options.anomalyProfitWeight,
        DEFAULT_OPTIONS.anomalyProfitWeight,
        0
      ),
      volatilityProfitWeight: sanitiseNumber(
        options.volatilityProfitWeight,
        DEFAULT_OPTIONS.volatilityProfitWeight,
        0
      ),
      maxProfitMargin: sanitiseNumber(
        options.maxProfitMargin,
        DEFAULT_OPTIONS.maxProfitMargin,
        0.01
      ),
    };

    this.baseProfitMargin = sanitiseNumber(
      options.baseProfitMargin,
      DEFAULT_OPTIONS.baseProfitMargin,
      0.0001
    );
    if (this.baseProfitMargin > this.options.maxProfitMargin) {
      this.options.maxProfitMargin = this.baseProfitMargin;
    }

    this.snapshotProvider =
      options.snapshotProvider || getEnergyInsightsSnapshot;
  }

  getBaseProfitMargin(): number {
    return this.baseProfitMargin;
  }

  setBaseProfitMargin(next: number): void {
    if (!Number.isFinite(next) || next <= 0) {
      return;
    }
    const sanitized = sanitiseNumber(next, this.baseProfitMargin, 0.0001);
    this.baseProfitMargin = sanitized;
    if (this.baseProfitMargin > this.options.maxProfitMargin) {
      this.options.maxProfitMargin = this.baseProfitMargin;
    }
  }

  refresh(snapshot?: EnergyInsightsSnapshot): void {
    this.snapshot = snapshot ?? this.snapshotProvider();
    this.lastRefreshMs = Date.now();
  }

  getThresholds(category: string): CategoryEnergyThresholds | null {
    const normalized = normaliseCategory(category);
    const snapshot = this.getSnapshot();
    let records = this.collectCategoryRecords(snapshot, normalized);
    let source: EnergyPolicySource = 'category';
    if (!records.length && this.options.fallbackToGlobal) {
      records = this.collectAllRecords(snapshot);
      source = 'global';
    }
    if (!records.length) {
      return {
        category: normalized,
        source,
        minEfficiencyScore: this.options.efficiencyFloor,
        maxEnergyScore: this.options.energyCeiling,
        recommendedProfitMargin: this.baseProfitMargin,
        baseProfitMargin: this.baseProfitMargin,
        anomalyRate: 0,
        energyMean: 0,
        energyStdDev: 0,
        efficiencyMean: 0,
        efficiencyStdDev: 0,
        confidence: 0,
        dataPoints: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }

    const limited = this.applyLookback(records);
    const energyValues = filterNumeric(
      limited.map((job) => job.averageEnergy)
    ).filter((value) => value >= 0);
    const efficiencyValues = filterNumeric(
      limited.map((job) => job.efficiencyScore)
    ).filter((value) => value >= 0);
    const anomalyValues = filterNumeric(
      limited.map((job) => job.anomalyRate)
    ).filter((value) => value >= 0);

    const energyMean = mean(energyValues);
    const efficiencyMean = mean(efficiencyValues);
    const anomalyMean = mean(anomalyValues);
    const energyStdDev = standardDeviation(energyValues, energyMean);
    const efficiencyStdDev = standardDeviation(
      efficiencyValues,
      efficiencyMean
    );

    const { minEfficiencyScore, maxEnergyScore } = this.deriveThresholds({
      energyMean,
      energyStdDev,
      efficiencyMean,
      efficiencyStdDev,
    });

    const recommendedProfitMargin = this.deriveProfitMargin({
      anomalyRate: anomalyMean,
      energyMean,
      energyStdDev,
    });

    const updatedAt = limited[0]?.lastUpdated || new Date(0).toISOString();
    const confidence = clamp(
      limited.length / Math.max(1, this.options.lookbackJobs),
      0,
      1
    );

    return {
      category: normalized,
      source,
      minEfficiencyScore,
      maxEnergyScore,
      recommendedProfitMargin,
      baseProfitMargin: this.baseProfitMargin,
      anomalyRate: anomalyMean,
      energyMean,
      energyStdDev,
      efficiencyMean,
      efficiencyStdDev,
      confidence,
      dataPoints: limited.length,
      updatedAt,
    };
  }

  private deriveThresholds(stats: {
    energyMean: number;
    energyStdDev: number;
    efficiencyMean: number;
    efficiencyStdDev: number;
  }): { minEfficiencyScore: number; maxEnergyScore: number } {
    let minEfficiencyScore =
      stats.efficiencyMean * this.options.efficiencyBias -
      stats.efficiencyStdDev * this.options.efficiencyStdMultiplier;
    if (!Number.isFinite(minEfficiencyScore)) {
      minEfficiencyScore = this.options.efficiencyFloor;
    }
    minEfficiencyScore = clamp(
      minEfficiencyScore,
      this.options.efficiencyFloor,
      1
    );

    let maxEnergyScore =
      stats.energyMean * this.options.energyBias +
      stats.energyStdDev * this.options.energyStdMultiplier;
    if (!Number.isFinite(maxEnergyScore) || maxEnergyScore <= 0) {
      maxEnergyScore = this.options.energyCeiling;
    }
    if (Number.isFinite(this.options.energyCeiling)) {
      maxEnergyScore = Math.min(maxEnergyScore, this.options.energyCeiling);
    }
    if (maxEnergyScore < 0) {
      maxEnergyScore = 0;
    }

    return { minEfficiencyScore, maxEnergyScore };
  }

  private deriveProfitMargin(stats: {
    anomalyRate: number;
    energyMean: number;
    energyStdDev: number;
  }): number {
    const anomalyComponent =
      Math.max(0, stats.anomalyRate) * this.options.anomalyProfitWeight;
    const volatility =
      stats.energyMean > 0
        ? Math.max(0, stats.energyStdDev / stats.energyMean)
        : stats.energyStdDev > 0
        ? 1
        : 0;
    const volatilityComponent =
      volatility * this.options.volatilityProfitWeight;

    const profit =
      this.baseProfitMargin + anomalyComponent + volatilityComponent;
    const bounded = clamp(
      profit,
      this.baseProfitMargin,
      Math.max(this.baseProfitMargin, this.options.maxProfitMargin)
    );
    return bounded;
  }

  private applyLookback(records: JobEnergyInsight[]): JobEnergyInsight[] {
    if (!records.length) {
      return records;
    }
    const sorted = [...records].sort(
      (a, b) => parseTimestamp(b.lastUpdated) - parseTimestamp(a.lastUpdated)
    );
    return sorted.slice(0, this.options.lookbackJobs);
  }

  private collectAllRecords(
    snapshot: EnergyInsightsSnapshot
  ): JobEnergyInsight[] {
    const records: JobEnergyInsight[] = [];
    for (const agentJobs of Object.values(snapshot.jobs)) {
      for (const job of Object.values(agentJobs)) {
        if (job) {
          records.push(job);
        }
      }
    }
    return records;
  }

  private collectCategoryRecords(
    snapshot: EnergyInsightsSnapshot,
    category: string
  ): JobEnergyInsight[] {
    const normalized = category.trim().toLowerCase();
    const records: JobEnergyInsight[] = [];
    for (const agentJobs of Object.values(snapshot.jobs)) {
      for (const job of Object.values(agentJobs)) {
        if (!job) continue;
        const jobCategory = job.category ? job.category.toLowerCase() : '';
        if (!normalized || jobCategory === normalized) {
          records.push(job);
        }
      }
    }
    return records;
  }

  private getSnapshot(): EnergyInsightsSnapshot {
    const now = Date.now();
    if (
      !this.snapshot ||
      now - this.lastRefreshMs > this.options.refreshIntervalMs
    ) {
      this.snapshot = this.snapshotProvider();
      this.lastRefreshMs = now;
    }
    return this.snapshot;
  }
}

export default EnergyPolicy;
