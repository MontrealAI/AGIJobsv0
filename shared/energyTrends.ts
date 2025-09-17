import fs from 'fs';
import path from 'path';
import { EnergySample } from './energyMonitor';

const TELEMETRY_DIR = path.resolve(__dirname, '../storage/telemetry');
const TREND_PATH = path.join(TELEMETRY_DIR, 'energy-trends.json');

const SHORT_ALPHA = clampAlpha(
  Number(process.env.ENERGY_TREND_SHORT_ALPHA || '0.4')
);
const LONG_ALPHA = clampAlpha(
  Number(process.env.ENERGY_TREND_LONG_ALPHA || '0.12')
);
const MOMENTUM_WARNING_THRESHOLD = Number(
  process.env.ENERGY_TREND_WARNING_THRESHOLD || '0.08'
);
const MOMENTUM_CRITICAL_THRESHOLD = Number(
  process.env.ENERGY_TREND_CRITICAL_THRESHOLD || '0.18'
);
const COOLING_THRESHOLD = Number(
  process.env.ENERGY_TREND_COOLING_THRESHOLD || '0.06'
);

interface TrendFile {
  agents: Record<string, AgentTrendRecord>;
  totals: EnergyTrendTotalsInternal;
  updatedAt: string;
}

interface EnergyTrendTotalsInternal {
  sampleCount: number;
  anomalyCount: number;
}

interface AgentTrendRecord {
  agent: string;
  shortEnergy: number;
  longEnergy: number;
  shortEfficiency: number;
  longEfficiency: number;
  totalReward: number;
  sampleCount: number;
  anomalyCount: number;
  lastUpdated: string;
  lastAnomalyAt?: string;
  lastSample?: AgentTrendSample;
}

interface AgentTrendSample {
  jobId?: string;
  energy: number;
  reward?: number;
  efficiency?: number;
  anomalies?: string[];
  timestamp: string;
}

export type EnergyTrendStatus =
  | 'cooling'
  | 'stable'
  | 'warming'
  | 'overheating';

export interface AgentEnergyTrend {
  agent: string;
  sampleCount: number;
  anomalyCount: number;
  anomalyRate: number;
  shortTermEnergy: number;
  longTermEnergy: number;
  energyMomentum: number;
  energyMomentumRatio: number;
  shortTermEfficiency: number;
  longTermEfficiency: number;
  efficiencyMomentum: number;
  totalReward: number;
  averageReward: number;
  status: EnergyTrendStatus;
  notes: string[];
  lastUpdated: string;
  lastAnomalyAt?: string;
  lastSample?: AgentTrendSample;
}

export interface EnergyTrendTotals {
  agents: number;
  sampleCount: number;
  anomalyCount: number;
  overheatingAgents: number;
  warmingAgents: number;
  coolingAgents: number;
  stableAgents: number;
}

export interface EnergyTrendSnapshot {
  agents: Record<string, AgentEnergyTrend>;
  totals: EnergyTrendTotals;
  updatedAt: string;
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    return 0.1;
  }
  return value;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyTrendFile(): TrendFile {
  return {
    agents: {},
    totals: { sampleCount: 0, anomalyCount: 0 },
    updatedAt: new Date(0).toISOString(),
  };
}

async function readTrendFile(): Promise<TrendFile> {
  try {
    const raw = await fs.promises.readFile(TREND_PATH, 'utf8');
    if (!raw) {
      return emptyTrendFile();
    }
    const parsed = JSON.parse(raw) as TrendFile;
    parsed.agents = parsed.agents ?? {};
    parsed.totals = parsed.totals ?? {
      sampleCount: 0,
      anomalyCount: 0,
    };
    parsed.updatedAt = parsed.updatedAt ?? new Date(0).toISOString();
    return parsed;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return emptyTrendFile();
    }
    console.warn('Failed to read energy trend snapshot', err);
    return emptyTrendFile();
  }
}

