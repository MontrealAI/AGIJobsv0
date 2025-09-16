import fs from 'fs';
import os from 'os';
import path from 'path';
import { ethers } from 'ethers';
import { EnergySample } from '../shared/energyMonitor';
import { orchestratorWallet, agents, FETCH_TIMEOUT_MS } from './utils';
import {
  isOracleContractConfigured,
  submitEnergyAttestations,
  OperatorSubmissionResult,
} from './operator';
import { getCachedIdentity, refreshIdentity } from './identity';
import {
  recordAgentFailure,
  secureLogAction,
  quarantineManager,
} from './security';

export const ENERGY_ORACLE_URL = process.env.ENERGY_ORACLE_URL || '';
export const ENERGY_ORACLE_TOKEN = process.env.ENERGY_ORACLE_TOKEN || '';
const TELEMETRY_FLUSH_INTERVAL_MS = Number(
  process.env.TELEMETRY_FLUSH_INTERVAL_MS || '60000'
);
const REQUIRE_TELEMETRY_SIGNATURE =
  process.env.ENERGY_ORACLE_REQUIRE_SIGNATURE === 'true';

const TELEMETRY_DIR = path.resolve(__dirname, '../storage/telemetry');
const TELEMETRY_OUTBOX = path.join(TELEMETRY_DIR, 'telemetry-queue.json');

let queue: EnergySample[] = [];
let loaded = false;
let flushing = false;
let flushTimer: NodeJS.Timeout | null = null;
let warnedNoOracle = false;
let warnedNoContract = false;
let warnedMissingSigner = false;

const ENERGY_METRICS_PATH = path.resolve(
  __dirname,
  '../data/energy-metrics.jsonl'
);

const COMPLEXITY_ORDER = [
  'O(1)',
  'O(log n)',
  'O(n)',
  'O(n log n)',
  'O(n^2)',
  'O(n^3)',
  'O(2^n)',
];

const CPU_OPERATION_WEIGHT = Number(
  process.env.TELEMETRY_CPU_OPERATION_WEIGHT || '1000'
);
const GPU_OPERATION_WEIGHT = Number(
  process.env.TELEMETRY_GPU_OPERATION_WEIGHT || '500'
);

function ensurePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

const ENERGY_ANOMALY_FAILURE_THRESHOLD = ensurePositiveInteger(
  Number(process.env.ENERGY_ANOMALY_FAILURE_THRESHOLD || '3'),
  3
);
const ENERGY_ANOMALY_WINDOW_MS = ensurePositiveInteger(
  Number(process.env.ENERGY_ANOMALY_WINDOW_MS || String(15 * 60 * 1000)),
  15 * 60 * 1000
);
const ENERGY_ANOMALY_ALERT_COOLDOWN_MS = Math.max(
  0,
  Number(process.env.ENERGY_ANOMALY_ALERT_COOLDOWN_MS || String(10 * 60 * 1000))
);

interface AnomalyHistoryEntry {
  address: string;
  timestamps: number[];
  firstDetected: number;
  lastDetected: number;
  lastTypes: string[];
  lastJobId?: string;
  lastAnomalyScore?: number;
  lastAlert?: number;
}

const energyAnomalyHistory = new Map<string, AnomalyHistoryEntry>();

type LoadAverages = [number, number, number];

