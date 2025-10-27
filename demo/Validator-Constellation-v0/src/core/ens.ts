import { createHash, randomBytes } from 'crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { Hex } from './types';

const VALIDATOR_ROOTS = ['club.agi.eth', 'alpha.club.agi.eth'];
const AGENT_ROOTS = ['agent.agi.eth', 'alpha.agent.agi.eth'];
const NODE_ROOTS = ['node.agi.eth', 'alpha.node.agi.eth'];

export interface EnsLeaf {
  ensName: string;
  owner: Hex;
}

export interface EnsProofStep {
  sibling: Hex;
  isLeft: boolean;
}

export interface EnsProof {
  ensName: string;
  owner: Hex;
  path: EnsProofStep[];
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function computeLeafHash(leaf: EnsLeaf): Hex {
  const normalized = normalize(leaf.ensName);
  const encoded = toUtf8Bytes(`${normalized}::${leaf.owner}`);
  return keccak256(encoded) as Hex;
}

function hashPair(left: Hex, right: Hex): Hex {
  const leftBytes = Buffer.from(left.slice(2), 'hex');
  const rightBytes = Buffer.from(right.slice(2), 'hex');
  return keccak256(Buffer.concat([leftBytes, rightBytes])) as Hex;
}

export function buildMerkleRoot(leaves: EnsLeaf[]): Hex {
  if (leaves.length === 0) {
    throw new Error('cannot derive ENS merkle root with no leaves');
  }
  let layer = leaves.map((leaf) => computeLeafHash(leaf));
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? layer[i];
      next.push(hashPair(left, right));
    }
    layer = next;
  }
  return layer[0];
}

export function generateMerkleProof(leaves: EnsLeaf[], target: EnsLeaf): EnsProof {
  const normalized = normalize(target.ensName);
  const index = leaves.findIndex((leaf) => normalize(leaf.ensName) === normalized && leaf.owner === target.owner);
  if (index === -1) {
    throw new Error('leaf not found in ENS registry');
  }
  let layer = leaves.map((leaf) => computeLeafHash(leaf));
  const proof: EnsProofStep[] = [];
  let idx = index;
  while (layer.length > 1) {
    const isLeftNode = idx % 2 === 1;
    const siblingIndex = isLeftNode ? idx - 1 : idx + 1;
    const sibling = layer[siblingIndex] ?? layer[idx];
    proof.push({ sibling, isLeft: isLeftNode });
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? layer[i];
      next.push(hashPair(left, right));
    }
    layer = next;
    idx = Math.floor(idx / 2);
  }
  return {
    ensName: target.ensName,
    owner: target.owner,
    path: proof,
  };
}

export function verifyMerkleProof(root: Hex, proof: EnsProof): boolean {
  let hash = computeLeafHash({ ensName: proof.ensName, owner: proof.owner });
  for (const step of proof.path) {
    hash = step.isLeft ? hashPair(step.sibling, hash) : hashPair(hash, step.sibling);
  }
  return hash === root;
}

function isSubdomainOf(name: string, root: string): boolean {
  const normalized = normalize(name);
  const normalizedRoot = normalize(root);
  if (!normalized.endsWith(normalizedRoot)) {
    return false;
  }
  const prefix = normalized.slice(0, normalized.length - normalizedRoot.length);
  return prefix.endsWith('.') && prefix.length > 1;
}

export function assertValidatorDomain(name: string): void {
  if (!VALIDATOR_ROOTS.some((root) => isSubdomainOf(name, root))) {
    throw new Error(`validator ENS must be a subdomain of ${VALIDATOR_ROOTS.join(' or ')}`);
  }
}

export function assertAgentDomain(name: string): void {
  if (!AGENT_ROOTS.some((root) => isSubdomainOf(name, root))) {
    throw new Error(`agent ENS must be a subdomain of ${AGENT_ROOTS.join(' or ')}`);
  }
}

export function assertNodeDomain(name: string): void {
  if (!NODE_ROOTS.some((root) => isSubdomainOf(name, root))) {
    throw new Error(`node ENS must be a subdomain of ${NODE_ROOTS.join(' or ')}`);
  }
}

export function randomEnsNonce(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}