async function writeTrendFile(file: TrendFile): Promise<void> {
  ensureDir(path.dirname(TREND_PATH));
  await fs.promises.writeFile(
    TREND_PATH,
    JSON.stringify(file, null, 2),
    'utf8'
  );
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function applyEma(
  previous: number | undefined,
  value: number,
  alpha: number
): number {
  if (!Number.isFinite(value)) {
    return previous ?? 0;
  }
  if (previous === undefined || !Number.isFinite(previous) || previous === 0) {
    return value;
  }
  return alpha * value + (1 - alpha) * previous;
}

function computeStatus(
  momentumRatio: number,
  anomalyRate: number,
  hasRecentAnomaly: boolean
): EnergyTrendStatus {
  if (hasRecentAnomaly || momentumRatio >= MOMENTUM_CRITICAL_THRESHOLD) {
    return 'overheating';
  }
  if (momentumRatio >= MOMENTUM_WARNING_THRESHOLD) {
    return 'warming';
  }
  if (momentumRatio <= -COOLING_THRESHOLD) {
    return 'cooling';
  }
  return 'stable';
}

function normaliseAgent(agent?: string | null): string {
  if (!agent) {
    return 'unknown';
  }
  return agent.toLowerCase();
}

function buildSample(
  sample: EnergySample,
  timestamp: string
): AgentTrendSample {
  return {
    jobId: sample.jobId ? String(sample.jobId) : undefined,
    energy: toNumber(sample.energyEstimate),
    reward: sample.rewardValue,
    efficiency: sample.efficiencyScore,
    anomalies:
      sample.anomalies && sample.anomalies.length
        ? [...sample.anomalies]
        : undefined,
    timestamp,
  };
}

export async function updateEnergyTrends(sample: EnergySample): Promise<void> {
  const agentKey = normaliseAgent(sample.agent);
  const trendFile = await readTrendFile();
  const record: AgentTrendRecord = trendFile.agents[agentKey] ?? {
    agent: agentKey,
    shortEnergy: 0,
    longEnergy: 0,
    shortEfficiency: 0,
    longEfficiency: 0,
    totalReward: 0,
    sampleCount: 0,
    anomalyCount: 0,
    lastUpdated: new Date(0).toISOString(),
  };

  const timestamp = sample.finishedAt || new Date().toISOString();
  const energy = toNumber(sample.energyEstimate);
  const reward = toNumber(sample.rewardValue);
  const efficiency =
    Number.isFinite(sample.efficiencyScore) &&
    sample.efficiencyScore !== undefined
      ? Number(sample.efficiencyScore)
      : reward > 0
      ? reward / Math.max(energy, 1)
      : 0;
  const anomalyCount = Array.isArray(sample.anomalies)
    ? sample.anomalies.length
    : 0;

  record.sampleCount += 1;
  record.shortEnergy = applyEma(record.shortEnergy, energy, SHORT_ALPHA);
  record.longEnergy = applyEma(record.longEnergy, energy, LONG_ALPHA);
  record.shortEfficiency = applyEma(
    record.shortEfficiency,
    efficiency,
    SHORT_ALPHA
  );
  record.longEfficiency = applyEma(
    record.longEfficiency,
    efficiency,
    LONG_ALPHA
  );
  record.totalReward += reward;
  record.anomalyCount += anomalyCount;
  record.lastUpdated = timestamp;
  record.lastSample = buildSample(sample, timestamp);
  if (anomalyCount > 0) {
    record.lastAnomalyAt = timestamp;
  }

  trendFile.agents[agentKey] = record;
  trendFile.totals.sampleCount += 1;
  trendFile.totals.anomalyCount += anomalyCount;
  trendFile.updatedAt = timestamp;

  await writeTrendFile(trendFile);
}

function readTrendFileSync(): TrendFile {
  try {
    const raw = fs.readFileSync(TREND_PATH, 'utf8');
    if (!raw) {
      return emptyTrendFile();
    }
    const parsed = JSON.parse(raw) as TrendFile;
    parsed.agents = parsed.agents ?? {};
    parsed.totals = parsed.totals ?? {
      sampleCount: 0,
      anomalyCount: 0,
    };
    parsed.updatedAt = parsed.updatedAt ?? new Date(0).toISOString();
    return parsed;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to read energy trend snapshot', err);
    }
    return emptyTrendFile();
  }
}

