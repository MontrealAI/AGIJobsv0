import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const SENSITIVE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[redacted-email]' },
  { regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[redacted-phone]' },
  { regex: /\b0x[a-fA-F0-9]{64}\b/g, replacement: '[redacted-secret]' },
  { regex: /\b[A-Z0-9]{40,}\b/g, replacement: '[redacted-token]' },
];

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

let cachedKey: Buffer | null | undefined;

function loadEncryptionKey(): Buffer | null {
  if (cachedKey !== undefined) {
    return cachedKey;
  }
  const raw = process.env.ONEBOX_RECEIPT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return null;
  }
  const candidates: Buffer[] = [];
  for (const encoding of ['base64', 'hex'] as const) {
    try {
      const buffer = Buffer.from(raw, encoding);
      if (buffer.length) {
        candidates.push(buffer);
      }
    } catch {
      // ignore parse failure and try the next encoding
    }
  }
  const candidate = candidates.find((buf) => buf.length >= 32) ?? null;
  if (!candidate) {
    console.warn('Receipt encryption key is invalid; expected 32 bytes of base64 or hex data.');
    cachedKey = null;
    return null;
  }
  cachedKey = candidate.subarray(0, 32);
  return cachedKey;
}

export interface EncryptionEnvelope {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  authTag: string;
}

function scrubString(value: string): string {
  let output = value.replace(CONTROL_CHAR_PATTERN, '');
  for (const pattern of SENSITIVE_PATTERNS) {
    output = output.replace(pattern.regex, pattern.replacement);
  }
  return output.trim();
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (value === null || depth > 8) {
    return value;
  }
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubUnknown(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const entries: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      entries[key] = scrubUnknown(entry, depth + 1);
    }
    return entries;
  }
  return value;
}

export function scrubForPrivacy<T>(value: T): T {
  return scrubUnknown(value) as T;
}

export function maybeEncryptSerialized(payload: string): EncryptionEnvelope | null {
  const key = loadEncryptionKey();
  if (!key) {
    return null;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function maybeDecryptEnvelope(envelope: EncryptionEnvelope): string | null {
  const key = loadEncryptionKey();
  if (!key) {
    return null;
  }
  try {
    const iv = Buffer.from(envelope.iv, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (error) {
    console.warn('Failed to decrypt receipt payload', error);
    return null;
  }
}

export function hasEncryptionKey(): boolean {
  return loadEncryptionKey() !== null;
}
