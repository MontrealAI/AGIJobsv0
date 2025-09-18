import { expect } from 'chai';

import {
  computeEnergyTrends,
  type AgentEnergyTrend,
} from '../../agent-gateway/energyTrends';
import type { EnergyMetricRecord } from '../../agent-gateway/telemetry';

const BASE_TIME = Date.parse('2024-01-01T12:00:00.000Z');

interface RecordOptions {
  agent: string;
  jobId: string;
  offsetMinutes: number;
  energy: number;
  efficiency?: number;
  success?: boolean;
  anomalies?: string[];
}

function createRecord(options: RecordOptions): EnergyMetricRecord {
  const {
    agent,
    jobId,
    offsetMinutes,
    energy,
    efficiency = 0.5,
    success = true,
    anomalies = [],
  } = options;
  const timestamp = BASE_TIME + offsetMinutes * 60 * 1000;
  const start = new Date(timestamp - 60_000).toISOString();
  const end = new Date(timestamp).toISOString();
  return {
    jobId,
    agent,
    startedAt: start,
    finishedAt: end,
    wallTimeMs: 60_000,
    cpuTimeMs: 1_200,
    cpuUserUs: 1_000,
    cpuSystemUs: 200,
    cpuCount: 4,
    inputSizeBytes: 1_024,
    outputSizeBytes: 512,
    estimatedOperations: 10_000,
    algorithmicComplexity: 'O(n)',
    loadAverageStart: [0.1, 0.1, 0.1],
    loadAverageEnd: [0.2, 0.2, 0.2],
    invocationSuccess: success,
    metadata: {},
    spanId: `span-${jobId}`,
    jobSuccess: success,
    energyEstimate: energy,
    gpuTimeMs: 0,
    memoryRssBytes: 0,
    rewardValue: 5,
    efficiencyScore: efficiency,
    loadAverageDelta: [0.1, 0.1, 0.1],
    entropyEstimate: 0.01,
    anomalies,
    anomalyScore: anomalies.length > 0 ? anomalies.length : undefined,
  };
}

function trendByAgent(trends: AgentEnergyTrend[], agent: string): AgentEnergyTrend {
  const entry = trends.find((trend) => trend.agent === agent.toLowerCase());
  if (!entry) {
    throw new Error(`Trend not found for ${agent}`);
  }
  return entry;
}

