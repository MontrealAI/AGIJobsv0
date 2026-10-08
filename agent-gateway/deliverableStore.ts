import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { ethers } from 'ethers';

const STORAGE_ROOT = path.resolve(__dirname, '../storage/deliverables');
const TELEMETRY_DIR = path.join(STORAGE_ROOT, 'telemetry');
const DELIVERABLES_PATH = path.join(STORAGE_ROOT, 'deliverables.jsonl');
const HEARTBEATS_PATH = path.join(STORAGE_ROOT, 'heartbeats.jsonl');
const TELEMETRY_PATH = path.join(STORAGE_ROOT, 'telemetry.jsonl');
const PAYLOAD_INLINE_LIMIT = 8 * 1024; // 8 KB
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const DATABASE_PATH = path.join(STORAGE_ROOT, 'deliverables.sqlite');
const MAX_DATABASE_BYTES = 256 * 1024 * 1024;
type RecordKind = 'deliverables' | 'heartbeats' | 'telemetry';
interface StorageStatement {
  get(...values: (string | number)[]): any;
  all(...values: (string | number)[]): any[];
  run(...values: (string | number)[]): { changes: number };
}
interface StorageDatabase {
  prepare(sql: string): StorageStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple: boolean }): any;
  transaction<T>(operation: () => T): { immediate(): T };
  close(): void;
}
const Database = require('better-sqlite3') as new (
  file: string,
  options: { fileMustExist: boolean; timeout: number }
) => StorageDatabase;
const STORAGE_ANCHOR = path.resolve(__dirname, '..');

export class DeliverableStorageError extends Error {}
export class DeliverableInputError extends DeliverableStorageError {}

export interface StoredPayloadReference {
  cid?: string;
  uri?: string;
  path?: string;
  digest?: string;
  bytes?: number;
  storedAt?: string;
  inline?: unknown;
}

export interface DeliverableContributor {
  address: string;
  ens?: string;
  role?: string;
  label?: string;
  signature?: string;
  payloadDigest?: string;
  metadata?: Record<string, unknown>;
}

export interface ContributorContribution {
  deliverableId: string;
  jobId: string;
  submittedAt: string;
  primary: boolean;
  role?: string;
  label?: string;
  signature?: string;
  payloadDigest?: string;
  metadata?: Record<string, unknown>;
}

export interface JobContributorSummary {
  address: string;
  ensNames: string[];
  roles: string[];
  labels: string[];
  signatures: string[];
  payloadDigests: string[];
  contributionCount: number;
  firstContributionAt: string;
  lastContributionAt: string;
  contributions: ContributorContribution[];
}

export interface AgentDeliverableRecord {
  id: string;
  jobId: string;
  agent: string;
  submittedAt: string;
  success: boolean;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  telemetry?: StoredPayloadReference;
  contributors?: DeliverableContributor[];
  submissionMethod?: 'finalizeJob' | 'submit' | 'none';
  txHash?: string;
  certificateMetadataUri?: string;
  certificateMetadataCid?: string;
  certificateMetadataIpnsName?: string;
}

export interface DeliverableInput {
  jobId: string;
  agent: string;
  success?: boolean;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  telemetry?: unknown;
  telemetryCid?: string;
  telemetryUri?: string;
  contributors?: DeliverableContributor[];
  submissionMethod?: 'finalizeJob' | 'submit' | 'none';
  txHash?: string;
  submittedAt?: string;
  certificateMetadataUri?: string;
  certificateMetadataCid?: string;
  certificateMetadataIpnsName?: string;
}

export interface AgentHeartbeatRecord {
  id: string;
  jobId: string;
  agent: string;
  status: string;
  recordedAt: string;
  note?: string;
  telemetry?: StoredPayloadReference;
  metadata?: Record<string, unknown>;
}

