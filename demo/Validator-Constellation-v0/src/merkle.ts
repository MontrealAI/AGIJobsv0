import { keccak256, solidityPacked } from 'ethers';

export type MerkleTree = {
  root: string;
  leaves: string[];
  layers: string[][];
};

export function buildMerkleTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error('Cannot build a tree without leaves');
  }
  const sortedLeaves = [...leaves].sort();
  const layers: string[][] = [sortedLeaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] ?? prev[i];
      next.push(hashPair(left, right));
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], leaves: sortedLeaves, layers };
}

function hashPair(a: string, b: string): string {
  const ordered = [a, b].sort();
  return keccak256(solidityPacked(['bytes32', 'bytes32'], ordered));
}

export function getProof(tree: MerkleTree, leaf: string): string[] {
  const index = tree.leaves.indexOf(leaf);
  if (index === -1) {
    throw new Error('Leaf not in tree');
  }
  const proof: string[] = [];
  let currentIndex = index;
  for (let layerIndex = 0; layerIndex < tree.layers.length - 1; layerIndex += 1) {
    const layer = tree.layers[layerIndex];
    const pairIndex = currentIndex ^ 1;
    const pair = layer[pairIndex] ?? layer[currentIndex];
    proof.push(pair);
    currentIndex = Math.floor(currentIndex / 2);
  }
  return proof;
}
