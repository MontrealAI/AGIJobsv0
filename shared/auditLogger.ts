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

export async function anchorAuditTrail(
  signer: ethers.Wallet,
  events?: SignedAuditEvent[]
): Promise<{ merkleRoot: string; count: number }> {
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
