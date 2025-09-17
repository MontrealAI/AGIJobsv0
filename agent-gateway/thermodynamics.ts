import { ethers } from 'ethers';
import {
  getEnergyInsightsSnapshot,
  type EnergyInsightsSnapshot,
} from '../shared/energyInsights';
import {
  getEfficiencyIndex,
  type AgentEfficiencyReport,
} from '../shared/efficiencyMetrics';
import {
  getAgentEfficiencyStats,
  getEnergyAnomalyReport,
  type AgentEfficiencyStats,
  type EnergyAnomalySnapshot,
} from './telemetry';
import {
  getCachedIdentity,
  refreshIdentity,
  type AgentIdentity,
  type AgentRole,
} from './identity';

export type ThermodynamicSummarySortKey =
  | 'score'
  | 'energy'
  | 'rewardDensity'
  | 'anomaly'
  | 'success'
  | 'efficiency';

export interface ThermodynamicAgentSummary {
  address: string;
  ensName?: string;
  label?: string;
  role?: AgentRole;
  jobCount: number;
  successRate: number;
  totalReward: number;
  averageReward: number;
  totalEnergy: number;
  averageEnergy: number;
  rewardPerEnergy: number;
  efficiencyScore: number;
  averageEfficiency: number;
  sampleCount: number;
  energySamples: number;
  anomalyCount: number;
  anomalyRate: number;
  averageCpuTimeMs?: number;
  averageGpuTimeMs?: number;
  dominantComplexity?: string;
  thermodynamicScore: number;
  rewardDensityScore: number;
  stabilityScore: number;
  successScore: number;
  energyContributionScore: number;
  status: 'nominal' | 'warning' | 'critical';
  warnings: string[];
  lastUpdated: string;
}

export interface ThermodynamicSummaryTotals {
  agentCount: number;
  totalEnergy: number;
  sampleCount: number;
  totalReward: number;
  averageEnergy: number;
  averageRewardPerEnergy: number;
  averageThermodynamicScore: number;
  anomalyCount: number;
  anomalyAgentCount: number;
}

export interface ThermodynamicSummaryMeta {
  totalAgents: number;
  returnedAgents: number;
  limitApplied: boolean;
}

export interface ThermodynamicSummary {
  generatedAt: string;
  totals: ThermodynamicSummaryTotals;
  agents: ThermodynamicAgentSummary[];
  anomalies?: EnergyAnomalySnapshot[];
  notes: string[];
  meta: ThermodynamicSummaryMeta;
}

export interface ThermodynamicSummaryOptions {
  limit?: number;
  sortBy?: ThermodynamicSummarySortKey;
  order?: 'asc' | 'desc';
  includeAnomalies?: boolean;
  refreshIdentities?: boolean;
}

interface IdentitySummary {
  address: string;
  ensName?: string;
  label?: string;
  role?: AgentRole;
}

