import { JobResult, ZkBatchSubmission } from './types';
import { keccak256, mixEntropy } from './utils';

export class ZkBatchProcessor {
  createBatch(jobs: JobResult[]): ZkBatchSubmission {
    const proofId = keccak256(jobs.map((job) => job.jobId).join('|'));
    const proofSeed = mixEntropy(jobs.map((job) => job.proofHash));
    const proof = keccak256(`${proofId}:${proofSeed}`);
    return {
      proofId,
      jobs,
      proof,
      verified: false,
    };
  }

  verify(batch: ZkBatchSubmission): ZkBatchSubmission {
    // mock verification – in production this would integrate a zk-SNARK verifier contract.
    batch.verified = true;
    return batch;
  }
}