function readLoadAverage(): LoadAverages {
  try {
    const values = os.loadavg();
    if (!Array.isArray(values) || values.length < 3) {
      return [0, 0, 0];
    }
    return [values[0] || 0, values[1] || 0, values[2] || 0];
  } catch {
    return [0, 0, 0];
  }
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

interface ComplexityEstimate {
  algorithmicComplexity: string;
  estimatedOperations: number;
}

function estimateAlgorithmicComplexity(
  cpuTimeMs: number,
  gpuTimeMs: number,
  inputSizeBytes: number,
  outputSizeBytes: number,
  cpuCount: number
): ComplexityEstimate {
  const safeCpuTime =
    Number.isFinite(cpuTimeMs) && cpuTimeMs > 0 ? cpuTimeMs : 0;
  const safeGpuTime =
    Number.isFinite(gpuTimeMs) && gpuTimeMs > 0 ? gpuTimeMs : 0;
  const threads = Number.isFinite(cpuCount) && cpuCount > 0 ? cpuCount : 1;

  const cpuOperations = safeCpuTime * CPU_OPERATION_WEIGHT * threads;
  const gpuOperations = safeGpuTime * GPU_OPERATION_WEIGHT;
  const estimatedOperations = Math.max(
    1,
    Math.round(cpuOperations + gpuOperations)
  );

  const scale = Math.max(1, inputSizeBytes, outputSizeBytes);
  const ratio = estimatedOperations / scale;

  let algorithmicComplexity = 'O(1)';
  if (ratio <= 2) {
    algorithmicComplexity = 'O(1)';
  } else if (ratio <= 10) {
    algorithmicComplexity = 'O(n)';
  } else if (ratio <= 25) {
    algorithmicComplexity = 'O(n log n)';
  } else if (ratio <= 60) {
    algorithmicComplexity = 'O(n^2)';
  } else if (ratio <= 120) {
    algorithmicComplexity = 'O(n^3)';
  } else {
    algorithmicComplexity = 'O(2^n)';
  }

  return { algorithmicComplexity, estimatedOperations };
}

function normaliseAgentAddress(value?: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return ethers.getAddress(value);
  } catch {
    return null;
  }
}

function refreshAnomalyWindow(entry: AnomalyHistoryEntry, now: number): void {
  entry.timestamps = entry.timestamps.filter(
    (ts) => now - ts <= ENERGY_ANOMALY_WINDOW_MS
  );
  if (entry.timestamps.length > 0) {
    entry.firstDetected = entry.timestamps[0];
    entry.lastDetected = entry.timestamps[entry.timestamps.length - 1];
  }
}

export interface JobInvocationSpan {
  jobId: string;
  agent: string;
  startedAt: string;
  cpuStart: NodeJS.CpuUsage;
  hrtimeStart: bigint;
  loadAverageStart: LoadAverages;
  cpuCount: number;
  inputSizeBytes: number;
  metadata?: Record<string, unknown>;
  resourceStart?: NodeJS.ResourceUsage;
}

