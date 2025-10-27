import { keccak256, toUtf8Bytes } from 'ethers';
import { eventBus } from './eventBus';
import { Hex, JobResult, ZkBatchProof } from './types';

function hashJob(job: JobResult): Hex {
  const payload = JSON.stringify({ jobId: job.jobId, domainId: job.domainId, passed: job.passed, reportCID: job.reportCID });
  return keccak256(toUtf8Bytes(payload)) as Hex;
}

function hashPair(left: Hex, right: Hex): Hex {
  const leftBytes = Buffer.from(left.slice(2), 'hex');
  const rightBytes = Buffer.from(right.slice(2), 'hex');
  return keccak256(Buffer.concat([leftBytes, rightBytes])) as Hex;
}

export function computeJobRoot(jobs: JobResult[]): Hex {
  if (jobs.length === 0) {
    throw new Error('cannot compute root for empty job batch');
  }
  let layer = jobs.map((job) => hashJob(job));
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

export class ZkBatchProver {
  private verifyingKey: Hex;

  constructor(initialKey: Hex) {
    this.verifyingKey = initialKey;
  }

  setVerifyingKey(newKey: Hex): void {
    this.verifyingKey = newKey;
  }

  getVerifyingKey(): Hex {
    return this.verifyingKey;
  }

  prove(jobs: JobResult[], committeeSignature: string): ZkBatchProof {
    const jobRoot = computeJobRoot(jobs);
    const witnessCommitment = keccak256(toUtf8Bytes(`${jobRoot}:${this.verifyingKey}`)) as Hex;
    const transcriptCommitment = keccak256(
      toUtf8Bytes(
        jobs
          .map((job, index) => `${index}:${job.jobId}:${job.passed ? '1' : '0'}`)
          .join('|'),
      ),
    );
    const sealedOutput = keccak256(
      Buffer.concat([
        Buffer.from(jobRoot.slice(2), 'hex'),
        Buffer.from(witnessCommitment.slice(2), 'hex'),
        Buffer.from(committeeSignature.slice(2), 'hex'),
      ]),
    );

    const proof: ZkBatchProof = {
      proofId: `proof-${Date.now()}`,
      jobRoot: jobRoot as Hex,
      witnessCommitment: witnessCommitment as Hex,
      sealedOutput: sealedOutput as Hex,
      attestedJobCount: jobs.length,
      publicSignals: {
        committeeSignature: committeeSignature as Hex,
        transcriptCommitment: transcriptCommitment as Hex,
      },
    };
    eventBus.emit('ZkBatchFinalized', proof);
    return proof;
  }

  verify(jobs: JobResult[], proof: ZkBatchProof): boolean {
    if (jobs.length !== proof.attestedJobCount) {
      return false;
    }
    const expectedRoot = computeJobRoot(jobs);
    if (expectedRoot !== proof.jobRoot) {
      return false;
    }
    const expectedWitness = keccak256(toUtf8Bytes(`${proof.jobRoot}:${this.verifyingKey}`));
    if (expectedWitness !== proof.witnessCommitment) {
      return false;
    }
    const expectedTranscript = keccak256(
      toUtf8Bytes(
        jobs
          .map((job, index) => `${index}:${job.jobId}:${job.passed ? '1' : '0'}`)
          .join('|'),
      ),
    );
    if (expectedTranscript !== proof.publicSignals.transcriptCommitment) {
      return false;
    }
    const recomputedSeal = keccak256(
      Buffer.concat([
        Buffer.from(proof.jobRoot.slice(2), 'hex'),
        Buffer.from(proof.witnessCommitment.slice(2), 'hex'),
        Buffer.from(proof.publicSignals.committeeSignature.slice(2), 'hex'),
      ]),
    );
    return recomputedSeal === proof.sealedOutput;
  }
}
