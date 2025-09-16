import fs from 'fs';
import path from 'path';
import { Wallet, getAddress } from 'ethers';
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

export interface EnsIdentityRecord {
  address: string;
  ensName: string;
  label: string;
  role: AgentRole;
  wallet?: Wallet;
  metadata?: AgentIdentityMetadata;
  verified: boolean;
  chainId?: number;
  network?: string;
  parent?: string;
  resolver?: string;
  source?: string;
  createdAt?: string;
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

interface StoredIdentityFile {
  address: string;
  privateKey?: string;
  ens?: string;
  role?: string;
  label?: string;
  metadata?: AgentIdentityMetadata;
  parent?: string;
  resolver?: string;
  chainId?: number;
  network?: string;
  createdAt?: string;
}

interface LoadedIdentityFile extends StoredIdentityFile {
  label?: string;
  ens?: string;
  wallet?: Wallet;
  verifiedEns?: string;
  filePath?: string;
}

const identityCache = new Map<string, AgentIdentity>();
let localFilesLoaded = false;
let localFilesLoading: Promise<void> | null = null;
const localIdentityMap = new Map<string, LoadedIdentityFile>();
const ensIdentityByLabel = new Map<string, LoadedIdentityFile>();
const ensIdentityByEns = new Map<string, LoadedIdentityFile>();
const ensIdentityByAddress = new Map<string, LoadedIdentityFile>();

function inferRoleFromEns(name?: string): AgentRole {
  if (!name) return 'agent';
  if (name.endsWith('.club.agi.eth')) return 'validator';
  if (name.endsWith('.a.agi.eth')) return 'business';
  if (name.endsWith('.agent.agi.eth')) return 'agent';
  return 'agent';
}

const KNOWN_AGENT_ROLES: AgentRole[] = [
  'agent',
  'validator',
  'business',
  'employer',
  'operator',
];

function normaliseRole(value?: string): AgentRole | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase() as AgentRole;
  return KNOWN_AGENT_ROLES.includes(lower) ? lower : undefined;
}

function normaliseLabel(
  filePath: string,
  record: StoredIdentityFile
): string | undefined {
  if (typeof record.label === 'string') {
    const trimmed = record.label.trim();
    if (trimmed) {
      return trimmed.toLowerCase();
    }
  }
  const base = path.basename(filePath, path.extname(filePath));
  if (!base) return undefined;
  return base.toLowerCase();
}

