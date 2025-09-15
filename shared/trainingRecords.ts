import fs from 'fs';
import path from 'path';

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

export const TRAINING_DATA_DIR = path.resolve(__dirname, '../data/training');
export const TRAINING_RECORDS_PATH =
  process.env.TRAINING_RECORDS_PATH ||
  path.join(TRAINING_DATA_DIR, 'records.jsonl');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
