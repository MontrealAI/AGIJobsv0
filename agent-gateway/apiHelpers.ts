import { ethers } from 'ethers';
import { DeliverableContributor } from './deliverableStore';
import { provider, TOKEN_DECIMALS } from './utils';
import { ROLE_AGENT, ROLE_PLATFORM, ROLE_VALIDATOR } from './stakeCoordinator';

export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalised);
  }
  return false;
}

export function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export function pickQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

export function parseFloatParam(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseTokenAmount(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    try {
      return ethers.parseUnits(value.toString(), TOKEN_DECIMALS);
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return ethers.parseUnits(trimmed, TOKEN_DECIMALS);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function formatTokenAmount(value: bigint): string {
  try {
    return ethers.formatUnits(value, TOKEN_DECIMALS);
  } catch {
    return value.toString();
  }
}

export async function resolveAgentAddress(raw: string): Promise<string | null> {
  const identifier = raw?.trim();
  if (!identifier) {
    return null;
  }
  if (identifier.endsWith('.eth')) {
    try {
      const resolved = await provider.resolveName(identifier);
      if (resolved) {
        return ethers.getAddress(resolved);
      }
    } catch (err) {
      console.warn('ENS resolve failed for agent lookup', identifier, err);
    }
  }
  if (ethers.isAddress(identifier)) {
    return ethers.getAddress(identifier);
  }
  return null;
}

export function parseRoleInput(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return ROLE_AGENT;
    }
    if (trimmed === 'agent') return ROLE_AGENT;
    if (trimmed === 'validator') return ROLE_VALIDATOR;
    if (trimmed === 'platform') return ROLE_PLATFORM;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return ROLE_AGENT;
}

export function normaliseMetadata(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function canonicaliseContributorPayload(payload: unknown): string {
  try {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function parseContributors(
  raw: unknown
): DeliverableContributor[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const contributors: DeliverableContributor[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const address = (entry as { address?: unknown }).address;
    if (typeof address !== 'string') {
      continue;
    }
    let normalised: string;
    try {
      normalised = ethers.getAddress(address);
    } catch {
      normalised = address.toLowerCase();
    }
    const contributor: DeliverableContributor = { address: normalised };
    const ens = (entry as { ens?: unknown }).ens;
    if (typeof ens === 'string' && ens.trim().length > 0) {
      contributor.ens = ens.trim();
    }
    const role = (entry as { role?: unknown }).role;
    if (typeof role === 'string' && role.trim().length > 0) {
      contributor.role = role.trim();
    }
    const label = (entry as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim().length > 0) {
      contributor.label = label.trim();
    }
    const metadata = (entry as { metadata?: unknown }).metadata;
    if (metadata && typeof metadata === 'object') {
      contributor.metadata = metadata as Record<string, unknown>;
    }
    const payload = (entry as { payload?: unknown }).payload;
    const signature = (entry as { signature?: unknown }).signature;
    const payloadDigest = (entry as { payloadDigest?: unknown }).payloadDigest;
    if (typeof signature === 'string' && signature.trim().length > 0) {
      if (payload !== undefined) {
        const canonical = canonicaliseContributorPayload(payload);
        try {
          const recovered = ethers
            .verifyMessage(canonical, signature)
            .toLowerCase();
          if (recovered !== normalised.toLowerCase()) {
            throw new Error('mismatch');
          }
          contributor.signature = signature;
          contributor.payloadDigest = ethers.hashMessage(canonical);
        } catch (err) {
          throw new Error(
            `Contributor signature verification failed for ${address}: ${String(
              (err as Error)?.message || err
            )}`
          );
        }
      } else {
        contributor.signature = signature;
        if (typeof payloadDigest === 'string' && payloadDigest.trim().length > 0) {
          contributor.payloadDigest = payloadDigest.trim();
        }
      }
    } else if (
      typeof payloadDigest === 'string' &&
      payloadDigest.trim().length > 0
    ) {
      contributor.payloadDigest = payloadDigest.trim();
    }
    contributors.push(contributor);
  }
  return contributors.length > 0 ? contributors : undefined;
}
