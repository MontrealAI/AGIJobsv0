import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';

export interface AgentSignature {
  agentId: string;
  signer: string;
  signature: string;
  digest: string;
  canonicalPayload: string;
  algorithm: string;
}

interface AgentKeyConfig {
  [agentId: string]: string;
}

const AGENT_KEY_FILE = process.env.AGENT_KEY_FILE
  ? path.resolve(process.env.AGENT_KEY_FILE)
  : null;

const signerCache = new Map<string, Wallet>();
const configuredAgentIds = new Set<string>();
let loaded = false;

function normalizeAgentId(agentId: string): string {
  return agentId.trim().toLowerCase();
}

function loadAgentKeysFromEnv(): AgentKeyConfig {
  const source = process.env.AGENT_PRIVATE_KEYS;
  if (!source) return {};
  const config: AgentKeyConfig = {};
  const pairs = source
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const [rawId, rawKey] = pair.split(':').map((item) => item.trim());
    if (!rawId || !rawKey) continue;
    config[rawId] = rawKey;
  }
  return config;
}

function loadAgentKeysFromFile(): AgentKeyConfig {
  if (!AGENT_KEY_FILE) return {};
  try {
    if (!fs.existsSync(AGENT_KEY_FILE)) return {};
    const raw = fs.readFileSync(AGENT_KEY_FILE, 'utf8');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AgentKeyConfig;
    return parsed;
  } catch (err) {
    console.warn('Failed to read agent key file', err);
    return {};
  }
}

function hydrateSigners(): void {
  if (loaded) return;
  const config = {
    ...loadAgentKeysFromEnv(),
    ...loadAgentKeysFromFile(),
  };
  for (const [agentId, key] of Object.entries(config)) {
    try {
      const wallet = new Wallet(key);
      signerCache.set(agentId, wallet);
      signerCache.set(normalizeAgentId(agentId), wallet);
      signerCache.set(normalizeAgentId(wallet.address), wallet);
      configuredAgentIds.add(agentId);
    } catch (err) {
      console.warn(`Skipping invalid agent key for ${agentId}`, err);
    }
  }
  loaded = true;
}

export function registerAgentKey(agentId: string, privateKey: string): void {
  const wallet = new Wallet(privateKey);
  signerCache.set(agentId, wallet);
  signerCache.set(normalizeAgentId(agentId), wallet);
  signerCache.set(normalizeAgentId(wallet.address), wallet);
  configuredAgentIds.add(agentId);
}

export function getAgentSigner(agentId: string): Wallet | undefined {
  hydrateSigners();
  if (!agentId) return undefined;
  return (
    signerCache.get(agentId) ||
    signerCache.get(normalizeAgentId(agentId)) ||
    undefined
  );
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`;
  if (value instanceof Uint8Array)
    return `0x${Buffer.from(value).toString('hex')}`;
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (value instanceof Map)
    return Array.from(value.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => ({ key, value: normalizeValue(val) }));
  if (value instanceof Set)
    return Array.from(value.values())
      .map((item) => normalizeValue(item))
      .sort();
  if (typeof value === 'object') {
    if (typeof (value as any).toJSON === 'function') {
      return normalizeValue((value as any).toJSON());
    }
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      normalized[key] = normalizeValue(val);
    }
    return normalized;
  }
  return String(value);
}

export function canonicalizePayload(payload: unknown): string {
  const normalized = normalizeValue(payload);
  const serialized = JSON.stringify(normalized);
  if (serialized === undefined) {
    return JSON.stringify(String(payload ?? ''));
  }
  return serialized;
}

export function signAgentOutput(
  agentId: string,
  payload: unknown
): AgentSignature {
  const signer = getAgentSigner(agentId);
  if (!signer) {
    throw new Error(`No signing key configured for agent ${agentId}`);
  }
  const canonicalPayload = canonicalizePayload(payload);
  const digest = ethers.keccak256(ethers.toUtf8Bytes(canonicalPayload));
  const signature = signer.signMessageSync(ethers.getBytes(digest));
  return {
    agentId,
    signer: signer.address,
    signature,
    digest,
    canonicalPayload,
    algorithm: 'keccak256-eth-sign-v1',
  };
}

export function listConfiguredAgents(): string[] {
  hydrateSigners();
  return Array.from(configuredAgentIds.values());
}