function normaliseEns(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function loadIdentityFile(
  filePath: string
): Promise<LoadedIdentityFile | null> {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as StoredIdentityFile;
  if (!parsed.address) {
    console.warn('Identity file missing address', filePath);
    return null;
  }
  let address: string;
  try {
    address = getAddress(parsed.address);
  } catch (err) {
    console.warn('Invalid address in identity file', filePath, err);
    return null;
  }

  let wallet: Wallet | undefined;
  if (parsed.privateKey) {
    try {
      const candidate = new Wallet(parsed.privateKey, provider);
      if (candidate.address.toLowerCase() !== address.toLowerCase()) {
        console.warn(
          `Private key/address mismatch in ${path.basename(
            filePath
          )}; ignoring private key`
        );
      } else {
        wallet = candidate;
      }
    } catch (err) {
      console.warn('Failed to load wallet from private key', filePath, err);
    }
  }

  const label = normaliseLabel(filePath, parsed);
  let ens = normaliseEns(parsed.ens);
  let verifiedEns: string | undefined;
  try {
    const lookup = await provider.lookupAddress(address);
    if (lookup) {
      if (ens) {
        if (lookup.toLowerCase() !== ens.toLowerCase()) {
          console.warn(
            `ENS mismatch for ${address}: expected ${ens}, resolved ${lookup}`
          );
        } else {
          verifiedEns = lookup;
        }
      } else {
        ens = lookup;
        verifiedEns = lookup;
      }
    } else if (ens) {
      console.warn(
        `ENS reverse lookup returned no result for ${address}; expected ${ens}`
      );
    }
  } catch (err) {
    console.warn('ENS lookup failed for', address, err);
  }

  const record: LoadedIdentityFile = {
    ...parsed,
    address,
    label,
    ens,
    wallet,
    verifiedEns,
    filePath,
  };

  return record;
}

function registerIdentity(record: LoadedIdentityFile): void {
  if (!record.address) return;
  const entries = new Set<string>();
  entries.add(record.address.toLowerCase());
  if (record.ens) entries.add(record.ens.toLowerCase());
  if (record.label) entries.add(record.label.toLowerCase());
  for (const key of entries) {
    localIdentityMap.set(key, record);
  }
  ensIdentityByAddress.set(record.address.toLowerCase(), record);
  if (record.ens) {
    ensIdentityByEns.set(record.ens.toLowerCase(), record);
  }
  if (record.label) {
    ensIdentityByLabel.set(record.label.toLowerCase(), record);
  }
}

async function ensureLocalFilesLoaded(): Promise<void> {
  if (localFilesLoaded) return;
  if (localFilesLoading) {
    await localFilesLoading;
    return;
  }
  localFilesLoading = (async () => {
    if (!fs.existsSync(agentDirectory)) {
      localFilesLoaded = true;
      return;
    }
    const files = fs
      .readdirSync(agentDirectory)
      .filter((file) => file.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(agentDirectory, file);
      try {
        const record = await loadIdentityFile(filePath);
        if (record) {
          registerIdentity(record);
        }
      } catch (err) {
        console.warn('Failed to parse identity file', file, err);
      }
    }
    localFilesLoaded = true;
  })();
  try {
    await localFilesLoading;
  } finally {
    localFilesLoading = null;
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
  await ensureLocalFilesLoaded();
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
  const localRole = normaliseRole(local?.role);
  const role =
    localRole ?? inferRoleFromEns(ensName) ?? inferRoleFromEns(local?.ens);
  const label = local?.label ?? (ensName ? ensName.split('.')[0] : undefined);
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

export async function getEnsIdentity(
  identifier: string
): Promise<EnsIdentityRecord | undefined> {
  if (!identifier) return undefined;
  const key = identifier.trim().toLowerCase();
  if (!key) return undefined;
  await ensureLocalFilesLoaded();
  const record =
    ensIdentityByLabel.get(key) ??
    ensIdentityByEns.get(key) ??
    ensIdentityByAddress.get(key);
  if (!record || !record.address || !record.ens || !record.label) {
    return undefined;
  }
  if (!record.wallet && record.privateKey) {
    try {
      const candidate = new Wallet(record.privateKey, provider);
      if (candidate.address.toLowerCase() === record.address.toLowerCase()) {
        record.wallet = candidate;
      } else {
        console.warn(
          'Stored private key does not match address for identity',
          record.filePath || record.address
        );
      }
    } catch (err) {
      console.warn('Failed to load wallet from stored private key', err);
    }
  }
  const verified =
    !!record.verifiedEns &&
    record.verifiedEns.toLowerCase() === record.ens.toLowerCase();
  const role = normaliseRole(record.role) ?? inferRoleFromEns(record.ens);
  return {
    address: record.address,
    ensName: record.ens,
    label: record.label,
    role,
    wallet: record.wallet,
    metadata: record.metadata,
    verified,
    chainId: record.chainId,
    network: record.network,
    parent: record.parent,
    resolver: record.resolver,
    source: record.filePath,
    createdAt: record.createdAt,
  };
}

export async function registerIdentityFile(
  filePath: string
): Promise<AgentIdentity | null> {
  try {
    await ensureLocalFilesLoaded();
    const record = await loadIdentityFile(filePath);
    if (!record) {
      return null;
    }
    registerIdentity(record);
    identityCache.delete(record.address.toLowerCase());
    return refreshIdentity(record.address);
  } catch (err) {
    console.warn('Failed to register identity file', filePath, err);
    return null;
  }
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
