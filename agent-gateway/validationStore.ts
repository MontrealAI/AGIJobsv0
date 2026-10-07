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

const configuredStorage = process.env.VALIDATION_STORAGE_DIR;
if (configuredStorage !== undefined && !path.isAbsolute(configuredStorage))
  throw new Error('VALIDATION_STORAGE_DIR must be an absolute path');
const STORAGE_ROOT =
  configuredStorage ?? path.resolve(__dirname, '../storage/validation');
const STORAGE_ANCHOR = configuredStorage
  ? path.dirname(STORAGE_ROOT)
  : path.resolve(__dirname, '..');
const MAX_RECORD_BYTES = 1024 * 1024;

function validateDirectory(directory: string, privateDirectory: boolean): void {
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    const stat = fs.fstatSync(fd);
    if (
      !stat.isDirectory() ||
      fs.realpathSync(directory) !== path.resolve(directory) ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
      (stat.mode & (privateDirectory ? 0o077 : 0o022)) !== 0
    ) {
      throw new Error('VALIDATION_STORAGE_UNSAFE_DIRECTORY');
    }
  } finally {
    fs.closeSync(fd);
  }
}

function ensureStorageRoot(): void {
  validateDirectory(STORAGE_ANCHOR, false);
  const directories = configuredStorage
    ? [STORAGE_ROOT]
    : [path.dirname(STORAGE_ROOT), STORAGE_ROOT];
  for (const directory of directories) {
    let created = false;
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      created = true;
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
    validateDirectory(directory, directory === STORAGE_ROOT);
    if (created) syncDirectory(path.dirname(directory));
  }
}

function recordPath(jobId: string | number, validator: string): string {
  if (
    (typeof jobId !== 'string' && typeof jobId !== 'number') ||
    (typeof jobId === 'number' &&
      (!Number.isSafeInteger(jobId) || jobId < 0)) ||
    typeof validator !== 'string'
  )
    throw new Error('VALIDATION_STORAGE_IDENTITY_INVALID');
  const safeJobId = jobId.toString();
  if (
    !/^(0|[1-9][0-9]{0,77})$/.test(safeJobId) ||
    BigInt(safeJobId) >= 1n << 256n ||
    !/^0x[0-9a-fA-F]{40}$/.test(validator)
  )
    throw new Error('VALIDATION_STORAGE_IDENTITY_INVALID');
  const safeValidator = validator.toLowerCase();
  return path.join(STORAGE_ROOT, `${safeJobId}-${safeValidator}.json`);
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function serialiseRecord(record: StoredCommitRecord): string {
  const active = new WeakSet<object>();
  let nodes = 0;
  let stringBytes = 0;
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 16384 || depth > 32)
      throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
    if (value === undefined || value === null || typeof value === 'boolean')
      return;
    if (typeof value === 'string') {
      stringBytes += Buffer.byteLength(value, 'utf8');
      if (stringBytes > MAX_RECORD_BYTES)
        throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || active.has(value))
      throw new Error('VALIDATION_STORAGE_RECORD_INVALID');
    if (Array.isArray(value) && value.length > 16384)
      throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
    if (
      !Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      throw new Error('VALIDATION_STORAGE_RECORD_INVALID');
    active.add(value);
    for (const key of Object.keys(value)) {
      stringBytes += Buffer.byteLength(key, 'utf8');
      if (stringBytes > MAX_RECORD_BYTES)
        throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor))
        throw new Error('VALIDATION_STORAGE_RECORD_INVALID');
      visit(descriptor.value, depth + 1);
    }
    active.delete(value);
  };
  visit(record, 0);
  const body = JSON.stringify(record, null, 2);
  if (Buffer.byteLength(body, 'utf8') > MAX_RECORD_BYTES)
    throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
  return body;
}

