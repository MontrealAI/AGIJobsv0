import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';

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

export interface CommitRoundScope {
  chainId: string;
  validationModule: string;
  nonce: string;
  commitDeadline: string;
  domain: string;
  specHash: string;
  blockNumber: number;
  blockHash: string;
}

export interface StoredCommitRecord {
  jobId: string;
  validator: string;
  validatorEns?: string;
  validatorLabel?: string;
  approve: boolean;
  salt: string;
  burnTxHash?: string;
  roundScope?: CommitRoundScope;
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
  burnTxHash?: string;
  roundScope?: CommitRoundScope;
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

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeRecord(file: string, record: StoredCommitRecord): void {
  ensureStorageRoot();
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(record, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
    syncDirectory(STORAGE_ROOT);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function beginCommitRecord(
  jobId: string | number,
  validator: string,
  update: CommitRecordUpdate,
  expectedPrevious: StoredCommitRecord | null
): StoredCommitRecord {
  ensureStorageRoot();
  const file = recordPath(jobId, validator);
  let lock: number;
  try {
    lock = fs.openSync(`${file}.lock`, 'wx', 0o600);
  } catch {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  try {
    const current = loadCommitRecord(jobId, validator);
    if (JSON.stringify(current) !== JSON.stringify(expectedPrevious)) {
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    }
    if (
      typeof update.approve !== 'boolean' ||
      !update.salt ||
      !update.commitHash ||
      !update.roundScope
    ) {
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    }
    if (current) {
      const directory = path.join(STORAGE_ROOT, 'archive');
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      syncDirectory(STORAGE_ROOT);
      const body = JSON.stringify(current, null, 2);
      const digest = createHash('sha256').update(body).digest('hex');
      const archived = path.join(directory, `${digest}.json`);
      let fd: number | undefined;
      try {
        fd = fs.openSync(archived, 'wx', 0o600);
        fs.writeFileSync(fd, body);
        fs.fsyncSync(fd);
      } catch (err: any) {
        if (err.code !== 'EEXIST' || fs.readFileSync(archived, 'utf8') !== body)
          throw err;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
      syncDirectory(directory);
    }
    const next = mergeRecords(
      {
        jobId: jobId.toString(),
        validator: validator.toLowerCase(),
        approve: update.approve,
        salt: update.salt,
        commitHash: update.commitHash,
        committedAt: update.committedAt ?? new Date().toISOString(),
      },
      update
    );
    writeRecord(file, next);
    return next;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(`${file}.lock`);
  }
}

export function loadCommitRecord(
  jobId: string | number,
  validator: string
): StoredCommitRecord | null {
  const file = recordPath(jobId, validator);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const record = JSON.parse(raw) as StoredCommitRecord;
    if (
      !record ||
      record.jobId !== jobId.toString() ||
      record.validator !== validator.toLowerCase() ||
      typeof record.approve !== 'boolean' ||
      typeof record.salt !== 'string' ||
      !record.salt ||
      typeof record.commitHash !== 'string' ||
      !record.commitHash ||
      typeof record.committedAt !== 'string'
    ) {
      throw new Error('Invalid stored validator commitment');
    }
    return record;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
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
  if (update.roundScope) next.roundScope = { ...update.roundScope };
  if (typeof update.burnTxHash === 'string') {
    next.burnTxHash = update.burnTxHash;
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
  update: CommitRecordUpdate,
  expected?: { commitHash: string; roundScope: CommitRoundScope }
): StoredCommitRecord {
  ensureStorageRoot();
  const file = recordPath(jobId, validator);
  let lock: number;
  try {
    lock = fs.openSync(`${file}.lock`, 'wx', 0o600);
  } catch {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  try {
    const current = loadCommitRecord(jobId, validator);
    if (expected) {
      if (
        !current ||
        current.commitHash !== expected.commitHash ||
        JSON.stringify(current.roundScope) !==
          JSON.stringify(expected.roundScope)
      ) {
        throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
      }
    } else if (
      current?.roundScope &&
      [
        'approve',
        'salt',
        'burnTxHash',
        'roundScope',
        'commitHash',
        'committedAt',
        'commitTx',
        'revealTx',
        'revealedAt',
      ].some((key) => Object.prototype.hasOwnProperty.call(update, key))
    ) {
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    }
    return mergeCommitRecord(jobId, validator, update);
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(`${file}.lock`);
  }
}

function mergeCommitRecord(
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
      typeof update.committedAt === 'string' && update.committedAt.length > 0
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
