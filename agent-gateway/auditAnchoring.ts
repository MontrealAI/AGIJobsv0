import {
  anchorAuditTrail,
  readAuditEvents,
  readAuditAnchors,
  type AuditAnchorRecord,
} from '../shared/auditLogger';
import { secureLogAction } from './security';
import { orchestratorWallet } from './utils';

function ensureNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ANCHOR_INTERVAL_MS = ensureNonNegativeInt(
  Number(process.env.AUDIT_ANCHOR_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS)),
  DEFAULT_INTERVAL_MS
);
const MIN_NEW_EVENTS_DEFAULT = ensureNonNegativeInt(
  Number(process.env.AUDIT_ANCHOR_MIN_NEW_EVENTS ?? '5'),
  1
);
const START_DELAY_MS = ensureNonNegativeInt(
  Number(process.env.AUDIT_ANCHOR_START_DELAY_MS ?? '0'),
  0
);

interface TriggerOptions {
  force?: boolean;
  minNewEvents?: number;
}

let anchorTimer: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;
let pending: Promise<AuditAnchorRecord | null> | null = null;
let lastAnchor: AuditAnchorRecord | null = null;
let lastError: string | null = null;
let lastSkipReason: string | null = null;
let lastRunAt: number | null = null;
let nextRunAt: number | null = null;
let warnedNoWallet = false;

void readAuditAnchors(1)
  .then((records) => {
    if (records.length > 0) {
      lastAnchor = records[records.length - 1];
    }
  })
  .catch((err) => console.warn('Failed to load last audit anchor', err));

function ensureMinEvents(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return MIN_NEW_EVENTS_DEFAULT;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function scheduleNextRun(base: number): void {
  if (ANCHOR_INTERVAL_MS > 0) {
    nextRunAt = base + ANCHOR_INTERVAL_MS;
  } else {
    nextRunAt = null;
  }
}

export interface AuditAnchoringState {
  enabled: boolean;
  intervalMs: number;
  minNewEvents: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  pending: boolean;
  lastError: string | null;
  lastSkipReason: string | null;
  lastAnchor: AuditAnchorRecord | null;
}

export function getAuditAnchoringState(): AuditAnchoringState {
  return {
    enabled: ANCHOR_INTERVAL_MS > 0,
    intervalMs: ANCHOR_INTERVAL_MS,
    minNewEvents: MIN_NEW_EVENTS_DEFAULT,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    nextRunAt: nextRunAt ? new Date(nextRunAt).toISOString() : null,
    pending: Boolean(pending),
    lastError,
    lastSkipReason,
    lastAnchor,
  };
}

async function performAnchor(
  options: Required<Pick<TriggerOptions, 'force'>> & {
    minNewEvents: number;
  }
): Promise<AuditAnchorRecord | null> {
  const wallet = orchestratorWallet;
  if (!wallet) {
    lastSkipReason = 'wallet-unavailable';
    lastError = 'No orchestrator wallet configured for audit anchoring';
    if (!warnedNoWallet) {
      console.warn(lastError);
      warnedNoWallet = true;
    }
    if (options.force) {
      throw new Error(lastError);
    }
    return null;
  }
  warnedNoWallet = false;

  const events = await readAuditEvents();
  if (!options.force && events.length === 0) {
    lastSkipReason = 'no-events';
    lastError = null;
    return null;
  }

  const previous = await readAuditAnchors(1);
  if (previous.length > 0 && !lastAnchor) {
    lastAnchor = previous[previous.length - 1];
  }
  const baseline =
    previous.length > 0 ? previous[previous.length - 1].count : 0;
  const newEvents = Math.max(0, events.length - baseline);
  if (!options.force && newEvents < options.minNewEvents) {
    lastSkipReason = 'insufficient-new-events';
    lastError = null;
    return null;
  }

  const record = await anchorAuditTrail(wallet, events);
  lastAnchor = record;
  lastError = null;
  lastSkipReason = null;

  try {
    await secureLogAction(
      {
        component: 'audit',
        action: 'anchor',
        success: true,
        metadata: {
          merkleRoot: record.merkleRoot,
          digest: record.digest,
          count: record.count,
        },
      },
      wallet
    );
  } catch (err) {
    console.warn('Failed to record audit anchor event', err);
  }

  return record;
}

export async function triggerAuditAnchor(
  options: TriggerOptions = {}
): Promise<AuditAnchorRecord | null> {
  if (pending) {
    return pending;
  }
  const force = Boolean(options.force);
  const minNewEvents = force ? 0 : ensureMinEvents(options.minNewEvents);
  const runTimestamp = Date.now();
  lastRunAt = runTimestamp;
  scheduleNextRun(runTimestamp);

  pending = performAnchor({ force, minNewEvents })
    .catch(async (err) => {
      const error = err instanceof Error ? err.message : String(err);
      lastError = error;
      lastSkipReason = null;
      const wallet = orchestratorWallet;
      try {
        await secureLogAction(
          {
            component: 'audit',
            action: 'anchor',
            success: false,
            metadata: { error },
          },
          wallet
        );
      } catch (logErr) {
        console.warn('Failed to log audit anchor failure', logErr);
      }
      throw err;
    })
    .finally(() => {
      pending = null;
    });

  const inflight = pending!;
  return inflight;
}

export async function startAuditAnchoringService(): Promise<void> {
  if (ANCHOR_INTERVAL_MS <= 0) {
    console.warn(
      'Audit anchoring service disabled; set AUDIT_ANCHOR_INTERVAL_MS to a positive value to enable periodic anchoring.'
    );
    nextRunAt = null;
    return;
  }
  if (anchorTimer) {
    return;
  }

  const schedule = () => {
    triggerAuditAnchor().catch((err) =>
      console.warn('audit anchor execution failed', err)
    );
  };

  if (START_DELAY_MS === 0) {
    schedule();
  } else {
    nextRunAt = Date.now() + START_DELAY_MS;
    initialTimer = setTimeout(() => {
      initialTimer = null;
      schedule();
    }, START_DELAY_MS);
  }

  anchorTimer = setInterval(() => {
    schedule();
  }, ANCHOR_INTERVAL_MS);
}

export function stopAuditAnchoringService(): void {
  if (anchorTimer) {
    clearInterval(anchorTimer);
    anchorTimer = null;
  }
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  nextRunAt = null;
}

export async function listAuditAnchors(
  limit?: number
): Promise<AuditAnchorRecord[]> {
  const records = await readAuditAnchors(limit);
  if (records.length > 0) {
    lastAnchor = records[records.length - 1];
  }
  return records;
}
