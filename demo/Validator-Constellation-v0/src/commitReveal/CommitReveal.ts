import { keccak256, toUtf8Bytes } from "ethers";
import { StakeManager } from "../staking/StakeManager";
import { EventBus } from "../subgraph/EventBus";

export type VoteValue = "approve" | "reject";

export interface CommitEntry {
  commitHash: string;
  committedAt: number;
}

export interface RevealEntry {
  vote: VoteValue;
  salt: string;
  revealedAt: number;
}

export interface RoundConfig {
  roundId: string;
  validators: string[];
  commitDeadline: number;
  revealDeadline: number;
  quorum: number;
  penaltyPercentage: number;
}

export interface RoundResult {
  roundId: string;
  consensus: VoteValue;
  totalReveals: number;
  slashed: string[];
}

function computeCommit(vote: VoteValue, salt: string): string {
  return keccak256(toUtf8Bytes(`${vote}:${salt}`));
}

export class CommitRevealRound {
  private readonly commits = new Map<string, CommitEntry>();
  private readonly reveals = new Map<string, RevealEntry>();
  private phase: "commit" | "reveal" | "finalized" = "commit";

  constructor(
    private readonly config: RoundConfig,
    private readonly stakeManager: StakeManager,
    private readonly bus: EventBus,
  ) {}

  commit(address: string, vote: VoteValue, salt: string, now: number): void {
    if (this.phase !== "commit") {
      throw new Error(`Round ${this.config.roundId} not in commit phase`);
    }
    if (!this.config.validators.includes(address)) {
      throw new Error(`Validator ${address} not assigned to round ${this.config.roundId}`);
    }
    if (now > this.config.commitDeadline) {
      throw new Error(`Commit deadline exceeded for round ${this.config.roundId}`);
    }
    const hash = computeCommit(vote, salt);
    this.commits.set(address, { commitHash: hash, committedAt: now });
    this.bus.emit("ValidatorCommitted", { roundId: this.config.roundId, validator: address, commitHash: hash });
  }

  advancePhase(now: number): void {
    if (this.phase === "commit" && now >= this.config.commitDeadline) {
      this.phase = "reveal";
    }
    if (this.phase === "reveal" && now >= this.config.revealDeadline) {
      this.phase = "finalized";
    }
  }

  reveal(address: string, vote: VoteValue, salt: string, now: number): void {
    if (this.phase === "commit") {
      throw new Error(`Round ${this.config.roundId} not yet in reveal phase`);
    }
    if (this.phase === "finalized") {
      throw new Error(`Round ${this.config.roundId} already finalized`);
    }
    const commit = this.commits.get(address);
    if (!commit) {
      throw new Error(`Validator ${address} has no commit for round ${this.config.roundId}`);
    }
    const expected = computeCommit(vote, salt);
    if (expected !== commit.commitHash) {
      throw new Error(`Reveal mismatch for validator ${address}`);
    }
    if (now > this.config.revealDeadline) {
      throw new Error(`Reveal deadline exceeded for round ${this.config.roundId}`);
    }
    this.reveals.set(address, { vote, salt, revealedAt: now });
    this.bus.emit("ValidatorRevealed", { roundId: this.config.roundId, validator: address, vote });
  }

  finalize(truth: VoteValue): RoundResult {
    if (this.phase !== "finalized") {
      throw new Error(`Round ${this.config.roundId} cannot be finalised during ${this.phase}`);
    }
    const reveals = Array.from(this.reveals.entries());
    if (reveals.length < this.config.quorum) {
      throw new Error(`Round ${this.config.roundId} did not reach quorum`);
    }
    const slashed: string[] = [];
    for (const validator of this.config.validators) {
      if (!this.reveals.has(validator)) {
        this.stakeManager.slash(validator, this.config.penaltyPercentage, "NonReveal");
        slashed.push(validator);
      }
    }
    for (const [validator, reveal] of reveals) {
      if (reveal.vote !== truth) {
        this.stakeManager.slash(validator, this.config.penaltyPercentage, "DishonestVote");
        slashed.push(validator);
      }
    }
    return { roundId: this.config.roundId, consensus: truth, totalReveals: reveals.length, slashed };
  }
}

export function deriveCommit(vote: VoteValue, salt: string): string {
  return computeCommit(vote, salt);
}
