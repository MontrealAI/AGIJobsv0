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
  evaluateSandbox,
  loadSandboxTests,
  SandboxResult,
} from '../utils/sandbox';
import {
  getSpawnRequests as loadSpawnRequests,
  consumeSpawnRequest,
  type SpawnRequest,
} from '../../shared/spawnManager';

interface AgentDefinition {
  address: string;
  energy?: number;
  efficiencyScore?: number;
  [key: string]: unknown;
}

type AgentsConfig = Record<string, AgentDefinition[]>;

interface CategoryDemand {
  total: number;
  success: number;
  rewardSum: bigint;
  decimals: number;
  agents: Set<string>;
}

interface AgentCategorySummary {
  key: string;
  label: string;
  total: number;
  successRate: number;
  averageReward: number;
  averageEnergy: number;
  rewardPerEnergy: number;
  efficiencyScore: number;
}

interface AgentSummary {
  address: string;
  total: number;
  successRate: number;
  averageReward: number;
  averageEnergy: number;
  rewardPerEnergy: number;
  efficiencyScore: number;
  energySamples: number;
  categories: Map<string, AgentCategorySummary>;
}

interface BaseAgentCandidate {
  address: string;
  category: string;
  definition: AgentDefinition;
  summary: AgentSummary;
  score: number;
}

interface NichePerformanceSummary {
  entries: JobOutcomeEntry[];
  samples: number;
  successRate: number;
  averageReward: number;
  averageEnergy: number;
  rewardPerEnergy: number;
}

const CONFIG_PATH =
  process.env.AGENT_CONFIG_PATH ||
  path.resolve(__dirname, '../../config/agents.json');
const MIN_TASKS = Number(process.env.SPAWN_MIN_TASKS || '15');
const MIN_SUCCESS_RATE = Number(process.env.SPAWN_MIN_SUCCESS_RATE || '0.65');
const MAX_AGENTS_PER_CATEGORY = Number(process.env.SPAWN_MAX_AGENTS || '3');
const DRY_RUN = process.argv.includes('--dry-run');
const NICHE_OBSERVATION_THRESHOLD = Number(
  process.env.SPAWN_NICHE_THRESHOLD || '3'
);
const BASE_AGENT_MIN_SAMPLES = Number(
  process.env.SPAWN_BASE_AGENT_MIN_SAMPLES || '10'
);
const BASE_AGENT_MIN_SUCCESS_RATE = Number(
  process.env.SPAWN_BASE_AGENT_MIN_SUCCESS || '0.55'
);

function loadAgentsConfig(): AgentsConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as AgentsConfig;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function saveAgentsConfig(config: AgentsConfig): void {
  const sortedKeys = Object.keys(config).sort();
  const sorted: AgentsConfig = {};
  for (const key of sortedKeys) {
    sorted[key] = config[key];
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sorted, null, 2));
}

function computeCategoryDemand(
  records: TrainingRecord[]
): Map<string, CategoryDemand> {
  const result = new Map<string, CategoryDemand>();
  for (const record of records) {
    if (record.kind !== 'job') continue;
    const category = resolveCategory(record);
    if (!category) continue;
    if (!result.has(category)) {
      result.set(category, {
        total: 0,
        success: 0,
        rewardSum: 0n,
        decimals: record.reward?.decimals ?? 18,
        agents: new Set<string>(),
      });
    }
    const entry = result.get(category)!;
    entry.total += 1;
    if (record.success) entry.success += 1;
    if (record.reward) {
      entry.rewardSum += BigInt(record.reward.posted.raw || '0');
      if (typeof record.reward.decimals === 'number') {
        entry.decimals = record.reward.decimals;
      }
    }
    if (record.agent) {
      entry.agents.add(record.agent.toLowerCase());
    }
  }
  return result;
}

async function logSandbox(
  agent: string,
  category: string,
  results: SandboxResult[],
  metadata: Record<string, unknown> = {}
): Promise<void> {
  for (const result of results) {
    await appendTrainingRecord({
      kind: 'sandbox',
      jobId: `sandbox:${agent}:${result.id}`,
      recordedAt: result.timestamp,
      agent,
      category,
      success: result.passed,
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
        mode: 'spawn',
        ...metadata,
      },
    });
  }
}

