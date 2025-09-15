import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  appendTrainingRecord,
  readTrainingRecords,
  resolveCategory,
  TrainingRecord,
} from '../../shared/trainingRecords';
import {
  loadSandboxTests,
  evaluateSandbox,
  SandboxResult,
} from '../utils/sandbox';

const MODELS_DIR = path.resolve(__dirname, '../../storage/models');
const REGISTRY_PATH = path.join(MODELS_DIR, 'registry.json');
const ACTIVE_PATH = path.join(MODELS_DIR, 'active.json');
const MIN_NEW_RECORDS = Number(process.env.TRAINING_MIN_RECORDS || '5');
const TRAINING_INTERVAL_MS = Number(
  process.env.TRAINING_INTERVAL_MS || 10 * 60 * 1000
);
const RUN_ONCE = process.argv.includes('--once');

interface CategoryStats {
  total: number;
  successRate: number;
  averageReward: string;
}

interface ModelRegistryEntry {
  agent: string;
  version: number;
  modelPath: string;
  lastUpdated: string;
  processedRecords: number;
  status: 'active' | 'pending';
  metrics: {
    total: number;
    successRate: number;
    averageReward: string;
    rewardDecimals: number;
    categoryBreakdown: Record<string, CategoryStats>;
  };
  sandbox: SandboxResult[];
}