export interface HeartbeatInput {
  jobId: string;
  agent: string;
  status: string;
  note?: string;
  telemetry?: unknown;
  telemetryCid?: string;
  telemetryUri?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTelemetryRecord {
  id: string;
  jobId: string;
  agent: string;
  recordedAt: string;
  payload?: StoredPayloadReference;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  spanId?: string;
  status?: string;
}

export interface TelemetryRecordInput {
  jobId: string;
  agent: string;
  payload?: unknown;
  cid?: string;
  uri?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  spanId?: string;
  status?: string;
}

interface QueryOptions {
  jobId?: string;
  agent?: string;
  limit?: number;
}

export interface ContributorQueryOptions extends QueryOptions {
  includePrimary?: boolean;
}

/** Validate bounded JSON data without invoking getters, toJSON or coercion hooks. */
function serialiseStorageData(
  input: unknown,
  limit = MAX_RECORD_BYTES
): string {
  const active = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 16384 || depth > 32)
      throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_TOO_LARGE');
    if (value === null || typeof value === 'boolean' || value === undefined)
      return value;
    if (typeof value === 'string') {
      bytes += Buffer.byteLength(value, 'utf8');
      if (bytes > limit)
        throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_TOO_LARGE');
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || active.has(value))
      throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_INVALID');
    const array = Array.isArray(value);
    if (
      (array && value.length > 16384) ||
      (!array &&
        ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    )
      throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_INVALID');
    active.add(value);
    let result: unknown;
    if (array) {
      const elements: unknown[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index)
        );
        if (descriptor && !('value' in descriptor))
          throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_INVALID');
        elements.push(visit(descriptor?.value, depth + 1));
      }
      result = elements;
    } else {
      const entries = new Map<string, unknown>();
      for (const key of Object.keys(value)) {
        bytes += Buffer.byteLength(key, 'utf8');
        if (bytes > limit)
          throw new DeliverableInputError(
            'DELIVERABLE_STORAGE_RECORD_TOO_LARGE'
          );
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor))
          throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_INVALID');
        entries.set(key, visit(descriptor.value, depth + 1));
      }
      // fromEntries defines own data properties: __proto__ is data, never a setter.
      result = Object.fromEntries(entries);
    }
    active.delete(value);
    return result;
  };
  // Escape HTML delimiters in persisted JSON while preserving decoded values.
  // These records remain data even if inspected in an HTML-oriented viewer.
  const json = JSON.stringify(visit(input, 0));
  if (json === undefined)
    throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_INVALID');
  const body = json.replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  if (Buffer.byteLength(body, 'utf8') > limit)
    throw new DeliverableInputError('DELIVERABLE_STORAGE_RECORD_TOO_LARGE');
  return body;
}

function validateDirectory(dir: string, privateDirectory: boolean): void {
  const fd = fs.openSync(
    dir,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    const stats = fs.fstatSync(fd);
    if (
      !stats.isDirectory() ||
      fs.realpathSync(dir) !== path.resolve(dir) ||
      (typeof process.getuid === 'function' &&
        stats.uid !== process.getuid()) ||
      (stats.mode & (privateDirectory ? 0o077 : 0o022)) !== 0
    )
      throw new DeliverableStorageError('DELIVERABLE_STORAGE_UNSAFE_DIRECTORY');
  } finally {
    fs.closeSync(fd);
  }
}

function ensureDirectory(dir: string, privateDirectory = true): void {
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
  }
  validateDirectory(dir, privateDirectory);
}

function ensureStorage(): void {
  validateDirectory(STORAGE_ANCHOR, false);
  ensureDirectory(path.dirname(STORAGE_ROOT), false);
  ensureDirectory(STORAGE_ROOT);
  ensureDirectory(TELEMETRY_DIR);
}

function validateFile(fd: number, limit: number): fs.Stats {
  const stats = fs.fstatSync(fd);
  if (
    !stats.isFile() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o077) !== 0 ||
    (typeof process.getuid === 'function' && stats.uid !== process.getuid())
  )
    throw new DeliverableStorageError('DELIVERABLE_STORAGE_UNSAFE_FILE');
  if (stats.size > limit)
    throw new DeliverableStorageError('DELIVERABLE_STORAGE_FILE_TOO_LARGE');
  return stats;
}

