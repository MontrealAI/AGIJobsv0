import { hashCommit } from '../utils/crypto.js';
import { CommitPayload, CommitRecord, RevealPayload, RevealRecord } from '../types.js';

export interface CommitRevealConfig {
  revealDeadlineBlocks: number;
  quorum: number;
  slashPenaltyReason: string;
}

export class CommitRevealRound {
  private commits = new Map<`0x${string}`, CommitRecord>();
  private reveals = new Map<`0x${string}`, RevealRecord>();
  private closed = false;

  constructor(private config: CommitRevealConfig, private blockNumber: number, private roundId: string) {}

  public commit(validator: `0x${string}`, payload: CommitPayload, salt: string) {
    if (this.closed) {
      throw new Error('Round closed');
    }
    const commitHash = hashCommit(payload, salt);
    this.commits.set(validator, {
      validator,
      commitHash,
      payload,
      revealed: false,
    });
  }

  public reveal(validator: `0x${string}`, payload: RevealPayload, salt: string, currentBlock: number) {
    if (this.closed) {
      throw new Error('Round closed');
    }
    const commit = this.commits.get(validator);
    if (!commit) {
      throw new Error('Commit not found');
    }
    const expectedHash = hashCommit(payload, salt);
    if (expectedHash !== commit.commitHash) {
      throw new Error('Commit mismatch');
    }
    if (currentBlock - this.blockNumber > this.config.revealDeadlineBlocks) {
      throw new Error('Reveal window closed');
    }
    const revealHash = hashCommit(payload, salt);
    const updatedCommit: CommitRecord = { ...commit, revealed: true };
    this.commits.set(validator, updatedCommit);
    const record: RevealRecord = {
      ...updatedCommit,
      payload,
      revealHash,
    };
    this.reveals.set(validator, record);
  }

  public closeRound() {
    this.closed = true;
  }

  public computeResult() {
    const votes = [...this.reveals.values()].map((record) => record.payload.vote);
    const yesVotes = votes.filter(Boolean).length;
    const noVotes = votes.length - yesVotes;
    const quorumReached = votes.length >= this.config.quorum;
    return {
      yesVotes,
      noVotes,
      quorumReached,
      slashCandidates: this.identifySlashCandidates(),
    };
  }

  private identifySlashCandidates(): `0x${string}`[] {
    const offenders: `0x${string}`[] = [];
    for (const [validator, record] of this.commits.entries()) {
      if (!record.revealed) {
        offenders.push(validator);
        continue;
      }
      const reveal = this.reveals.get(validator);
      if (!reveal) {
        offenders.push(validator);
      } else if (reveal.payload.vote === false) {
        offenders.push(validator);
      }
    }
    return offenders;
  }
}
