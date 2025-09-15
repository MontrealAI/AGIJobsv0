import fs from 'fs';
import path from 'path';

export interface AuditLogEntry {
  action: string;
  timestamp?: string;
  actor?: string;
  jobId?: string;
  stageName?: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

const AUDIT_ROOT =
  process.env.AUDIT_LOG_DIR || path.resolve(__dirname, '../../logs/audit');

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

export function writeAuditLog(entry: AuditLogEntry): void {
  const now = new Date();
  const record = {
    ...entry,
    timestamp: entry.timestamp ?? now.toISOString(),
  };
  const file = currentLogFile(now);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function auditLog(
  action: string,
  entry: Omit<AuditLogEntry, 'action'>
): void {
  writeAuditLog({ action, ...entry });
}

export function auditLogPathFor(date: string): string {
  ensureDirectory(AUDIT_ROOT);
  return path.join(AUDIT_ROOT, `${date}.log`);
}

export function getAuditLogDirectory(): string {
  ensureDirectory(AUDIT_ROOT);
  return AUDIT_ROOT;
}