function readStorageFile(file: string, limit: number): string {
  ensureStorage();
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stats = validateFile(fd, limit);
    const data = Buffer.alloc(stats.size + 1);
    let count = 0;
    while (count < data.length) {
      const read = fs.readSync(fd, data, count, data.length - count, count);
      if (read === 0) break;
      count += read;
    }
    if (count > stats.size)
      throw new DeliverableStorageError('DELIVERABLE_STORAGE_FILE_CHANGED');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      data.subarray(0, count)
    );
  } finally {
    fs.closeSync(fd);
  }
}

ensureStorage();

function loadJsonLines<T>(file: string): T[] {
  let data: string;
  try {
    data = readStorageFile(file, MAX_JOURNAL_BYTES);
  } catch (error: any) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return data
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES)
        throw new DeliverableStorageError(
          'DELIVERABLE_STORAGE_RECORD_TOO_LARGE'
        );
      const record = JSON.parse(line);
      serialiseStorageData(record);
      return record as T;
    });
}

const legacyPaths: Record<RecordKind, string> = {
  deliverables: DELIVERABLES_PATH,
  heartbeats: HEARTBEATS_PATH,
  telemetry: TELEMETRY_PATH,
};

function validateDatabaseFiles(): void {
  ensureStorage();
  for (const file of [
    DATABASE_PATH,
    `${DATABASE_PATH}-journal`,
    `${DATABASE_PATH}-wal`,
    `${DATABASE_PATH}-shm`,
  ]) {
    let fd: number;
    try {
      fd = fs.openSync(
        file,
        fs.constants.O_RDONLY |
          fs.constants.O_NOFOLLOW |
          fs.constants.O_NONBLOCK
      );
    } catch (error: any) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    try {
      validateFile(fd, MAX_DATABASE_BYTES);
    } finally {
      fs.closeSync(fd);
    }
  }
}

