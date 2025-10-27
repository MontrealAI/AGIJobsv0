import { keccak256, solidityPacked } from "ethers";
import { EventBus } from "../subgraph/EventBus";
import { VoteValue } from "../commitReveal/CommitReveal";

export interface JobResult {
  jobId: string;
  domain: string;
  vote: VoteValue;
  witness: string;
}

export interface BatchProof {
  readonly batchId: string;
  readonly jobs: number;
  readonly aggregateHash: string;
  readonly commitment: string;
}

export class ZkBatchAttestor {
  constructor(private readonly bus: EventBus, private readonly capacity = 1000) {}

  buildProof(results: JobResult[], secret: string): BatchProof {
    if (results.length === 0) {
      throw new Error("Batch must contain at least one job result");
    }
    if (results.length > this.capacity) {
      throw new Error(`Batch exceeds capacity of ${this.capacity} jobs`);
    }
    const aggregateHash = this.aggregate(results);
    const commitment = keccak256(solidityPacked(["bytes32", "string"], [aggregateHash, secret]));
    const proof: BatchProof = {
      batchId: keccak256(solidityPacked(["bytes32", "uint256"], [aggregateHash, results.length])),
      jobs: results.length,
      aggregateHash,
      commitment,
    };
    this.bus.emit("BatchProofSubmitted", { batchId: proof.batchId, jobs: proof.jobs });
    return proof;
  }

  verify(results: JobResult[], proof: BatchProof, secret: string): boolean {
    if (results.length !== proof.jobs) {
      return false;
    }
    const aggregateHash = this.aggregate(results);
    if (aggregateHash !== proof.aggregateHash) {
      return false;
    }
    const expectedCommitment = keccak256(solidityPacked(["bytes32", "string"], [aggregateHash, secret]));
    return expectedCommitment === proof.commitment;
  }

  private aggregate(results: JobResult[]): string {
    let accumulator = "0x" + "00".repeat(32);
    for (const result of results) {
      const jobHash = keccak256(solidityPacked(["string", "string", "string"], [result.jobId, result.domain, result.vote]));
      accumulator = keccak256(solidityPacked(["bytes32", "bytes32", "string"], [accumulator, jobHash, result.witness]));
    }
    return accumulator;
  }
}
