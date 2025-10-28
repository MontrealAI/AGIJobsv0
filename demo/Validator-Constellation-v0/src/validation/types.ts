import type { Domain } from "../config/entities";
import type { PseudoVrfProof } from "../vrf/pseudoVrf";

export type VoteChoice = "approve" | "reject";

export interface ValidatorProfile {
  readonly address: string;
  readonly ensName: string;
  readonly domain: Domain;
  readonly stake: bigint;
}

export interface CommitSubmission {
  readonly validator: ValidatorProfile;
  readonly commitment: string;
  readonly vrfProof: PseudoVrfProof;
  readonly salt: string;
  readonly vote: VoteChoice;
}

export interface RevealSubmission {
  readonly validator: ValidatorProfile;
  readonly vote: VoteChoice;
  readonly salt: string;
}

export interface FinalizationResult {
  readonly approved: boolean;
  readonly quorumMet: boolean;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly slashed: string[];
}
