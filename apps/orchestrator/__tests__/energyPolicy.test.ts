import { strict as assert } from 'assert';
import { EnergyPolicy, type EnergyPolicyOptions } from '../energyPolicy';
import type {
  EnergyInsightsSnapshot,
  AgentEnergyInsight,
  JobEnergyInsight,
} from '../../../shared/energyInsights';

function createAgentInsight(
  overrides: Partial<AgentEnergyInsight>
): AgentEnergyInsight {
  return {
    agent: overrides.agent ?? 'agent',
    jobCount: overrides.jobCount ?? 1,
    sampleCount: overrides.sampleCount ?? 1,
    totalEnergy: overrides.totalEnergy ?? 100,
    averageEnergy: overrides.averageEnergy ?? 100,
    totalReward: overrides.totalReward ?? 100,
    averageEfficiency: overrides.averageEfficiency ?? 0.5,
    efficiencyScore:
      overrides.efficiencyScore ?? overrides.averageEfficiency ?? 0.5,
    anomalyRate: overrides.anomalyRate ?? 0.1,
    lastUpdated: overrides.lastUpdated ?? new Date().toISOString(),
  };
}

function createJobInsight(
  overrides: Partial<JobEnergyInsight>
): JobEnergyInsight {
  return {
    jobId: overrides.jobId ?? '1',
    agent: overrides.agent ?? 'agent',
    category: overrides.category,
    samples: overrides.samples ?? 1,
    totalEnergy: overrides.totalEnergy ?? 100,
    averageEnergy: overrides.averageEnergy ?? 100,
    averageCpuTimeMs: overrides.averageCpuTimeMs ?? 50,
    averageGpuTimeMs: overrides.averageGpuTimeMs ?? 0,
    averageWallTimeMs: overrides.averageWallTimeMs ?? 60,
    averageCpuCycles: overrides.averageCpuCycles ?? 1_000,
    averageGpuCycles: overrides.averageGpuCycles ?? 0,
    averageGpuUtilization: overrides.averageGpuUtilization ?? 0,
    rewardValue: overrides.rewardValue ?? 80,
    efficiencyScore: overrides.efficiencyScore ?? 0.4,
    anomalyRate: overrides.anomalyRate ?? 0.1,
    anomalyCount: overrides.anomalyCount ?? 1,
    lastUpdated: overrides.lastUpdated ?? new Date().toISOString(),
  };
}

const now = new Date().toISOString();

const snapshot: EnergyInsightsSnapshot = {
  agents: {
    '0xagent1': createAgentInsight({
      agent: '0xagent1',
      jobCount: 2,
      sampleCount: 2,
      totalEnergy: 220,
      averageEnergy: 110,
      totalReward: 180,
      averageEfficiency: 0.45,
      efficiencyScore: 0.45,
      anomalyRate: 0.05,
      lastUpdated: now,
    }),
    '0xagent2': createAgentInsight({
      agent: '0xagent2',
      jobCount: 1,
      sampleCount: 1,
      totalEnergy: 80,
      averageEnergy: 80,
      totalReward: 120,
      averageEfficiency: 0.6,
      efficiencyScore: 0.6,
      anomalyRate: 0.12,
      lastUpdated: now,
    }),
  },
  jobs: {
    '0xagent1': {
      '1': createJobInsight({
        jobId: '1',
        agent: '0xagent1',
        category: 'finance',
        averageEnergy: 120,
        efficiencyScore: 0.42,
        anomalyRate: 0.05,
        lastUpdated: now,
      }),
      '2': createJobInsight({
        jobId: '2',
        agent: '0xagent1',
        category: 'finance',
        averageEnergy: 100,
        efficiencyScore: 0.48,
        anomalyRate: 0.02,
        lastUpdated: new Date(Date.now() - 60_000).toISOString(),
      }),
    },
    '0xagent2': {
      '3': createJobInsight({
        jobId: '3',
        agent: '0xagent2',
        category: 'research',
        averageEnergy: 80,
        efficiencyScore: 0.6,
        anomalyRate: 0.1,
        lastUpdated: now,
      }),
    },
  },
  updatedAt: now,
};

const options: EnergyPolicyOptions = {
  snapshotProvider: () => snapshot,
  lookbackJobs: 10,
  refreshIntervalMs: 1,
  energyCeiling: 500,
  efficiencyFloor: 0.05,
  baseProfitMargin: 0.08,
  maxProfitMargin: 1,
  energyStdMultiplier: 1,
  efficiencyStdMultiplier: 0.5,
};

const policy = new EnergyPolicy(options);

const finance = policy.getThresholds('Finance');
assert(finance, 'finance thresholds should exist');
assert.equal(finance?.category, 'finance');
assert.equal(finance?.source, 'category');
assert.equal(finance?.dataPoints, 2);
assert(finance!.maxEnergyScore <= 500, 'max energy respects ceiling');
assert(
  finance!.minEfficiencyScore >= 0.05,
  'minimum efficiency should respect floor'
);
assert(
  finance!.recommendedProfitMargin >= options.baseProfitMargin!,
  'profit margin should not fall below base'
);

const fallback = policy.getThresholds('nonexistent');
assert(fallback, 'fallback thresholds should exist');
assert.equal(fallback?.source, 'global');
assert(fallback!.dataPoints >= 3, 'global fallback should include all jobs');

policy.setBaseProfitMargin(0.2);
const updated = policy.getThresholds('finance');
assert(updated, 'updated thresholds should exist');
assert(
  updated!.recommendedProfitMargin >= 0.2,
  'updated base margin should influence recommendation'
);

console.log('energyPolicy tests passed');
