import fs from 'node:fs/promises';
import path from 'node:path';
import { ScenarioConfig, RewardWeights, PolicyConfig } from './types';

const DEFAULT_POLICY: PolicyConfig = {
  learningRate: 0.12,
  batchSize: 12,
  experienceWindow: 384,
  explorationEpsilon: 0.12,
  temperature: 0.9,
  entropyWeight: 0.015
};

export async function loadScenario(scenarioPath: string): Promise<ScenarioConfig> {
  const resolved = path.resolve(scenarioPath);
  const content = await fs.readFile(resolved, 'utf8');
  const parsed = JSON.parse(content) as ScenarioConfig;
  parsed.policy = { ...DEFAULT_POLICY, ...(parsed.policy ?? {}) };
  return parsed;
}

export async function loadRewardWeights(defaultPath: string, overrides?: Partial<RewardWeights>): Promise<RewardWeights> {
  const resolved = path.resolve(defaultPath);
  const content = await fs.readFile(resolved, 'utf8');
  const base = JSON.parse(content) as RewardWeights;
  return { ...base, ...(overrides ?? {}) };
}
