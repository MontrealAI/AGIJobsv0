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
  try {
    await appendTrainingRecord({
      kind: 'sandbox',
      jobId: job.jobId,
      recordedAt: new Date().toISOString(),
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