function readRecordText(file: string): string {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())
    )
      throw new Error('VALIDATION_STORAGE_UNSAFE_RECORD');
    if (stat.size > MAX_RECORD_BYTES)
      throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
    const bytes = Buffer.alloc(MAX_RECORD_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!read) break;
      count += read;
    }
    if (count > MAX_RECORD_BYTES)
      throw new Error('VALIDATION_STORAGE_RECORD_TOO_LARGE');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, count)
    );
  } finally {
    fs.closeSync(fd);
  }
}

function writeRecord(file: string, record: StoredCommitRecord): void {
  const body = serialiseRecord(record);
  ensureStorageRoot();
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, body);
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
  const file = recordPath(jobId, validator);
  ensureStorageRoot();
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
      validateDirectory(directory, true);
      syncDirectory(STORAGE_ROOT);
      const body = serialiseRecord(current);
      const digest = createHash('sha256').update(body).digest('hex');
      const archived = path.join(directory, `${digest}.json`);
      let fd: number | undefined;
      try {
        fd = fs.openSync(archived, 'wx', 0o600);
        fs.writeFileSync(fd, body);
        fs.fsyncSync(fd);
      } catch (err: any) {
        if (err.code !== 'EEXIST' || readRecordText(archived) !== body)
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
    validateDirectory(STORAGE_ANCHOR, false);
    validateDirectory(path.dirname(STORAGE_ROOT), false);
    validateDirectory(STORAGE_ROOT, true);
    const raw = readRecordText(file);
    const record = JSON.parse(raw) as StoredCommitRecord;
    serialiseRecord(record);
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
  expected?: {
    commitHash: string;
    roundScope: CommitRoundScope;
    revealUnattempted?: boolean;
  }
): StoredCommitRecord {
  const file = recordPath(jobId, validator);
  ensureStorageRoot();
  let lock: number;
  try {
    lock = fs.openSync(`${file}.lock`, 'wx', 0o600);
  } catch {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  try {
    const current = loadCommitRecord(jobId, validator);
    const changesRevealStatus = Object.prototype.hasOwnProperty.call(
      update.metadata ?? {},
      'automaticRevealStatus'
    );
    if (changesRevealStatus && !expected) {
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    }
    if (expected) {
      if (
        !current ||
        !current.roundScope ||
        !expected.roundScope ||
        current.commitHash !== expected.commitHash ||
        JSON.stringify(current.roundScope) !==
          JSON.stringify(expected.roundScope)
      ) {
        throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
      }
      if (changesRevealStatus) {
        const statuses = ['broadcast-intent', 'broadcast', 'confirmed'];
        const nextStatus = update.metadata!.automaticRevealStatus;
        const nextIndex =
          typeof nextStatus === 'string' ? statuses.indexOf(nextStatus) : -1;
        const hasPrior = Object.prototype.hasOwnProperty.call(
          current.metadata ?? {},
          'automaticRevealStatus'
        );
        const priorStatus = current.metadata?.automaticRevealStatus;
        const priorIndex =
          typeof priorStatus === 'string' ? statuses.indexOf(priorStatus) : -1;
        if (
          nextIndex < 0 ||
          (!hasPrior && nextIndex !== 0) ||
          (hasPrior && (priorIndex < 0 || nextIndex < priorIndex))
        )
          throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
      }
      if (expected.revealUnattempted) {
        if (
          Object.prototype.hasOwnProperty.call(current, 'revealTx') ||
          Object.prototype.hasOwnProperty.call(current, 'revealedAt') ||
          Object.prototype.hasOwnProperty.call(
            current.metadata ?? {},
            'automaticRevealStatus'
          ) ||
          update.metadata?.automaticRevealStatus !== 'broadcast-intent'
        ) {
          throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
        }
      } else if (
        update.metadata?.automaticRevealStatus === 'broadcast-intent'
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
  ensureStorageRoot();
  let lock: number;
  try {
    lock = fs.openSync(`${file}.lock`, 'wx', 0o600);
  } catch {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  try {
    if (!loadCommitRecord(jobId, validator)) return;
    fs.unlinkSync(file);
    syncDirectory(STORAGE_ROOT);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(`${file}.lock`);
  }
}