function estimateEnergy(successRate: number): number {
  const score = 50 + successRate * 50;
  return Math.min(100, Math.max(1, Math.round(score)));
}

function normaliseCategoryName(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function buildCategoryIndex(config: AgentsConfig): Map<string, string> {
  const index = new Map<string, string>();
  for (const key of Object.keys(config)) {
    index.set(normaliseCategoryName(key), key);
  }
  return index;
}

function resolveCategoryKey(
  index: Map<string, string>,
  category: string
): string {
  const normalised = normaliseCategoryName(category);
  return index.get(normalised) ?? category;
}

function getCategoryAgents(
  config: AgentsConfig,
  index: Map<string, string>,
  category: string
): AgentDefinition[] | undefined {
  const key = index.get(normaliseCategoryName(category));
  return key ? config[key] : undefined;
}

function registerCategory(index: Map<string, string>, category: string): void {
  const key = normaliseCategoryName(category);
  if (!index.has(key)) {
    index.set(key, category);
  }
}

function buildAgentIndex(
  config: AgentsConfig
): Map<string, { category: string; definition: AgentDefinition }> {
  const index = new Map<
    string,
    { category: string; definition: AgentDefinition }
  >();
  for (const [category, agents] of Object.entries(config)) {
    for (const agent of agents) {
      if (!agent.address) continue;
      index.set(agent.address.toLowerCase(), { category, definition: agent });
    }
  }
  return index;
}

function groupEntriesByAgent(
  entries: JobOutcomeEntry[]
): Map<string, JobOutcomeEntry[]> {
  const grouped = new Map<string, JobOutcomeEntry[]>();
  for (const entry of entries) {
    const agent = entry.record.agent;
    if (!agent) continue;
    const key = agent.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(entry);
  }
  return grouped;
}

function summariseAgentEntries(
  agentKey: string,
  entries: JobOutcomeEntry[]
): AgentSummary {
  const address = entries[0]?.record.agent ?? agentKey;
  let successCount = 0;
  let rewardSum = 0;
  let energySum = 0;
  let energySamples = 0;
  let rewardPerEnergySum = 0;
  let rewardPerEnergySamples = 0;

  interface MutableCategory {
    label: string;
    total: number;
    success: number;
    rewardSum: number;
    energySum: number;
    energySamples: number;
    rewardPerEnergySum: number;
    rewardPerEnergySamples: number;
  }

  const categories = new Map<string, MutableCategory>();

  for (const entry of entries) {
    if (entry.record.success) {
      successCount += 1;
    }
    rewardSum += entry.rewardValue;
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

    const resolvedCategory =
      entry.category ?? resolveCategory(entry.record) ?? 'Uncategorized';
    const key = normaliseCategoryName(resolvedCategory) || 'uncategorized';
    if (!categories.has(key)) {
      categories.set(key, {
        label: resolvedCategory,
        total: 0,
        success: 0,
        rewardSum: 0,
        energySum: 0,
        energySamples: 0,
        rewardPerEnergySum: 0,
        rewardPerEnergySamples: 0,
      });
    }
    const categoryData = categories.get(key)!;
    categoryData.total += 1;
    if (entry.record.success) {
      categoryData.success += 1;
    }
    categoryData.rewardSum += entry.rewardValue;
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

  const total = entries.length;
  const successRate = total > 0 ? successCount / total : 0;
  const averageReward = total > 0 ? rewardSum / total : 0;
  const averageEnergy = energySamples > 0 ? energySum / energySamples : 0;
  const rewardPerEnergy =
    rewardPerEnergySamples > 0
      ? rewardPerEnergySum / rewardPerEnergySamples
      : 0;
  const energyFactor = energySamples > 0 ? 1 / (1 + averageEnergy / 1000) : 1;
  const rewardFactor =
    rewardPerEnergy > 0 ? Math.log10(1 + rewardPerEnergy) : 0;
  const efficiencyScore = successRate * energyFactor * rewardFactor;

  const categorySummaries = new Map<string, AgentCategorySummary>();
  for (const [key, data] of categories.entries()) {
    const categorySuccessRate = data.total > 0 ? data.success / data.total : 0;
    const categoryAverageReward =
      data.total > 0 ? data.rewardSum / data.total : 0;
    const categoryAverageEnergy =
      data.energySamples > 0 ? data.energySum / data.energySamples : 0;
    const categoryRewardPerEnergy =
      data.rewardPerEnergySamples > 0
        ? data.rewardPerEnergySum / data.rewardPerEnergySamples
        : 0;
    const categoryEnergyFactor =
      data.energySamples > 0 ? 1 / (1 + categoryAverageEnergy / 1000) : 1;
    const categoryRewardFactor =
      categoryRewardPerEnergy > 0 ? Math.log10(1 + categoryRewardPerEnergy) : 0;
    const categoryEfficiency =
      categorySuccessRate * categoryEnergyFactor * categoryRewardFactor;
    categorySummaries.set(key, {
      key,
      label: data.label,
      total: data.total,
      successRate: categorySuccessRate,
      averageReward: categoryAverageReward,
      averageEnergy: categoryAverageEnergy,
      rewardPerEnergy: categoryRewardPerEnergy,
      efficiencyScore: categoryEfficiency,
    });
  }

  return {
    address,
    total,
    successRate,
    averageReward,
    averageEnergy,
    rewardPerEnergy,
    efficiencyScore,
    energySamples,
    categories: categorySummaries,
  };
}

function selectBaseAgentCandidate(
  entries: JobOutcomeEntry[],
  config: AgentsConfig
): BaseAgentCandidate | null {
  const grouped = groupEntriesByAgent(entries);
  if (grouped.size === 0) return null;
  const agentIndex = buildAgentIndex(config);
  let best: BaseAgentCandidate | null = null;

  for (const [agentKey, agentEntries] of grouped.entries()) {
    const indexEntry = agentIndex.get(agentKey);
    if (!indexEntry) continue;
    const summary = summariseAgentEntries(agentKey, agentEntries);
    if (
      summary.total < BASE_AGENT_MIN_SAMPLES ||
      summary.successRate < BASE_AGENT_MIN_SUCCESS_RATE ||
      summary.efficiencyScore <= 0
    ) {
      continue;
    }
    const definition: AgentDefinition = {
      ...indexEntry.definition,
      metadata: indexEntry.definition.metadata
        ? { ...indexEntry.definition.metadata }
        : undefined,
    };
    const score = summary.efficiencyScore * Math.log1p(summary.total);
    if (!best || score > best.score) {
      best = {
        address: summary.address,
        category: indexEntry.category,
        definition,
        summary,
        score,
      };
    }
  }

  return best;
}

function summariseNichePerformance(
  entries: JobOutcomeEntry[],
  request: SpawnRequest
): NichePerformanceSummary | null {
  const jobIdSet = new Set((request.jobs ?? []).map((job) => job.toString()));
  let relevant = entries.filter((entry) =>
    jobIdSet.has(entry.record.jobId.toString())
  );
  if (relevant.length === 0) {
    const categoryKey = normaliseCategoryName(request.category);
    relevant = entries.filter(
      (entry) =>
        normaliseCategoryName(
          entry.category ?? resolveCategory(entry.record)
        ) === categoryKey
    );
  }
  if (relevant.length === 0) {
    return null;
  }

  const samples = relevant.length;
  const success = relevant.filter((entry) => entry.record.success).length;
  const successRate = samples > 0 ? success / samples : 0;
  const averageReward =
    relevant.reduce((total, entry) => total + entry.rewardValue, 0) / samples;
  const energyValues = relevant
    .map((entry) => entry.efficiency.energyEstimate)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value)
    );
  const averageEnergy =
    energyValues.length > 0
      ? energyValues.reduce((total, value) => total + value, 0) /
        energyValues.length
      : 0;
  const rewardPerEnergyValues = relevant
    .map((entry) => entry.efficiency.rewardPerEnergy)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value)
    );
  const rewardPerEnergy =
    rewardPerEnergyValues.length > 0
      ? rewardPerEnergyValues.reduce((total, value) => total + value, 0) /
        rewardPerEnergyValues.length
      : 0;

  return {
    entries: relevant,
    samples,
    successRate,
    averageReward,
    averageEnergy,
    rewardPerEnergy,
  };
}