interface InternalAgentSnapshot {
  address: string;
  identity?: IdentitySummary;
  efficiency?: AgentEfficiencyReport;
  anomaly?: EnergyAnomalySnapshot;
  stats?: AgentEfficiencyStats;
  successRate: number;
  totalReward: number;
  averageReward: number;
  rewardPerEnergy: number;
  efficiencyScore: number;
  averageEfficiency: number;
  averageEnergy: number;
  totalEnergy: number;
  sampleCount: number;
  energySamples: number;
  anomalyCount: number;
  anomalyRate: number;
  rewardDensityScore: number;
  stabilityScore: number;
  successScore: number;
  averageCpuTimeMs?: number;
  averageGpuTimeMs?: number;
  dominantComplexity?: string;
  lastUpdated: string;
  energyLastUpdated: string;
  jobCount: number;
  initialWarnings: string[];
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round(value: number, precision = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toLowerAddress(value: string): string {
  try {
    return ethers.getAddress(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

async function loadIdentitySummaries(
  addresses: string[],
  refresh: boolean
): Promise<Map<string, IdentitySummary>> {
  const results = new Map<string, IdentitySummary>();
  const pending: Promise<void>[] = [];
  for (const address of addresses) {
    if (!address || address === 'unknown') {
      continue;
    }
    const lower = toLowerAddress(address);
    if (results.has(lower)) continue;
    const cached = refresh ? undefined : getCachedIdentity(lower);
    if (cached) {
      results.set(lower, {
        address: cached.address,
        ensName: cached.ensName,
        label: cached.label,
        role: cached.role,
      });
      continue;
    }
    pending.push(
      refreshIdentity(address)
        .then((identity: AgentIdentity) => {
          results.set(lower, {
            address: identity.address,
            ensName: identity.ensName,
            label: identity.label,
            role: identity.role,
          });
        })
        .catch(() => {
          // ignore lookup failures; identity will be missing
        })
    );
  }
  if (pending.length) {
    await Promise.allSettled(pending);
  }
  return results;
}

function computeRewardDensityScore(rewardPerEnergy: number): number {
  if (rewardPerEnergy <= 0) {
    return 0;
  }
  const score = 1 - Math.exp(-rewardPerEnergy);
  return clamp(score, 0, 1);
}

function computeStabilityScore(anomalyRate: number): number {
  if (anomalyRate <= 0) {
    return 1;
  }
  const penalty = Math.min(1, anomalyRate * 4);
  return clamp(1 - penalty, 0, 1);
}

function computeEnergyContribution(
  averageEnergy: number,
  globalAverage: number
): number {
  if (globalAverage <= 0) {
    return 0.5;
  }
  if (!Number.isFinite(averageEnergy) || averageEnergy <= 0) {
    return 1;
  }
  const ratio = averageEnergy / globalAverage;
  if (!Number.isFinite(ratio)) {
    return 0.5;
  }
  const penalty = Math.min(1, ratio / 2);
  return clamp(1 - penalty, 0, 1);
}

function buildAnomalyMap(
  anomalies: EnergyAnomalySnapshot[]
): Map<string, EnergyAnomalySnapshot> {
  const map = new Map<string, EnergyAnomalySnapshot>();
  for (const entry of anomalies) {
    if (!entry?.agent) continue;
    map.set(toLowerAddress(entry.agent), entry);
  }
  return map;
}

function pickSortValue(
  agent: ThermodynamicAgentSummary,
  key: ThermodynamicSummarySortKey
): number {
  switch (key) {
    case 'energy':
      return agent.averageEnergy;
    case 'rewardDensity':
      return agent.rewardPerEnergy;
    case 'anomaly':
      return agent.anomalyRate;
    case 'success':
      return agent.successRate;
    case 'efficiency':
      return agent.efficiencyScore;
    case 'score':
    default:
      return agent.thermodynamicScore;
  }
}

function summariseIdentity(identity?: IdentitySummary): {
  ensName?: string;
  label?: string;
  role?: AgentRole;
} {
  if (!identity) {
    return {};
  }
  return {
    ensName: identity.ensName,
    label: identity.label,
    role: identity.role,
  };
}

function listAgentKeys(snapshot: EnergyInsightsSnapshot): string[] {
  return Object.keys(snapshot.agents).map((key) => key.toLowerCase());
}

export async function buildThermodynamicSummary(
  options: ThermodynamicSummaryOptions = {}
): Promise<ThermodynamicSummary> {
  const snapshot = getEnergyInsightsSnapshot();
  const agentKeys = listAgentKeys(snapshot);
  const [efficiencyIndex, efficiencyStats, anomalyList, identityMap] =
    await Promise.all([
      getEfficiencyIndex(),
      getAgentEfficiencyStats(),
      Promise.resolve(getEnergyAnomalyReport()),
      loadIdentitySummaries(agentKeys, Boolean(options.refreshIdentities)),
    ]);

  const anomalies = buildAnomalyMap(anomalyList);

  const partials: InternalAgentSnapshot[] = [];
  const totals = {
    totalEnergy: 0,
    sampleCount: 0,
    totalReward: 0,
    anomalyCount: 0,
  };

  for (const [rawKey, energy] of Object.entries(snapshot.agents)) {
    const addressKey = rawKey.toLowerCase();
    const identity = identityMap.get(addressKey);
    const efficiency = efficiencyIndex.get(addressKey);
    const stats = efficiencyStats.get(addressKey);
    const anomaly = anomalies.get(addressKey);

    const jobCount =
      efficiency?.overall.jobs ??
      (Number.isFinite(energy.jobCount) ? energy.jobCount : 0);
    const successRate = clamp(
      Number.isFinite(efficiency?.overall.successRate)
        ? Number(efficiency?.overall.successRate)
        : Number.isFinite(stats?.successRate)
        ? Number(stats?.successRate)
        : 0,
      0,
      1
    );

    const totalReward = Number.isFinite(efficiency?.overall.totalReward)
      ? Number(efficiency?.overall.totalReward)
      : Number.isFinite(energy.totalReward)
      ? Number(energy.totalReward)
      : 0;
    const averageReward = Number.isFinite(efficiency?.overall.averageReward)
      ? Number(efficiency?.overall.averageReward)
      : jobCount > 0
      ? totalReward / jobCount
      : 0;

    const totalEnergy = Number.isFinite(energy.totalEnergy)
      ? Number(energy.totalEnergy)
      : 0;
    const averageEnergy = Number.isFinite(energy.averageEnergy)
      ? Number(energy.averageEnergy)
      : 0;
    const sampleCount = Number.isFinite(energy.sampleCount)
      ? Number(energy.sampleCount)
      : 0;
    const energySamples = Number.isFinite(efficiency?.overall.energySamples)
      ? Number(efficiency?.overall.energySamples)
      : sampleCount;

    const rewardPerEnergy = Number.isFinite(efficiency?.overall.rewardPerEnergy)
      ? Number(efficiency?.overall.rewardPerEnergy)
      : totalEnergy > 0
      ? totalReward / totalEnergy
      : 0;
    const efficiencyScore = Number.isFinite(efficiency?.overall.efficiencyScore)
      ? Number(efficiency?.overall.efficiencyScore)
      : Number.isFinite(energy.efficiencyScore)
      ? Number(energy.efficiencyScore)
      : 0;
    const averageEfficiency = Number.isFinite(stats?.averageEfficiency)
      ? Number(stats?.averageEfficiency)
      : Number.isFinite(energy.averageEfficiency)
      ? Number(energy.averageEfficiency)
      : 0;

    const anomalyCount = anomaly
      ? Number(anomaly.count)
      : Math.round(
          (Number.isFinite(energy.anomalyRate) ? energy.anomalyRate : 0) *
            sampleCount
        );
    const anomalyRate =
      sampleCount > 0
        ? anomalyCount / sampleCount
        : Number(energy.anomalyRate ?? 0);

    const rewardDensityScore = computeRewardDensityScore(rewardPerEnergy);
    const stabilityScore = computeStabilityScore(anomalyRate);
    const successScore = clamp(successRate, 0, 1);

    const initialWarnings: string[] = [];
    if (successScore < 0.5) {
      initialWarnings.push('low-success-rate');
    }
    if (anomalyRate > 0.2) {
      initialWarnings.push('anomaly-rate-high');
    }
    if (sampleCount < 3) {
      initialWarnings.push('insufficient-telemetry');
    }
    if (rewardPerEnergy <= 0.01 && jobCount >= 3) {
      initialWarnings.push('low-reward-density');
    }

    totals.totalEnergy += totalEnergy;
    totals.sampleCount += sampleCount;
    totals.totalReward += totalReward;
    totals.anomalyCount += Math.max(0, anomalyCount);

    partials.push({
      address: addressKey,
      identity,
      efficiency,
      anomaly,
      stats,
      successRate,
      totalReward,
      averageReward,
      rewardPerEnergy,
      efficiencyScore,
      averageEfficiency,
      averageEnergy,
      totalEnergy,
      sampleCount,
      energySamples,
      anomalyCount,
      anomalyRate,
      rewardDensityScore,
      stabilityScore,
      successScore,
      averageCpuTimeMs: Number.isFinite(stats?.averageCpuTimeMs)
        ? Number(stats?.averageCpuTimeMs)
        : undefined,
      averageGpuTimeMs: Number.isFinite(stats?.averageGpuTimeMs)
        ? Number(stats?.averageGpuTimeMs)
        : undefined,
      dominantComplexity: stats?.dominantComplexity,
      lastUpdated:
        efficiency?.overall.lastUpdated ||
        stats?.lastUpdated ||
        new Date(0).toISOString(),
      energyLastUpdated: energy.lastUpdated || new Date(0).toISOString(),
      jobCount,
      initialWarnings,
    });
  }

  const globalAverageEnergy =
    totals.sampleCount > 0 ? totals.totalEnergy / totals.sampleCount : 0;

  const agentSummaries: ThermodynamicAgentSummary[] = partials.map((entry) => {
    const energyContribution = computeEnergyContribution(
      entry.averageEnergy,
      globalAverageEnergy
    );
    const efficiencyComponent = clamp(entry.efficiencyScore, 0, 1);
    const baseScore =
      entry.rewardDensityScore * 0.45 +
      entry.successScore * 0.25 +
      entry.stabilityScore * 0.2 +
      energyContribution * 0.1;
    const thermodynamicScore = clamp(
      baseScore * (0.7 + efficiencyComponent * 0.3),
      0,
      1
    );

    const warnings = [...entry.initialWarnings];
    if (
      globalAverageEnergy > 0 &&
      entry.averageEnergy > globalAverageEnergy * 1.5 &&
      entry.sampleCount >= 3
    ) {
      warnings.push('energy-outlier');
    }
    if (thermodynamicScore < 0.4) {
      warnings.push('thermodynamic-risk');
    }

    let status: 'nominal' | 'warning' | 'critical' = 'nominal';
    if (warnings.includes('thermodynamic-risk') || entry.anomalyRate >= 0.25) {
      status = 'critical';
    } else if (
      warnings.includes('low-success-rate') ||
      warnings.includes('anomaly-rate-high') ||
      warnings.includes('energy-outlier')
    ) {
      status = 'warning';
    }

    return {
      address: entry.address,
      ...summariseIdentity(entry.identity),
      jobCount: entry.jobCount,
      successRate: round(entry.successRate),
      totalReward: round(entry.totalReward),
      averageReward: round(entry.averageReward),
      totalEnergy: round(entry.totalEnergy),
      averageEnergy: round(entry.averageEnergy),
      rewardPerEnergy: round(entry.rewardPerEnergy),
      efficiencyScore: round(entry.efficiencyScore),
      averageEfficiency: round(entry.averageEfficiency),
      sampleCount: entry.sampleCount,
      energySamples: entry.energySamples,
      anomalyCount: entry.anomalyCount,
      anomalyRate: round(entry.anomalyRate),
      averageCpuTimeMs: entry.averageCpuTimeMs
        ? round(entry.averageCpuTimeMs)
        : undefined,
      averageGpuTimeMs: entry.averageGpuTimeMs
        ? round(entry.averageGpuTimeMs)
        : undefined,
      dominantComplexity: entry.dominantComplexity,
      thermodynamicScore: round(thermodynamicScore),
      rewardDensityScore: round(entry.rewardDensityScore),
      stabilityScore: round(entry.stabilityScore),
      successScore: round(entry.successScore),
      energyContributionScore: round(energyContribution),
      status,
      warnings,
      lastUpdated: entry.lastUpdated || entry.energyLastUpdated,
    };
  });

  const totalAgents = agentSummaries.length;
  const anomalyAgentCount = agentSummaries.filter(
    (agent) => agent.anomalyCount > 0
  ).length;
  const scoreSum = agentSummaries.reduce(
    (sum, agent) => sum + agent.thermodynamicScore,
    0
  );

  const sortKey = options.sortBy ?? 'score';
  const defaultOrder =
    options.order ??
    (sortKey === 'anomaly' || sortKey === 'energy' ? 'asc' : 'desc');
  const orderMultiplier = defaultOrder === 'asc' ? 1 : -1;

  agentSummaries.sort((a, b) => {
    const aValue = pickSortValue(a, sortKey);
    const bValue = pickSortValue(b, sortKey);
    if (
      Number.isFinite(aValue) &&
      Number.isFinite(bValue) &&
      aValue !== bValue
    ) {
      return (aValue - bValue) * orderMultiplier;
    }
    if (b.thermodynamicScore !== a.thermodynamicScore) {
      return (b.thermodynamicScore - a.thermodynamicScore) * orderMultiplier;
    }
    return a.address.localeCompare(b.address);
  });

  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(0, Math.floor(options.limit))
      : undefined;
  const limitedAgents =
    typeof limit === 'number' && limit >= 0
      ? agentSummaries.slice(0, limit || agentSummaries.length)
      : agentSummaries;

  const notes: string[] = [];
  const criticalAgents = agentSummaries.filter(
    (agent) => agent.status === 'critical'
  );
  const warningAgents = agentSummaries.filter(
    (agent) => agent.status === 'warning'
  );

  if (totalAgents === 0) {
    notes.push('No thermodynamic telemetry has been recorded yet.');
  }
  if (criticalAgents.length > 0) {
    const names = criticalAgents
      .slice(0, 3)
      .map((agent) => agent.label || agent.ensName || agent.address)
      .join(', ');
    notes.push(
      `Critical thermodynamic state detected for ${criticalAgents.length} agent(s): ${names}.`
    );
  } else if (warningAgents.length > 0) {
    const names = warningAgents
      .slice(0, 3)
      .map((agent) => agent.label || agent.ensName || agent.address)
      .join(', ');
    notes.push(
      `Thermodynamic warnings active for ${warningAgents.length} agent(s): ${names}.`
    );
  }
  if (totals.anomalyCount > 0) {
    notes.push(
      `Energy anomalies observed across ${anomalyAgentCount} agent(s) in the current monitoring window.`
    );
  }

  const summary: ThermodynamicSummary = {
    generatedAt: new Date().toISOString(),
    totals: {
      agentCount: totalAgents,
      totalEnergy: round(totals.totalEnergy),
      sampleCount: totals.sampleCount,
      totalReward: round(totals.totalReward),
      averageEnergy: round(globalAverageEnergy),
      averageRewardPerEnergy:
        totals.totalEnergy > 0
          ? round(totals.totalReward / totals.totalEnergy)
          : 0,
      averageThermodynamicScore:
        totalAgents > 0 ? round(scoreSum / totalAgents) : 0,
      anomalyCount: totals.anomalyCount,
      anomalyAgentCount,
    },
    agents: limitedAgents,
    anomalies: options.includeAnomalies === false ? undefined : anomalyList,
    notes,
    meta: {
      totalAgents,
      returnedAgents: limitedAgents.length,
      limitApplied:
        typeof limit === 'number' &&
        limit < agentSummaries.length &&
        limit >= 0,
    },
  };

  return summary;
}
