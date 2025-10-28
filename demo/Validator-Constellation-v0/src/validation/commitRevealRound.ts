import { keccak256, solidityPacked } from "ethers";
import { governanceDefaults } from "../config/defaults";
import type { EventIndexer } from "../subgraph/eventIndexer";
import type { StakeManager } from "../stake/stakeManager";
import type { PseudoVrfProof } from "../vrf/pseudoVrf";
import type {
  CommitSubmission,
  FinalizationResult,
  VoteChoice,
  ValidatorProfile,
} from "./types";

export interface CommitRevealConfig {
  readonly quorum: number;
  readonly committeeSize: number;
  readonly commitDeadlineSeconds: number;
  readonly revealDeadlineSeconds: number;
  readonly nonRevealSlashBps: number;
  readonly dishonestSlashBps: number;
}

export interface CommitRevealRoundOptions {
  readonly roundId: string;
  readonly jobBatchId: string;
  readonly committee: readonly ValidatorProfile[];
  readonly seed: string;
  readonly config?: Partial<CommitRevealConfig>;
}

interface CommitRecord {
  readonly submission: CommitSubmission;
  readonly timestamp: number;
}

interface RevealRecord {
  readonly submission: {
    readonly validator: ValidatorProfile;
    readonly vote: VoteChoice;
    readonly salt: string;
  };
  readonly timestamp: number;
}

export class CommitRevealRound {
  private readonly config: CommitRevealConfig;
  private readonly commits = new Map<string, CommitRecord>();
  private readonly reveals = new Map<string, RevealRecord>();
  private finalized = false;

  constructor(
    private readonly options: CommitRevealRoundOptions,
    private readonly stakeManager: StakeManager,
    private readonly indexer: EventIndexer
  ) {
    this.config = {
      quorum: options.config?.quorum ?? governanceDefaults.quorum,
      committeeSize:
        options.config?.committeeSize ?? governanceDefaults.committeeSize,
      commitDeadlineSeconds:
        options.config?.commitDeadlineSeconds ?? governanceDefaults.commitDeadlineSeconds,
      revealDeadlineSeconds:
        options.config?.revealDeadlineSeconds ?? governanceDefaults.revealDeadlineSeconds,
      nonRevealSlashBps:
        options.config?.nonRevealSlashBps ?? governanceDefaults.nonRevealSlashBps,
      dishonestSlashBps:
        options.config?.dishonestSlashBps ?? governanceDefaults.dishonestSlashBps,
    };
  }

  private validateCommittee(address: string): boolean {
    return this.options.committee.some(
      (validator) => validator.address.toLowerCase() === address.toLowerCase()
    );
  }

  private computeCommitment(vote: VoteChoice, salt: string): string {
    return keccak256(
      solidityPacked(["string", "string"], [vote, salt.toLowerCase()])
    );
  }

  submitCommit(submission: CommitSubmission) {
    if (this.finalized) {
      throw new Error("Round already finalized");
    }
    const address = submission.validator.address.toLowerCase();
    if (!this.validateCommittee(address)) {
      throw new Error("Validator not part of committee");
    }
    const expectedCommitment = this.computeCommitment(
      submission.vote,
      submission.salt
    );
    if (expectedCommitment !== submission.commitment) {
      throw new Error("Commitment mismatch with vote + salt");
    }

    const existingCommit = this.commits.get(address);
    if (existingCommit) {
      throw new Error("Commit already submitted");
    }

    this.commits.set(address, {
      submission,
      timestamp: Date.now(),
    });
    this.indexer.recordEvent("CommitSubmitted", {
      roundId: this.options.roundId,
      validator: submission.validator.ensName,
      address: submission.validator.address,
      commitment: submission.commitment,
      vrfOutput: submission.vrfProof.output,
    });
  }

  submitReveal(submission: RevealSubmission) {
    if (this.finalized) {
      throw new Error("Round already finalized");
    }
    const address = submission.validator.address.toLowerCase();
    const commitRecord = this.commits.get(address);
    if (!commitRecord) {
      throw new Error("Commitment not found");
    }
    const commitment = this.computeCommitment(
      submission.vote,
      submission.salt
    );
    if (commitment !== commitRecord.submission.commitment) {
      throw new Error("Reveal does not match commitment");
    }
    if (this.reveals.has(address)) {
      throw new Error("Reveal already submitted");
    }
    this.reveals.set(address, {
      submission,
      timestamp: Date.now(),
    });
    this.indexer.recordEvent("VoteRevealed", {
      roundId: this.options.roundId,
      validator: submission.validator.ensName,
      address: submission.validator.address,
      vote: submission.vote,
    });
  }

  getCommittee(): readonly ValidatorProfile[] {
    return this.options.committee;
  }

  getConfig(): CommitRevealConfig {
    return this.config;
  }

  finalize(expectedVerdict: VoteChoice): FinalizationResult {
    if (this.finalized) {
      throw new Error("Round already finalized");
    }
    this.finalized = true;
    const votesFor = Array.from(this.reveals.values()).filter(
      (reveal) => reveal.submission.vote === "approve"
    ).length;
    const votesAgainst = Array.from(this.reveals.values()).filter(
      (reveal) => reveal.submission.vote === "reject"
    ).length;
    const quorumMet = votesFor + votesAgainst >= this.config.quorum;

    const slashed: string[] = [];

    for (const validator of this.options.committee) {
      const address = validator.address.toLowerCase();
      const revealed = this.reveals.get(address);
      if (!revealed) {
        if (this.config.nonRevealSlashBps > 0) {
          this.stakeManager.slash(
            validator.address,
            this.config.nonRevealSlashBps,
            `validator did not reveal vote in round ${this.options.roundId}`
          );
          slashed.push(validator.address);
        }
        continue;
      }
      if (revealed.submission.vote !== expectedVerdict) {
        if (this.config.dishonestSlashBps > 0) {
          this.stakeManager.slash(
            validator.address,
            this.config.dishonestSlashBps,
            `validator voted ${revealed.submission.vote} against canonical verdict ${expectedVerdict}`
          );
          slashed.push(validator.address);
        }
      }
    }

    const approved =
      expectedVerdict === "approve" && votesFor >= this.config.quorum;

    this.indexer.recordEvent("RoundFinalized", {
      roundId: this.options.roundId,
      jobBatchId: this.options.jobBatchId,
      approved,
      quorumMet,
      votesFor,
      votesAgainst,
      slashed,
    });

    return {
      approved,
      quorumMet,
      votesFor,
      votesAgainst,
      slashed,
    };
  }
}

export interface RevealSubmission {
  readonly validator: ValidatorProfile;
  readonly vote: VoteChoice;
  readonly salt: string;
}

export function deriveCommitment(vote: VoteChoice, salt: string): string {
  return keccak256(solidityPacked(["string", "string"], [vote, salt.toLowerCase()]));
}

export function randomSalt(seed: string, index: number): string {
  return keccak256(Buffer.from(`${seed}:${index}`, "utf8"));
}
