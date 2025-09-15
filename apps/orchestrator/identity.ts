import fs from 'fs';
import path from 'path';
import { JsonRpcProvider, Wallet, ethers } from 'ethers';
import { registerAgentKey } from './signing';

export type AgentRole =
  | 'agent'
  | 'validator'
  | 'operator'
  | 'employer'
  | 'business'
  | 'observer';

export interface IdentityFileRecord {
  ens?: string;
  address?: string;
  privateKey?: string;
  role?: AgentRole;
  label?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentIdentity extends IdentityFileRecord {
  id: string;
  address: string;
  wallet: Wallet;
  role: AgentRole;
  capabilities: string[];
}

export interface IdentityManagerOptions {
  directory?: string;
  fallbackRecords?: IdentityFileRecord[];
  skipEnsVerification?: boolean;
}

function defaultDirectory(): string {
  const fromEnv = process.env.AGENT_IDENTITY_DIR;
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(__dirname, '../../config/agents');
}

function parseDirectory(directory: string): IdentityFileRecord[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const records: IdentityFileRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(directory, entry.name);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw) as
        | IdentityFileRecord
        | IdentityFileRecord[];
      if (Array.isArray(parsed)) {
        records.push(...parsed);
      } else {
        records.push(parsed);
      }
    } catch (err) {
      console.warn(`Skipping malformed identity file ${filePath}:`, err);
    }
  }
  return records;
}

function normalizeRole(role?: AgentRole): AgentRole {
  if (!role) return 'agent';
  return role;
}

function uniqueId(record: IdentityFileRecord, wallet: Wallet): string {
  if (record.ens) return record.ens.toLowerCase();
  if (record.label) return record.label.toLowerCase();
  return wallet.address.toLowerCase();
}

async function verifyEns(
  provider: JsonRpcProvider,
  record: IdentityFileRecord,
  wallet: Wallet,
  skipVerification: boolean
): Promise<void> {
  if (!record.ens || skipVerification) return;
  try {
    const resolved = await provider.resolveName(record.ens);
    if (resolved && resolved.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(
        `ENS ${record.ens} resolves to ${resolved}, expected ${wallet.address}`
      );
    }
    const reverse = await provider.lookupAddress(wallet.address);
    if (reverse && reverse.toLowerCase() !== record.ens.toLowerCase()) {
      throw new Error(
        `Reverse record ${reverse} does not match expected ${record.ens}`
      );
    }
  } catch (err) {
    if (skipVerification) return;
    throw err;
  }
}

function validateRecord(record: IdentityFileRecord): void {
  if (!record.privateKey) {
    throw new Error('privateKey is required');
  }
  if (record.address) {
    if (!ethers.isAddress(record.address)) {
      throw new Error(`Invalid address: ${record.address}`);
    }
  }
}

function hydrateRecords(
  provider: JsonRpcProvider,
  rawRecords: IdentityFileRecord[],
  skipEnsVerification: boolean
): Promise<AgentIdentity[]> {
  const results: AgentIdentity[] = [];
  const work = rawRecords.map(async (record) => {
    try {
      validateRecord(record);
      const wallet = new Wallet(record.privateKey!, provider);
      if (
        record.address &&
        wallet.address.toLowerCase() !== record.address.toLowerCase()
      ) {
        throw new Error(
          `Address mismatch for ENS ${record.ens || record.label || 'unknown'}`
        );
      }
      await verifyEns(provider, record, wallet, skipEnsVerification);
      const id = uniqueId(record, wallet);
      const normalizedRole = normalizeRole(record.role);
      const capabilities = record.capabilities ?? [];
      const identity: AgentIdentity = {
        ...record,
        id,
        address: wallet.address,
        wallet,
        role: normalizedRole,
        capabilities,
      };
      registerAgentKey(id, wallet.privateKey);
      results.push(identity);
    } catch (err) {
      console.warn('Skipping identity record due to error:', err);
    }
  });
  return Promise.all(work).then(() => results);
}

export class IdentityManager {
  private readonly provider: JsonRpcProvider;
  private readonly skipEnsVerification: boolean;
  private readonly records = new Map<string, AgentIdentity>();
  private readonly addresses = new Map<string, AgentIdentity>();
  private readonly roles = new Map<AgentRole, AgentIdentity[]>();

  constructor(provider: JsonRpcProvider, options?: IdentityManagerOptions) {
    this.provider = provider;
    this.skipEnsVerification = Boolean(options?.skipEnsVerification);
  }

  async load(options?: IdentityManagerOptions): Promise<void> {
    const directory = options?.directory || defaultDirectory();
    const envRecords = this.loadFromEnv();
    const diskRecords = parseDirectory(directory);
    const fallback = options?.fallbackRecords ?? [];
    const records = [...diskRecords, ...envRecords, ...fallback];
    const hydrated = await hydrateRecords(
      this.provider,
      records,
      this.skipEnsVerification || Boolean(options?.skipEnsVerification)
    );
    this.records.clear();
    this.addresses.clear();
    this.roles.clear();
    for (const record of hydrated) {
      this.records.set(record.id, record);
      this.addresses.set(record.address.toLowerCase(), record);
      const list = this.roles.get(record.role) ?? [];
      list.push(record);
      this.roles.set(record.role, list);
    }
  }

  private loadFromEnv(): IdentityFileRecord[] {
    const raw = process.env.AGENT_IDENTITIES;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as IdentityFileRecord[];
      }
      return [parsed as IdentityFileRecord];
    } catch (err) {
      console.warn('Failed to parse AGENT_IDENTITIES env var:', err);
      return [];
    }
  }

  list(): AgentIdentity[] {
    return Array.from(this.records.values());
  }

  listByRole(role: AgentRole): AgentIdentity[] {
    return [...(this.roles.get(role) ?? [])];
  }

  get(idOrEns: string): AgentIdentity | undefined {
    const key = idOrEns.toLowerCase();
    return this.records.get(key);
  }

  getByAddress(address: string): AgentIdentity | undefined {
    const key = address.toLowerCase();
    return this.addresses.get(key);
  }

  getPrimary(role: AgentRole): AgentIdentity | undefined {
    const list = this.roles.get(role);
    return list && list.length ? list[0] : undefined;
  }

  getWallet(addressOrId: string): Wallet | undefined {
    const record = this.get(addressOrId) || this.getByAddress(addressOrId);
    return record?.wallet;
  }

  getCapabilities(addressOrId: string): string[] {
    const record =
      this.get(addressOrId) || this.getByAddress(addressOrId.toLowerCase());
    return record?.capabilities ?? [];
  }
}
