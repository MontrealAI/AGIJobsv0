import { encodeLeaf, defaultAllowlist } from "./allowlist";
import { MerkleTree } from "../utils/merkle";
import type { Role } from "./allowlist";

export interface EnsVerificationInput {
  readonly address: string;
  readonly ensName: string;
  readonly role: Role;
  readonly domain: string;
  readonly proof: string[];
}

export interface EnsVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly root: string;
}

function isValidNamespace(role: Role, ensName: string): boolean {
  const name = ensName.toLowerCase();
  switch (role) {
    case "validator":
      return (
        name.endsWith(".club.agi.eth") || name.endsWith(".alpha.club.agi.eth")
      );
    case "agent":
      return (
        name.endsWith(".agent.agi.eth") ||
        name.endsWith(".alpha.agent.agi.eth")
      );
    case "node":
      return (
        name.endsWith(".node.agi.eth") ||
        name.endsWith(".alpha.node.agi.eth")
      );
    default:
      return false;
  }
}

export class EnsIdentityVerifier {
  private readonly root: string;

  constructor(root: string = defaultAllowlist.root) {
    this.root = root;
  }

  verify(input: EnsVerificationInput): EnsVerificationResult {
    if (!isValidNamespace(input.role, input.ensName)) {
      return {
        valid: false,
        reason: `ENS namespace is not authorized for role ${input.role}`,
        root: this.root,
      };
    }

    const leaf = encodeLeaf(
      input.address,
      input.ensName,
      input.role,
      input.domain
    );
    const proof = input.proof.map((value) => value as `0x${string}`);
    const isMember = MerkleTree.verify(leaf, proof, this.root as `0x${string}`);

    return {
      valid: isMember,
      reason: isMember ? undefined : "Merkle proof invalid or not allowlisted",
      root: this.root,
    };
  }
}

export const ensVerifier = new EnsIdentityVerifier();
