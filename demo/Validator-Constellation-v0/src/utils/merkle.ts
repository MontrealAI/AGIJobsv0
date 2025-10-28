import { keccak256 } from "ethers";

export type Hex = `0x${string}`;

export function hashLeaf(data: string): Hex {
  const buffer = data.startsWith("0x")
    ? Buffer.from(data.slice(2), "hex")
    : Buffer.from(data, "utf8");
  return keccak256(buffer);
}

export function hashPair(a: Hex, b: Hex): Hex {
  const [left, right] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  const buffer = Buffer.concat([
    Buffer.from(left.slice(2), "hex"),
    Buffer.from(right.slice(2), "hex"),
  ]);
  return keccak256(buffer);
}

export class MerkleTree {
  private readonly layers: Hex[][];

  constructor(leaves: Hex[]) {
    if (!leaves.length) {
      throw new Error("Cannot build Merkle tree without leaves");
    }
    this.layers = [leaves];
    while (this.layers[this.layers.length - 1].length > 1) {
      const prev = this.layers[this.layers.length - 1];
      const next: Hex[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        const left = prev[i];
        const right = prev[i + 1] ?? prev[i];
        next.push(hashPair(left, right));
      }
      this.layers.push(next);
    }
  }

  getRoot(): Hex {
    const lastLayer = this.layers[this.layers.length - 1];
    return lastLayer[0];
  }

  getProof(leaf: Hex): Hex[] {
    const proof: Hex[] = [];
    let idx = this.layers[0].findIndex((value) => value === leaf);
    if (idx === -1) {
      throw new Error("Leaf not found in Merkle tree");
    }
    for (let level = 0; level < this.layers.length - 1; level += 1) {
      const layer = this.layers[level];
      const isRightNode = idx % 2 === 1;
      const pairIndex = isRightNode ? idx - 1 : idx + 1;
      const pairNode = layer[pairIndex] ?? layer[idx];
      proof.push(pairNode);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  static verify(leaf: Hex, proof: Hex[], root: Hex): boolean {
    return proof.reduce((hash, sibling) => hashPair(hash, sibling), leaf) === root;
  }
}
