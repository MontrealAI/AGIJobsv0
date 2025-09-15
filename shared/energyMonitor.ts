import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
}

export interface EnergySample extends EnergySpanContext {
  spanId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuTotalUs: number;
  memoryRssBytes: number;
  energyEstimate: number;
  entropyEstimate?: number;
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
  const memory = process.memoryUsage();
  const cpuTotalUs = cpu.user + cpu.system;
  const energyEstimate = cpuTotalUs / 1000 + memory.rss / 1_000_000;
  const entropyEstimate =
    Math.log(1 + cpuTotalUs) + Math.log(1 + memory.heapUsed);
  const sample: EnergySample = {
    spanId: span.id,
    startedAt: span.startedAt,
    finishedAt,
    durationMs,
    cpuUserUs: cpu.user,
    cpuSystemUs: cpu.system,
    cpuTotalUs,
    memoryRssBytes: memory.rss,
    energyEstimate,
    entropyEstimate,
    metadata,
    ...span.context,
  };
  await logEnergySample(sample);
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
