import fs from 'node:fs/promises';
import path from 'node:path';

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
  await fs.mkdir(RECEIPT_DIR, { recursive: true });
}

function safeFilename(entry: StoredReceiptEntry): string {
  const slug = entry.planHash.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  const timestamp = entry.createdAt.replace(/[:.]/g, '-');
  return `${timestamp}-${entry.kind}-${slug}.json`;
}

export async function saveReceipt(entry: StoredReceiptEntry): Promise<void> {
  await ensureDirectory();
  const filePath = path.join(RECEIPT_DIR, safeFilename(entry));
  const payload = JSON.stringify(entry, null, 2);
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
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => (a < b ? 1 : -1));
    for (const file of sorted) {
      const filePath = path.join(RECEIPT_DIR, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as StoredReceiptEntry;
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
