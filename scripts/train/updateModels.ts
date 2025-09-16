import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  appendTrainingRecord,
  collectJobOutcomeDataset,
  JobOutcomeEntry,
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
  averageRewardValue: number;
  averageEnergy: number;
  rewardPerEnergy: number;
  efficiencyScore: number;
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
    averageRewardValue: number;
    averageEnergy: number;
    rewardPerEnergy: number;
    efficiencyScore: number;
    energySamples: number;
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

function groupEntriesByAgent(
  entries: JobOutcomeEntry[]
): Map<string, JobOutcomeEntry[]> {
  const map = new Map<string, JobOutcomeEntry[]>();
  for (const entry of entries) {
    const agent = entry.record.agent;
    if (!agent) continue;
    const key = agent.toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  }
  return map;
}

function round(value: number, places = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function computeAgentStats(entries: JobOutcomeEntry[]) {
  const total = entries.length;
  if (total === 0) {
    return {
      total,
      successRate: 0,
      averageReward: '0',
      averageRewardValue: 0,
      averageEnergy: 0,
      rewardPerEnergy: 0,
      efficiencyScore: 0,
      energySamples: 0,
      rewardDecimals: 18,
      categoryBreakdown: {},
    };
  }

  const decimals = entries[0].record.reward?.decimals ?? 18;
  let successCount = 0;
  let rewardSumRaw = 0n;
  let rewardSumValue = 0;
  let energySum = 0;
  let energySamples = 0;
  let rewardPerEnergySum = 0;
  let rewardPerEnergySamples = 0;

  interface CategoryData {
    label: string;
    total: number;
    success: number;
    rewardSumRaw: bigint;
    rewardSumValue: number;
    energySum: number;
    energySamples: number;
    rewardPerEnergySum: number;
    rewardPerEnergySamples: number;
  }

  const categories = new Map<string, CategoryData>();

  for (const entry of entries) {
    const record = entry.record;
    if (record.success) {
      successCount += 1;
    }
    const rawReward = record.reward?.posted?.raw;
    if (rawReward) {
      rewardSumRaw += BigInt(rawReward);
    }
    rewardSumValue += entry.rewardValue;

    const energy = entry.efficiency.energyEstimate;
    if (typeof energy === 'number' && Number.isFinite(energy)) {
      energySum += energy;
      energySamples += 1;
    }

    const rewardPerEnergy = entry.efficiency.rewardPerEnergy;
    if (
      typeof rewardPerEnergy === 'number' &&
      Number.isFinite(rewardPerEnergy)
    ) {
      rewardPerEnergySum += rewardPerEnergy;
      rewardPerEnergySamples += 1;
    }

    const categoryLabel =
      entry.category ?? resolveCategory(record) ?? 'uncategorized';
    const categoryKey = categoryLabel.toLowerCase();
    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, {
        label: categoryLabel,
        total: 0,
        success: 0,
        rewardSumRaw: 0n,
        rewardSumValue: 0,
        energySum: 0,
        energySamples: 0,
        rewardPerEnergySum: 0,
        rewardPerEnergySamples: 0,
      });
    }
    const categoryData = categories.get(categoryKey)!;
    categoryData.total += 1;
    if (record.success) {
      categoryData.success += 1;
    }
    if (rawReward) {
      categoryData.rewardSumRaw += BigInt(rawReward);
    }
    categoryData.rewardSumValue += entry.rewardValue;
    if (typeof energy === 'number' && Number.isFinite(energy)) {
      categoryData.energySum += energy;
      categoryData.energySamples += 1;
    }
    if (
      typeof rewardPerEnergy === 'number' &&
      Number.isFinite(rewardPerEnergy)
    ) {
      categoryData.rewardPerEnergySum += rewardPerEnergy;
      categoryData.rewardPerEnergySamples += 1;
    }
  }

  const averageRaw = rewardSumRaw / BigInt(total);
  const averageReward = ethers.formatUnits(averageRaw, decimals);
  const averageRewardValue = rewardSumValue / total;
  const averageEnergy = energySamples > 0 ? energySum / energySamples : 0;
  const rewardPerEnergy =
    rewardPerEnergySamples > 0
      ? rewardPerEnergySum / rewardPerEnergySamples
      : 0;
  const successRate = successCount / total;
  const energyFactor = energySamples > 0 ? 1 / (1 + averageEnergy / 1000) : 1;
  const rewardFactor =
    rewardPerEnergy > 0 ? Math.log10(1 + rewardPerEnergy) : 0;
  const efficiencyScore = successRate * energyFactor * rewardFactor;

  const categoryBreakdown: Record<string, CategoryStats> = {};
  for (const data of categories.values()) {
    const categoryAvgRaw =
      data.total > 0 ? data.rewardSumRaw / BigInt(data.total) : 0n;
    const categoryAverageReward = ethers.formatUnits(categoryAvgRaw, decimals);
    const categoryAverageRewardValue =
      data.total > 0 ? data.rewardSumValue / data.total : 0;
    const categoryAverageEnergy =
      data.energySamples > 0 ? data.energySum / data.energySamples : 0;
    const categoryRewardPerEnergy =
      data.rewardPerEnergySamples > 0
        ? data.rewardPerEnergySum / data.rewardPerEnergySamples
        : 0;
    const categorySuccessRate = data.total > 0 ? data.success / data.total : 0;
    const categoryEnergyFactor =
      data.energySamples > 0 ? 1 / (1 + categoryAverageEnergy / 1000) : 1;
    const categoryRewardFactor =
      categoryRewardPerEnergy > 0 ? Math.log10(1 + categoryRewardPerEnergy) : 0;
    const categoryEfficiency =
      categorySuccessRate * categoryEnergyFactor * categoryRewardFactor;
    categoryBreakdown[data.label] = {
      total: data.total,
      successRate: round(categorySuccessRate),
      averageReward: categoryAverageReward,
      averageRewardValue: round(categoryAverageRewardValue),
      averageEnergy: round(categoryAverageEnergy),
      rewardPerEnergy: round(categoryRewardPerEnergy),
      efficiencyScore: round(categoryEfficiency),
    };
  }

  return {
    total,
    successRate: round(successRate),
    averageReward,
    averageRewardValue: round(averageRewardValue),
    averageEnergy: round(averageEnergy),
    rewardPerEnergy: round(rewardPerEnergy),
    efficiencyScore: round(efficiencyScore),
    energySamples,
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
  entries: JobOutcomeEntry[],
  jobRecords: TrainingRecord[],
  entry: ModelRegistryEntry | undefined,
  registry: ModelRegistry
): Promise<boolean> {
  const stats = computeAgentStats(entries);
  if (stats.total === 0) {
    console.log(`Skipping ${agentId}: no completed jobs recorded.`);
    return false;
  }

  const version = (entry?.version ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const modelPath = path.join(MODELS_DIR, `${agentId}-${version}.json`);

  const rewardPerEnergySamples = entries.filter(
    (entry) => typeof entry.efficiency.rewardPerEnergy === 'number'
  ).length;

  const weights = {
    successBias: stats.successRate,
    rewardWeight: stats.averageRewardValue,
    energyPenalty: stats.averageEnergy,
    efficiencyWeight: stats.rewardPerEnergy,
    baseline: round(stats.successRate * stats.rewardPerEnergy),
  };

  const featureSummary = {
    samples: stats.total,
    energySamples: stats.energySamples,
    rewardPerEnergySamples,
  };

  const modelPayload = {
    agent: agentId,
    version,
    trainedAt: timestamp,
    metrics: stats,
    weights,
    featureSummary,
  };

  await fs.promises.writeFile(modelPath, JSON.stringify(modelPayload, null, 2));

  const sandboxTests = loadSandboxTests();
  const sandboxResults = evaluateSandbox(jobRecords, sandboxTests, {
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
  const dataset = await collectJobOutcomeDataset();
  if (dataset.records.length === 0) {
    console.log('No training records available.');
    return;
  }

  const registry = loadRegistry();
  const grouped = groupEntriesByAgent(dataset.records);
  let updated = false;

  for (const [agentId, agentEntries] of grouped.entries()) {
    const entry = registry[agentId];
    const newCount = getNewRecordCount(entry, agentEntries.length);
    if (newCount < MIN_NEW_RECORDS) {
      continue;
    }
    const agentJobRecords = agentEntries.map(
      (entry) => entry.record as TrainingRecord
    );
    const changed = await processAgent(
      agentId,
      agentEntries,
      agentJobRecords,
      entry,
      registry
    );
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
