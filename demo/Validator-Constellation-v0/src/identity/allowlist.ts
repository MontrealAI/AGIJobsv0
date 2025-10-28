import { keccak256, solidityPacked } from "ethers";
import { deriveAllIdentities } from "../config/entities";
import { MerkleTree, hashLeaf } from "../utils/merkle";

export type Role = "validator" | "agent" | "node";

export interface AllowlistEntry {
  readonly address: string;
  readonly ensName: string;
  readonly role: Role;
  readonly domain: string;
  readonly proof: string[];
}

export interface AllowlistSnapshot {
  readonly root: string;
  readonly entries: AllowlistEntry[];
}

export function buildAllowlist(): AllowlistSnapshot {
  const identities = deriveAllIdentities();
  const leaves = identities.map((identity) =>
    encodeLeaf(identity.wallet.address, identity.ensName, identity.role, identity.domain)
  );
  const tree = new MerkleTree(leaves);
  const entries = identities.map((identity, index) => ({
    address: identity.wallet.address,
    ensName: identity.ensName,
    role: identity.role,
    domain: identity.domain,
    proof: tree.getProof(leaves[index]),
  }));
  return { root: tree.getRoot(), entries };
}

export function encodeLeaf(
  address: string,
  ensName: string,
  role: Role,
  domain: string
): `0x${string}` {
  const canonicalEns = ensName.toLowerCase();
  return hashLeaf(
    solidityPacked(
      ["address", "string", "string", "string"],
      [address, canonicalEns, role, domain]
    )
  );
}

export function hashSnapshot(snapshot: AllowlistSnapshot): string {
  return keccak256(
    Buffer.from(
      JSON.stringify({
        root: snapshot.root,
        entries: snapshot.entries.map((entry) => ({
          address: entry.address,
          ensName: entry.ensName,
          role: entry.role,
          domain: entry.domain,
        })),
      })
    )
  );
}

export const defaultAllowlist = buildAllowlist();
export const defaultAllowlistFingerprint = hashSnapshot(defaultAllowlist);
