import { MerkleTree } from 'merkletreejs';
import { keccak256, stringToHex } from 'viem';
import { BatchProof, JobOutcome } from '../types.js';
import { deriveProofId } from '../utils/crypto.js';

function bufferify(hex: `0x${string}`): Buffer {
  return Buffer.from(hex.slice(2), 'hex');
}

function hashBuffer(data: Buffer): Buffer {
  return bufferify(keccak256(`0x${data.toString('hex')}` as `0x${string}`));
}

export interface ZkBatchConfig {
  maxBatchSize: number;
}

export class ZkBatchAttestor {
  constructor(private config: ZkBatchConfig) {}

  public buildProof(outcomes: JobOutcome[]): BatchProof {
    if (outcomes.length === 0) {
      throw new Error('No outcomes provided');
    }
    if (outcomes.length > this.config.maxBatchSize) {
      throw new Error('Batch exceeds maximum size');
    }
    const leaves = outcomes.map((outcome) =>
      bufferify(
        keccak256(
          stringToHex(
            `${outcome.jobId}|${outcome.domain}|${outcome.executedBy}|${outcome.success ? '1' : '0'}|${outcome.cost}|${outcome.metadataHash}`
          )
        )
      )
    );
    const tree = new MerkleTree(leaves, hashBuffer, { sortPairs: true, hashLeaves: false });
    const validityRoot = `0x${tree.getRoot().toString('hex')}` as `0x${string}`;
    const proofId = deriveProofId([validityRoot, ...outcomes.map((outcome) => outcome.jobId)]);
    const leafProofs = outcomes.map((outcome, index) => {
      const leaf = leaves[index];
      const proof = tree.getProof(leaf).map((step) => `0x${step.data.toString('hex')}` as `0x${string}`);
      return { jobId: outcome.jobId, proof };
    });
    return {
      proofId,
      jobIds: outcomes.map((outcome) => outcome.jobId),
      validityRoot,
      proofData: JSON.stringify(leafProofs),
    };
  }
}
