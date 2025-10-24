import fs from 'node:fs/promises';
import path from 'node:path';

import {
  hasEncryptionKey,
  maybeDecryptEnvelope,
  maybeEncryptSerialized,
  scrubForPrivacy,
  type EncryptionEnvelope,
} from './privacy';

export type ReceiptKind = 'PLAN' | 'EXECUTION';

export interface StoredReceiptEntry {
  kind: ReceiptKind;
  planHash: string;
  jobId?: number;
  createdAt: string;
  txHashes?: string[];
  attestationUid?: string | null;
  attestationTxHash?: string | null;
  attestationCid?: string | null;
  receipt?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
}

interface EncryptedReceiptFile {
  version: 1;
  encrypted: EncryptionEnvelope;
}

const RECEIPT_DIR = path.resolve(process.cwd(), 'storage', 'receipts');

function resolveReceiptPath(fileName: string): string {
  const resolved = path.resolve(RECEIPT_DIR, fileName);
  const relative = path.relative(RECEIPT_DIR, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Unsafe receipt file path');
  }
  return resolved;
}

async function ensureDirectory(): Promise<void> {
  await fs.mkdir(RECEIPT_DIR, { recursive: true });
}

function normalisePlanHash(planHash: unknown): string {
  if (typeof planHash !== 'string' || !planHash.trim()) {
    return 'unknown';
  }
  return planHash.trim().replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'unknown';
}

function normaliseTimestamp(createdAt: unknown): string {
  const source = typeof createdAt === 'string' && createdAt.trim() ? createdAt.trim() : new Date().toISOString();
  return source.replace(/[^0-9a-z_-]/gi, '-').slice(0, 48) || 'timestamp';
}

function safeFilename(entry: StoredReceiptEntry): string {
  const slug = normalisePlanHash(entry.planHash);
  const timestamp = normaliseTimestamp(entry.createdAt);
  const kind = entry.kind === 'EXECUTION' ? 'EXECUTION' : 'PLAN';
  return `${timestamp}-${kind}-${slug}.json`;
}

export async function saveReceipt(entry: StoredReceiptEntry): Promise<void> {
  await ensureDirectory();
  const sanitized = scrubForPrivacy(entry);
  const fileName = safeFilename(sanitized);
  const filePath = resolveReceiptPath(fileName);
  const payload = JSON.stringify(sanitized, null, 2);
  const encrypted = maybeEncryptSerialized(payload);
  if (encrypted) {
    const wrapper: EncryptedReceiptFile = { version: 1, encrypted };
    await fs.writeFile(filePath, JSON.stringify(wrapper, null, 2), 'utf8');
    return;
  }
  await fs.writeFile(filePath, payload, 'utf8');
}

export async function listReceipts(options: {
  planHash?: string;
  jobId?: number;
  limit?: number;
}): Promise<StoredReceiptEntry[]> {
  const limit = options.limit && options.limit > 0 ? options.limit : 20;
  try {
    const files = await fs.readdir(RECEIPT_DIR);
    const entries: StoredReceiptEntry[] = [];
    const sorted = files
      .filter((file) => file.endsWith('.json') && !file.includes(path.sep))
      .sort((a, b) => (a < b ? 1 : -1));
    for (const file of sorted) {
      let filePath: string;
      try {
        filePath = resolveReceiptPath(file);
      } catch (unsafeError) {
        console.warn(`Skipping unsafe receipt file name ${file}`, unsafeError);
        continue;
      }
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as StoredReceiptEntry | EncryptedReceiptFile;
        let record: StoredReceiptEntry | null = null;
        if ((parsed as EncryptedReceiptFile).encrypted) {
          if (!hasEncryptionKey()) {
            continue;
          }
          try {
            const decrypted = maybeDecryptEnvelope((parsed as EncryptedReceiptFile).encrypted);
            if (!decrypted) {
              continue;
            }
            record = JSON.parse(decrypted) as StoredReceiptEntry;
          } catch (decryptError) {
            console.warn(`Failed to decrypt stored receipt ${file}`, decryptError);
            continue;
          }
        } else {
          record = parsed as StoredReceiptEntry;
        }
        if (!record) {
          continue;
        }
        if (
          (options.planHash && record.planHash !== options.planHash) ||
          (options.jobId !== undefined && record.jobId !== options.jobId)
        ) {
          continue;
        }
        entries.push(record);
        if (entries.length >= limit) {
          break;
        }
      } catch (error) {
        console.warn(`Failed to read stored receipt ${file}`, error);
      }
    }
    return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
