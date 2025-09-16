import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { readEnergySamples, type EnergySample } from './energyMonitor';

export interface RewardSnapshot {
  raw: string;
  formatted: string;
}

export interface RewardPayout extends RewardSnapshot {
  recipient: string;
}

export interface RewardRecord {
  posted: RewardSnapshot;
  payouts?: RewardPayout[];
  decimals: number;
}

export type TrainingRecordKind = 'job' | 'sandbox';

export interface TrainingRecord {
  kind: TrainingRecordKind;
  jobId: string;
  recordedAt: string;
  agent?: string | null;
  employer?: string | null;
  category?: string | null;
  agentType?: number | null;
  success: boolean;
  reward?: RewardRecord;
  sandbox?: {
    scenario: string;
    passed: boolean;
    metrics: {
      sampleSize: number;
      successRate: number;
      averageReward: string;
    };
    details?: string;
  };
  metadata?: Record<string, unknown>;
}

export type JobTrainingRecord = TrainingRecord & { kind: 'job' };

export interface JobEfficiencyMetrics {
  energyEstimate?: number | null;
  durationMs?: number | null;
  rewardPerEnergy?: number | null;
  energyPerReward?: number | null;
  cpuTotalUs?: number | null;
  memoryRssBytes?: number | null;
  entropyEstimate?: number | null;
}

export interface JobOutcomeEntry {
  record: JobTrainingRecord;
  category?: string;
  rewardValue: number;
  rewardDecimals: number;
  energySample?: EnergySample | null;
  efficiency: JobEfficiencyMetrics;
}

export interface JobOutcomeDataset {
  generatedAt: string;
  records: JobOutcomeEntry[];
}

export interface JobDatasetOptions {
  since?: Date | string | number;
  agents?: string | string[];
  categories?: string | string[];
  includeFailed?: boolean;
}

export const TRAINING_DATA_DIR = path.resolve(__dirname, '../data/training');
export const TRAINING_RECORDS_PATH =
  process.env.TRAINING_RECORDS_PATH ||
  path.join(TRAINING_DATA_DIR, 'records.jsonl');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normaliseValue(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function parseSince(value?: Date | string | number): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toArray(value?: string | string[]): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return null;
}

function parseRewardValue(record: TrainingRecord): number {
  const formatted = record.reward?.posted?.formatted;
  if (typeof formatted === 'string' && formatted.trim().length > 0) {
    const parsed = Number.parseFloat(formatted);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const raw = record.reward?.posted?.raw;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const decimals = Number(record.reward?.decimals ?? 18);
      return Number.parseFloat(ethers.formatUnits(BigInt(raw), decimals));
    } catch (err) {
      console.warn('Failed to parse reward raw value', err);
    }
  }
  return 0;
}

function resolveJobId(sample: EnergySample): string | null {
  const fromContext = (sample as { jobId?: unknown }).jobId;
  if (typeof fromContext === 'string' && fromContext.length > 0) {
    return fromContext;
  }
  if (typeof fromContext === 'number') {
    return fromContext.toString();
  }
  const metadataJobId = sample.metadata?.['jobId'];
  if (typeof metadataJobId === 'string' && metadataJobId.length > 0) {
    return metadataJobId;
  }
  if (typeof metadataJobId === 'number') {
    return metadataJobId.toString();
  }
  return null;
}

function selectLatestSample(
  existing: EnergySample | undefined,
  candidate: EnergySample
): EnergySample {
  if (!existing) return candidate;
  const existingTs = existing.finishedAt || existing.startedAt || '';
  const candidateTs = candidate.finishedAt || candidate.startedAt || '';
  return candidateTs > existingTs ? candidate : existing;
}

function indexEnergySamples(
  samples: EnergySample[]
): Map<string, EnergySample> {
  const map = new Map<string, EnergySample>();
  for (const sample of samples) {
    const jobId = resolveJobId(sample);
    if (!jobId) continue;
    const key = jobId.toString();
    const existing = map.get(key);
    map.set(key, selectLatestSample(existing, sample));
  }
  return map;
}

