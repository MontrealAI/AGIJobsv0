import {
  buildThermodynamicSummary,
  type ThermodynamicSummary,
} from './thermodynamics';
import {
  getEnergyTrendsSnapshot,
  type EnergyTrendSnapshot,
} from '../shared/energyTrends';
import {
  getAgentEfficiencyStats,
  getEnergyAnomalyReport,
  type AgentEfficiencyStats,
  type EnergyAnomalySnapshot,
} from './telemetry';
import {
  listOpportunityForecasts,
  type StoredOpportunityForecast,
} from './opportunities';
import {
  buildOpportunityBacktest,
  type OpportunityBacktestReport,
} from './opportunityBacktest';
import {
  getSpawnPipelineReport,
  type SpawnCandidateReport,
} from './agentFactory';

export interface PerformanceDashboardOptions {
  agentLimit?: number;
  includeAnomalies?: boolean;
  includeOpportunityHistory?: boolean;
  opportunityLimit?: number;
  includeBacktest?: boolean;
  backtestLimit?: number;
  includeSpawnPipeline?: boolean;
  includeEfficiencyStats?: boolean;
}

export interface EfficiencyStatSummary {
  agent: string;
  jobCount: number;
  averageEnergy: number;
  averageEfficiency: number;
  successRate: number;
  averageCpuTimeMs: number;
  averageGpuTimeMs: number;
  dominantComplexity: string;
  lastUpdated: string | null;
}

export interface PerformanceDashboard {
  generatedAt: string;
  thermodynamics: ThermodynamicSummary;
  energy: {
    trends: EnergyTrendSnapshot | null;
    anomalies?: EnergyAnomalySnapshot[];
    efficiency?: EfficiencyStatSummary[];
  };
  opportunities?: {
    recentForecasts: StoredOpportunityForecast[];
    backtest?: OpportunityBacktestReport;
  };
  spawn?: {
    pipeline: SpawnCandidateReport[];
  };
  notes: string[];
}

function createEmptyThermodynamicSummary(): ThermodynamicSummary {
  return {
    generatedAt: new Date(0).toISOString(),
    totals: {
      agentCount: 0,
      totalEnergy: 0,
      sampleCount: 0,
      totalReward: 0,
      averageEnergy: 0,
      averageRewardPerEnergy: 0,
      averageThermodynamicScore: 0,
      anomalyCount: 0,
      anomalyAgentCount: 0,
    },
    agents: [],
    anomalies: [],
    notes: ['thermodynamic-summary-unavailable'],
    meta: {
      totalAgents: 0,
      returnedAgents: 0,
      limitApplied: false,
    },
  };
}

function formatMetric(value: number, precision = 6): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function summariseEfficiencyStats(
  stats: Map<string, AgentEfficiencyStats>
): EfficiencyStatSummary[] {
  const items: EfficiencyStatSummary[] = [];
  for (const entry of stats.values()) {
    items.push({
      agent: entry.agent,
      jobCount: entry.jobCount,
      averageEnergy: formatMetric(entry.averageEnergy, 4),
      averageEfficiency: formatMetric(entry.averageEfficiency, 4),
      successRate: formatMetric(entry.successRate, 4),
      averageCpuTimeMs: formatMetric(entry.averageCpuTimeMs, 3),
      averageGpuTimeMs: formatMetric(entry.averageGpuTimeMs, 3),
      dominantComplexity: entry.dominantComplexity,
      lastUpdated: entry.lastUpdated ?? null,
    });
  }
  items.sort((a, b) => {
    if (b.jobCount !== a.jobCount) {
      return b.jobCount - a.jobCount;
    }
    if (b.successRate !== a.successRate) {
      return b.successRate - a.successRate;
    }
    return a.agent.localeCompare(b.agent);
  });
  return items;
}

