import { createHash } from "crypto";
import { Address, CommitRecord, ValidatorProfile } from "./types";
import { DeterministicVrf } from "./vrf";

export interface RoundConfiguration {
  quorum: number;
  revealDeadlineBlocks: number;
  domain: string;
  committeeSize: number;
}

export type RoundOutcome = "TRUTH" | "FALSEHOOD" | "QUORUM_NOT_MET";

export class CommitRevealRound {
  readonly id: string;
  readonly config: RoundConfiguration;
  readonly committee: ValidatorProfile[];
  readonly seed: string;

  private commits = new Map<Address, CommitRecord>();
  private finalised = false;
  private outcome: RoundOutcome | null = null;

  constructor(
    id: string,
    allValidators: ValidatorProfile[],
    vrf: DeterministicVrf,
    config: RoundConfiguration
  ) {
    this.id = id;
    this.config = config;
    const { committee, seed } = vrf.selectCommittee(allValidators.filter((v) => v.active), config.committeeSize, config.domain, id);
    this.committee = committee;
    this.seed = seed;
  }

  commitVote(validator: Address, commitment: string) {
    this.assertCommitteeMember(validator);
    if (this.finalised) {
      throw new Error("Round already finalised");
    }
    this.commits.set(validator.toLowerCase(), { validator, commitment });
  }

  revealVote(validator: Address, vote: boolean, salt: string) {
    const key = validator.toLowerCase();
    this.assertCommitteeMember(validator);
    const record = this.commits.get(key);
    if (!record) {
      throw new Error("Validator did not commit");
    }
    const expectedHash = this.hashVote(vote, salt);
    if (record.commitment !== expectedHash) {
      record.revealed = true;
      record.truthful = false;
      record.vote = vote;
      record.salt = salt;
      throw new Error("Commitment mismatch - slashing required");
    }
    record.revealed = true;
    record.truthful = true;
    record.vote = vote;
    record.salt = salt;
    this.commits.set(key, record);
  }

  finalizeRound(truthfulResult: boolean): RoundOutcome {
    if (this.finalised) {
      return this.outcome!;
    }
    const records = [...this.commits.values()].filter((record) => record.revealed);
    if (records.length < this.config.quorum) {
      this.finalised = true;
      this.outcome = "QUORUM_NOT_MET";
      return this.outcome;
    }
    const truthfulVotes = records.filter(
      (record) => record.truthful && record.vote === truthfulResult
    ).length;
    const incorrectVotes = records.filter(
      (record) => !record.truthful || record.vote !== truthfulResult
    ).length;
    this.finalised = true;
    this.outcome = truthfulVotes >= incorrectVotes ? "TRUTH" : "FALSEHOOD";
    return this.outcome;
  }

  getCommitRecords(): CommitRecord[] {
    return [...this.commits.values()];
  }

  hashVote(vote: boolean, salt: string): string {
    const hash = createHash("sha256");
    hash.update(vote ? "1" : "0");
    hash.update(salt);
    return hash.digest("hex");
  }

  private assertCommitteeMember(address: Address) {
    if (!this.committee.some((member) => member.address.toLowerCase() === address.toLowerCase())) {
      throw new Error("Validator is not part of the committee");
    }
  }
}
