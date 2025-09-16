import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { EnergySample } from '../shared/energyMonitor';
import { orchestratorWallet } from './utils';
import { getCachedIdentity, refreshIdentity } from './identity';

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
let warnedMissingSigner = false;

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
  const payload = await buildTelemetryEnvelope(samples);
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
