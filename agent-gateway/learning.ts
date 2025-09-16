import fs from 'fs';
import path from 'path';
import { Job } from './types';
import { AgentProfile, JobAnalysis } from './agentRegistry';
import { EnergySample } from '../shared/energyMonitor';
import { appendTrainingRecord } from '../shared/trainingRecords';
import { TOKEN_DECIMALS } from './utils';
import {
  recordSpawnRequest as storeSpawnRequest,
  getSpawnRequests as loadSpawnRequests,
} from '../shared/spawnManager';

interface RetrainingTask {
  agent: string;
  reason: string;
  jobId: string;
  createdAt: string;
  failureCount: number;
}

const TRAINING_DIR = path.resolve(__dirname, '../storage/training');
const RETRAINING_PATH = path.join(TRAINING_DIR, 'retraining-queue.json');
const LEARNING_DIR = path.resolve(__dirname, '../storage/learning');
const LEARNING_RECORDS_PATH = path.join(LEARNING_DIR, 'records.jsonl');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to read file', file, err);
    }
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  ensureDir(path.dirname(file));
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function queueRetrainingTask(task: RetrainingTask): Promise<void> {
  const queue = await readJsonFile<RetrainingTask[]>(RETRAINING_PATH, []);
  const existing = queue.find(
    (entry) => entry.agent.toLowerCase() === task.agent.toLowerCase()
  );
  if (existing) {
    existing.failureCount += task.failureCount;
    existing.jobId = task.jobId;
    existing.reason = task.reason;
    existing.createdAt = task.createdAt;
  } else {
    queue.push(task);
  }
  await writeJsonFile(RETRAINING_PATH, queue);
}

export interface TrainingOutcome {
  job: Job;
  profile: AgentProfile;
  analysis: JobAnalysis;
  success: boolean;
  energy: EnergySample | null;
  txHash: string;
  resultURI: string;
  resultHash: string;
}

interface LearningJobRecord {
  jobId: string;
  employer: string;
  agent: string;
  specHash?: string;
  uri?: string;
  category?: string;
  description?: string;
  skills?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  reward: { raw: string; formatted: string; decimals: number };
  stake: { raw: string; formatted: string };
  fee: { raw: string; formatted: string };
}

interface LearningAgentRecord {
  address: string;
  label?: string;
  ensName?: string;
  categories: string[];
  skills: string[];
  reputationScore: number;
  successRate: number;
  totalJobs: number;
  averageEnergy: number;
  averageDurationMs: number;
  stakeBalance?: string;
  endpoint?: string;
}

interface LearningAnalysisRecord {
  jobId: string;
  employer: string;
  category?: string;
  description?: string;
  skills?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  reward: string;
  stake: string;
  fee: string;
  specHash?: string;
  uri?: string;
  deadline?: string | number | null;
}

interface LearningEnergyRecord {
  estimate?: number | null;
  durationMs?: number | null;
  cpuTotalUs?: number | null;
  memoryRssBytes?: number | null;
  entropyEstimate?: number | null;
}

export interface LearningRecord {
  recordedAt: string;
  job: LearningJobRecord;
  agent: LearningAgentRecord;
  analysis: LearningAnalysisRecord;
  energy?: LearningEnergyRecord | null;
  result: {
    success: boolean;
    txHash?: string;
    resultURI?: string;
    resultHash?: string;
  };
}

function normaliseSkills(values?: string[] | null): string[] {
  if (!values) return [];
  return values.filter((value): value is string => typeof value === 'string');
}

function normaliseMetadata(
  metadata?: unknown
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

function formatJobRecord(job: Job, analysis: JobAnalysis): LearningJobRecord {
  return {
    jobId: job.jobId,
    employer: job.employer,
    agent: job.agent,
    specHash: job.specHash || undefined,
    uri: job.uri || undefined,
    category: analysis.category || undefined,
    description: analysis.description || undefined,
    skills: normaliseSkills(analysis.skills),
    tags: normaliseSkills(analysis.tags),
    metadata: normaliseMetadata(analysis.metadata),
    reward: {
      raw: job.rewardRaw,
      formatted: job.reward,
      decimals: TOKEN_DECIMALS,
    },
    stake: { raw: job.stakeRaw, formatted: job.stake },
    fee: { raw: job.feeRaw, formatted: job.fee },
  };
}

function formatAgentRecord(profile: AgentProfile): LearningAgentRecord {
  return {
    address: profile.address,
    label: profile.label || undefined,
    ensName: profile.ensName || undefined,
    categories: Array.from(profile.categories || []),
    skills: Array.from(profile.skills || []),
    reputationScore: profile.reputationScore,
    successRate: profile.successRate,
    totalJobs: profile.totalJobs,
    averageEnergy: profile.averageEnergy,
    averageDurationMs: profile.averageDurationMs,
    stakeBalance: profile.stakeBalance?.toString(),
    endpoint: profile.endpoint,
  };
}

function bigintToString(value: bigint | number | undefined): string {
  if (value === undefined || value === null) {
    return '0';
  }
  try {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value).toString();
    }
    return String(value);
  } catch {
    return String(value);
  }
}