function withDatabase<T>(operation: (database: StorageDatabase) => T): T {
  validateDatabaseFiles();
  try {
    const fd = fs.openSync(
      DATABASE_PATH,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600
    );
    fs.closeSync(fd);
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
  }
  validateDatabaseFiles();
  const database = new Database(DATABASE_PATH, {
    fileMustExist: true,
    timeout: 5000,
  });
  try {
    database.pragma('trusted_schema = OFF');
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = DELETE');
    database.pragma('synchronous = FULL');
    database.pragma('temp_store = MEMORY');
    const pageSize = Number(database.pragma('page_size', { simple: true }));
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0)
      throw new DeliverableStorageError('DELIVERABLE_STORAGE_DATABASE_INVALID');
    database.pragma(
      `max_page_count = ${Math.floor(MAX_DATABASE_BYTES / pageSize)}`
    );
    database.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('deliverables', 'heartbeats', 'telemetry')),
        body TEXT NOT NULL,
        bytes INTEGER NOT NULL CHECK (bytes >= 0)
      );
      CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
      CREATE TABLE IF NOT EXISTS payloads (
        locator TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES records(id),
        body TEXT NOT NULL
      );
    `);
    return operation(database);
  } finally {
    database.close();
  }
}

function legacyBytes(kind: RecordKind): number {
  let fd: number;
  try {
    fd = fs.openSync(
      legacyPaths[kind],
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
  } catch (error: any) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  try {
    return validateFile(fd, MAX_JOURNAL_BYTES).size;
  } finally {
    fs.closeSync(fd);
  }
}

function assertCapacity(
  database: StorageDatabase,
  kind: RecordKind,
  bytes: number
): void {
  const used = Number(
    database
      .prepare(
        'SELECT COALESCE(SUM(bytes), 0) AS bytes FROM records WHERE kind = ?'
      )
      .get(kind).bytes
  );
  if (
    !Number.isSafeInteger(used) ||
    used + legacyBytes(kind) + bytes > MAX_JOURNAL_BYTES
  )
    throw new DeliverableStorageError('DELIVERABLE_STORAGE_JOURNAL_FULL');
}

function assertDatabaseHeadroom(database: StorageDatabase): void {
  const pageSize = Number(database.pragma('page_size', { simple: true }));
  const pageCount = Number(database.pragma('page_count', { simple: true }));
  const freePages = Number(database.pragma('freelist_count', { simple: true }));
  const maxPages = Number(database.pragma('max_page_count', { simple: true }));
  if (
    ![pageSize, pageCount, freePages, maxPages].every(Number.isSafeInteger) ||
    pageSize <= 0 ||
    (maxPages - pageCount + freePages) * pageSize < 4 * MAX_RECORD_BYTES
  )
    throw new DeliverableStorageError('DELIVERABLE_STORAGE_DATABASE_FULL');
}

function loadRecords<T>(kind: RecordKind): T[] {
  const legacy = loadJsonLines<T>(legacyPaths[kind]);
  const stored = withDatabase((database) =>
    database
      .prepare('SELECT body FROM records WHERE kind = ? ORDER BY rowid')
      .all(kind)
  );
  const combined = new Map<string, T>();
  for (const record of [
    ...legacy,
    ...stored.map(({ body }) => {
      if (
        typeof body !== 'string' ||
        Buffer.byteLength(body, 'utf8') > MAX_RECORD_BYTES
      )
        throw new DeliverableStorageError(
          'DELIVERABLE_STORAGE_RECORD_TOO_LARGE'
        );
      const parsed = JSON.parse(body);
      serialiseStorageData(parsed);
      return parsed as T;
    }),
  ]) {
    const id = (record as { id?: unknown })?.id;
    combined.set(
      typeof id === 'string' ? id : `legacy-${combined.size}`,
      record
    );
  }
  return [...combined.values()];
}

const deliverables = loadRecords<AgentDeliverableRecord>('deliverables');
const heartbeats = loadRecords<AgentHeartbeatRecord>('heartbeats');
const telemetryReports = loadRecords<AgentTelemetryRecord>('telemetry');

interface PendingPayload {
  locator: string;
  body: string;
}
function appendRecord(
  kind: RecordKind,
  record: { id: string },
  payload?: PendingPayload
): void {
  const body = serialiseStorageData(record);
  const bytes =
    Buffer.byteLength(body, 'utf8') +
    1 +
    (payload ? Buffer.byteLength(payload.body, 'utf8') : 0);
  withDatabase((database) =>
    database
      .transaction(() => {
        assertCapacity(database, kind, bytes);
        database
          .prepare(
            'INSERT INTO records (id, kind, body, bytes) VALUES (?, ?, ?, ?)'
          )
          .run(record.id, kind, body, bytes);
        if (payload)
          database
            .prepare(
              'INSERT INTO payloads (locator, record_id, body) VALUES (?, ?, ?)'
            )
            .run(payload.locator, record.id, payload.body);
      })
      .immediate()
  );
}

function assertJournalReady(kind: RecordKind): void {
  withDatabase((database) =>
    database
      .transaction(() => {
        assertCapacity(database, kind, 2 * MAX_RECORD_BYTES + 1);
        assertDatabaseHeadroom(database);
      })
      .immediate()
  );
}

/** Check detectable storage failures before a transaction; this reserves no disk space. */
export function assertDeliverableStorageReady(): void {
  assertJournalReady('deliverables');
}

export function validateDeliverableInput(
  input: DeliverableInput
): DeliverableInput {
  return JSON.parse(
    serialiseStorageData(input, MAX_RECORD_BYTES - 64 * 1024)
  ) as DeliverableInput;
}

function clone<T>(value: T): T {
  const scoped: typeof structuredClone | undefined = (globalThis as any)
    ?.structuredClone;
  if (typeof scoped === 'function') {
    return scoped(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normaliseAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    return address.toLowerCase();
  }
}

function resolveStoredPath(relativePath: string): string | null {
  if (
    !/^telemetry\/(?:deliverable|heartbeat|telemetry-report)-[0-9]+-[0-9a-f-]{36}\.json$/.test(
      relativePath
    )
  )
    return null;
  const candidate = path.resolve(STORAGE_ROOT, relativePath);
  if (!candidate.startsWith(STORAGE_ROOT + path.sep)) {
    console.warn('rejecting payload outside storage root', relativePath);
    return null;
  }
  return candidate;
}

export function loadStoredPayload(
  reference?: StoredPayloadReference
): unknown | null {
  if (!reference) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(reference, 'inline')) {
    return JSON.parse(
      serialiseStorageData((reference as { inline?: unknown }).inline)
    );
  }
  if (!reference.path) {
    return null;
  }
  const resolved = resolveStoredPath(reference.path);
  if (!resolved) {
    return null;
  }
  try {
    const stored = withDatabase((database) =>
      database
        .prepare('SELECT body FROM payloads WHERE locator = ?')
        .get(reference.path!)
    );
    const data = stored
      ? stored.body
      : readStorageFile(resolved, MAX_RECORD_BYTES);
    if (
      typeof data !== 'string' ||
      Buffer.byteLength(data, 'utf8') > MAX_RECORD_BYTES
    )
      throw new DeliverableStorageError('DELIVERABLE_STORAGE_RECORD_TOO_LARGE');
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  } catch (err) {
    console.warn('failed to read stored payload', reference.path, err);
    return null;
  }
}

function createPayloadReference(
  payload: unknown,
  { cid, uri, prefix }: { cid?: string; uri?: string; prefix: string },
  pending: PendingPayload[]
): StoredPayloadReference | undefined {
  const hasMetadata = cid || uri;
  if (payload === undefined || payload === null) {
    return hasMetadata ? { cid, uri } : undefined;
  }
  const canonical = serialiseStorageData(payload);
  const digest = createHash('sha256').update(canonical).digest('hex');
  const byteLength = Buffer.byteLength(canonical, 'utf8');
  if (byteLength <= PAYLOAD_INLINE_LIMIT) {
    try {
      return { cid, uri, inline: JSON.parse(canonical), digest };
    } catch {
      return { cid, uri, inline: canonical, digest };
    }
  }
  const fileName = `${prefix}-${Date.now()}-${randomUUID()}.json`;
  const relativePath = `telemetry/${fileName}`;
  pending.push({ locator: relativePath, body: canonical });
  return {
    cid,
    uri,
    path: relativePath,
    digest,
    bytes: byteLength,
    storedAt: new Date().toISOString(),
  };
}

function selectRecords<T extends { jobId: string; agent: string }>(
  records: T[],
  { jobId, agent, limit }: QueryOptions,
  timestampKey: keyof T
): T[] {
  const filtered = records.filter((record) => {
    if (jobId && record.jobId !== jobId) {
      return false;
    }
    if (agent && record.agent.toLowerCase() !== agent.toLowerCase()) {
      return false;
    }
    return true;
  });
  const key = timestampKey as string;
  const sorted = filtered.slice().sort((a, b) => {
    const aValue = String((a as Record<string, unknown>)[key] ?? '');
    const bValue = String((b as Record<string, unknown>)[key] ?? '');
    return bValue.localeCompare(aValue);
  });
  if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

export function recordDeliverable(
  input: DeliverableInput
): AgentDeliverableRecord {
  // Confirmed receipts add generated fields to the preflight snapshot. Use
  // the full record budget here; the input helper reserved that extra space.
  input = JSON.parse(serialiseStorageData(input)) as DeliverableInput;
  assertDeliverableStorageReady();
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const pending: PendingPayload[] = [];
  const record: AgentDeliverableRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    submittedAt,
    success: input.success !== false,
    resultUri: input.resultUri,
    resultCid: input.resultCid,
    resultRef: input.resultRef,
    resultHash: input.resultHash,
    digest: input.digest,
    signature: input.signature,
    proof: input.proof,
    metadata: input.metadata,
    telemetry: createPayloadReference(
      input.telemetry,
      {
        cid: input.telemetryCid,
        uri: input.telemetryUri,
        prefix: 'deliverable',
      },
      pending
    ),
    contributors: Array.isArray(input.contributors)
      ? input.contributors.map((entry) => ({
          ...entry,
          address: normaliseAddress(entry.address),
        }))
      : undefined,
    submissionMethod: input.submissionMethod,
    txHash: input.txHash,
    certificateMetadataUri: input.certificateMetadataUri,
    certificateMetadataCid: input.certificateMetadataCid,
    certificateMetadataIpnsName: input.certificateMetadataIpnsName,
  };
  appendRecord('deliverables', record, pending[0]);
  deliverables.push(record);
  return clone(record);
}

export function listDeliverables(
  options: QueryOptions = {}
): AgentDeliverableRecord[] {
  const selected = selectRecords(deliverables, options, 'submittedAt');
  return selected.map((record) => clone(record));
}

export function getLatestDeliverable(
  jobId: string,
  agent?: string
): AgentDeliverableRecord | null {
  const [record] = selectRecords(
    deliverables,
    { jobId, agent, limit: 1 },
    'submittedAt'
  );
  return record ? clone(record) : null;
}

export function recordHeartbeat(input: HeartbeatInput): AgentHeartbeatRecord {
  input = JSON.parse(serialiseStorageData(input)) as HeartbeatInput;
  assertJournalReady('heartbeats');
  const pending: PendingPayload[] = [];
  const record: AgentHeartbeatRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    status: input.status,
    recordedAt: new Date().toISOString(),
    note: input.note,
    telemetry: createPayloadReference(
      input.telemetry,
      {
        cid: input.telemetryCid,
        uri: input.telemetryUri,
        prefix: 'heartbeat',
      },
      pending
    ),
    metadata: input.metadata,
  };
  appendRecord('heartbeats', record, pending[0]);
  heartbeats.push(record);
  return clone(record);
}

export function listHeartbeats(
  options: QueryOptions = {}
): AgentHeartbeatRecord[] {
  const selected = selectRecords(heartbeats, options, 'recordedAt');
  return selected.map((record) => clone(record));
}

export function recordTelemetryReport(
  input: TelemetryRecordInput
): AgentTelemetryRecord {
  input = JSON.parse(serialiseStorageData(input)) as TelemetryRecordInput;
  assertJournalReady('telemetry');
  const pending: PendingPayload[] = [];
  const record: AgentTelemetryRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    recordedAt: new Date().toISOString(),
    payload: createPayloadReference(
      input.payload,
      {
        cid: input.cid,
        uri: input.uri,
        prefix: 'telemetry-report',
      },
      pending
    ),
    signature: input.signature,
    proof: input.proof,
    metadata: input.metadata,
    spanId: input.spanId,
    status: input.status,
  };
  appendRecord('telemetry', record, pending[0]);
  telemetryReports.push(record);
  return clone(record);
}

export function listTelemetryReports(
  options: QueryOptions = {}
): AgentTelemetryRecord[] {
  const selected = selectRecords(telemetryReports, options, 'recordedAt');
  return selected.map((record) => clone(record));
}

interface ContributorAccumulator {
  summary: JobContributorSummary;
  ensNames: Set<string>;
  roles: Set<string>;
  labels: Set<string>;
  signatures: Set<string>;
  payloadDigests: Set<string>;
}

function createAccumulator(address: string): ContributorAccumulator {
  return {
    summary: {
      address,
      ensNames: [],
      roles: [],
      labels: [],
      signatures: [],
      payloadDigests: [],
      contributionCount: 0,
      firstContributionAt: '',
      lastContributionAt: '',
      contributions: [],
    },
    ensNames: new Set<string>(),
    roles: new Set<string>(),
    labels: new Set<string>(),
    signatures: new Set<string>(),
    payloadDigests: new Set<string>(),
  };
}

function sortedValues(values: Set<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function appendContribution(
  accumulators: Map<string, ContributorAccumulator>,
  address: string,
  detail: ContributorContribution,
  ens?: string
): void {
  const normalisedAddress = normaliseAddress(address);
  const key = normalisedAddress.toLowerCase();
  let accumulator = accumulators.get(key);
  if (!accumulator) {
    accumulator = createAccumulator(normalisedAddress);
    accumulators.set(key, accumulator);
  }

  if (ens && ens.trim().length > 0) {
    accumulator.ensNames.add(ens.trim());
  }
  if (detail.role) {
    accumulator.roles.add(detail.role);
  }
  if (detail.label) {
    accumulator.labels.add(detail.label);
  }
  if (detail.signature) {
    accumulator.signatures.add(detail.signature);
  }
  if (detail.payloadDigest) {
    accumulator.payloadDigests.add(detail.payloadDigest);
  }

  const contribution: ContributorContribution = {
    deliverableId: detail.deliverableId,
    jobId: detail.jobId,
    submittedAt: detail.submittedAt,
    primary: detail.primary,
    role: detail.role,
    label: detail.label,
    signature: detail.signature,
    payloadDigest: detail.payloadDigest,
    metadata: detail.metadata ? clone(detail.metadata) : undefined,
  };

  accumulator.summary.contributions.push(contribution);

  const { summary } = accumulator;
  if (
    !summary.firstContributionAt ||
    detail.submittedAt < summary.firstContributionAt
  ) {
    summary.firstContributionAt = detail.submittedAt;
  }
  if (
    !summary.lastContributionAt ||
    detail.submittedAt > summary.lastContributionAt
  ) {
    summary.lastContributionAt = detail.submittedAt;
  }
}

export function listContributorSummaries(
  options: ContributorQueryOptions = {}
): JobContributorSummary[] {
  const includePrimary = options.includePrimary !== false;
  const selected = selectRecords(deliverables, options, 'submittedAt');
  const accumulators = new Map<string, ContributorAccumulator>();

  for (const record of selected) {
    if (includePrimary) {
      appendContribution(accumulators, record.agent, {
        deliverableId: record.id,
        jobId: record.jobId,
        submittedAt: record.submittedAt,
        primary: true,
        role: 'primary',
        metadata: record.metadata ? clone(record.metadata) : undefined,
      });
    }
    if (record.contributors) {
      for (const contributor of record.contributors) {
        appendContribution(
          accumulators,
          contributor.address,
          {
            deliverableId: record.id,
            jobId: record.jobId,
            submittedAt: record.submittedAt,
            primary: false,
            role: contributor.role,
            label: contributor.label,
            signature: contributor.signature,
            payloadDigest: contributor.payloadDigest,
            metadata: contributor.metadata
              ? clone(contributor.metadata)
              : undefined,
          },
          contributor.ens
        );
      }
    }
  }

  const summaries: JobContributorSummary[] = [];
  for (const accumulator of accumulators.values()) {
    const { summary } = accumulator;
    summary.contributions.sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt)
    );
    summary.contributionCount = summary.contributions.length;
    if (summary.contributions.length > 0) {
      summary.lastContributionAt = summary.contributions[0].submittedAt;
      summary.firstContributionAt =
        summary.contributions[summary.contributions.length - 1].submittedAt;
    } else {
      summary.lastContributionAt = '';
      summary.firstContributionAt = '';
    }
    summary.ensNames = sortedValues(accumulator.ensNames);
    summary.roles = sortedValues(accumulator.roles);
    summary.labels = sortedValues(accumulator.labels);
    summary.signatures = sortedValues(accumulator.signatures);
    summary.payloadDigests = sortedValues(accumulator.payloadDigests);
    summaries.push(clone(summary));
  }

  return summaries.sort((a, b) =>
    b.lastContributionAt.localeCompare(a.lastContributionAt)
  );
}

function findById<T extends { id: string }>(
  records: T[],
  id: string
): T | null {
  if (!id) {
    return null;
  }
  const record = records.find((entry) => entry.id === id);
  return record ? clone(record) : null;
}

export function getDeliverableById(id: string): AgentDeliverableRecord | null {
  return findById(deliverables, id);
}

export function getHeartbeatById(id: string): AgentHeartbeatRecord | null {
  return findById(heartbeats, id);
}

export function getTelemetryReportById(
  id: string
): AgentTelemetryRecord | null {
  return findById(telemetryReports, id);
}
