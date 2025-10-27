import { keccak256, toUtf8Bytes } from "ethers";

export type EnsRole = "validator" | "agent" | "node";

export interface EnsRecord {
  name: string;
  owner: string;
  role: EnsRole;
  merkleProof?: string[];
}

const VALIDATOR_ROOTS = ["club.agi.eth", "alpha.club.agi.eth"];
const AGENT_ROOTS = ["agent.agi.eth", "alpha.agent.agi.eth"];
const NODE_ROOTS = ["node.agi.eth", "alpha.node.agi.eth"];

function normaliseAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid address ${address}`);
  }
  return address.toLowerCase();
}

function ensureSubdomain(name: string, root: string): boolean {
  if (!name.toLowerCase().endsWith(root)) {
    return false;
  }
  const prefix = name.slice(0, name.length - root.length);
  return prefix.length > 1 && prefix.endsWith(".");
}

function buildLeaf(name: string, owner: string): string {
  return keccak256(toUtf8Bytes(`${name.toLowerCase()}::${normaliseAddress(owner)}`));
}

export class EnsRegistry {
  private readonly records = new Map<string, EnsRecord>();
  private readonly blacklist = new Set<string>();

  constructor(initialRecords: EnsRecord[] = []) {
    initialRecords.forEach((record) => this.register(record));
  }

  register(record: EnsRecord): void {
    const nameKey = record.name.toLowerCase();
    if (!this.isValidForRole(record.name, record.role)) {
      throw new Error(`ENS name ${record.name} does not satisfy naming policy for role ${record.role}`);
    }
    const owner = normaliseAddress(record.owner);
    this.records.set(nameKey, { ...record, owner });
  }

  blacklistAddress(address: string): void {
    this.blacklist.add(normaliseAddress(address));
  }

  isAuthorised(address: string, name: string, role: EnsRole, merkleRoot?: string): boolean {
    if (this.blacklist.has(normaliseAddress(address))) {
      return false;
    }
    const nameKey = name.toLowerCase();
    const record = this.records.get(nameKey);
    if (!record || record.role !== role) {
      return false;
    }
    if (record.owner !== normaliseAddress(address)) {
      return false;
    }
    if (record.merkleProof && merkleRoot) {
      return this.verifyMerkleProof(name, record.owner, record.merkleProof, merkleRoot);
    }
    return true;
  }

  assertAuthorised(address: string, name: string, role: EnsRole, merkleRoot?: string): void {
    if (!this.isAuthorised(address, name, role, merkleRoot)) {
      throw new Error(`Address ${address} is not authorised to operate as ${role} using ${name}`);
    }
  }

  verifyMerkleProof(name: string, owner: string, proof: string[], root: string): boolean {
    let computed = buildLeaf(name, owner);
    for (const sibling of proof) {
      const [lower, upper] = [computed, sibling].sort();
      computed = keccak256(toUtf8Bytes(`${lower}:${upper}`));
    }
    return computed === root;
  }

  isValidForRole(name: string, role: EnsRole): boolean {
    const roots = role === "validator" ? VALIDATOR_ROOTS : role === "agent" ? AGENT_ROOTS : NODE_ROOTS;
    return roots.some((root) => ensureSubdomain(name, root));
  }

  list(role?: EnsRole): EnsRecord[] {
    return Array.from(this.records.values()).filter((record) => !role || record.role === role);
  }
}

export const ensPolicies = {
  validatorRoots: VALIDATOR_ROOTS,
  agentRoots: AGENT_ROOTS,
  nodeRoots: NODE_ROOTS,
};