export interface JobInvocationMetrics {
  jobId: string;
  agent: string;
  startedAt: string;
  finishedAt: string;
  wallTimeMs: number;
  cpuTimeMs: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuCount: number;
  inputSizeBytes: number;
  outputSizeBytes: number;
  estimatedOperations: number;
  algorithmicComplexity: string;
  loadAverageStart: LoadAverages;
  loadAverageEnd: LoadAverages;
  invocationSuccess: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface EnergyMetricRecord extends JobInvocationMetrics {
  spanId: string;
  jobSuccess: boolean;
  energyEstimate: number;
  gpuTimeMs: number;
  memoryRssBytes: number;
  rewardValue?: number;
  efficiencyScore?: number;
  loadAverageDelta: LoadAverages;
  entropyEstimate?: number;
  anomalies?: string[];
  anomalyScore?: number;
}

interface AgentEfficiencyAggregate {
  agent: string;
  jobCount: number;
  totalEnergy: number;
  totalEfficiency: number;
  totalCpuTime: number;
  totalGpuTime: number;
  successCount: number;
  complexityTotal: number;
  complexitySamples: number;
  lastUpdated: string | null;
}

export interface AgentEfficiencyStats {
  agent: string;
  jobCount: number;
  averageEnergy: number;
  averageEfficiency: number;
  averageCpuTimeMs: number;
  averageGpuTimeMs: number;
  successRate: number;
  dominantComplexity: string;
  lastUpdated: string | null;
}

const agentEfficiencyAggregates = new Map<string, AgentEfficiencyAggregate>();
let energyMetricsLoaded = false;
let energyMetricsLoadPromise: Promise<void> | null = null;

function normaliseAgent(agent: string | undefined): string {
  if (!agent) {
    return 'unknown';
  }
  return agent.toLowerCase();
}

function complexityIndex(label: string): number {
  const idx = COMPLEXITY_ORDER.indexOf(label);
  return idx === -1 ? 0 : idx;
}

function updateAgentAggregate(record: EnergyMetricRecord): void {
  const key = normaliseAgent(record.agent);
  const existing = agentEfficiencyAggregates.get(key);
  const aggregate: AgentEfficiencyAggregate = existing ?? {
    agent: key,
    jobCount: 0,
    totalEnergy: 0,
    totalEfficiency: 0,
    totalCpuTime: 0,
    totalGpuTime: 0,
    successCount: 0,
    complexityTotal: 0,
    complexitySamples: 0,
    lastUpdated: null,
  };

  aggregate.jobCount += 1;
  if (Number.isFinite(record.energyEstimate)) {
    aggregate.totalEnergy += record.energyEstimate;
  }
  if (Number.isFinite(record.efficiencyScore ?? 0)) {
    aggregate.totalEfficiency += record.efficiencyScore ?? 0;
  }
  if (Number.isFinite(record.cpuTimeMs)) {
    aggregate.totalCpuTime += record.cpuTimeMs;
  }
  if (Number.isFinite(record.gpuTimeMs)) {
    aggregate.totalGpuTime += record.gpuTimeMs;
  }
  if (record.jobSuccess) {
    aggregate.successCount += 1;
  }
  aggregate.complexityTotal += complexityIndex(record.algorithmicComplexity);
  aggregate.complexitySamples += 1;
  aggregate.lastUpdated =
    record.finishedAt || record.startedAt || aggregate.lastUpdated;

  agentEfficiencyAggregates.set(key, aggregate);
}

async function ensureEnergyMetricsLoaded(): Promise<void> {
  if (energyMetricsLoaded) {
    return;
  }
  if (energyMetricsLoadPromise) {
    return energyMetricsLoadPromise;
  }
  energyMetricsLoadPromise = (async () => {
    try {
      const raw = await fs.promises.readFile(ENERGY_METRICS_PATH, 'utf8');
      if (!raw) {
        return;
      }
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as EnergyMetricRecord;
          if (parsed && parsed.agent) {
            updateAgentAggregate(parsed);
          }
        } catch (err) {
          console.warn('Skipping malformed energy metric entry', err);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to load energy metrics history', err);
      }
    } finally {
      energyMetricsLoaded = true;
      energyMetricsLoadPromise = null;
    }
  })();
  return energyMetricsLoadPromise;
}

async function appendEnergyMetric(record: EnergyMetricRecord): Promise<void> {
  await ensureEnergyMetricsLoaded();
  updateAgentAggregate(record);
  ensureDir(path.dirname(ENERGY_METRICS_PATH));
  await fs.promises.appendFile(
    ENERGY_METRICS_PATH,
    `${JSON.stringify(record)}\n`,
    'utf8'
  );
}

function notifyAgentOfAnomaly(
  address: string,
  payload: Record<string, unknown>
): void {
  const lower = address.toLowerCase();
  let serialised: string | null = null;
  for (const [, info] of agents.entries()) {
    if (info.wallet.toLowerCase() !== lower) continue;
    if (info.ws && info.ws.readyState === 1) {
      try {
        if (!serialised) serialised = JSON.stringify(payload);
        info.ws.send(serialised);
      } catch (err) {
        console.warn('energy anomaly websocket notification failed', err);
      }
      continue;
    }
    if (info.url) {
      try {
        if (!serialised) serialised = JSON.stringify(payload);
      } catch (err) {
        console.warn('failed to serialise anomaly notification payload', err);
        return;
      }
      if (typeof fetch !== 'function') {
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      fetch(info.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: serialised,
        signal: controller.signal,
      })
        .catch((err) =>
          console.warn('energy anomaly webhook notification failed', err)
        )
        .finally(() => clearTimeout(timer));
    }
  }
}