type ModelRegistry = Record<string, ModelRegistryEntry>;

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadRegistry(): ModelRegistry {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw) as ModelRegistry;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function saveRegistry(registry: ModelRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function saveActiveState(registry: ModelRegistry): void {
  const active: Record<
    string,
    { version: number; modelPath: string; updatedAt: string }
  > = {};
  for (const entry of Object.values(registry)) {
    if (entry.status === 'active') {
      active[entry.agent] = {
        version: entry.version,
        modelPath: entry.modelPath,
        updatedAt: entry.lastUpdated,
      };
    }
  }
  fs.writeFileSync(ACTIVE_PATH, JSON.stringify(active, null, 2));
}

function groupRecordsByAgent(
  records: TrainingRecord[]
): Map<string, TrainingRecord[]> {
  const map = new Map<string, TrainingRecord[]>();
  for (const record of records) {
    if (record.kind !== 'job') continue;
    if (!record.agent) continue;
    const key = record.agent.toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(record);
  }
  return map;
}

function computeAgentStats(records: TrainingRecord[]) {
  const jobRecords = records.filter((record) => record.kind === 'job');
  const total = jobRecords.length;
  const successCount = jobRecords.filter((record) => record.success).length;
  const decimals = jobRecords[0]?.reward?.decimals ?? 18;
  let rewardSum = 0n;
  const categories = new Map<
    string,
    { total: number; success: number; rewardSum: bigint }
  >();

  for (const record of jobRecords) {
    const reward = record.reward;
    if (reward) {
      rewardSum += BigInt(reward.posted.raw || '0');
    }
    const category = resolveCategory(record);
    if (!category) continue;
    if (!categories.has(category)) {
      categories.set(category, { total: 0, success: 0, rewardSum: 0n });
    }
    const entry = categories.get(category)!;
    entry.total += 1;
    if (record.success) entry.success += 1;
    if (reward) entry.rewardSum += BigInt(reward.posted.raw || '0');
  }

  const averageRaw = total > 0 ? rewardSum / BigInt(total) : 0n;
  const averageReward = ethers.formatUnits(averageRaw, decimals);

  const categoryBreakdown: Record<string, CategoryStats> = {};
  for (const [category, data] of categories.entries()) {
    const avg = data.total > 0 ? data.rewardSum / BigInt(data.total) : 0n;
    categoryBreakdown[category] = {
      total: data.total,
      successRate: data.total > 0 ? data.success / data.total : 0,
      averageReward: ethers.formatUnits(avg, decimals),
    };
  }

  return {
    total,
    successRate: total > 0 ? successCount / total : 0,
    averageReward,
    rewardDecimals: decimals,
    categoryBreakdown,
  };
}

function getNewRecordCount(
  entry: ModelRegistryEntry | undefined,
  total: number
): number {
  return total - (entry?.processedRecords ?? 0);
}

async function logSandboxEvaluations(
  agentId: string,
  results: SandboxResult[]
): Promise<void> {
  for (const result of results) {
    await appendTrainingRecord({
      kind: 'sandbox',
      jobId: `sandbox:${agentId}:${result.id}`,
      recordedAt: result.timestamp,
      agent: agentId,
      success: result.passed,
      category: result.category ?? undefined,
      sandbox: {
        scenario: result.id,
        passed: result.passed,
        metrics: {
          sampleSize: result.sampleSize,
          successRate: Number(result.successRate.toFixed(4)),
          averageReward: result.averageReward.toFixed(4),
        },
        details: result.reason,
      },
      metadata: {
        description: result.description,
      },
    });
  }
}

async function processAgent(
  agentId: string,
  records: TrainingRecord[],
  entry: ModelRegistryEntry | undefined,
  registry: ModelRegistry
): Promise<boolean> {
  const stats = computeAgentStats(records);
  if (stats.total === 0) {
    console.log(`Skipping ${agentId}: no completed jobs recorded.`);
    return false;
  }

  const version = (entry?.version ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const modelPath = path.join(MODELS_DIR, `${agentId}-${version}.json`);

  const modelPayload = {
    agent: agentId,
    version,
    trainedAt: timestamp,
    metrics: stats,
    samples: stats.total,
  };

  await fs.promises.writeFile(modelPath, JSON.stringify(modelPayload, null, 2));

  const sandboxTests = loadSandboxTests();
  const sandboxResults = evaluateSandbox(records, sandboxTests, {
    agentId,
  });
  await logSandboxEvaluations(agentId, sandboxResults);

  const allPassed = sandboxResults.every((result) => result.passed);

  registry[agentId] = {
    agent: agentId,
    version,
    modelPath,
    lastUpdated: timestamp,
    processedRecords: stats.total,
    status: allPassed ? 'active' : 'pending',
    metrics: stats,
    sandbox: sandboxResults,
  };

  if (allPassed) {
    console.log(`Hot-swapped agent ${agentId} to model v${version}`);
  } else {
    const failed = sandboxResults
      .filter((result) => !result.passed)
      .map((result) => result.id)
      .join(', ');
    console.warn(
      `Sandbox checks failed for ${agentId} on tests: ${failed || 'unknown'}`
    );
  }

  return true;
}

async function runCycle(): Promise<void> {
  ensureDirectory(MODELS_DIR);
  const records = await readTrainingRecords();
  if (records.length === 0) {
    console.log('No training records available.');
    return;
  }

  const registry = loadRegistry();
  const grouped = groupRecordsByAgent(records);
  let updated = false;

  for (const [agentId, agentRecords] of grouped.entries()) {
    const entry = registry[agentId];
    const newCount = getNewRecordCount(entry, agentRecords.length);
    if (newCount < MIN_NEW_RECORDS) {
      continue;
    }
    const changed = await processAgent(agentId, agentRecords, entry, registry);
    updated = updated || changed;
  }

  if (updated) {
    saveRegistry(registry);
    saveActiveState(registry);
  }
}

let running = false;
async function guardedRun(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runCycle();
  } catch (err) {
    console.error('Model update cycle failed', err);
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  await guardedRun();
  if (RUN_ONCE) {
    return;
  }
  if (!Number.isFinite(TRAINING_INTERVAL_MS) || TRAINING_INTERVAL_MS <= 0) {
    console.log('TRAINING_INTERVAL_MS disabled; exiting after initial cycle.');
    return;
  }
  setInterval(() => {
    guardedRun().catch((err) => console.error(err));
  }, TRAINING_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
