import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  buildStructuredLogRecord,
  type StructuredLogRecord,
} from './structuredLogger';

export interface AuditEvent {
  timestamp?: string;
  component: string;
  action: string;
  level?: string;
  actor?: string;
  jobId?: string;
  agent?: string;
  employer?: string;
  stageName?: string;
  metadata?: Record<string, unknown>;
  success?: boolean;
  extra?: Record<string, unknown>;
}

export interface SignedAuditEvent extends StructuredLogRecord {
  hash: string;
  signature?: string;
}

export interface AuditAnchorRecord {
  timestamp: string;
  merkleRoot: string;
  count: number;
  anchor: string;
  digest: string;
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

export async function recordAuditEvent(
  event: AuditEvent,
  signer?: ethers.Wallet
): Promise<SignedAuditEvent> {
  const timestamp = event.timestamp ?? new Date().toISOString();
  const baseRecord = buildStructuredLogRecord({
    component: event.component,
    action: event.action,
    timestamp,
    level: event.level,
    actor: event.actor ?? event.agent ?? event.employer,
    jobId: event.jobId,
    agentId: event.agent,
    stageName: event.stageName,
    details: event.metadata,
    extra: {
      agent: event.agent,
      employer: event.employer,
      success: event.success,
      ...event.extra,
    },
  });
  const digest = baseRecord.integrity.eventHash.startsWith('sha256:')
    ? baseRecord.integrity.eventHash.slice('sha256:'.length)
    : baseRecord.integrity.eventHash.replace(/^0x/, '');
  let signature: string | undefined;
  if (signer) {
    signature = await signer.signMessage(baseRecord.integrity.eventHash);
  }
  const entry: SignedAuditEvent = {
    ...baseRecord,
    hash: digest,
    signature,
  };
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
    const events = lines.map((line) => {
      const parsed = JSON.parse(line) as SignedAuditEvent & {
        integrity?: StructuredLogRecord['integrity'];
        hash?: string;
      };
      if (!parsed.integrity || !parsed.integrity.eventHash) {
        const fallback = parsed.hash
          ? parsed.hash.replace(/^0x/, '')
          : crypto.createHash('sha256').update(line).digest('hex');
        parsed.integrity = {
          version: 0,
          eventHash: `sha256:${fallback}`,
          hashedFields: {},
        };
        parsed.hash = fallback;
      } else if (!parsed.hash) {
        const normalized = parsed.integrity.eventHash.startsWith('sha256:')
          ? parsed.integrity.eventHash.slice('sha256:'.length)
          : parsed.integrity.eventHash.replace(/^0x/, '');
        parsed.hash = normalized;
      }
      return parsed as SignedAuditEvent;
    });
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

function normaliseHex(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  try {
    const bytes = ethers.getBytes(prefixed);
    return ethers.hexlify(bytes);
  } catch {
    return fallback;
  }
}

function normaliseAnchorAddress(value: string | undefined): string {
  if (typeof value !== 'string' || value.length === 0) {
    return ethers.ZeroAddress;
  }
  try {
    return ethers.getAddress(value);
  } catch {
    return value;
  }
}

function canonicaliseAnchorPayload(record: {
  timestamp: string;
  merkleRoot: string;
  count: number;
  anchor: string;
}): string {
  return JSON.stringify({
    timestamp: record.timestamp,
    merkleRoot: normaliseHex(record.merkleRoot, ethers.ZeroHash),
    count: record.count,
    anchor: record.anchor,
  });
}

function computeAnchorDigest(record: {
  timestamp: string;
  merkleRoot: string;
  count: number;
  anchor: string;
}): string {
  const payload = canonicaliseAnchorPayload(record);
  return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

export async function anchorAuditTrail(
  signer: ethers.Wallet,
  events?: SignedAuditEvent[]
): Promise<AuditAnchorRecord> {
  const entries = events ?? (await readAuditEvents());
  const hashes = entries.map((entry) => {
    if (entry.integrity?.eventHash?.startsWith('sha256:')) {
      return `0x${entry.integrity.eventHash.slice('sha256:'.length)}`;
    }
    const normalized = entry.hash.startsWith('0x')
      ? entry.hash
      : `0x${entry.hash}`;
    return normalized;
  });
  const merkleRoot = computeMerkleRoot(hashes);
  const timestamp = new Date().toISOString();
  const anchor = signer.address;
  const baseRecord = {
    timestamp,
    merkleRoot,
    count: entries.length,
    anchor,
  };
  const digest = computeAnchorDigest(baseRecord);
  let signature: string | undefined;
  try {
    const payload = canonicaliseAnchorPayload(baseRecord);
    signature = await signer.signMessage(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to sign audit anchor: ${message}`);
  }
  const record: AuditAnchorRecord = {
    ...baseRecord,
    digest,
    signature,
  };
  ensureDirectory(path.dirname(AUDIT_ANCHOR_PATH));
  await fs.promises.appendFile(
    AUDIT_ANCHOR_PATH,
    `${JSON.stringify(record)}\n`,
    'utf8'
  );
  return record;
}

export function auditLogPath(): string {
  return AUDIT_LOG_PATH;
}

export function auditAnchorPath(): string {
  return AUDIT_ANCHOR_PATH;
}

function parseAnchorRecord(raw: string): AuditAnchorRecord | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {
      timestamp?: unknown;
      merkleRoot?: unknown;
      count?: unknown;
      anchor?: unknown;
      digest?: unknown;
      signature?: unknown;
    };
    const timestamp =
      typeof parsed.timestamp === 'string' && parsed.timestamp.length > 0
        ? parsed.timestamp
        : null;
    if (!timestamp) {
      return null;
    }
    const countValue = Number(parsed.count ?? 0);
    const count = Number.isFinite(countValue)
      ? Math.max(0, Math.floor(countValue))
      : 0;
    const merkleRoot = normaliseHex(
      typeof parsed.merkleRoot === 'string' ? parsed.merkleRoot : undefined,
      ethers.ZeroHash
    );
    const anchor = normaliseAnchorAddress(
      typeof parsed.anchor === 'string' ? parsed.anchor : undefined
    );
    const base = {
      timestamp,
      merkleRoot,
      count,
      anchor,
    };
    const digest = normaliseHex(
      typeof parsed.digest === 'string' ? parsed.digest : undefined,
      computeAnchorDigest(base)
    );
    const signature =
      typeof parsed.signature === 'string' && parsed.signature.length > 0
        ? parsed.signature
        : undefined;
    return {
      ...base,
      digest,
      signature,
    };
  } catch (err) {
    console.warn('Failed to parse audit anchor record', err);
    return null;
  }
}

export async function readAuditAnchors(
  limit?: number
): Promise<AuditAnchorRecord[]> {
  try {
    const raw = await fs.promises.readFile(AUDIT_ANCHOR_PATH, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const records: AuditAnchorRecord[] = [];
    for (const line of lines) {
      const record = parseAnchorRecord(line);
      if (record) {
        records.push(record);
      }
    }
    if (!limit || records.length <= limit) {
      return records;
    }
    return records.slice(-limit);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
