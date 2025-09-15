import { ethers } from 'ethers';
import {
  readTrainingRecords,
  resolveCategory,
  type TrainingRecord,
} from './trainingRecords';
import { readEnergySamples, type EnergySample } from './energyMonitor';

export interface EfficiencyBreakdown {
  key: string;
  name: string;
  jobs: number;
  successes: number;
  successRate: number;
  totalReward: number;
  averageReward: number;
  totalEnergy: number;
  averageEnergy: number;
  rewardPerEnergy: number;
  energySamples: number;
  efficiencyScore: number;
  lastUpdated?: string;
}

export interface AgentEfficiencyReport {
  agent: string;
  overall: EfficiencyBreakdown;
  categories: EfficiencyBreakdown[];
  updatedAt: string;
}

interface EnergyAggregate {
  totalEnergy: number;
  samples: number;
  lastUpdated?: string;
}

interface MutableBreakdown {
  key: string;
  name: string;
  jobs: number;
  successes: number;
  rewardTotal: number;
  energyTotal: number;
  energySamples: number;
  lastRecordAt?: string;
  lastEnergyAt?: string;
}

interface AgentReportMutable {
  agent: string;
  overall: MutableBreakdown;
  categories: Map<string, MutableBreakdown>;
  updatedAt?: string;
}

const DEFAULT_CATEGORY_KEY = 'uncategorized';
const DEFAULT_CATEGORY_NAME = 'Uncategorized';
const CACHE_TTL_MS = Number(process.env.EFFICIENCY_CACHE_TTL_MS || '60000');

function normaliseCategoryName(value?: string | null): {
  key: string;
  name: string;
} {
  if (!value) {
    return { key: DEFAULT_CATEGORY_KEY, name: DEFAULT_CATEGORY_NAME };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { key: DEFAULT_CATEGORY_KEY, name: DEFAULT_CATEGORY_NAME };
  }
  return { key: trimmed.toLowerCase(), name: trimmed };
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(6));
}

