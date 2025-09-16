import fs from 'fs';
import path from 'path';
import {
  buildStructuredLogRecord,
  type StructuredLogRecord,
} from '../../shared/structuredLogger';

export interface AuditLogEntry {
  action: string;
  timestamp?: string;
  level?: string;
  actor?: string;
  jobId?: string;
  stageName?: string;
  agentId?: string;
  component?: string;
  details?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

const AUDIT_ROOT =
  process.env.AUDIT_LOG_DIR || path.resolve(__dirname, '../../logs/audit');
const DEFAULT_COMPONENT = process.env.AUDIT_COMPONENT || 'meta-orchestrator';

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function currentLogFile(now: Date): string {
  const date = now.toISOString().slice(0, 10);
  ensureDirectory(AUDIT_ROOT);
  return path.join(AUDIT_ROOT, `${date}.log`);
}

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function writeAuditLog(record: StructuredLogRecord): void {
  const timestamp = parseTimestamp(record.timestamp) ?? new Date();
  const file = currentLogFile(timestamp);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function auditLog(
  action: string,
  entry: Omit<AuditLogEntry, 'action'>
): void {
  const timestamp = entry.timestamp
    ? entry.timestamp
    : new Date().toISOString();
  const record = buildStructuredLogRecord({
    component: entry.component ?? DEFAULT_COMPONENT,
    action,
    timestamp,
    level: entry.level,
    actor: entry.actor,
    jobId: entry.jobId,
    agentId: entry.agentId,
    stageName: entry.stageName,
    details: entry.details,
    extra: entry.extra,
  });
  writeAuditLog(record);
}

export function auditLogPathFor(date: string): string {
  ensureDirectory(AUDIT_ROOT);
  return path.join(AUDIT_ROOT, `${date}.log`);
}

export function getAuditLogDirectory(): string {
  ensureDirectory(AUDIT_ROOT);
  return AUDIT_ROOT;
}