describe('energy trends analysis', () => {
  const now = BASE_TIME + 5 * 60 * 1000;
  it('classifies agent trajectories using slope and efficiency', () => {
    const records: EnergyMetricRecord[] = [
      createRecord({
        agent: '0xAAA',
        jobId: 'a-1',
        offsetMinutes: -240,
        energy: 150,
        efficiency: 0.4,
        success: true,
      }),
      createRecord({
        agent: '0xAAA',
        jobId: 'a-2',
        offsetMinutes: -120,
        energy: 120,
        efficiency: 0.55,
        success: true,
      }),
      createRecord({
        agent: '0xAAA',
        jobId: 'a-3',
        offsetMinutes: -60,
        energy: 90,
        efficiency: 0.7,
        success: false,
        anomalies: ['cpu_spike'],
      }),
      createRecord({
        agent: '0xBBB',
        jobId: 'b-1',
        offsetMinutes: -180,
        energy: 60,
        efficiency: 0.8,
        success: true,
      }),
      createRecord({
        agent: '0xBBB',
        jobId: 'b-2',
        offsetMinutes: -90,
        energy: 72,
        efficiency: 0.75,
        success: true,
      }),
      createRecord({
        agent: '0xBBB',
        jobId: 'b-3',
        offsetMinutes: -15,
        energy: 95,
        efficiency: 0.7,
        success: true,
        anomalies: ['gpu_hot'],
      }),
      createRecord({
        agent: '0xCCC',
        jobId: 'c-1',
        offsetMinutes: -120,
        energy: 40,
        efficiency: 0.65,
        success: true,
      }),
      createRecord({
        agent: '0xCCC',
        jobId: 'c-2',
        offsetMinutes: -60,
        energy: 42,
        efficiency: 0.66,
        success: true,
      }),
      createRecord({
        agent: '0xCCC',
        jobId: 'c-3',
        offsetMinutes: -30,
        energy: 41,
        efficiency: 0.67,
        success: true,
      }),
    ];

    const trends = computeEnergyTrends(records, {
      slopeThreshold: 5,
      lookbackMs: 6 * 60 * 60 * 1000,
      now,
    });

    const improving = trendByAgent(trends, '0xAAA');
    expect(improving.direction).to.equal('improving');
    expect(improving.energyDelta).to.be.below(0);
    expect(improving.slopePerHour).to.be.below(0);
    expect(improving.anomalyRate).to.be.closeTo(1 / 3, 0.0001);
    expect(improving.successRate).to.be.closeTo(2 / 3, 0.0001);
    expect(improving.averageEfficiency).to.be.closeTo(0.55, 0.0001);
    expect(improving.efficiencyDelta ?? 0).to.be.greaterThan(0);

    const regressing = trendByAgent(trends, '0xBBB');
    expect(regressing.direction).to.equal('regressing');
    expect(regressing.energyDelta).to.be.greaterThan(0);
    expect(regressing.slopePerHour).to.be.greaterThan(0);
    expect(regressing.anomalyRate).to.be.closeTo(1 / 3, 0.0001);
    expect(regressing.successRate).to.equal(1);

    const stable = trendByAgent(trends, '0xCCC');
    expect(stable.direction).to.equal('stable');
    expect(Math.abs(stable.energyDelta)).to.be.below(5);
    expect(Math.abs(stable.slopePerHour)).to.be.below(5);
    expect(stable.successRate).to.equal(1);
  });

  it('limits lookback and sample windows', () => {
    const records: EnergyMetricRecord[] = [
      createRecord({ agent: '0xDDD', jobId: 'd-1', offsetMinutes: -300, energy: 70 }),
      createRecord({ agent: '0xDDD', jobId: 'd-2', offsetMinutes: -180, energy: 72 }),
      createRecord({ agent: '0xDDD', jobId: 'd-3', offsetMinutes: -120, energy: 75 }),
      createRecord({ agent: '0xDDD', jobId: 'd-4', offsetMinutes: -60, energy: 78 }),
      createRecord({ agent: '0xDDD', jobId: 'd-5', offsetMinutes: -30, energy: 80 }),
      createRecord({ agent: '0xDDD', jobId: 'd-6', offsetMinutes: -10, energy: 82 }),
    ];

    const trends = computeEnergyTrends(records, {
      lookbackMs: 2 * 60 * 60 * 1000,
      sampleLimit: 3,
      now,
    });
    const trend = trendByAgent(trends, '0xDDD');
    expect(trend.sampleCount).to.equal(3);
    expect(trend.firstJobId).to.equal('d-4');
    expect(trend.latestJobId).to.equal('d-6');
    expect(trend.startedAt).to.equal(new Date(BASE_TIME - 60 * 60 * 1000).toISOString());
    expect(trend.endedAt).to.equal(new Date(BASE_TIME - 10 * 60 * 1000).toISOString());
  });

  it('enforces minimum sample requirements by default', () => {
    const records: EnergyMetricRecord[] = [
      createRecord({ agent: '0xEEE', jobId: 'e-1', offsetMinutes: -30, energy: 40 }),
      createRecord({ agent: '0xEEE', jobId: 'e-2', offsetMinutes: -10, energy: 35 }),
    ];

    const empty = computeEnergyTrends(records, { now, lookbackMs: 60 * 60 * 1000 });
    expect(empty.find((trend) => trend.agent === '0xeee')).to.be.undefined;

    const relaxed = computeEnergyTrends(records, {
      now,
      lookbackMs: 60 * 60 * 1000,
      minSamples: 2,
      slopeThreshold: 1,
    });
    expect(relaxed).to.have.lengthOf(1);
    expect(relaxed[0].direction).to.equal('improving');
    expect(relaxed[0].sampleCount).to.equal(2);
  });
});
