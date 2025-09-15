import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import manifestConfig from '../config/agents.json';
import { provider } from './utils';

export type AgentRole =
  | 'agent'
  | 'validator'
  | 'business'
  | 'employer'
  | 'operator';

export interface AgentIdentityMetadata {
  url?: string;
  skills?: string[];
  categories?: string[];
  energy?: number;
  reputation?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface AgentIdentity {
  address: string;
  ensName?: string;
  label?: string;
  role: AgentRole;
  metadata?: AgentIdentityMetadata;
  manifestCategories?: string[];
}

interface ManifestAgentEntry {
  address: string;
  energy?: number;
  reputation?: number;
  url?: string;
  ens?: string;
  skills?: string[];
  notes?: string;
}

type Manifest = Record<string, ManifestAgentEntry[]>;

const manifest: Manifest = manifestConfig as Manifest;
const agentDirectory = path.resolve(__dirname, '../config/agents');

interface LocalIdentityFile {
  address: string;
  privateKey?: string;
  ens?: string;
  role?: string;
  label?: string;
  metadata?: AgentIdentityMetadata;
}

const identityCache = new Map<string, AgentIdentity>();
let localFilesLoaded = false;
const localIdentityMap = new Map<string, LocalIdentityFile>();

function inferRoleFromEns(name?: string): AgentRole {
  if (!name) return 'agent';
  if (name.endsWith('.club.agi.eth')) return 'validator';
  if (name.endsWith('.a.agi.eth')) return 'business';
  if (name.endsWith('.agent.agi.eth')) return 'agent';
  return 'agent';
}

function ensureLocalFilesLoaded(): void {
  if (localFilesLoaded) return;
  localFilesLoaded = true;
  if (!fs.existsSync(agentDirectory)) {
    return;
  }
  const files = fs
    .readdirSync(agentDirectory)
    .filter((file) => file.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(agentDirectory, file), 'utf8');
      const data = JSON.parse(raw) as LocalIdentityFile;
      if (data.address) {
        localIdentityMap.set(data.address.toLowerCase(), data);
      }
      if (data.ens) {
        localIdentityMap.set(data.ens.toLowerCase(), data);
      }
      if (data.label) {
        localIdentityMap.set(data.label.toLowerCase(), data);
      }
    } catch (err) {
      // continue on malformed files to avoid blocking startup
      console.warn('Failed to parse identity file', file, err);
    }
  }
}

function buildMetadataFromManifest(address: string): {
  categories: string[];
  metadata?: AgentIdentityMetadata;
} {
  const categories: string[] = [];
  const metadata: AgentIdentityMetadata = {};
  const lower = address.toLowerCase();
  for (const [category, entries] of Object.entries(manifest)) {
    const match = entries.find(
      (entry) => entry.address.toLowerCase() === lower
    );
    if (match) {
      categories.push(category);
      if (typeof match.energy === 'number') metadata.energy = match.energy;
      if (typeof match.reputation === 'number')
        metadata.reputation = match.reputation;
      if (match.url) metadata.url = match.url;
      if (match.skills) metadata.skills = match.skills;
      if (match.notes) metadata.notes = match.notes;
      if (match.ens)
        metadata.notes = [metadata.notes, `ENS:${match.ens}`]
          .filter(Boolean)
          .join(' | ');
    }
  }
  return {
    categories,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

async function resolveIdentity(address: string): Promise<AgentIdentity> {
  const lower = address.toLowerCase();
  if (identityCache.has(lower)) {
    return identityCache.get(lower)!;
  }
  ensureLocalFilesLoaded();
  let ensName: string | undefined;
  try {
    const lookup = await provider.lookupAddress(address);
    ensName = lookup ?? undefined;
  } catch (err) {
    console.warn('ENS lookup failed', address, err);
  }
  const local = localIdentityMap.get(lower);
  if (!ensName && local?.ens) {
    ensName = local.ens;
  }
  const role = inferRoleFromEns(ensName) ?? inferRoleFromEns(local?.ens);
  const label = ensName ? ensName.split('.')[0] : local?.label;
  const manifestMeta = buildMetadataFromManifest(address);
  const identity: AgentIdentity = {
    address,
    ensName,
    label,
    role,
    metadata: local?.metadata || manifestMeta.metadata,
    manifestCategories: manifestMeta.categories,
  };
  identityCache.set(lower, identity);
  return identity;
}

export async function ensureIdentity(
  wallet: Wallet,
  expectedRole: AgentRole = 'agent'
): Promise<AgentIdentity> {
  const identity = await resolveIdentity(wallet.address);
  if (!identity.ensName) {
    throw new Error(
      `Wallet ${wallet.address} has no ENS name; expected ${expectedRole}. Register the required subdomain.`
    );
  }
  const role = inferRoleFromEns(identity.ensName);
  if (expectedRole === 'validator' && role !== 'validator') {
    throw new Error(
      `Wallet ${wallet.address} is not registered as a validator subdomain.`
    );
  }
  if (expectedRole === 'business' && role !== 'business') {
    throw new Error(
      `Wallet ${wallet.address} is not registered under *.a.agi.eth.`
    );
  }
  if (expectedRole === 'agent' && role !== 'agent' && role !== 'business') {
    throw new Error(
      `Wallet ${wallet.address} lacks an agent-compatible ENS name.`
    );
  }
  identity.role = role;
  return identity;
}

export async function refreshIdentity(address: string): Promise<AgentIdentity> {
  identityCache.delete(address.toLowerCase());
  return resolveIdentity(address);
}

export function getCachedIdentity(address: string): AgentIdentity | undefined {
  return identityCache.get(address.toLowerCase());
}

export function listManifestCategories(): string[] {
  return Object.keys(manifest);
}

export function getManifest(): Manifest {
  return manifest;
}
