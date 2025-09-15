import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

export interface AuditEvent {
  timestamp?: string;
  component: string;
  action: string;
  jobId?: string;
  agent?: string;
  employer?: string;
  metadata?: Record<string, unknown>;
  success?: boolean;
}

export interface SignedAuditEvent extends AuditEvent {
  timestamp: string;
  hash: string;
  signature?: string;
}

const AUDIT_DIR = path.resolve(__dirname, '../storage/audit');
const AUDIT_LOG_PATH = path.join(AUDIT_DIR, 'events.jsonl');
const AUDIT_ANCHOR_PATH = path.join(AUDIT_DIR, 'anchors.jsonl');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normaliseEvent(event: AuditEvent): SignedAuditEvent {
  const timestamp = event.timestamp || new Date().toISOString();
  const base: SignedAuditEvent = {
    ...event,
    timestamp,
    hash: '',
  };
  return base;
}

function hashEvent(event: SignedAuditEvent): string {
  const payload = { ...event };
  delete (payload as Partial<SignedAuditEvent>).hash;
  delete (payload as Partial<SignedAuditEvent>).signature;
  const json = JSON.stringify(payload);
  return crypto.createHash('sha256').update(json).digest('hex');
}

export async function recordAuditEvent(
  event: AuditEvent,
  signer?: ethers.Wallet
): Promise<SignedAuditEvent> {
  const entry = normaliseEvent(event);
  entry.hash = hashEvent(entry);
  if (signer) {
    entry.signature = await signer.signMessage(entry.hash);
  }
  ensureDirectory(path.dirname(AUDIT_LOG_PATH));
  await fs.promises.appendFile(
    AUDIT_LOG_PATH,
    `${JSON.stringify(entry)}\n`,
    'utf8'
  );
  return entry;
}

export async function readAuditEvents(
  limit?: number
): Promise<SignedAuditEvent[]> {
  try {
    const raw = await fs.promises.readFile(AUDIT_LOG_PATH, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const events = lines.map((line) => JSON.parse(line) as SignedAuditEvent);
    if (!limit || events.length <= limit) {
      return events;
    }
    return events.slice(-limit);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function hashPair(a: string, b: string): string {
  const [left, right] = [a, b].sort();
  return ethers.keccak256(
    ethers.concat([ethers.getBytes(left), ethers.getBytes(right)])
  );
}

export function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return ethers.ZeroHash;
  }
  let layer = [...hashes];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(hashPair(layer[i], layer[i + 1]));
      } else {
        next.push(hashPair(layer[i], layer[i]));
      }
    }
    layer = next;
  }
  return layer[0];
}

export async function anchorAuditTrail(
  signer: ethers.Wallet,
  events?: SignedAuditEvent[]
): Promise<{ merkleRoot: string; count: number }> {
  const entries = events ?? (await readAuditEvents());
  const hashes = entries.map((entry) => `0x${entry.hash}`);
  const merkleRoot = computeMerkleRoot(hashes);
  ensureDirectory(path.dirname(AUDIT_ANCHOR_PATH));
  const record = {
    timestamp: new Date().toISOString(),
    merkleRoot,
    count: entries.length,
    anchor: signer.address,
  };
  await fs.promises.appendFile(
    AUDIT_ANCHOR_PATH,
    `${JSON.stringify(record)}\n`,
    'utf8'
  );
  return { merkleRoot, count: entries.length };
}

export function auditLogPath(): string {
  return AUDIT_LOG_PATH;
}

export function auditAnchorPath(): string {
  return AUDIT_ANCHOR_PATH;
}
