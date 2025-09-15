import fs from 'fs';
import path from 'path';

export interface InstrumentationOptions {
  jobId: string;
  stageName: string;
  agentId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  skipLogging?: boolean;
  onMetrics?: (metrics: TaskMetrics) => void;
}

export interface TaskMetrics {
  jobId: string;
  stageName: string;
  agent: string;
  timestamp: string;
  cpuTimeMs: number;
  gpuTimeMs: number;
  wallTimeMs: number;
  energyScore: number;
  efficiencyScore: number;
  algorithmicComplexity: string;
  estimatedOperations: number;
  inputSize: number;
  outputSize: number;
  success: boolean;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface JobEnergySummary {
  totalCpuTimeMs: number;
  totalGpuTimeMs: number;
  totalWallTimeMs: number;
  energyScore: number;
  efficiencyScore: number;
  averageEfficiency: number;
  complexity: string;
  successRate: number;
  runs: number;
  lastUpdated: string;
}

export interface JobEnergyLog {
  jobId: string;
  agent: string;
  stages: TaskMetrics[];
  summary: JobEnergySummary;
}

export interface AgentEnergyStats {
  agent: string;
  jobCount: number;
  totalEnergyScore: number;
  averageEnergyScore: number;
  averageEfficiencyScore: number;
  averageCpuTimeMs: number;
  averageGpuTimeMs: number;
  successRate: number;
  lastUpdated: string | null;
}

type GPUTimeProvider = () => number;

const COMPLEXITY_RANKING = [
  'O(1)',
  'O(log n)',
  'O(n)',
  'O(n log n)',
  'O(n^2)',
  'O(n^3)',
  'O(2^n)',
];

const ENERGY_LOG_ROOT =
  process.env.ENERGY_LOG_DIR || path.resolve(__dirname, '../../logs/energy');

function resolveNumericEnv(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_MIN_EFFICIENCY_SCORE = resolveNumericEnv(
  process.env.MIN_EFFICIENCY_SCORE,
  0.05
);

export const DEFAULT_MAX_ENERGY_SCORE = resolveNumericEnv(
  process.env.MAX_ENERGY_SCORE,
  Number.POSITIVE_INFINITY
);

let gpuTimeProvider: GPUTimeProvider | null = null;

export function setGPUTimeProvider(provider: GPUTimeProvider | null): void {
  gpuTimeProvider = provider;
}

function sampleGPUTime(): number {
  if (!gpuTimeProvider) return 0;
  try {
    const value = gpuTimeProvider();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeForFs(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_');
}

function estimateSize(payload: unknown): number {
  if (payload === null || payload === undefined) {
    return 0;
  }
  if (typeof payload === 'string') {
    return Buffer.byteLength(payload, 'utf8');
  }
  if (payload instanceof Uint8Array || Buffer.isBuffer(payload)) {
    return payload.length;
  }
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return 0;
  }
}

interface ComplexityEstimateResult {
  algorithmicComplexity: string;
  estimatedOperations: number;
  efficiencyScore: number;
  inputSize: number;
  outputSize: number;
}

function estimateComplexity(
  input: unknown,
  output: unknown,
  cpuTimeMs: number,
  gpuTimeMs: number
): ComplexityEstimateResult {
  const inputSize = estimateSize(input);
  const outputSize = estimateSize(output);
  const operations = Math.max(
    1,
    Math.round(cpuTimeMs * 1000 + gpuTimeMs * 500)
  );
  const scale = Math.max(1, inputSize, outputSize);
  const ratio = operations / scale;

  let algorithmicComplexity = 'O(1)';
  if (ratio <= 2) {
    algorithmicComplexity = 'O(1)';
  } else if (ratio <= 10) {
    algorithmicComplexity = 'O(n)';
  } else if (ratio <= 25) {
    algorithmicComplexity = 'O(n log n)';
  } else if (ratio <= 100) {
    algorithmicComplexity = 'O(n^2)';
  } else {
    algorithmicComplexity = 'O(2^n)';
  }

  const work = Math.max(1, inputSize + outputSize);
  const energy = Math.max(1, cpuTimeMs + gpuTimeMs);
  const efficiencyScore = work / energy;

  return {
    algorithmicComplexity,
    estimatedOperations: operations,
    efficiencyScore,
    inputSize,
    outputSize,
  };
}

function computeSummary(stages: TaskMetrics[]): JobEnergySummary {
  const totalCpuTimeMs = stages.reduce(
    (acc, stage) => acc + stage.cpuTimeMs,
    0
  );
  const totalGpuTimeMs = stages.reduce(
    (acc, stage) => acc + stage.gpuTimeMs,
    0
  );
  const totalWallTimeMs = stages.reduce(
    (acc, stage) => acc + stage.wallTimeMs,
    0
  );
  const totalEfficiency = stages.reduce(
    (acc, stage) => acc + stage.efficiencyScore,
    0
  );
  const successRate = stages.length
    ? stages.filter((stage) => stage.success).length / stages.length
    : 0;
  const complexityIndex = stages.reduce((maxIndex, stage) => {
    const idx = COMPLEXITY_RANKING.indexOf(stage.algorithmicComplexity);
    return idx > maxIndex ? idx : maxIndex;
  }, 0);

  const lastUpdated = stages.length
    ? stages[stages.length - 1].timestamp
    : new Date().toISOString();

  const averageEfficiency = stages.length ? totalEfficiency / stages.length : 0;

  return {
    totalCpuTimeMs,
    totalGpuTimeMs,
    totalWallTimeMs,
    energyScore: totalCpuTimeMs + totalGpuTimeMs,
    efficiencyScore: averageEfficiency,
    averageEfficiency,
    complexity: COMPLEXITY_RANKING[complexityIndex] || 'O(1)',
    successRate,
    runs: stages.length,
    lastUpdated,
  };
}

function loadJobEnergyLog(logPath: string): JobEnergyLog | null {
  if (!fs.existsSync(logPath)) return null;
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JobEnergyLog;
    if (!parsed.summary && parsed.stages) {
      parsed.summary = computeSummary(parsed.stages);
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistMetrics(metrics: TaskMetrics): void {
  const agentKey = sanitizeForFs(metrics.agent || 'unknown');
  const agentDir = path.join(ENERGY_LOG_ROOT, agentKey);
  ensureDirectory(agentDir);
  const logPath = path.join(agentDir, `${metrics.jobId}.json`);
  const existing = loadJobEnergyLog(logPath);
  const stages = [...(existing?.stages ?? []), metrics];
  const summary = computeSummary(stages);
  const log: JobEnergyLog = {
    jobId: metrics.jobId,
    agent: metrics.agent,
    stages,
    summary,
  };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

export async function instrumentTask<T>(
  options: InstrumentationOptions,
  task: () => Promise<T>
): Promise<T> {
  const { jobId, stageName, agentId, input, metadata, skipLogging } = options;
  const agent = agentId ?? 'unknown';
  const startCpu = process.cpuUsage();
  const startTime = process.hrtime.bigint();
  const startGpu = sampleGPUTime();

  let output: T | undefined;
  let error: unknown;
  try {
    output = await task();
    return output;
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const cpuUsage = process.cpuUsage(startCpu);
    const wallTimeMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const cpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1000;
    const gpuTimeMs = Math.max(0, sampleGPUTime() - startGpu);
    const {
      algorithmicComplexity,
      estimatedOperations,
      efficiencyScore,
      inputSize,
      outputSize,
    } = estimateComplexity(input, output, cpuTimeMs, gpuTimeMs);

    const metrics: TaskMetrics = {
      jobId,
      stageName,
      agent,
      timestamp: new Date().toISOString(),
      cpuTimeMs,
      gpuTimeMs,
      wallTimeMs,
      energyScore: cpuTimeMs + gpuTimeMs,
      efficiencyScore,
      algorithmicComplexity,
      estimatedOperations,
      inputSize,
      outputSize,
      success: !error,
      metadata,
      errorMessage: error ? String(error) : undefined,
    };

    if (typeof options.onMetrics === 'function') {
      try {
        options.onMetrics(metrics);
      } catch (err) {
        console.warn('instrumentTask onMetrics callback failed', err);
      }
    }

    if (!skipLogging) {
      persistMetrics(metrics);
    }
  }
}

export function getJobEnergyLog(
  agentId: string,
  jobId: string | number
): JobEnergyLog | null {
  const agentKey = sanitizeForFs(agentId);
  const logPath = path.join(ENERGY_LOG_ROOT, agentKey, `${jobId}.json`);
  return loadJobEnergyLog(logPath);
}

export function getAgentEnergyStats(agentId: string): AgentEnergyStats | null {
  const agentKey = sanitizeForFs(agentId);
  const agentDir = path.join(ENERGY_LOG_ROOT, agentKey);
  if (!fs.existsSync(agentDir)) return null;
  const files = fs
    .readdirSync(agentDir)
    .filter((file) => file.endsWith('.json'));

  let jobCount = 0;
  let totalEnergyScore = 0;
  let totalEfficiency = 0;
  let totalCpu = 0;
  let totalGpu = 0;
  let successAccumulator = 0;
  let lastUpdated: string | null = null;

  for (const file of files) {
    const log = loadJobEnergyLog(path.join(agentDir, file));
    if (!log) continue;
    const summary = log.summary || computeSummary(log.stages);
    jobCount += 1;
    totalEnergyScore += summary.energyScore;
    totalEfficiency += summary.efficiencyScore;
    totalCpu += summary.totalCpuTimeMs;
    totalGpu += summary.totalGpuTimeMs;
    successAccumulator += summary.successRate;
    if (!lastUpdated || summary.lastUpdated > lastUpdated) {
      lastUpdated = summary.lastUpdated;
    }
  }

  if (jobCount === 0) {
    return null;
  }

  return {
    agent: agentId,
    jobCount,
    totalEnergyScore,
    averageEnergyScore: totalEnergyScore / jobCount,
    averageEfficiencyScore: totalEfficiency / jobCount,
    averageCpuTimeMs: totalCpu / jobCount,
    averageGpuTimeMs: totalGpu / jobCount,
    successRate: successAccumulator / jobCount,
    lastUpdated,
  };
}

export function getEnergyLogDirectory(): string {
  ensureDirectory(ENERGY_LOG_ROOT);
  return ENERGY_LOG_ROOT;
}