async function handleEnergyAnomalies(
  record: EnergyMetricRecord
): Promise<void> {
  const anomalies = Array.isArray(record.anomalies)
    ? record.anomalies.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  if (anomalies.length === 0) {
    return;
  }
  const address = normaliseAgentAddress(record.agent);
  if (!address) {
    return;
  }
  const key = address.toLowerCase();
  const now = Date.now();
  const entry = energyAnomalyHistory.get(key) ?? {
    address,
    timestamps: [],
    firstDetected: now,
    lastDetected: now,
    lastTypes: [],
  };
  if (entry.timestamps.length === 0) {
    entry.firstDetected = now;
  }
  entry.address = address;
  refreshAnomalyWindow(entry, now);
  entry.timestamps.push(now);
  entry.lastDetected = now;
  entry.lastTypes = Array.from(new Set(anomalies));
  entry.lastJobId = record.jobId;
  entry.lastAnomalyScore = record.anomalyScore ?? anomalies.length;
  energyAnomalyHistory.set(key, entry);

  const anomalyCount = entry.timestamps.length;
  const shouldEscalate =
    anomalyCount >= ENERGY_ANOMALY_FAILURE_THRESHOLD &&
    (!entry.lastAlert ||
      now - entry.lastAlert >= ENERGY_ANOMALY_ALERT_COOLDOWN_MS);

  if (!shouldEscalate) {
    return;
  }

  entry.lastAlert = now;
  energyAnomalyHistory.set(key, entry);

  let health: ReturnType<typeof recordAgentFailure> | undefined;
  try {
    health = recordAgentFailure(address, 'energy-anomaly');
  } catch (err) {
    console.warn('energy anomaly failure tracking failed', err);
  }

  try {
    await secureLogAction(
      {
        component: 'telemetry',
        action: 'energy-anomaly-threshold',
        agent: address,
        jobId: record.jobId,
        success: false,
        metadata: {
          anomalies: entry.lastTypes,
          anomalyScore: entry.lastAnomalyScore,
          count: anomalyCount,
          windowMs: ENERGY_ANOMALY_WINDOW_MS,
          threshold: ENERGY_ANOMALY_FAILURE_THRESHOLD,
          energyEstimate: record.energyEstimate,
          rewardValue: record.rewardValue,
          jobSuccess: record.jobSuccess,
          quarantined: health?.quarantined ?? false,
          lastJobId: entry.lastJobId,
        },
      },
      orchestratorWallet
    );
  } catch (err) {
    console.warn('energy anomaly audit log failed', err);
  }

  try {
    notifyAgentOfAnomaly(address, {
      type: 'EnergyAnomaly',
      agent: address,
      jobId: record.jobId,
      anomalies: entry.lastTypes,
      anomalyScore: entry.lastAnomalyScore,
      count: anomalyCount,
      timestamp: new Date(now).toISOString(),
      quarantined: health?.quarantined ?? false,
    });
  } catch (err) {
    console.warn('energy anomaly notification failed', err);
  }
}

