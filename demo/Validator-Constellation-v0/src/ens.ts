import { getAddress, keccak256, solidityPacked } from 'ethers';

export type EnsIdentity = {
  address: string;
  ensName: string;
  ensNode: string;
};

export function encodeLeaf(identity: EnsIdentity): string {
  const normalised = getAddress(identity.address.toLowerCase());
  return keccak256(solidityPacked(['address', 'bytes32'], [normalised, identity.ensNode]));
}

export function toNode(namehash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(namehash)) {
    throw new Error(`Invalid ENS namehash: ${namehash}`);
  }
  return namehash;
}