async function main(): Promise<void> {
  const dataset = await collectJobOutcomeDataset();
  const jobEntries = dataset.records;
  if (jobEntries.length === 0) {
    console.log('No task history available to evaluate.');
    return;
  }

  const jobRecords = jobEntries.map((entry) => entry.record as TrainingRecord);
  const pendingRequests = await loadSpawnRequests();
  const pendingCategories = new Set(
    pendingRequests.map((request) => normaliseCategoryName(request.category))
  );

  const config = loadAgentsConfig();
  const categoryIndex = buildCategoryIndex(config);
  const sandboxTests = loadSandboxTests();
  const createdAgents: AgentDefinition[] = [];
  const processedCategories = new Set<string>();

  const cloneRequests = pendingRequests
    .filter((request) => request.observed >= NICHE_OBSERVATION_THRESHOLD)
    .filter((request) => {
      const agents = getCategoryAgents(config, categoryIndex, request.category);
      return !agents || agents.length === 0;
    });

  if (cloneRequests.length > 0) {
    const baseCandidate = selectBaseAgentCandidate(jobEntries, config);
    if (!baseCandidate) {
      console.warn(
        'No eligible base agent available to clone for niche categories.'
      );
    } else {
      cloneRequests.sort((a, b) => b.observed - a.observed);
      for (const request of cloneRequests) {
        const normalized = normaliseCategoryName(request.category);
        const nicheSummary = summariseNichePerformance(jobEntries, request);
        if (!nicheSummary) {
          console.warn(
            `Insufficient training data to sandbox niche category ${request.category}; skipping.`
          );
          continue;
        }

        const wallet = ethers.Wallet.createRandom();
        const syntheticRecords = nicheSummary.entries.map(
          (entry) =>
            ({
              ...entry.record,
              agent: wallet.address,
            } as TrainingRecord)
        );
        const sandboxResults = evaluateSandbox(syntheticRecords, sandboxTests, {
          agentId: wallet.address,
          category: request.category,
        });
        await logSandbox(wallet.address, request.category, sandboxResults, {
          mode: 'spawn-clone',
          prototype: baseCandidate.address,
          spawnReason: 'niche-recurring',
          observedJobs: request.observed,
          sampleSize: nicheSummary.samples,
          successRate: Number(nicheSummary.successRate.toFixed(4)),
          averageReward: Number(nicheSummary.averageReward.toFixed(4)),
          averageEnergy: Number(nicheSummary.averageEnergy.toFixed(4)),
          rewardPerEnergy: Number(nicheSummary.rewardPerEnergy.toFixed(4)),
          baseAgentSuccessRate: Number(
            baseCandidate.summary.successRate.toFixed(4)
          ),
          baseAgentEfficiency: Number(
            baseCandidate.summary.efficiencyScore.toFixed(4)
          ),
          baseAgentAverageReward: Number(
            baseCandidate.summary.averageReward.toFixed(4)
          ),
        });
        const allPassed = sandboxResults.every((result) => result.passed);
        if (!allPassed) {
          console.warn(
            `Sandbox checks failed for cloned agent ${wallet.address} in ${request.category}; skipping deployment.`
          );
          continue;
        }

        const baseMetadata = baseCandidate.definition.metadata
          ? { ...baseCandidate.definition.metadata }
          : {};

        const agentEntry: AgentDefinition = {
          ...baseCandidate.definition,
          address: wallet.address,
          efficiencyScore: Number(
            baseCandidate.summary.efficiencyScore.toFixed(6)
          ),
          metadata: {
            ...baseMetadata,
            mode: 'spawn-clone',
            prototype: baseCandidate.address,
            spawnedAt: new Date().toISOString(),
            spawnReason: 'niche-recurring',
            observedJobs: request.observed,
            sampleSize: nicheSummary.samples,
            successRate: Number(nicheSummary.successRate.toFixed(4)),
            averageReward: Number(nicheSummary.averageReward.toFixed(4)),
            averageEnergy: Number(nicheSummary.averageEnergy.toFixed(4)),
            rewardPerEnergy: Number(nicheSummary.rewardPerEnergy.toFixed(4)),
            nicheCategory: request.category,
            baseCategory: baseCandidate.category,
            source: 'spawn-script',
          },
        };

        const categoryKey = resolveCategoryKey(categoryIndex, request.category);
        if (!config[categoryKey]) {
          config[categoryKey] = [];
          registerCategory(categoryIndex, categoryKey);
        }
        config[categoryKey].push(agentEntry);
        createdAgents.push(agentEntry);
        processedCategories.add(normalized);
        pendingCategories.delete(normalized);

        if (!DRY_RUN) {
          await consumeSpawnRequest(request.category).catch((err) =>
            console.warn(
              'Failed to clear niche spawn request for category',
              request.category,
              err
            )
          );
        }

        console.log(
          `Cloned base agent ${baseCandidate.address} into ${wallet.address} for ${request.category} (${request.observed} observations).`
        );
      }
    }
  }

  const demand = computeCategoryDemand(jobRecords);

  for (const [category, stats] of demand.entries()) {
    const normalizedCategory = normaliseCategoryName(category);
    if (processedCategories.has(normalizedCategory)) {
      continue;
    }

    const successRate = stats.total > 0 ? stats.success / stats.total : 0;
    const existingCount =
      getCategoryAgents(config, categoryIndex, category)?.length ?? 0;

    if (stats.total < MIN_TASKS) {
      continue;
    }
    if (successRate < MIN_SUCCESS_RATE) {
      continue;
    }
    if (existingCount >= MAX_AGENTS_PER_CATEGORY) {
      continue;
    }

    const wallet = ethers.Wallet.createRandom();
    const sandboxResults = evaluateSandbox(jobRecords, sandboxTests, {
      category,
    });
    await logSandbox(wallet.address, category, sandboxResults, {
      mode: 'spawn-specialist',
    });
    const allPassed = sandboxResults.every((result) => result.passed);
    if (!allPassed) {
      console.warn(
        `Sandbox checks failed for proposed agent ${wallet.address} in ${category}; skipping.`
      );
      continue;
    }

    const averageRaw =
      stats.total > 0 ? stats.rewardSum / BigInt(stats.total) : 0n;
    const averageReward = Number(
      ethers.formatUnits(averageRaw, stats.decimals)
    );
    const agentEntry: AgentDefinition = {
      address: wallet.address,
      energy: estimateEnergy(successRate),
      metadata: {
        category,
        spawnedAt: new Date().toISOString(),
        successRate: Number(successRate.toFixed(4)),
        averageReward,
        source: 'spawn-script',
        samples: stats.total,
      },
    };

    const categoryKey = resolveCategoryKey(categoryIndex, category);
    if (!config[categoryKey]) {
      config[categoryKey] = [];
      registerCategory(categoryIndex, categoryKey);
    }
    config[categoryKey].push(agentEntry);
    createdAgents.push(agentEntry);
    console.log(
      `Prepared specialized agent ${wallet.address} for ${category} (success ${(
        successRate * 100
      ).toFixed(1)}% avg reward ${averageReward.toFixed(2)})`
    );

    if (!DRY_RUN && pendingCategories.has(normalizedCategory)) {
      await consumeSpawnRequest(category).catch((err) =>
        console.warn(
          'Failed to clear spawn request for category',
          category,
          err
        )
      );
      pendingCategories.delete(normalizedCategory);
    }
  }

  if (createdAgents.length === 0) {
    console.log('No new agents spawned.');
    return;
  }

  if (DRY_RUN) {
    console.log('Dry run enabled; configuration was not updated.');
    return;
  }

  saveAgentsConfig(config);
  console.log(`Registered ${createdAgents.length} new agent(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