async function safeExecute<T>(
  label: string,
  task: () => Promise<T>,
  fallback: () => T,
  notes: string[]
): Promise<T> {
  try {
    return await task();
  } catch (err: any) {
    const message = err?.message ? String(err.message) : String(err);
    notes.push(`${label}: ${message}`);
    try {
      return fallback();
    } catch {
      return fallback();
    }
  }
}

export async function buildPerformanceDashboard(
  options: PerformanceDashboardOptions = {}
): Promise<PerformanceDashboard> {
  const notes: string[] = [];
  const agentLimit =
    options.agentLimit && options.agentLimit > 0
      ? Math.floor(options.agentLimit)
      : undefined;

  const thermodynamics = await safeExecute(
    'thermodynamics',
    async () =>
      buildThermodynamicSummary({
        limit: agentLimit,
        includeAnomalies: options.includeAnomalies !== false,
        sortBy: 'score',
      }),
    createEmptyThermodynamicSummary,
    notes
  );

  const trends = await safeExecute(
    'energy-trends',
    async () => getEnergyTrendsSnapshot(),
    () => null,
    notes
  );

  let efficiency: EfficiencyStatSummary[] | undefined;
  if (options.includeEfficiencyStats !== false) {
    const efficiencyStats = await safeExecute(
      'efficiency-stats',
      () => getAgentEfficiencyStats(),
      () => new Map<string, AgentEfficiencyStats>(),
      notes
    );
    efficiency = summariseEfficiencyStats(efficiencyStats);
  }

  let anomalies: EnergyAnomalySnapshot[] | undefined;
  if (options.includeAnomalies !== false) {
    anomalies = await safeExecute(
      'energy-anomalies',
      async () => getEnergyAnomalyReport(),
      () => [],
      notes
    );
  }

  let opportunities: PerformanceDashboard['opportunities'] | undefined;
  if (options.includeOpportunityHistory) {
    const limit =
      options.opportunityLimit && options.opportunityLimit > 0
        ? Math.floor(options.opportunityLimit)
        : undefined;
    const recentForecasts = await safeExecute(
      'opportunity-forecasts',
      () => listOpportunityForecasts(limit),
      () => [],
      notes
    );
    let backtest: OpportunityBacktestReport | undefined;
    if (options.includeBacktest) {
      const backtestLimit =
        options.backtestLimit && options.backtestLimit > 0
          ? Math.floor(options.backtestLimit)
          : undefined;
      backtest = await safeExecute(
        'opportunity-backtest',
        () =>
          buildOpportunityBacktest({
            limit: backtestLimit,
            includeFailed: true,
          }),
        () => ({
          generatedAt: new Date(0).toISOString(),
          totalForecasts: 0,
          evaluatedForecasts: 0,
          ignoredLowConfidence: 0,
          missingOutcomes: 0,
          staleForecasts: 0,
          metrics: {
            samples: 0,
            agentMatchRate: null,
            successAccuracy: null,
            successBrierScore: null,
            rewardMAE: null,
            rewardRMSE: null,
            netMAE: null,
            energyMAE: null,
            energyMAPE: null,
            averageConfidence: null,
            averageOpportunityScore: null,
          },
          segments: { byAgent: [], byCategory: [] },
          records: [],
        }),
        notes
      );
    }
    opportunities = {
      recentForecasts,
      backtest,
    };
  }

  let spawn: PerformanceDashboard['spawn'] | undefined;
  if (options.includeSpawnPipeline) {
    const pipeline = await safeExecute(
      'spawn-pipeline',
      () => getSpawnPipelineReport(),
      () => [],
      notes
    );
    spawn = { pipeline };
  }

  const aggregatedNotes = Array.from(
    new Set([...thermodynamics.notes, ...notes])
  );

  return {
    generatedAt: new Date().toISOString(),
    thermodynamics,
    energy: {
      trends,
      anomalies,
      efficiency,
    },
    opportunities,
    spawn,
    notes: aggregatedNotes,
  };
}
