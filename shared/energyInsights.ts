import fs from 'fs';
import path from 'path';
import type { EnergySample } from './energyMonitor';

const TELEMETRY_DIR = path.resolve(__dirname, '../storage/telemetry');
const INSIGHTS_PATH = path.join(TELEMETRY_DIR, 'energy-insights.json');
const ANOMALY_LOG_PATH = path.join(TELEMETRY_DIR, 'energy-anomalies.jsonl');
const MAX_ANOMALY_HISTORY = Number(
  process.env.ENERGY_ANOMALY_HISTORY_LIMIT || '50'
);

interface JobRecord {
  key: string;
  jobId: string;
  agent: string;
  category?: string;
  rewardValue?: number;
  energyTotal: number;
  cpuTimeMs: number;
  gpuTimeMs: number;
  wallTimeMs: number;
  cpuCycles: number;
  gpuCycles: number;
  gpuUtilizationTotal: number;
  samples: number;
  anomalyCount: number;
  anomalies?: Array<{ code: string; at: string }>;
  lastUpdated: string;
}

interface AgentRecord {
  agent: string;
  energyTotal: number;
  sampleCount: number;
  anomalyCount: number;
  jobKeys: string[];
  lastUpdated: string;
}

interface InsightsFile {
  jobs: Record<string, JobRecord>;
  agents: Record<string, AgentRecord>;
  updatedAt: string;
}

export interface AgentEnergyInsight {
  agent: string;
  jobCount: number;
  sampleCount: number;
  totalEnergy: number;
  averageEnergy: number;
  totalReward: number;
  averageEfficiency: number;
  efficiencyScore: number;
  anomalyRate: number;
  lastUpdated: string;
}

export interface JobEnergyInsight {
  jobId: string;
  agent: string;
  category?: string;
  samples: number;
  totalEnergy: number;
  averageEnergy: number;
  averageCpuTimeMs: number;
  averageGpuTimeMs: number;
  averageWallTimeMs: number;
  averageCpuCycles: number;
  averageGpuCycles: number;
  averageGpuUtilization: number;
  rewardValue: number;
  efficiencyScore: number;
  anomalyRate: number;
  anomalyCount: number;
  lastUpdated: string;
}

export interface EnergyInsightsSnapshot {
  agents: Record<string, AgentEnergyInsight>;
  jobs: Record<string, Record<string, JobEnergyInsight>>;
  updatedAt: string;
}

