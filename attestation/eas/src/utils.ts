import { ethers } from "ethers";

function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "bigint") {
    return `bigint:${value.toString()}`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return ethers.hexlify(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([key, val]) => ({
      key: String(key),
      value: normalizeValue(val),
    }));
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return entries;
  }
  if (value instanceof Set) {
    const entries = Array.from(value.values()).map((entry) => normalizeValue(entry));
    entries.sort();
    return entries;
  }
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.toJSON === "function") {
      try {
        return normalizeValue(candidate.toJSON());
      } catch (error) {
        return String(error);
      }
    }
    const entries = Object.entries(candidate)
      .map(([key, val]) => [key, normalizeValue(val)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      normalized[key] = val;
    }
    return normalized;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function canonicalize(value: unknown): unknown {
  return normalizeValue(value);
}

export function canonicalizeToJson(value: unknown): string {
  const normalized = canonicalize(value);
  const serialized = JSON.stringify(normalized);
  if (serialized !== undefined) {
    return serialized;
  }
  return JSON.stringify(String(value ?? ""));
}

export function computeReceiptDigest(payload: unknown): string {
  const canonical = canonicalizeToJson(payload);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function normalizeOptionalHex(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return ethers.getBytes(trimmed).length ? ethers.hexlify(trimmed) : trimmed;
  } catch {
    return trimmed;
  }
}

export function normalizeContext(context: Record<string, unknown> | undefined): string | undefined {
  if (!context) {
    return undefined;
  }
  const canonical = canonicalizeToJson(context);
  return canonical === "null" ? undefined : canonical;
}
