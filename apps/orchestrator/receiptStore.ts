import fs from 'node:fs/promises';
import path from 'node:path';
import { ensurePrivateDirectory, readContainedFile, writeContainedFile } from '../../shared/containedFiles';

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

const RECEIPT_DIR = path.resolve(process.cwd(), 'storage', 'receipts');

async function ensureDirectory(): Promise<void> {
  ensurePrivateDirectory(RECEIPT_DIR);
}

function safeFilename(entry: StoredReceiptEntry): string {
  if (!entry || typeof entry.planHash !== 'string' || !entry.planHash || entry.planHash.length > 512) throw new Error('Invalid receipt plan hash');
  if (entry.kind !== 'PLAN' && entry.kind !== 'EXECUTION') throw new Error('Invalid receipt kind');
  if (typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) || new Date(entry.createdAt).toISOString() !== entry.createdAt) throw new Error('Receipt timestamp must be canonical ISO UTC');
  const slug = entry.planHash.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  const timestamp = entry.createdAt.replace(/[:.]/g, '-');
  return `${timestamp}-${entry.kind}-${slug}.json`;
}

export async function saveReceipt(entry: StoredReceiptEntry): Promise<void> {
  await ensureDirectory();
  const filename = safeFilename(entry);
  const payload = JSON.stringify(entry, null, 2);
  writeContainedFile(RECEIPT_DIR, filename, payload, true);
}

export async function listReceipts(options: {
  planHash?: string;
  jobId?: number;
  limit?: number;
}): Promise<StoredReceiptEntry[]> {
  const limit = options.limit && options.limit > 0 ? options.limit : 20;
  try {
    await ensureDirectory();
    const files = await fs.readdir(RECEIPT_DIR);
    const entries: StoredReceiptEntry[] = [];
    const sorted = files
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => (a < b ? 1 : -1));
    for (const file of sorted) {
      try {
        const raw = readContainedFile(RECEIPT_DIR, file);
        const parsed = JSON.parse(raw) as StoredReceiptEntry;
        if (safeFilename(parsed) !== file) throw new Error('Receipt content does not match its filename');
        if (
          (options.planHash && parsed.planHash !== options.planHash) ||
          (options.jobId !== undefined && parsed.jobId !== options.jobId)
        ) {
          continue;
        }
        entries.push(parsed);
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
