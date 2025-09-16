import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { updateEnergyInsights } from './energyInsights';

export interface GpuSample {
  timeMs: number;
  cycles?: number;
  utilization?: number;
  timestamp: number;
}

export type GpuSampler = () => Partial<GpuSample> | GpuSample;

let gpuSampler: GpuSampler | null = null;

export function setGpuSampler(sampler: GpuSampler | null): void {
  gpuSampler = sampler;
}

function captureGpuSample(): GpuSample | undefined {
  if (!gpuSampler) {
    return undefined;
  }
  try {
    const raw = gpuSampler() || {};
    const sample: GpuSample = {
      timeMs: Number.isFinite(raw.timeMs) ? Number(raw.timeMs) : 0,
      cycles: Number.isFinite(raw.cycles) ? Number(raw.cycles) : 0,
      utilization: Number.isFinite(raw.utilization)
        ? Number(raw.utilization)
        : 0,
      timestamp: Number.isFinite(raw.timestamp)
        ? Number(raw.timestamp)
        : Date.now(),
    };
    return sample;
  } catch (err) {
    console.warn('GPU sampler failed', err);
    return {
      timeMs: 0,
      cycles: 0,
      utilization: 0,
      timestamp: Date.now(),
    };
  }
}

const CPU_SPEED_MHZ = (() => {
  try {
    const cores = os.cpus();
    if (!cores || cores.length === 0) {
      return 0;
    }
    const total = cores.reduce((sum, core) => sum + (core.speed || 0), 0);
    return total / cores.length;
  } catch {
    return 0;
  }
})();

const CPU_TIME_ANOMALY_MS = Number(
  process.env.ENERGY_CPU_TIME_THRESHOLD_MS || '120000'
);
const GPU_TIME_ANOMALY_MS = Number(
  process.env.ENERGY_GPU_TIME_THRESHOLD_MS || '120000'
);
const ENERGY_ANOMALY_THRESHOLD = Number(
  process.env.ENERGY_USAGE_THRESHOLD || '200000'
);
const DURATION_ANOMALY_THRESHOLD_MS = Number(
  process.env.ENERGY_RUNTIME_THRESHOLD_MS || '300000'
);
const MEMORY_ANOMALY_THRESHOLD_BYTES = Number(
  process.env.ENERGY_MEMORY_THRESHOLD_BYTES || String(512 * 1024 * 1024)
);
const EFFICIENCY_MIN_THRESHOLD = Number(
  process.env.ENERGY_EFFICIENCY_MIN_THRESHOLD || '0.0001'
);

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function estimateCpuCycles(totalMicroseconds: number): number {
  if (!Number.isFinite(totalMicroseconds) || totalMicroseconds <= 0) {
    return 0;
  }
  if (CPU_SPEED_MHZ > 0) {
    return totalMicroseconds * CPU_SPEED_MHZ;
  }
  return totalMicroseconds * 1000;
}

function extractReward(metadata: Record<string, unknown>): number | null {
  const candidates = [
    metadata.rewardValue,
    metadata.jobReward,
    metadata.reward,
    metadata.expectedReward,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value > 0) {
      return value;
    }
  }
  return null;
}

function detectAnomalies(sample: {
  cpuTimeMs: number;
  gpuTimeMs: number;
  durationMs: number;
  energyEstimate: number;
  memoryRssBytes: number;
  efficiencyScore?: number;
  rewardValue?: number | null;
}): string[] {
  const anomalies: string[] = [];
  if (sample.cpuTimeMs > CPU_TIME_ANOMALY_MS) {
    anomalies.push('cpu-time-high');
  }
  if (sample.gpuTimeMs > GPU_TIME_ANOMALY_MS) {
    anomalies.push('gpu-time-high');
  }
  if (sample.durationMs > DURATION_ANOMALY_THRESHOLD_MS) {
    anomalies.push('runtime-high');
  }
  if (sample.energyEstimate > ENERGY_ANOMALY_THRESHOLD) {
    anomalies.push('energy-usage-high');
  }
  if (sample.memoryRssBytes > MEMORY_ANOMALY_THRESHOLD_BYTES) {
    anomalies.push('memory-usage-high');
  }
  const rewardValue = sample.rewardValue ?? 0;
  if (rewardValue > 0) {
    const efficiency =
      sample.efficiencyScore ??
      rewardValue / Math.max(sample.energyEstimate, 1);
    if (efficiency < EFFICIENCY_MIN_THRESHOLD) {
      anomalies.push('low-efficiency');
    }
  }
  return anomalies;
}

export interface EnergySpanContext {
  jobId?: string;
  agent?: string;
  label?: string;
  category?: string;
}