function computeEfficiency(
  rewardValue: number,
  sample?: EnergySample | null
): JobEfficiencyMetrics {
  if (!sample) {
    return {
      energyEstimate: null,
      durationMs: null,
      rewardPerEnergy: null,
      energyPerReward: null,
      cpuTotalUs: null,
      memoryRssBytes: null,
      entropyEstimate: null,
    };
  }
  const energy = Number(sample.energyEstimate ?? 0);
  const durationMs = Number(sample.durationMs ?? 0);
  const rewardPerEnergy = energy > 0 ? rewardValue / energy : null;
  const energyPerReward = rewardValue > 0 ? energy / rewardValue : null;
  const cpuTotalUs = Number(sample.cpuTotalUs ?? null);
  const memoryRssBytes = Number(sample.memoryRssBytes ?? null);
  const entropyEstimate =
    typeof sample.entropyEstimate === 'number' ? sample.entropyEstimate : null;
  const metadataEntropy = sample.metadata?.['entropy'];
  return {
    energyEstimate: Number.isFinite(energy) ? energy : null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    rewardPerEnergy:
      rewardPerEnergy !== null && Number.isFinite(rewardPerEnergy)
        ? rewardPerEnergy
        : null,
    energyPerReward:
      energyPerReward !== null && Number.isFinite(energyPerReward)
        ? energyPerReward
        : null,
    cpuTotalUs: Number.isFinite(cpuTotalUs) ? cpuTotalUs : null,
    memoryRssBytes: Number.isFinite(memoryRssBytes) ? memoryRssBytes : null,
    entropyEstimate: Number.isFinite(entropyEstimate)
      ? entropyEstimate
      : typeof metadataEntropy === 'number'
      ? metadataEntropy
      : null,
  };
}

export async function collectJobOutcomeDataset(
  options: JobDatasetOptions = {}
): Promise<JobOutcomeDataset> {
  const [records, energySamples] = await Promise.all([
    readTrainingRecords(),
    readEnergySamples(),
  ]);
  const since = parseSince(options.since);
  const agentFilters = toArray(options.agents)?.map((value) =>
    value.toLowerCase()
  );
  const categoryFilters = toArray(options.categories)?.map((value) =>
    value.toLowerCase()
  );
  const agentSet = agentFilters ? new Set(agentFilters) : null;
  const categorySet = categoryFilters ? new Set(categoryFilters) : null;
  const includeFailed = options.includeFailed !== false;
  const energyIndex = indexEnergySamples(energySamples);

  const dataset: JobOutcomeEntry[] = [];
  for (const record of records) {
    if (record.kind !== 'job') continue;
    if (!includeFailed && !record.success) {
      continue;
    }
    if (since) {
      const timestamp = new Date(record.recordedAt).getTime();
      if (Number.isFinite(timestamp) && timestamp < since) {
        continue;
      }
    }
    const agent = record.agent ? record.agent.toLowerCase() : null;
    if (agentSet && (!agent || !agentSet.has(agent))) {
      continue;
    }
    const category = resolveCategory(record);
    const categoryKey = category ? normaliseValue(category) : null;
    if (categorySet && (!categoryKey || !categorySet.has(categoryKey))) {
      continue;
    }

    const rewardValue = parseRewardValue(record);
    const decimals = Number(record.reward?.decimals ?? 18);
    const energySample = energyIndex.get(record.jobId) ?? null;
    const efficiency = computeEfficiency(rewardValue, energySample);

    dataset.push({
      record: record as JobTrainingRecord,
      category: category ?? undefined,
      rewardValue,
      rewardDecimals: Number.isFinite(decimals) ? decimals : 18,
      energySample,
      efficiency,
    });
  }

  dataset.sort((a, b) =>
    a.record.recordedAt.localeCompare(b.record.recordedAt)
  );
  return {
    generatedAt: new Date().toISOString(),
    records: dataset,
  };
}

export async function appendTrainingRecord(
  record: TrainingRecord
): Promise<void> {
  ensureDirectory(path.dirname(TRAINING_RECORDS_PATH));
  const line = `${JSON.stringify(record)}\n`;
  await fs.promises.appendFile(TRAINING_RECORDS_PATH, line, 'utf8');
}

export async function readTrainingRecords(): Promise<TrainingRecord[]> {
  try {
    const raw = await fs.promises.readFile(TRAINING_RECORDS_PATH, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as TrainingRecord);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export function resolveCategory(record: TrainingRecord): string | undefined {
  if (record.category) {
    return record.category;
  }
  if (typeof record.agentType === 'number') {
    return `agentType-${record.agentType}`;
  }
  return undefined;
}