function parseReward(record: TrainingRecord): number {
  const formatted = record.reward?.posted?.formatted;
  if (formatted) {
    const parsed = Number.parseFloat(formatted);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const raw = record.reward?.posted?.raw;
  if (raw) {
    try {
      const decimals = record.reward?.decimals ?? 18;
      return Number.parseFloat(
        ethers.formatUnits(BigInt(raw), Number(decimals))
      );
    } catch (err) {
      console.warn('Failed to parse reward', err);
    }
  }
  return 0;
}

function maxTimestamp(
  ...values: Array<string | undefined>
): string | undefined {
  let result: string | undefined;
  for (const value of values) {
    if (!value) continue;
    if (!result || value > result) {
      result = value;
    }
  }
  return result;
}

function createBreakdown(key: string, name: string): MutableBreakdown {
  return {
    key,
    name,
    jobs: 0,
    successes: 0,
    rewardTotal: 0,
    energyTotal: 0,
    energySamples: 0,
  };
}

function ensureBreakdown(
  collection: Map<string, MutableBreakdown>,
  key: string,
  name: string
): MutableBreakdown {
  if (!collection.has(key)) {
    collection.set(key, createBreakdown(key, name));
  }
  const breakdown = collection.get(key)!;
  if (!breakdown.name) {
    breakdown.name = name;
  }
  return breakdown;
}

function updateBreakdownFromRecord(
  breakdown: MutableBreakdown,
  record: TrainingRecord
): void {
  breakdown.jobs += 1;
  if (record.success) {
    breakdown.successes += 1;
  }
  const reward = parseReward(record);
  if (Number.isFinite(reward)) {
    breakdown.rewardTotal += reward;
  }
  breakdown.lastRecordAt = maxTimestamp(
    breakdown.lastRecordAt,
    record.recordedAt
  );
}

function aggregateEnergy(samples: EnergySample[]): {
  overall: Map<string, EnergyAggregate>;
  byCategory: Map<string, Map<string, EnergyAggregate>>;
  categoryNames: Map<string, string>;
} {
  const overall = new Map<string, EnergyAggregate>();
  const byCategory = new Map<string, Map<string, EnergyAggregate>>();
  const categoryNames = new Map<string, string>([
    [DEFAULT_CATEGORY_KEY, DEFAULT_CATEGORY_NAME],
  ]);
  for (const sample of samples) {
    const agent = sample.agent?.toLowerCase();
    if (!agent) continue;
    const energy = Number(sample.energyEstimate ?? 0);
    if (!Number.isFinite(energy) || energy < 0) continue;
    const timestamp = sample.finishedAt || sample.startedAt;
    const { key, name } = normaliseCategoryName(sample.category);
    if (!categoryNames.has(key)) {
      categoryNames.set(key, name);
    }

    const overallEntry = overall.get(agent) ?? { totalEnergy: 0, samples: 0 };
    overallEntry.totalEnergy += energy;
    overallEntry.samples += 1;
    overallEntry.lastUpdated = maxTimestamp(
      overallEntry.lastUpdated,
      timestamp
    );
    overall.set(agent, overallEntry);

    let agentCategoryMap = byCategory.get(agent);
    if (!agentCategoryMap) {
      agentCategoryMap = new Map();
      byCategory.set(agent, agentCategoryMap);
    }
    const categoryEntry = agentCategoryMap.get(key) ?? {
      totalEnergy: 0,
      samples: 0,
    };
    categoryEntry.totalEnergy += energy;
    categoryEntry.samples += 1;
    categoryEntry.lastUpdated = maxTimestamp(
      categoryEntry.lastUpdated,
      timestamp
    );
    agentCategoryMap.set(key, categoryEntry);
  }
  return { overall, byCategory, categoryNames };
}

function finaliseBreakdown(data: MutableBreakdown): EfficiencyBreakdown {
  const successRate = data.jobs > 0 ? data.successes / data.jobs : 0;
  const averageReward = data.jobs > 0 ? data.rewardTotal / data.jobs : 0;
  const averageEnergy =
    data.energySamples > 0 ? data.energyTotal / data.energySamples : 0;
  const rewardPerEnergy =
    data.energyTotal > 0 ? data.rewardTotal / data.energyTotal : 0;
  const energyFactor =
    data.energySamples > 0 ? 1 / (1 + averageEnergy / 1000) : 1;
  const rewardFactor =
    rewardPerEnergy > 0 ? Math.log10(1 + rewardPerEnergy) : 0;
  const efficiencyScore = successRate * energyFactor * rewardFactor;
  const lastUpdated = maxTimestamp(data.lastRecordAt, data.lastEnergyAt);
  return {
    key: data.key,
    name: data.name,
    jobs: data.jobs,
    successes: data.successes,
    successRate: round(successRate),
    totalReward: round(data.rewardTotal),
    averageReward: round(averageReward),
    totalEnergy: round(data.energyTotal),
    averageEnergy: round(averageEnergy),
    rewardPerEnergy: round(rewardPerEnergy),
    energySamples: data.energySamples,
    efficiencyScore: round(efficiencyScore),
    lastUpdated,
  };
}

async function computeEfficiencyIndex(): Promise<
  Map<string, AgentEfficiencyReport>
> {
  const [records, energySamples] = await Promise.all([
    readTrainingRecords(),
    readEnergySamples(),
  ]);
  const energyAggregates = aggregateEnergy(energySamples);
  const categoryNames = new Map<string, string>(energyAggregates.categoryNames);
  const reports = new Map<string, AgentReportMutable>();

  const ensureAgent = (address: string): AgentReportMutable => {
    const key = address.toLowerCase();
    if (!reports.has(key)) {
      reports.set(key, {
        agent: key,
        overall: createBreakdown('overall', 'Overall'),
        categories: new Map(),
      });
    }
    return reports.get(key)!;
  };

  for (const record of records) {
    const agent = record.agent?.toLowerCase();
    if (!agent) continue;
    const report = ensureAgent(agent);
    updateBreakdownFromRecord(report.overall, record);
    report.updatedAt = maxTimestamp(report.updatedAt, record.recordedAt);
    const { key, name } = normaliseCategoryName(resolveCategory(record));
    if (!categoryNames.has(key)) {
      categoryNames.set(key, name);
    }
    const breakdown = ensureBreakdown(report.categories, key, name);
    updateBreakdownFromRecord(breakdown, record);
  }

  for (const [agent, aggregate] of energyAggregates.overall.entries()) {
    const report = ensureAgent(agent);
    report.overall.energyTotal = aggregate.totalEnergy;
    report.overall.energySamples = aggregate.samples;
    report.overall.lastEnergyAt = maxTimestamp(
      report.overall.lastEnergyAt,
      aggregate.lastUpdated
    );
    report.updatedAt = maxTimestamp(report.updatedAt, aggregate.lastUpdated);
  }

  for (const [agent, categories] of energyAggregates.byCategory.entries()) {
    const report = ensureAgent(agent);
    for (const [key, aggregate] of categories.entries()) {
      const name = categoryNames.get(key) ?? key;
      const breakdown = ensureBreakdown(report.categories, key, name);
      breakdown.energyTotal = aggregate.totalEnergy;
      breakdown.energySamples = aggregate.samples;
      breakdown.lastEnergyAt = maxTimestamp(
        breakdown.lastEnergyAt,
        aggregate.lastUpdated
      );
      report.updatedAt = maxTimestamp(report.updatedAt, aggregate.lastUpdated);
    }
  }

  const results = new Map<string, AgentEfficiencyReport>();
  for (const [agent, report] of reports.entries()) {
    const overall = finaliseBreakdown(report.overall);
    const categories = Array.from(report.categories.values())
      .map((entry) => finaliseBreakdown(entry))
      .sort((a, b) => b.efficiencyScore - a.efficiencyScore);
    const updatedAt =
      maxTimestamp(
        report.updatedAt,
        overall.lastUpdated,
        ...categories.map((c) => c.lastUpdated)
      ) || new Date().toISOString();
    results.set(agent, {
      agent,
      overall,
      categories,
      updatedAt,
    });
  }
  return results;
}

let cache: {
  generatedAt: number;
  reports: Map<string, AgentEfficiencyReport>;
} | null = null;

export async function getEfficiencyIndex(
  force = false
): Promise<Map<string, AgentEfficiencyReport>> {
  if (!force && cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
    return cache.reports;
  }
  const reports = await computeEfficiencyIndex();
  cache = { generatedAt: Date.now(), reports };
  return reports;
}

export async function getAgentEfficiency(
  address: string
): Promise<AgentEfficiencyReport | null> {
  if (!address) return null;
  const index = await getEfficiencyIndex();
  return index.get(address.toLowerCase()) ?? null;
}

export function findCategoryBreakdown(
  report: AgentEfficiencyReport,
  category?: string | null
): EfficiencyBreakdown | undefined {
  if (!category) {
    return report.overall;
  }
  const target = category.toLowerCase();
  if (target === 'overall') {
    return report.overall;
  }
  return report.categories.find(
    (entry) => entry.key === target || entry.name.toLowerCase() === target
  );
}

export function clearEfficiencyCache(): void {
  cache = null;
}
