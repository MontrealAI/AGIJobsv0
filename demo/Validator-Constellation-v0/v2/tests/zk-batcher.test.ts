import { describe, expect, it } from 'vitest';
import { ZkBatchAttestor } from '../src/zk/zk-batcher.js';

const attestor = new ZkBatchAttestor({ maxBatchSize: 1000 });

describe('ZkBatchAttestor', () => {
  it('creates proofs for batched outcomes', () => {
    const outcomes = Array.from({ length: 5 }).map((_, index) => ({
      jobId: `job-${index}`,
      domain: 'research' as const,
      executedBy: 'clio.agent.agi.eth',
      success: true,
      cost: BigInt(index + 1),
      metadataHash: `0x0${index}` as `0x${string}`,
    }));
    const proof = attestor.buildProof(outcomes);
    expect(proof.jobIds).toHaveLength(5);
    expect(proof.proofData).toContain('job-1');
  });

  it('rejects oversized batches', () => {
    const outcomes = Array.from({ length: 1001 }).map((_, index) => ({
      jobId: `job-${index}`,
      domain: 'research' as const,
      executedBy: 'clio.agent.agi.eth',
      success: true,
      cost: BigInt(index + 1),
      metadataHash: `0x0${index % 10}` as `0x${string}`,
    }));
    expect(() => attestor.buildProof(outcomes)).toThrowError('Batch exceeds maximum size');
  });
});
