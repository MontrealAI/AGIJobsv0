import fs from 'fs';
import path from 'path';

export interface DisputeRecord {
  claimant: string;
  evidenceHash: string;
  recordedAt: string;
}

export interface DisputeResolutionRecord {
  resolver: string;
  employerWins: boolean;
  resolvedAt: string;
}

export interface StoredCommitRecord {
  jobId: string;
  validator: string;
  validatorEns?: string;
  validatorLabel?: string;
  approve: boolean;
  salt: string;
  commitHash: string;
  committedAt: string;
  commitTx?: string;
  revealTx?: string;
  revealedAt?: string;
  evaluation?: unknown;
  submission?: unknown;
  dispute?: DisputeRecord;
  resolution?: DisputeResolutionRecord;
  metadata?: Record<string, unknown>;
}

export interface CommitRecordUpdate {
  approve?: boolean;
  salt?: string;
  commitHash?: string;
  committedAt?: string;
  commitTx?: string;
  revealTx?: string;
  revealedAt?: string;
  validatorEns?: string;
  validatorLabel?: string;
  evaluation?: unknown;
  submission?: unknown;
  dispute?: DisputeRecord | null;
  resolution?: DisputeResolutionRecord | null;
  metadata?: Record<string, unknown>;
}

const STORAGE_ROOT = path.resolve(__dirname, '../storage/validation');

function ensureStorageRoot(): void {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o700 });
    return;
  }
  try {
    const stats = fs.statSync(STORAGE_ROOT);
    if (!stats.isDirectory()) {
      throw new Error(`${STORAGE_ROOT} is not a directory`);
    }
    if ((stats.mode & 0o777) !== 0o700) {
      fs.chmodSync(STORAGE_ROOT, 0o700);
    }
  } catch (err) {
    console.warn('validation storage permission check failed', err);
  }
}

function recordPath(jobId: string | number, validator: string): string {
  const safeJobId = jobId.toString();
  const safeValidator = validator.toLowerCase();
  return path.join(STORAGE_ROOT, `${safeJobId}-${safeValidator}.json`);
}

function writeRecord(file: string, record: StoredCommitRecord): void {
  ensureStorageRoot();
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch (err) {
    console.warn('validation storage chmod failed', file, err);
  }
}

export function loadCommitRecord(
  jobId: string | number,
  validator: string
): StoredCommitRecord | null {
  const file = recordPath(jobId, validator);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as StoredCommitRecord;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn('failed to load commit record', file, err);
    }
    return null;
  }
}

function mergeRecords(
  existing: StoredCommitRecord,
  update: CommitRecordUpdate
): StoredCommitRecord {
  const next: StoredCommitRecord = { ...existing };
  if (typeof update.approve === 'boolean') {
    next.approve = update.approve;
  }
  if (typeof update.salt === 'string' && update.salt.length > 0) {
    next.salt = update.salt;
  }
  if (typeof update.commitHash === 'string' && update.commitHash.length > 0) {
    next.commitHash = update.commitHash;
  }
  if (typeof update.committedAt === 'string' && update.committedAt.length > 0) {
    next.committedAt = update.committedAt;
  }
  if (typeof update.commitTx === 'string' && update.commitTx.length > 0) {
    next.commitTx = update.commitTx;
  }
  if (typeof update.revealTx === 'string' && update.revealTx.length > 0) {
    next.revealTx = update.revealTx;
  }
  if (typeof update.revealedAt === 'string' && update.revealedAt.length > 0) {
    next.revealedAt = update.revealedAt;
  }
  if (update.validatorEns !== undefined) {
    next.validatorEns = update.validatorEns || undefined;
  }
  if (update.validatorLabel !== undefined) {
    next.validatorLabel = update.validatorLabel || undefined;
  }
  if (update.evaluation !== undefined) {
    next.evaluation = update.evaluation;
  }
  if (update.submission !== undefined) {
    next.submission = update.submission;
  }
  if (update.dispute !== undefined) {
    next.dispute = update.dispute ?? undefined;
  }
  if (update.resolution !== undefined) {
    next.resolution = update.resolution ?? undefined;
  }
  if (update.metadata) {
    next.metadata = {
      ...(existing.metadata ?? {}),
      ...update.metadata,
    };
  }
  return next;
}

export function updateCommitRecord(
  jobId: string | number,
  validator: string,
  update: CommitRecordUpdate
): StoredCommitRecord {
  const file = recordPath(jobId, validator);
  const existing = loadCommitRecord(jobId, validator);
  if (!existing) {
    if (
      typeof update.approve !== 'boolean' ||
      typeof update.salt !== 'string' ||
      update.salt.length === 0 ||
      typeof update.commitHash !== 'string' ||
      update.commitHash.length === 0
    ) {
      throw new Error(
        `commit record for job ${jobId} and validator ${validator} is missing required base fields`
      );
    }
    const committedAt =
      (typeof update.committedAt === 'string' && update.committedAt.length > 0)
        ? update.committedAt
        : new Date().toISOString();
    const base: StoredCommitRecord = {
      jobId: jobId.toString(),
      validator: validator.toLowerCase(),
      approve: update.approve,
      salt: update.salt,
      commitHash: update.commitHash,
      committedAt,
    };
    const record = mergeRecords(base, update);
    writeRecord(file, record);
    return record;
  }
  const merged = mergeRecords(existing, update);
  writeRecord(file, merged);
  return merged;
}

export function deleteCommitRecord(
  jobId: string | number,
  validator: string
): void {
  const file = recordPath(jobId, validator);
  try {
    fs.rmSync(file);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn('failed to delete commit record', file, err);
    }
  }
}

