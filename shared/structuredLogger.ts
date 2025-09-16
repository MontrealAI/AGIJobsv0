import { createHash } from 'crypto';

export interface StructuredLogInput {
  component: string;
  action: string;
  timestamp?: string;
  level?: string;
  actor?: string;
  jobId?: string;
  agentId?: string;
  stageName?: string;
  extra?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface StructuredLogRecord {
  timestamp: string;
  component: string;
  action: string;
  level: string;
  actor?: string;
  jobId?: string;
  agentId?: string;
  stageName?: string;
  details?: unknown;
  integrity: {
    version: number;
    eventHash: string;
    hashedFields: Record<string, string>;
  };
  [key: string]: unknown;
}

interface SanitizeResult {
  value: unknown;
  hashes: Record<string, string>;
}

interface HashedPlaceholder {
  hashed: true;
  algorithm: string;
  digest: string;
  type: string;
  length?: number;
}

const HASH_EXACT = new Set([
  'analysis',
  'context',
  'identity',
  'initialinput',
  'input',
  'metadata',
  'notes',
  'output',
  'payload',
  'profile',
  'raw',
  'rawdata',
  'rawinput',
  'rawoutput',
  'resultref',
  'worldmodel',
  'canonicalpayload',
  'inputsummary',
  'outputsummary',
  'observations',
  'observation',
  'digest',
  'signature',
  'signaturecid',
]);

const HASH_SUFFIXES = [
  'cid',
  'digest',
  'error',
  'hash',
  'metadata',
  'notes',
  'payload',
  'summary',
  'signature',
  'uri',
];

const HASH_EXEMPT = new Set(['txhash']);

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return 'bytes';
  return typeof value;
}

function valueLength(value: unknown): number | undefined {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  if (Buffer.isBuffer(value)) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return undefined;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('hex');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashContent(value: unknown): string {
  const hash = createHash('sha256');
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    hash.update(value);
  } else {
    hash.update(safeStringify(value));
  }
  return `sha256:${hash.digest('hex')}`;
}

function hashedRepresentation(value: unknown): HashedPlaceholder {
  const digest = hashContent(value);
  const representation: HashedPlaceholder = {
    hashed: true,
    algorithm: 'sha256',
    digest,
    type: describeType(value),
  };
  const length = valueLength(value);
  if (typeof length === 'number') {
    representation.length = length;
  }
  return representation;
}

function normalizePath(path: string[]): string[] {
  return path
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment))
    .map((segment) => segment.toLowerCase());
}

function shouldHash(path: string[]): boolean {
  const normalized = normalizePath(path);
  if (normalized.length === 0) {
    return false;
  }
  for (const segment of normalized) {
    if (HASH_EXACT.has(segment)) {
      return true;
    }
  }
  for (let i = normalized.length - 1; i >= 0; i--) {
    const segment = normalized[i];
    if (HASH_EXEMPT.has(segment)) {
      return false;
    }
    for (const suffix of HASH_SUFFIXES) {
      if (segment.endsWith(suffix) && !HASH_EXEMPT.has(segment)) {
        return true;
      }
    }
  }
  return false;
}

function sanitizeValue(value: unknown, path: string[]): SanitizeResult {
  const hashes: Record<string, string> = {};
  const normalizedPath = normalizePath(path);
  const shouldHashValue = shouldHash(path);
  const fullPath = normalizedPath.join('.');

  if (value === undefined) {
    return { value: undefined, hashes };
  }

  if (
    shouldHashValue ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array
  ) {
    const representation = hashedRepresentation(value);
    if (fullPath) {
      hashes[fullPath] = representation.digest;
    }
    return { value: representation, hashes };
  }

  if (value === null) {
    return { value: null, hashes };
  }

  if (value instanceof Date) {
    return { value: value.toISOString(), hashes };
  }

  if (typeof value === 'bigint') {
    return { value: value.toString(), hashes };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value, hashes };
  }

  if (typeof value === 'string') {
    return { value, hashes };
  }

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const entry = sanitizeValue(value[i], [...path, String(i)]);
      result.push(entry.value);
      Object.assign(hashes, entry.hashes);
    }
    return { value: result, hashes };
  }

  if (value && typeof value === 'object') {
    const record: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const entry = sanitizeValue(val, [...path, key]);
      if (entry.value !== undefined) {
        record[key] = entry.value;
      }
      Object.assign(hashes, entry.hashes);
    }
    return { value: record, hashes };
  }

  return { value: String(value), hashes };
}

function sanitizeRecord(record: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  hashes: Record<string, string>;
} {
  const sanitized: Record<string, unknown> = {};
  const hashes: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const entry = sanitizeValue(value, [key]);
    if (entry.value !== undefined) {
      sanitized[key] = entry.value;
    }
    Object.assign(hashes, entry.hashes);
  }
  return { sanitized, hashes };
}

export function buildStructuredLogRecord(
  input: StructuredLogInput
): StructuredLogRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const base: Record<string, unknown> = {
    component: input.component,
    action: input.action,
    level: input.level ?? 'info',
    actor: input.actor,
    jobId: input.jobId,
    agentId: input.agentId,
    stageName: input.stageName,
  };
  if (input.details) {
    base.details = input.details;
  }
  if (input.extra) {
    for (const [key, value] of Object.entries(input.extra)) {
      if (value !== undefined) {
        base[key] = value;
      }
    }
  }
  const { sanitized, hashes } = sanitizeRecord(base);
  const canonical = JSON.stringify(sanitized);
  const digest = createHash('sha256').update(canonical).digest('hex');
  const record: StructuredLogRecord = {
    timestamp,
    component:
      typeof sanitized.component === 'string'
        ? (sanitized.component as string)
        : input.component,
    action:
      typeof sanitized.action === 'string'
        ? (sanitized.action as string)
        : input.action,
    level:
      typeof sanitized.level === 'string'
        ? (sanitized.level as string)
        : input.level ?? 'info',
    actor:
      typeof sanitized.actor === 'string'
        ? (sanitized.actor as string)
        : undefined,
    jobId:
      typeof sanitized.jobId === 'string'
        ? (sanitized.jobId as string)
        : undefined,
    agentId:
      typeof sanitized.agentId === 'string'
        ? (sanitized.agentId as string)
        : undefined,
    stageName:
      typeof sanitized.stageName === 'string'
        ? (sanitized.stageName as string)
        : undefined,
    details: sanitized.details,
    integrity: {
      version: 1,
      eventHash: `sha256:${digest}`,
      hashedFields: hashes,
    },
  };

  const reserved = new Set([
    'component',
    'action',
    'level',
    'actor',
    'jobId',
    'agentId',
    'stageName',
    'details',
  ]);

  for (const [key, value] of Object.entries(sanitized)) {
    if (reserved.has(key)) continue;
    record[key] = value;
  }

  return record;
}
