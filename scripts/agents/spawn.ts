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
  evaluateSandbox,
  loadSandboxTests,
  SandboxResult,
} from '../utils/sandbox';

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

const CONFIG_PATH =
  process.env.AGENT_CONFIG_PATH ||
  path.resolve(__dirname, '../../config/agents.json');
const MIN_TASKS = Number(process.env.SPAWN_MIN_TASKS || '15');
const MIN_SUCCESS_RATE = Number(process.env.SPAWN_MIN_SUCCESS_RATE || '0.65');
const MAX_AGENTS_PER_CATEGORY = Number(process.env.SPAWN_MAX_AGENTS || '3');
const DRY_RUN = process.argv.includes('--dry-run');

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
  results: SandboxResult[]
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
      },
    });
  }
}

function estimateEnergy(successRate: number): number {
  const score = 50 + successRate * 50;
  return Math.min(100, Math.max(1, Math.round(score)));
}

async function main(): Promise<void> {
  const records = await readTrainingRecords();
  const jobRecords = records.filter((record) => record.kind === 'job');
  if (jobRecords.length === 0) {
    console.log('No task history available to evaluate.');
    return;
  }

  const config = loadAgentsConfig();
  const demand = computeCategoryDemand(jobRecords);
  const sandboxTests = loadSandboxTests();
  const createdAgents: AgentDefinition[] = [];

  for (const [category, stats] of demand.entries()) {
    const successRate = stats.total > 0 ? stats.success / stats.total : 0;
    const existingCount = config[category]?.length ?? 0;

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
    await logSandbox(wallet.address, category, sandboxResults);
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

    if (!config[category]) {
      config[category] = [];
    }
    config[category].push(agentEntry);
    createdAgents.push(agentEntry);
    console.log(
      `Prepared specialized agent ${wallet.address} for ${category} (success ${(
        successRate * 100
      ).toFixed(1)}% avg reward ${averageReward.toFixed(2)})`
    );
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