function toAgentTrend(record: AgentTrendRecord): AgentEnergyTrend {
  const energyMomentum = record.shortEnergy - record.longEnergy;
  const denominator = Math.max(record.longEnergy, 1);
  const momentumRatio = energyMomentum / denominator;
  const efficiencyMomentum = record.shortEfficiency - record.longEfficiency;
  const anomalyRate = record.sampleCount
    ? record.anomalyCount / record.sampleCount
    : 0;
  const hasRecentAnomaly = Boolean(record.lastAnomalyAt);
  const status = computeStatus(momentumRatio, anomalyRate, hasRecentAnomaly);
  const averageReward = record.sampleCount
    ? record.totalReward / record.sampleCount
    : 0;

  const notes: string[] = [];
  if (energyMomentum > 0) {
    notes.push(`heating:+${momentumRatio.toFixed(3)}`);
  } else if (energyMomentum < 0) {
    notes.push(`cooling:${momentumRatio.toFixed(3)}`);
  }
  if (anomalyRate > 0) {
    notes.push(`anomaly-rate:${anomalyRate.toFixed(3)}`);
  }
  if (efficiencyMomentum !== 0) {
    notes.push(`efficiency:${efficiencyMomentum.toFixed(3)}`);
  }

  return {
    agent: record.agent,
    sampleCount: record.sampleCount,
    anomalyCount: record.anomalyCount,
    anomalyRate,
    shortTermEnergy: record.shortEnergy,
    longTermEnergy: record.longEnergy,
    energyMomentum,
    energyMomentumRatio: momentumRatio,
    shortTermEfficiency: record.shortEfficiency,
    longTermEfficiency: record.longEfficiency,
    efficiencyMomentum,
    totalReward: record.totalReward,
    averageReward,
    status,
    notes,
    lastUpdated: record.lastUpdated,
    lastAnomalyAt: record.lastAnomalyAt,
    lastSample: record.lastSample,
  };
}

export function getEnergyTrendsSnapshot(): EnergyTrendSnapshot {
  const raw = readTrendFileSync();
  const agents: Record<string, AgentEnergyTrend> = {};
  let overheating = 0;
  let warming = 0;
  let cooling = 0;
  let stable = 0;

  for (const [key, record] of Object.entries(raw.agents)) {
    const trend = toAgentTrend(record);
    agents[key] = trend;
    switch (trend.status) {
      case 'overheating':
        overheating += 1;
        break;
      case 'warming':
        warming += 1;
        break;
      case 'cooling':
        cooling += 1;
        break;
      default:
        stable += 1;
        break;
    }
  }

  const totals: EnergyTrendTotals = {
    agents: Object.keys(agents).length,
    sampleCount: raw.totals.sampleCount,
    anomalyCount: raw.totals.anomalyCount,
    overheatingAgents: overheating,
    warmingAgents: warming,
    coolingAgents: cooling,
    stableAgents: stable,
  };

  return { agents, totals, updatedAt: raw.updatedAt };
}

export function getAgentEnergyTrend(
  agentId: string,
  snapshot?: EnergyTrendSnapshot
): AgentEnergyTrend | null {
  if (!agentId) {
    return null;
  }
  const data = snapshot ?? getEnergyTrendsSnapshot();
  return data.agents[agentId.toLowerCase()] ?? null;
}

export function getEnergyTrendMap(): Map<string, AgentEnergyTrend> {
  const snapshot = getEnergyTrendsSnapshot();
  return new Map(
    Object.values(snapshot.agents).map((trend) => [
      trend.agent.toLowerCase(),
      trend,
    ])
  );
}
