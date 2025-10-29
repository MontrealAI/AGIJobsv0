import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RewardConfig, JobOutcome, JobDefinition, AgentProfile, OwnerControlState } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadJsonFile<T>(relativePath: string): Promise<T> {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(__dirname, '..', relativePath);
  const data = await readFile(absolutePath, 'utf8');
  return JSON.parse(data) as T;
}

export async function loadRewardConfig(overrides?: Partial<RewardConfig>): Promise<RewardConfig> {
  const base = await loadJsonFile<RewardConfig>('config/reward-config.json');
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

export function composeStateId(job: JobDefinition): string {
  const normalizedCategory = job.category.toLowerCase().replace(/\s+/g, '-');
  const complexityBucket = Math.ceil(job.complexity / 2);
  const experienceBucket = Math.round(job.experienceRequired * 4);
  return `${normalizedCategory}|c${complexityBucket}|e${experienceBucket}`;
}

export function composeActionId(agent: AgentProfile): string {
  return agent.id;
}

export function calculateSustainabilityPenalty(agent: AgentProfile, job: JobDefinition): number {
  const overshoot = Math.max(0, agent.energyFootprint - job.sustainabilityTarget);
  return overshoot;
}

export function calculateReward(
  config: RewardConfig,
  job: JobDefinition,
  outcome: JobOutcome,
  agent: AgentProfile,
): number {
  const successTerm = outcome.success ? config.successBonus : config.failurePenalty;
  const gmvTerm = config.gmvWeight * Math.log1p(outcome.valueCaptured);
  const latencyRatio = outcome.durationHours / Math.max(config.latencyReferenceHours, 1e-3);
  const latencyTerm = config.latencyWeight * latencyRatio;
  const costTerm = config.costWeight * (outcome.cost / Math.max(outcome.rewardPaid, 1e-3));
  const ratingTerm = config.ratingWeight * (outcome.rating / 5 - 0.5) * 2;
  const sustainabilityPenalty = config.sustainabilityWeight * calculateSustainabilityPenalty(agent, job);
  return successTerm + gmvTerm + latencyTerm + costTerm + ratingTerm + sustainabilityPenalty;
}

export async function loadOwnerControls(pathToFile: string): Promise<OwnerControlState> {
  return loadJsonFile<OwnerControlState>(pathToFile);
}

export async function updateOwnerControls(
  pathToFile: string,
  transform: (current: OwnerControlState) => OwnerControlState,
): Promise<OwnerControlState> {
  const current = await loadOwnerControls(pathToFile);
  const updated = transform(current);
  const absolutePath = path.isAbsolute(pathToFile) ? pathToFile : path.join(__dirname, '..', pathToFile);
  await fsWriteJson(absolutePath, updated);
  return updated;
}

async function fsWriteJson(filePath: string, data: unknown): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filePath, `${serialized}\n`, 'utf8'));
}