function formatAnalysisRecord(analysis: JobAnalysis): LearningAnalysisRecord {
  return {
    jobId: analysis.jobId,
    employer: analysis.employer,
    category: analysis.category || undefined,
    description: analysis.description || undefined,
    skills: normaliseSkills(analysis.skills),
    tags: normaliseSkills(analysis.tags),
    metadata: normaliseMetadata(analysis.metadata),
    reward: bigintToString(analysis.reward),
    stake: bigintToString(analysis.stake),
    fee: bigintToString(analysis.fee),
    specHash: analysis.specHash || undefined,
    uri: analysis.uri || undefined,
    deadline: analysis.deadline ?? null,
  };
}

function formatEnergyRecord(
  sample: EnergySample | null
): LearningEnergyRecord | null {
  if (!sample) return null;
  return {
    estimate: sample.energyEstimate ?? null,
    durationMs: sample.durationMs ?? null,
    cpuTotalUs: sample.cpuTotalUs ?? null,
    memoryRssBytes: sample.memoryRssBytes ?? null,
    entropyEstimate: sample.entropyEstimate ?? null,
  };
}

async function appendLearningRecord(record: LearningRecord): Promise<void> {
  const line = JSON.stringify(record);
  ensureDir(LEARNING_DIR);
  await fs.promises.appendFile(LEARNING_RECORDS_PATH, `${line}\n`, 'utf8');
}

export async function notifyTrainingOutcome(
  outcome: TrainingOutcome
): Promise<void> {
  const {
    job,
    profile,
    analysis,
    success,
    energy,
    txHash,
    resultURI,
    resultHash,
  } = outcome;
  const recordedAt = new Date().toISOString();
  try {
    const record: LearningRecord = {
      recordedAt,
      job: formatJobRecord(job, analysis),
      agent: formatAgentRecord(profile),
      analysis: formatAnalysisRecord(analysis),
      energy: formatEnergyRecord(energy),
      result: {
        success,
        txHash: txHash || undefined,
        resultURI: resultURI || undefined,
        resultHash: resultHash || undefined,
      },
    };
    await appendLearningRecord(record);
  } catch (err) {
    console.warn('Failed to append learning record', err);
  }

  try {
    await appendTrainingRecord({
      kind: 'sandbox',
      jobId: job.jobId,
      recordedAt,
      agent: profile.address,
      employer: job.employer,
      category: analysis.category,
      success,
      reward: {
        posted: { raw: job.rewardRaw, formatted: job.reward },
        decimals: TOKEN_DECIMALS,
      },
      sandbox: {
        scenario: 'execution',
        passed: success,
        metrics: {
          sampleSize: 1,
          successRate: success ? 1 : 0,
          averageReward: job.reward,
        },
        details: JSON.stringify({ txHash, resultURI, resultHash }),
      },
      metadata: {
        energy: energy?.energyEstimate,
        entropy: energy?.entropyEstimate,
        durationMs: energy?.durationMs,
        categories: profile.categories,
      },
    });
  } catch (err) {
    console.warn('Failed to append sandbox training record', err);
  }

  if (!success) {
    await queueRetrainingTask({
      agent: profile.address,
      reason: 'job-failure',
      jobId: job.jobId,
      createdAt: new Date().toISOString(),
      failureCount: 1,
    });
  } else if (energy && energy.energyEstimate > 50_000) {
    await queueRetrainingTask({
      agent: profile.address,
      reason: 'high-energy-usage',
      jobId: job.jobId,
      createdAt: new Date().toISOString(),
      failureCount: 0,
    });
  }

  if (
    analysis.category &&
    !profile.categories.some(
      (cat) => cat.toLowerCase() === analysis.category?.toLowerCase()
    )
  ) {
    await storeSpawnRequest(analysis.category, job.jobId);
  }
}

export async function getRetrainingQueue(): Promise<RetrainingTask[]> {
  return readJsonFile(RETRAINING_PATH, [] as RetrainingTask[]);
}

export const getSpawnRequests = loadSpawnRequests;
