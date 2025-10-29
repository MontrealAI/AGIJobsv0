import { createHash } from "crypto";
import { Address, BatchProof, JobResult } from "./types";

export interface BatchConfig {
  maxJobs: number;
  trustedVerifier: Address;
}

export class ZkBatchVerifier {
  constructor(private config: BatchConfig) {}

  produceProof(jobs: JobResult[], prover: Address): BatchProof {
    if (jobs.length === 0) {
      throw new Error("No jobs to prove");
    }
    if (jobs.length > this.config.maxJobs) {
      throw new Error("Batch exceeds circuit capacity");
    }
    const hash = createHash("sha256");
    jobs.forEach((job) => hash.update(job.jobId + job.outcomeHash));
    const proofId = hash.digest("hex");
    return {
      proofId,
      jobIds: jobs.map((job) => job.jobId),
      verifierAddress: prover,
      timestamp: Date.now(),
    };
  }

  verifyProof(proof: BatchProof, jobs: JobResult[], submitter: Address): boolean {
    if (submitter.toLowerCase() !== this.config.trustedVerifier.toLowerCase()) {
      throw new Error("Only trusted verifier can submit proofs");
    }
    if (jobs.length !== proof.jobIds.length) {
      return false;
    }
    const recomputed = this.produceProof(jobs, proof.verifierAddress);
    return recomputed.proofId === proof.proofId;
  }
}
