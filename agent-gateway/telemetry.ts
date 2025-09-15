import fs from 'fs';
import path from 'path';
import { EnergySample } from '../shared/energyMonitor';

export const ENERGY_ORACLE_URL = process.env.ENERGY_ORACLE_URL || '';
export const ENERGY_ORACLE_TOKEN = process.env.ENERGY_ORACLE_TOKEN || '';
const TELEMETRY_FLUSH_INTERVAL_MS = Number(
  process.env.TELEMETRY_FLUSH_INTERVAL_MS || '60000'
);

const TELEMETRY_DIR = path.resolve(__dirname, '../storage/telemetry');
const TELEMETRY_OUTBOX = path.join(TELEMETRY_DIR, 'telemetry-queue.json');

let queue: EnergySample[] = [];
let loaded = false;
let flushing = false;
let flushTimer: NodeJS.Timeout | null = null;
let warnedNoOracle = false;

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

async function sendToOracle(samples: EnergySample[]): Promise<void> {
  if (!ENERGY_ORACLE_URL) {
    if (!warnedNoOracle) {
      console.warn(
        'ENERGY_ORACLE_URL not set; telemetry will be persisted locally only'
      );
      warnedNoOracle = true;
    }
    return;
  }
  const res = await fetch(ENERGY_ORACLE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ENERGY_ORACLE_TOKEN
        ? { Authorization: `Bearer ${ENERGY_ORACLE_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ samples }),
  });
  if (!res.ok) {
    throw new Error(
      `Energy oracle responded with ${res.status} ${res.statusText}`
    );
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
    await sendToOracle(snapshot);
    queue = [];
    await persistQueue();
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