function mergeMetadata(
  ...entries: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    if (!entry) continue;
    for (const [key, value] of Object.entries(entry)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function computeLoadDelta(
  start: LoadAverages,
  end: LoadAverages
): LoadAverages {
  return [
    Number((end[0] || 0) - (start[0] || 0)),
    Number((end[1] || 0) - (start[1] || 0)),
    Number((end[2] || 0) - (start[2] || 0)),
  ];
}

export function startJobInvocationMetrics(options: {
  jobId: string;
  agent: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}): JobInvocationSpan {
  return {
    jobId: options.jobId,
    agent: options.agent,
    startedAt: new Date().toISOString(),
    cpuStart: process.cpuUsage(),
    hrtimeStart: process.hrtime.bigint(),
    loadAverageStart: readLoadAverage(),
    cpuCount: os.cpus()?.length ?? 1,
    inputSizeBytes: estimateSize(options.payload),
    metadata: options.metadata,
    resourceStart:
      typeof process.resourceUsage === 'function'
        ? process.resourceUsage()
        : undefined,
  };
}

export function finishJobInvocationMetrics(
  span: JobInvocationSpan,
  options: {
    output: unknown;
    success: boolean;
    error?: Error;
    metadata?: Record<string, unknown>;
  }
): JobInvocationMetrics {
  const cpu = process.cpuUsage(span.cpuStart);
  const durationNs = process.hrtime.bigint() - span.hrtimeStart;
  const wallTimeMs = Number(durationNs) / 1_000_000;
  const outputSizeBytes = estimateSize(options.output);
  const complexity = estimateAlgorithmicComplexity(
    (cpu.user + cpu.system) / 1000,
    0,
    span.inputSizeBytes,
    outputSizeBytes,
    span.cpuCount
  );
  const loadAverageEnd = readLoadAverage();
  const metadata = mergeMetadata(span.metadata, options.metadata);

  return {
    jobId: span.jobId,
    agent: span.agent,
    startedAt: span.startedAt,
    finishedAt: new Date().toISOString(),
    wallTimeMs,
    cpuTimeMs: (cpu.user + cpu.system) / 1000,
    cpuUserUs: cpu.user,
    cpuSystemUs: cpu.system,
    cpuCount: span.cpuCount,
    inputSizeBytes: span.inputSizeBytes,
    outputSizeBytes,
    estimatedOperations: complexity.estimatedOperations,
    algorithmicComplexity: complexity.algorithmicComplexity,
    loadAverageStart: span.loadAverageStart,
    loadAverageEnd,
    invocationSuccess: options.success,
    errorMessage: options.error?.message,
    metadata,
  };
}

export async function recordJobEnergyMetrics(params: {
  invocation: JobInvocationMetrics;
  energy: EnergySample;
  rewardValue?: number;
  jobSuccess: boolean;
  metadata?: Record<string, unknown>;
}): Promise<EnergyMetricRecord> {
  await ensureEnergyMetricsLoaded();
  const reward = params.rewardValue ?? params.energy.rewardValue;
  const energyEstimate = Number(params.energy.energyEstimate ?? 0);
  const gpuTimeMs = Number(params.energy.gpuTimeMs ?? 0);
  const efficiencyScore =
    reward && energyEstimate > 0
      ? reward / Math.max(1, energyEstimate)
      : undefined;

  const complexity = estimateAlgorithmicComplexity(
    params.invocation.cpuTimeMs,
    gpuTimeMs,
    params.invocation.inputSizeBytes,
    params.invocation.outputSizeBytes,
    params.invocation.cpuCount
  );

  const loadAverageDelta = computeLoadDelta(
    params.invocation.loadAverageStart,
    params.invocation.loadAverageEnd
  );

  const metadata = mergeMetadata(
    params.invocation.metadata,
    params.metadata,
    params.energy.metadata
  );

  const record: EnergyMetricRecord = {
    ...params.invocation,
    algorithmicComplexity: complexity.algorithmicComplexity,
    estimatedOperations: complexity.estimatedOperations,
    spanId: params.energy.spanId,
    jobSuccess: params.jobSuccess,
    energyEstimate,
    gpuTimeMs,
    memoryRssBytes: Number(params.energy.memoryRssBytes ?? 0),
    rewardValue:
      reward && Number.isFinite(reward) && reward > 0 ? reward : undefined,
    efficiencyScore,
    loadAverageDelta,
    entropyEstimate: params.energy.entropyEstimate,
    anomalies: params.energy.anomalies,
    anomalyScore: params.energy.anomalyScore,
    metadata,
  };

  await appendEnergyMetric(record);
  await handleEnergyAnomalies(record);
  return record;
}

export async function getAgentEfficiencyStats(): Promise<
  Map<string, AgentEfficiencyStats>
> {
  await ensureEnergyMetricsLoaded();
  const snapshot = new Map<string, AgentEfficiencyStats>();
  for (const [agent, aggregate] of agentEfficiencyAggregates.entries()) {
    const jobCount = aggregate.jobCount;
    const averageEnergy = jobCount > 0 ? aggregate.totalEnergy / jobCount : 0;
    const averageEfficiency =
      jobCount > 0 ? aggregate.totalEfficiency / jobCount : 0;
    const averageCpuTimeMs =
      jobCount > 0 ? aggregate.totalCpuTime / jobCount : 0;
    const averageGpuTimeMs =
      jobCount > 0 ? aggregate.totalGpuTime / jobCount : 0;
    const successRate = jobCount > 0 ? aggregate.successCount / jobCount : 0;
    const complexityAverageIndex =
      aggregate.complexitySamples > 0
        ? aggregate.complexityTotal / aggregate.complexitySamples
        : 0;
    const complexityLabel =
      COMPLEXITY_ORDER[
        Math.min(
          COMPLEXITY_ORDER.length - 1,
          Math.max(0, Math.round(complexityAverageIndex))
        )
      ] || COMPLEXITY_ORDER[0];

    snapshot.set(agent, {
      agent,
      jobCount,
      averageEnergy,
      averageEfficiency,
      averageCpuTimeMs,
      averageGpuTimeMs,
      successRate,
      dominantComplexity: complexityLabel,
      lastUpdated: aggregate.lastUpdated,
    });
  }
  return snapshot;
}

export interface EnergyAnomalySnapshot {
  agent: string;
  count: number;
  firstDetected: string;
  lastDetected: string;
  lastTypes: string[];
  lastJobId?: string;
  lastAnomalyScore?: number;
  quarantined: boolean;
}

export function getEnergyAnomalyReport(
  agent?: string
): EnergyAnomalySnapshot[] {
  const now = Date.now();
  const filterAddress = agent ? normaliseAgentAddress(agent) : null;
  const filterKey = filterAddress ? filterAddress.toLowerCase() : null;
  const result: EnergyAnomalySnapshot[] = [];

  for (const [key, entry] of energyAnomalyHistory.entries()) {
    refreshAnomalyWindow(entry, now);
    if (entry.timestamps.length === 0) {
      energyAnomalyHistory.delete(key);
      continue;
    }
    if (filterKey && key !== filterKey) {
      continue;
    }
    const snapshot: EnergyAnomalySnapshot = {
      agent: entry.address,
      count: entry.timestamps.length,
      firstDetected: new Date(entry.firstDetected).toISOString(),
      lastDetected: new Date(entry.lastDetected).toISOString(),
      lastTypes: [...entry.lastTypes],
      lastJobId: entry.lastJobId,
      lastAnomalyScore: entry.lastAnomalyScore,
      quarantined: quarantineManager.isQuarantined(entry.address),
    };
    result.push(snapshot);
  }

  result.sort((a, b) => b.lastDetected.localeCompare(a.lastDetected));
  return result;
}

export function getEnergyAnomalyParameters(): {
  threshold: number;
  windowMs: number;
  cooldownMs: number;
} {
  return {
    threshold: ENERGY_ANOMALY_FAILURE_THRESHOLD,
    windowMs: ENERGY_ANOMALY_WINDOW_MS,
    cooldownMs: ENERGY_ANOMALY_ALERT_COOLDOWN_MS,
  };
}

export interface TelemetryEnvelope {
  samples: EnergySample[];
  submittedAt: string;
  signer?: string;
  ens?: string;
  digest?: string;
  signature?: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function loadQueue(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.promises.readFile(TELEMETRY_OUTBOX, 'utf8');
    queue = JSON.parse(raw) as EnergySample[];
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to load telemetry queue', err);
    }
    queue = [];
  }
}

async function persistQueue(): Promise<void> {
  ensureDir(path.dirname(TELEMETRY_OUTBOX));
  await fs.promises.writeFile(
    TELEMETRY_OUTBOX,
    JSON.stringify(queue, null, 2),
    'utf8'
  );
}

async function resolveSignerMetadata(): Promise<{
  address: string;
  ens?: string;
}> {
  const wallet = orchestratorWallet;
  if (!wallet) {
    if (REQUIRE_TELEMETRY_SIGNATURE && !warnedMissingSigner) {
      warnedMissingSigner = true;
      console.error(
        'ENERGY_ORACLE_REQUIRE_SIGNATURE is true but no orchestrator wallet is configured; telemetry will not be signed.'
      );
    }
    throw new Error('No orchestrator wallet configured for telemetry signing');
  }

  const cached = getCachedIdentity(wallet.address);
  if (cached?.ensName) {
    return { address: wallet.address, ens: cached.ensName };
  }
  try {
    const refreshed = await refreshIdentity(wallet.address);
    return { address: wallet.address, ens: refreshed.ensName };
  } catch (err) {
    console.warn('Failed to refresh orchestrator identity for telemetry', err);
    return { address: wallet.address };
  }
}

function canonicaliseEnvelope(envelope: TelemetryEnvelope): string {
  const entries: [string, unknown][] = [
    ['samples', envelope.samples],
    ['submittedAt', envelope.submittedAt],
  ];
  if (envelope.signer) entries.push(['signer', envelope.signer]);
  if (envelope.ens) entries.push(['ens', envelope.ens]);
  return JSON.stringify(Object.fromEntries(entries));
}

async function buildTelemetryEnvelope(
  samples: EnergySample[]
): Promise<TelemetryEnvelope> {
  const submittedAt = new Date().toISOString();
  const base: TelemetryEnvelope = { samples, submittedAt };
  if (!orchestratorWallet) {
    if (REQUIRE_TELEMETRY_SIGNATURE) {
      throw new Error(
        'Telemetry signing required but orchestrator wallet is unavailable'
      );
    }
    return base;
  }

  const signer = await resolveSignerMetadata().catch((err) => {
    if (REQUIRE_TELEMETRY_SIGNATURE) {
      throw err;
    }
    console.warn('Continuing without signer metadata for telemetry', err);
    return null;
  });

  if (!signer) {
    return base;
  }

  const envelope: TelemetryEnvelope = {
    samples,
    submittedAt,
    signer: signer.address,
    ens: signer.ens,
  };

  try {
    const canonical = canonicaliseEnvelope(envelope);
    const digest = ethers.hashMessage(canonical);
    const signature = await orchestratorWallet.signMessage(canonical);
    envelope.digest = digest;
    envelope.signature = signature;
  } catch (err) {
    if (REQUIRE_TELEMETRY_SIGNATURE) {
      throw new Error(
        `Failed to sign telemetry payload: ${(err as Error).message}`
      );
    }
    console.warn('Telemetry payload signing failed, submitting unsigned', err);
  }

  return envelope;
}

async function sendToOracle(
  samples: EnergySample[]
): Promise<OperatorSubmissionResult> {
  if (isOracleContractConfigured()) {
    const result = await submitEnergyAttestations(samples);
    if (!result.success && result.error) {
      console.warn('EnergyOracle submission failed', result.error);
    }
    return result;
  }

  if (!ENERGY_ORACLE_URL) {
    if (!warnedNoContract && !warnedNoOracle) {
      console.warn(
        'ENERGY_ORACLE_ADDRESS and ENERGY_ORACLE_URL are not set; telemetry will be persisted locally only'
      );
      warnedNoOracle = true;
      warnedNoContract = true;
    }
    return {
      processed: 0,
      success: false,
      error: new Error(
        'No EnergyOracle target configured (set ENERGY_ORACLE_ADDRESS or ENERGY_ORACLE_URL)'
      ),
    };
  }

  const payload = await buildTelemetryEnvelope(samples);
  try {
    const res = await fetch(ENERGY_ORACLE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ENERGY_ORACLE_TOKEN
          ? { Authorization: `Bearer ${ENERGY_ORACLE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(
        `Energy oracle responded with ${res.status} ${res.statusText}`
      );
    }
    return { processed: samples.length, success: true };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { processed: 0, success: false, error };
  }
}

export async function publishEnergySample(sample: EnergySample): Promise<void> {
  await loadQueue();
  queue.push(sample);
  await persistQueue();
}

export async function flushTelemetry(): Promise<void> {
  await loadQueue();
  if (flushing) return;
  if (queue.length === 0) return;
  flushing = true;
  const snapshot = [...queue];
  try {
    const result = await sendToOracle(snapshot);
    if (result.processed > 0) {
      queue = queue.slice(result.processed);
      await persistQueue();
    }
    if (!result.success) {
      throw result.error ?? new Error('Telemetry submission incomplete');
    }
  } catch (err) {
    console.warn('Failed to flush telemetry', err);
  } finally {
    flushing = false;
  }
}

export async function startTelemetryService(): Promise<void> {
  await loadQueue();
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushTelemetry().catch((err) => console.warn('telemetry flush error', err));
  }, TELEMETRY_FLUSH_INTERVAL_MS);
}

export function stopTelemetryService(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function telemetryQueueLength(): number {
  return queue.length;
}
