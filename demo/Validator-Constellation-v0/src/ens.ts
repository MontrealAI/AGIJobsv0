import { Address, AgentProfile, ValidatorProfile } from "./types";

const VALIDATOR_ROOTS = [".club.agi.eth", ".alpha.club.agi.eth"];
const AGENT_ROOTS = [".agent.agi.eth", ".alpha.agent.agi.eth"];
const NODE_ROOTS = [".node.agi.eth", ".alpha.node.agi.eth"];

export type EnsRole = "validator" | "agent" | "node";

type RegistryRecord = {
  owner: Address;
  role: EnsRole;
};

export class EnsOwnershipRegistry {
  private records = new Map<string, RegistryRecord>();

  register(name: string, owner: Address, role: EnsRole) {
    if (!this.isValidNameForRole(name, role)) {
      throw new Error(`Invalid ENS name ${name} for role ${role}`);
    }
    this.records.set(name.toLowerCase(), { owner, role });
  }

  transfer(name: string, newOwner: Address) {
    const key = name.toLowerCase();
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`ENS name ${name} is not registered`);
    }
    this.records.set(key, { ...record, owner: newOwner });
  }

  verify(name: string, owner: Address, role: EnsRole): boolean {
    if (!this.isValidNameForRole(name, role)) {
      return false;
    }
    const record = this.records.get(name.toLowerCase());
    return !!record && record.owner.toLowerCase() === owner.toLowerCase() && record.role === role;
  }

  private isValidNameForRole(name: string, role: EnsRole): boolean {
    const lower = name.toLowerCase();
    const roots = role === "validator" ? VALIDATOR_ROOTS : role === "agent" ? AGENT_ROOTS : NODE_ROOTS;
    return roots.some((root) => {
      const normalizedRoot = root.replace(/^\./, "");
      if (!lower.endsWith(normalizedRoot)) {
        return false;
      }
      const nameParts = lower.split(".");
      const rootParts = normalizedRoot.split(".");
      if (nameParts.length <= rootParts.length) {
        return false;
      }
      const tail = nameParts.slice(-rootParts.length).join(".");
      return tail === rootParts.join(".");
    });
  }
}

export function buildValidatorProfile(address: Address, ensName: string, stake: bigint): ValidatorProfile {
  return {
    address,
    ensName,
    stake,
    active: true,
    slashCount: 0,
  };
}

export function buildAgentProfile(address: Address, ensName: string): AgentProfile {
  return {
    address,
    ensName,
    reputation: 0,
  };
}
