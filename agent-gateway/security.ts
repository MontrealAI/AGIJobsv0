import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import { recordAuditEvent, AuditEvent } from '../shared/auditLogger';

interface AgentHealth {
  address: string;
  quarantined: boolean;
  lastFailure?: string;
  reasons: string[];
  failureHistory: number[];
}

const SECURITY_DIR = path.resolve(__dirname, '../storage/security');
const QUARANTINE_PATH = path.join(SECURITY_DIR, 'quarantine.json');

const FAILURE_THRESHOLD = Number(process.env.AGENT_ERROR_THRESHOLD || '3');
const FAILURE_WINDOW_MS = Number(process.env.AGENT_ERROR_WINDOW_MS || '600000');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState(): Map<string, AgentHealth> {
  try {
    const raw = fs.readFileSync(QUARANTINE_PATH, 'utf8');
    const entries = JSON.parse(raw) as AgentHealth[];
    const map = new Map<string, AgentHealth>();
    for (const entry of entries) {
      map.set(entry.address.toLowerCase(), entry);
    }
    return map;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to load quarantine state', err);
    }
    return new Map();
  }
}

function persistState(state: Map<string, AgentHealth>): void {
  ensureDir(path.dirname(QUARANTINE_PATH));
  const data = Array.from(state.values());
  fs.writeFileSync(QUARANTINE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

class QuarantineManager {
  private state: Map<string, AgentHealth>;
  private threshold: number;
  private windowMs: number;

  constructor(threshold: number, windowMs: number) {
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.state = loadState();
  }

  private persist(): void {
    persistState(this.state);
  }

  private prune(history: number[], now: number): number[] {
    return history.filter((ts) => now - ts <= this.windowMs);
  }

  recordFailure(address: string, reason: string): AgentHealth {
    const key = address.toLowerCase();
    const now = Date.now();
    const entry = this.state.get(key) ?? {
      address,
      quarantined: false,
      reasons: [],
      failureHistory: [],
    };
    entry.failureHistory = this.prune(entry.failureHistory, now);
    entry.failureHistory.push(now);
    entry.reasons.push(reason);
    entry.lastFailure = new Date(now).toISOString();
    if (entry.failureHistory.length >= this.threshold) {
      entry.quarantined = true;
    }
    this.state.set(key, entry);
    this.persist();
    return entry;
  }

  recordSuccess(address: string): AgentHealth {
    const key = address.toLowerCase();
    const entry = this.state.get(key) ?? {
      address,
      quarantined: false,
      reasons: [],
      failureHistory: [],
    };
    entry.failureHistory = [];
    entry.reasons = [];
    entry.quarantined = false;
    this.state.set(key, entry);
    this.persist();
    return entry;
  }

  release(address: string): void {
    const key = address.toLowerCase();
    if (!this.state.has(key)) return;
    const entry = this.state.get(key)!;
    entry.quarantined = false;
    entry.failureHistory = [];
    entry.reasons = [];
    this.state.set(key, entry);
    this.persist();
  }

  isQuarantined(address: string): boolean {
    const entry = this.state.get(address.toLowerCase());
    if (!entry) return false;
    if (!entry.quarantined) return false;
    const now = Date.now();
    entry.failureHistory = this.prune(entry.failureHistory, now);
    if (entry.failureHistory.length < this.threshold) {
      entry.quarantined = false;
      this.state.set(address.toLowerCase(), entry);
      this.persist();
      return false;
    }
    return true;
  }

  report(): AgentHealth[] {
    return Array.from(this.state.values());
  }
}

export const quarantineManager = new QuarantineManager(
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS
);

export async function secureLogAction(
  event: AuditEvent,
  signer?: Wallet
): Promise<void> {
  await recordAuditEvent(event, signer);
}

export function recordAgentFailure(
  address: string,
  reason: string
): AgentHealth {
  return quarantineManager.recordFailure(address, reason);
}

export function recordAgentSuccess(address: string): AgentHealth {
  return quarantineManager.recordSuccess(address);
}

export function quarantineReport(): AgentHealth[] {
  return quarantineManager.report();
}

export function releaseAgent(address: string): void {
  quarantineManager.release(address);
}