export interface EnergySpan {
  id: string;
  startedAt: string;
  cpuStart: NodeJS.CpuUsage;
  hrtimeStart: bigint;
  context: EnergySpanContext;
  gpuStart?: GpuSample;
}

export interface EnergySample extends EnergySpanContext {
  spanId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  runtimeMs: number;
  cpuTimeMs: number;
  gpuTimeMs: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuTotalUs: number;
  cpuCycles: number;
  gpuCycles: number;
  memoryRssBytes: number;
  energyEstimate: number;
  entropyEstimate?: number;
  rewardValue?: number;
  efficiencyScore?: number;
  anomalyScore?: number;
  anomalies?: string[];
  gpuUtilization?: number;
  metadata?: Record<string, unknown>;
}

const TELEMETRY_DIR = path.resolve(__dirname, '../storage/telemetry');
const ENERGY_LOG_PATH = path.join(TELEMETRY_DIR, 'energy.jsonl');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function startEnergySpan(context: EnergySpanContext = {}): EnergySpan {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    cpuStart: process.cpuUsage(),
    hrtimeStart: process.hrtime.bigint(),
    context,
    gpuStart: captureGpuSample(),
  };
}

export async function endEnergySpan(
  span: EnergySpan,
  metadata: Record<string, unknown> = {}
): Promise<EnergySample> {
  const cpu = process.cpuUsage(span.cpuStart);
  const finishedAt = new Date().toISOString();
  const durationNs = process.hrtime.bigint() - span.hrtimeStart;
  const durationMs = Number(durationNs) / 1_000_000;
  const cpuTimeMs = (cpu.user + cpu.system) / 1000;
  const gpuEnd = captureGpuSample();
  let gpuTimeMs = 0;
  let gpuCycles = 0;
  let gpuUtilization = 0;
  if (span.gpuStart && gpuEnd) {
    gpuTimeMs = Math.max(
      0,
      toNumber(gpuEnd.timeMs) - toNumber(span.gpuStart.timeMs)
    );
    gpuCycles = Math.max(
      0,
      toNumber(gpuEnd.cycles) - toNumber(span.gpuStart.cycles)
    );
    gpuUtilization = Math.max(0, toNumber(gpuEnd.utilization));
  }
  const memory = process.memoryUsage();
  const cpuTotalUs = cpu.user + cpu.system;
  const energyEstimate = cpuTotalUs / 1000 + memory.rss / 1_000_000;
  const entropyEstimate =
    Math.log(1 + cpuTotalUs) + Math.log(1 + memory.heapUsed);
  const cpuCycles = estimateCpuCycles(cpuTotalUs);
  const rewardValue =
    extractReward(metadata) ??
    (typeof span.context === 'object' && span.context
      ? extractReward(span.context as Record<string, unknown>)
      : null);
  const efficiencyScore =
    rewardValue && rewardValue > 0
      ? rewardValue / Math.max(1, energyEstimate)
      : undefined;
  const anomalies = detectAnomalies({
    cpuTimeMs,
    gpuTimeMs,
    durationMs,
    energyEstimate,
    memoryRssBytes: memory.rss,
    efficiencyScore,
    rewardValue,
  });
  const sample: EnergySample = {
    spanId: span.id,
    startedAt: span.startedAt,
    finishedAt,
    durationMs,
    runtimeMs: durationMs,
    cpuTimeMs,
    gpuTimeMs,
    cpuUserUs: cpu.user,
    cpuSystemUs: cpu.system,
    cpuTotalUs,
    cpuCycles,
    gpuCycles,
    memoryRssBytes: memory.rss,
    energyEstimate,
    entropyEstimate,
    rewardValue: rewardValue ?? undefined,
    efficiencyScore,
    anomalyScore: anomalies.length ? anomalies.length : undefined,
    anomalies: anomalies.length ? anomalies : undefined,
    gpuUtilization: gpuUtilization || undefined,
    metadata,
    ...span.context,
  };
  await logEnergySample(sample);
  try {
    await updateEnergyInsights(sample);
  } catch (err) {
    console.warn('Failed to update energy insights', err);
  }
  return sample;
}

export async function logEnergySample(sample: EnergySample): Promise<void> {
  ensureDirectory(path.dirname(ENERGY_LOG_PATH));
  await fs.promises.appendFile(
    ENERGY_LOG_PATH,
    `${JSON.stringify(sample)}\n`,
    'utf8'
  );
}

export async function readEnergySamples(
  limit?: number
): Promise<EnergySample[]> {
  try {
    const raw = await fs.promises.readFile(ENERGY_LOG_PATH, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const samples = lines.map((line) => JSON.parse(line) as EnergySample);
    if (!limit || samples.length <= limit) {
      return samples;
    }
    return samples.slice(-limit);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export function energyLogPath(): string {
  return ENERGY_LOG_PATH;
}
