import { CommitmentRecord, JobResult, ValidatorIdentity } from './types';
import { keccak256, now } from './utils';
import { validatorConfig } from './config';

export class CommitRevealRound {
  private commitments: CommitmentRecord[] = [];
  private readonly epochStartSeconds: number;

  constructor(private readonly job: JobResult, epochStartMs: number) {
    this.epochStartSeconds = Math.floor(epochStartMs / 1000);
  }

  commit(validator: ValidatorIdentity, vote: 'truth' | 'fraud', salt: string): CommitmentRecord {
    const commitment = keccak256(`${validator.address}:${this.job.jobId}:${vote}:${salt}`);
    const record: CommitmentRecord = {
      jobId: this.job.jobId,
      validator,
      commitment,
      salt,
      revealed: false,
    };
    this.commitments.push(record);
    return record;
  }

  reveal(record: CommitmentRecord, vote: 'truth' | 'fraud'): CommitmentRecord {
    const elapsedSeconds = now() - this.epochStartSeconds;
    const withinWindow = elapsedSeconds <= validatorConfig.revealWindowSeconds;
    if (!withinWindow) {
      throw new Error(`Reveal window elapsed for job ${this.job.jobId}.`);
    }
    const recomputed = keccak256(`${record.validator.address}:${this.job.jobId}:${vote}:${record.salt}`);
    if (recomputed !== record.commitment) {
      throw new Error(`Invalid reveal by ${record.validator.ens}.`);
    }
    record.revealed = true;
    record.vote = vote;
    return record;
  }

  getCommitments(): CommitmentRecord[] {
    return this.commitments;
  }

  quorumReached(): boolean {
    const reveals = this.commitments.filter((commitment) => commitment.revealed);
    const truthVotes = reveals.filter((commitment) => commitment.vote === 'truth').length;
    return reveals.length >= validatorConfig.quorum && truthVotes >= validatorConfig.quorum;
  }
}
