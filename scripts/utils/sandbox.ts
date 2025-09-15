import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { TrainingRecord, resolveCategory } from '../../shared/trainingRecords';

export interface SandboxTest {
  id: string;
  description?: string;
  minSamples: number;
  window?: number;
  category?: string | null;
  minSuccessRate?: number;
  minAverageReward?: number;
}

export interface SandboxResult {
  id: string;
  description?: string;
  passed: boolean;
  sampleSize: number;
  successRate: number;
  averageReward: number;
  category?: string | null;
  reason?: string;
  timestamp: string;
}

const DEFAULT_SANDBOX_TESTS: SandboxTest[] = [
  {
    id: 'baseline-quality',
    description: 'Ensure recent executions maintain at least 60% success.',
    minSamples: 5,
    window: 10,
    minSuccessRate: 0.6,
  },
  {
    id: 'reward-floor',
    description:
      'Ensure the average posted reward meets the configured minimum.',
    minSamples: 3,
    minAverageReward: 1,
  },
];

const DEFAULT_CONFIG_PATH = path.resolve(
  __dirname,
  '../../config/sandbox-tests.json'
);

export function loadSandboxTests(customPath?: string): SandboxTest[] {
  const file =
    customPath || process.env.SANDBOX_TESTS_PATH || DEFAULT_CONFIG_PATH;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as SandboxTest[];
    return parsed.length > 0 ? parsed : DEFAULT_SANDBOX_TESTS;
  } catch {
    return DEFAULT_SANDBOX_TESTS;
  }
}

interface EvaluateOptions {
  agentId?: string;
  category?: string | null;
}

function filterRecords(
  records: TrainingRecord[],
  options: EvaluateOptions,
  test: SandboxTest
): TrainingRecord[] {
  let filtered = records.filter((record) => record.kind === 'job');
  if (options.agentId) {
    const agent = options.agentId.toLowerCase();
    filtered = filtered.filter(
      (record) => (record.agent || '').toLowerCase() === agent
    );
  }
  const requestedCategory = options.category ?? null;
  if (requestedCategory) {
    filtered = filtered.filter(
      (record) => resolveCategory(record) === requestedCategory
    );
  }
  if (test.category) {
    filtered = filtered.filter(
      (record) => resolveCategory(record) === test.category
    );
  }
  if (test.window && test.window > 0 && filtered.length > test.window) {
    filtered = filtered.slice(filtered.length - test.window);
  }
  return filtered;
}

function calculateAverageReward(records: TrainingRecord[]): {
  average: number;
  decimals: number;
} {
  if (records.length === 0) {
    return { average: 0, decimals: 18 };
  }
  let decimals = 18;
  let sum = 0n;
  for (const record of records) {
    const reward = record.reward;
    if (!reward) continue;
    if (typeof reward.decimals === 'number') {
      decimals = reward.decimals;
    }
    const value = BigInt(reward.posted.raw || '0');
    sum += value;
  }
  if (records.length === 0) {
    return { average: 0, decimals };
  }
  const avgRaw = sum / BigInt(records.length || 1);
  const average = Number(ethers.formatUnits(avgRaw, decimals));
  return { average, decimals };
}

export function evaluateSandbox(
  records: TrainingRecord[],
  tests: SandboxTest[],
  options: EvaluateOptions = {}
): SandboxResult[] {
  const results: SandboxResult[] = [];
  const timestamp = new Date().toISOString();

  for (const test of tests) {
    const relevant = filterRecords(records, options, test);
    const sampleSize = relevant.length;
    const successCount = relevant.filter((r) => r.success).length;
    const successRate = sampleSize > 0 ? successCount / sampleSize : 0;
    const { average } = calculateAverageReward(relevant);
    const reasons: string[] = [];

    if (sampleSize < test.minSamples) {
      reasons.push(`requires ${test.minSamples} samples, saw ${sampleSize}`);
    }
    if (
      typeof test.minSuccessRate === 'number' &&
      successRate < test.minSuccessRate
    ) {
      reasons.push(
        `success rate ${successRate.toFixed(2)} < ${test.minSuccessRate}`
      );
    }
    if (
      typeof test.minAverageReward === 'number' &&
      average < test.minAverageReward
    ) {
      reasons.push(
        `average reward ${average.toFixed(2)} < ${test.minAverageReward}`
      );
    }

    results.push({
      id: test.id,
      description: test.description,
      passed: reasons.length === 0,
      sampleSize,
      successRate,
      averageReward: average,
      category: test.category ?? options.category ?? null,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
      timestamp,
    });
  }

  return results;
}
