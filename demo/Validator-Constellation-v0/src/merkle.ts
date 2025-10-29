import { getBytes, hexlify, keccak256, solidityPackedKeccak256, toUtf8Bytes } from 'ethers';

export interface MerkleTree {
  layers: string[][];
  leaves: string[];
}

export const combine = (left: string, right: string): string => {
  const [lo, hi] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(new Uint8Array([...getBytes(lo), ...getBytes(hi)]));
};

export const computeLeaf = (account: string, fqdn: string): string => {
  const nameHash = keccak256(toUtf8Bytes(fqdn));
  return solidityPackedKeccak256(['address', 'bytes32'], [account, nameHash]);
};

export const buildTree = (leaves: string[]): MerkleTree => {
  if (leaves.length === 0) {
    return { layers: [[]], leaves: [] };
  }
  const layers: string[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < Math.floor(current.length / 2); i += 1) {
      const left = current[2 * i];
      const right = current[2 * i + 1];
      next.push(combine(left, right));
    }
    if (current.length % 2 === 1) {
      next.push(current[current.length - 1]);
    }
    layers.push(next);
    current = next;
  }
  return { layers, leaves };
};

export const getProof = (tree: MerkleTree, index: number): string[] => {
  const proof: string[] = [];
  for (let level = 0; level < tree.layers.length - 1; level += 1) {
    const layer = tree.layers[level];
    const pairIndex = index ^ 1;
    if (pairIndex < layer.length) {
      proof.push(layer[pairIndex]);
    }
    index = Math.floor(index / 2);
  }
  return proof;
};

export const getRoot = (tree: MerkleTree): string => {
  const top = tree.layers[tree.layers.length - 1];
  if (top.length === 0) {
    return hexlify(new Uint8Array(32));
  }
  return top[0];
};