export interface EnergyAnomalyRecord {
  spanId: string;
  jobId?: string;
  agent?: string;
  timestamp: string;
  anomalies: string[];
  energyEstimate: number;
  cpuTimeMs: number;
  gpuTimeMs?: number;
  durationMs: number;
  rewardValue?: number;
  efficiencyScore?: number;
  metadata?: Record<string, unknown>;
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createEmptyInsights(): InsightsFile {
  return {
    jobs: {},
    agents: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function readInsightsSync(): InsightsFile {
  try {
    const raw = fs.readFileSync(INSIGHTS_PATH, 'utf8');
    if (!raw) {
      return createEmptyInsights();
    }
    const parsed = JSON.parse(raw) as InsightsFile;
    parsed.jobs = parsed.jobs ?? {};
    parsed.agents = parsed.agents ?? {};
    parsed.updatedAt = parsed.updatedAt ?? new Date(0).toISOString();
    return parsed;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return createEmptyInsights();
    }
    console.warn('Failed to read energy insights snapshot', err);
    return createEmptyInsights();
  }
}

async function readInsights(): Promise<InsightsFile> {
  try {
    const raw = await fs.promises.readFile(INSIGHTS_PATH, 'utf8');
    if (!raw) {
      return createEmptyInsights();
    }
    const parsed = JSON.parse(raw) as InsightsFile;
    parsed.jobs = parsed.jobs ?? {};
    parsed.agents = parsed.agents ?? {};
    parsed.updatedAt = parsed.updatedAt ?? new Date(0).toISOString();
    return parsed;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return createEmptyInsights();
    }
    console.warn('Failed to read energy insights', err);
    return createEmptyInsights();
  }
}

async function writeInsights(data: InsightsFile): Promise<void> {
  ensureDirectory(path.dirname(INSIGHTS_PATH));
  await fs.promises.writeFile(
    INSIGHTS_PATH,
    JSON.stringify(data, null, 2),
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

function normaliseAgent(agent?: string | null): string {
  if (!agent) {
    return 'unknown';
  }
  return agent.toLowerCase();
}

function composeJobKey(agent: string, jobId: string): string {
  return `${agent}::${jobId}`;
}

function splitJobKey(key: string): [string, string] {
  const idx = key.indexOf('::');
  if (idx === -1) {
    return ['unknown', key];
  }
  return [key.slice(0, idx), key.slice(idx + 2)];
}

function sanitiseMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  const entries = Object.entries(metadata).slice(0, 20);
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      result[key] = value.length > 256 ? `${value.slice(0, 256)}…` : value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        result[key] = value;
      }
    } else if (typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function extractRewardValue(sample: EnergySample): number | null {
  if (
    typeof sample.rewardValue === 'number' &&
    Number.isFinite(sample.rewardValue)
  ) {
    return sample.rewardValue;
  }
  if (sample.metadata) {
    const candidates = [
      sample.metadata.rewardValue,
      sample.metadata.jobReward,
      sample.metadata.reward,
    ];
    for (const candidate of candidates) {
      const value = toNumber(candidate);
      if (value > 0) {
        return value;
      }
    }
  }
  return null;
}

function appendAnomalyHistory(
  history: Array<{ code: string; at: string }> | undefined,
  codes: string[],
  timestamp: string
): Array<{ code: string; at: string }> {
  const next = history ? [...history] : [];
  for (const code of codes) {
    next.push({ code, at: timestamp });
  }
  if (next.length > MAX_ANOMALY_HISTORY) {
    return next.slice(next.length - MAX_ANOMALY_HISTORY);
  }
  return next;
}

function toJobInsight(record: JobRecord): JobEnergyInsight {
  const safeSamples = record.samples > 0 ? record.samples : 1;
  const averageEnergy = record.energyTotal / safeSamples;
  const averageCpuTime = record.cpuTimeMs / safeSamples;
  const averageGpuTime = record.gpuTimeMs / safeSamples;
  const averageWallTime = record.wallTimeMs / safeSamples;
  const averageCpuCycles = record.cpuCycles / safeSamples;
  const averageGpuCycles = record.gpuCycles / safeSamples;
  const averageGpuUtilisation = record.gpuUtilizationTotal / safeSamples;
  const rewardValue = record.rewardValue ?? 0;
  const efficiency =
    rewardValue > 0 ? rewardValue / Math.max(1, record.energyTotal) : 0;
  const anomalyRate = record.samples ? record.anomalyCount / record.samples : 0;
  return {
    jobId: record.jobId,
    agent: record.agent,
    category: record.category,
    samples: record.samples,
    totalEnergy: record.energyTotal,
    averageEnergy,
    averageCpuTimeMs: averageCpuTime,
    averageGpuTimeMs: averageGpuTime,
    averageWallTimeMs: averageWallTime,
    averageCpuCycles,
    averageGpuCycles,
    averageGpuUtilization: averageGpuUtilisation,
    rewardValue,
    efficiencyScore: efficiency,
    anomalyRate,
    anomalyCount: record.anomalyCount,
    lastUpdated: record.lastUpdated,
  };
}

function toAgentInsight(
  record: AgentRecord,
  jobs: Record<string, JobRecord>
): AgentEnergyInsight {
  let totalReward = 0;
  let efficiencyAccumulator = 0;
  let jobCount = 0;
  for (const key of record.jobKeys) {
    const job = jobs[key];
    if (!job) continue;
    jobCount += 1;
    const rewardValue = job.rewardValue ?? 0;
    totalReward += rewardValue;
    efficiencyAccumulator +=
      rewardValue > 0 ? rewardValue / Math.max(1, job.energyTotal) : 0;
  }
  const averageEfficiency = jobCount ? efficiencyAccumulator / jobCount : 0;
  const averageEnergy = record.sampleCount
    ? record.energyTotal / record.sampleCount
    : 0;
  const anomalyRate = record.sampleCount
    ? record.anomalyCount / record.sampleCount
    : 0;
  return {
    agent: record.agent,
    jobCount,
    sampleCount: record.sampleCount,
    totalEnergy: record.energyTotal,
    averageEnergy,
    totalReward,
    averageEfficiency,
    efficiencyScore: averageEfficiency,
    anomalyRate,
    lastUpdated: record.lastUpdated,
  };
}

function sanitiseJobId(jobId: string | number | undefined): string | null {
  if (jobId === undefined || jobId === null) {
    return null;
  }
  return String(jobId);
}

async function appendAnomalies(records: EnergyAnomalyRecord[]): Promise<void> {
  if (!records.length) {
    return;
  }
  ensureDirectory(path.dirname(ANOMALY_LOG_PATH));
  const lines = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.promises.appendFile(ANOMALY_LOG_PATH, `${lines}\n`, 'utf8');
}

export async function updateEnergyInsights(
  sample: EnergySample
): Promise<void> {
  const jobId = sanitiseJobId(sample.jobId ?? sample.metadata?.jobId);
  if (!jobId) {
    return;
  }
  const agentKey = normaliseAgent(sample.agent ?? sample.metadata?.agent);
  const jobKey = composeJobKey(agentKey, jobId);
  const rewardValue = extractRewardValue(sample);
  const anomalies = sample.anomalies ?? [];
  const timestamp = sample.finishedAt ?? new Date().toISOString();

  const insights = await readInsights();

  const jobRecord: JobRecord = insights.jobs[jobKey] ?? {
    key: jobKey,
    jobId,
    agent: agentKey,
    category: sample.category,
    rewardValue: rewardValue ?? undefined,
    energyTotal: 0,
    cpuTimeMs: 0,
    gpuTimeMs: 0,
    wallTimeMs: 0,
    cpuCycles: 0,
    gpuCycles: 0,
    gpuUtilizationTotal: 0,
    samples: 0,
    anomalyCount: 0,
    anomalies: [],
    lastUpdated: timestamp,
  };

  jobRecord.samples += 1;
  jobRecord.energyTotal += toNumber(sample.energyEstimate);
  jobRecord.cpuTimeMs += toNumber(sample.cpuTimeMs);
  jobRecord.gpuTimeMs += toNumber(sample.gpuTimeMs);
  jobRecord.wallTimeMs += toNumber(sample.runtimeMs ?? sample.durationMs);
  jobRecord.cpuCycles += toNumber(sample.cpuCycles);
  jobRecord.gpuCycles += toNumber(sample.gpuCycles);
  jobRecord.gpuUtilizationTotal += toNumber(sample.gpuUtilization);
  jobRecord.lastUpdated = timestamp;
  if (sample.category) {
    jobRecord.category = sample.category;
  }
  if (rewardValue !== null) {
    jobRecord.rewardValue = rewardValue;
  }
  if (anomalies.length) {
    jobRecord.anomalyCount += anomalies.length;
    jobRecord.anomalies = appendAnomalyHistory(
      jobRecord.anomalies,
      anomalies,
      timestamp
    );
  }
  insights.jobs[jobKey] = jobRecord;

  const agentRecord: AgentRecord = insights.agents[agentKey] ?? {
    agent: agentKey,
    energyTotal: 0,
    sampleCount: 0,
    anomalyCount: 0,
    jobKeys: [],
    lastUpdated: timestamp,
  };
  agentRecord.energyTotal += toNumber(sample.energyEstimate);
  agentRecord.sampleCount += 1;
  agentRecord.anomalyCount += anomalies.length;
  agentRecord.lastUpdated = timestamp;
  if (!agentRecord.jobKeys.includes(jobKey)) {
    agentRecord.jobKeys.push(jobKey);
  }
  insights.agents[agentKey] = agentRecord;

  insights.updatedAt = timestamp;

  await writeInsights(insights);

  if (anomalies.length) {
    const record: EnergyAnomalyRecord = {
      spanId: sample.spanId,
      jobId,
      agent: sample.agent ?? agentKey,
      timestamp,
      anomalies,
      energyEstimate: toNumber(sample.energyEstimate),
      cpuTimeMs: toNumber(sample.cpuTimeMs),
      gpuTimeMs: toNumber(sample.gpuTimeMs) || undefined,
      durationMs: toNumber(sample.runtimeMs ?? sample.durationMs),
      rewardValue: rewardValue ?? undefined,
      efficiencyScore: sample.efficiencyScore,
      metadata: sanitiseMetadata(sample.metadata),
    };
    await appendAnomalies([record]);
  }
}

export function getEnergyInsightsSnapshot(): EnergyInsightsSnapshot {
  const raw = readInsightsSync();
  const agents: Record<string, AgentEnergyInsight> = {};
  const jobsByAgent: Record<string, Record<string, JobEnergyInsight>> = {};

  for (const [key, record] of Object.entries(raw.jobs)) {
    const [agentKey, jobId] = splitJobKey(key);
    const insight = toJobInsight(record);
    if (!jobsByAgent[agentKey]) {
      jobsByAgent[agentKey] = {};
    }
    jobsByAgent[agentKey][jobId] = insight;
  }

  for (const [agentKey, record] of Object.entries(raw.agents)) {
    agents[agentKey] = toAgentInsight(record, raw.jobs);
  }

  return {
    agents,
    jobs: jobsByAgent,
    updatedAt: raw.updatedAt,
  };
}

export function getAgentEnergyInsight(
  agentId: string,
  snapshot?: EnergyInsightsSnapshot
): AgentEnergyInsight | null {
  if (!agentId) {
    return null;
  }
  const data = snapshot ?? getEnergyInsightsSnapshot();
  return data.agents[agentId.toLowerCase()] ?? null;
}

export function getJobEnergyInsight(
  agentId: string,
  jobId: string | number,
  snapshot?: EnergyInsightsSnapshot
): JobEnergyInsight | null {
  if (!jobId) {
    return null;
  }
  const agentKey = agentId ? agentId.toLowerCase() : 'unknown';
  const data = snapshot ?? getEnergyInsightsSnapshot();
  const agentJobs = data.jobs[agentKey];
  if (!agentJobs) {
    return null;
  }
  return agentJobs[String(jobId)] ?? null;
}
