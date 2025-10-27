import { keccak256, toUtf8Bytes } from 'ethers';
import { eventBus } from './eventBus';
import { GovernanceModule } from './governance';
import { StakeManager } from './stakeManager';
import {
  CommitMessage,
  GovernanceParameters,
  RevealMessage,
  ValidatorIdentity,
  VoteValue,
} from './types';

export interface RoundState {
  round: number;
  committee: Map<string, ValidatorIdentity>;
  commits: Map<string, CommitMessage>;
  reveals: Map<string, RevealMessage>;
  phase: 'COMMIT' | 'REVEAL' | 'FINALIZED';
  startedAt: number;
}

export function computeCommitment(vote: VoteValue, salt: string): string {
  return keccak256(toUtf8Bytes(`${vote}:${salt}`));
}

export class CommitRevealCoordinator {
  private rounds = new Map<number, RoundState>();

  constructor(private readonly governance: GovernanceModule, private readonly stakes: StakeManager) {}

  openRound(round: number, committee: ValidatorIdentity[]): RoundState {
    if (this.rounds.has(round)) {
      throw new Error(`round already opened: ${round}`);
    }
    if (committee.length === 0) {
      throw new Error('committee must not be empty');
    }
    const map = new Map<string, ValidatorIdentity>();
    for (const validator of committee) {
      map.set(validator.address, validator);
    }
    const state: RoundState = {
      round,
      committee: map,
      commits: new Map(),
      reveals: new Map(),
      phase: 'COMMIT',
      startedAt: Date.now(),
    };
    this.rounds.set(round, state);
    return state;
  }

  getRound(round: number): RoundState {
    const state = this.rounds.get(round);
    if (!state) {
      throw new Error(`unknown round ${round}`);
    }
    return state;
  }

  beginRevealPhase(round: number): void {
    const state = this.getRound(round);
    if (state.phase !== 'COMMIT') {
      throw new Error('cannot begin reveal phase from current state');
    }
    state.phase = 'REVEAL';
  }

  submitCommit(round: number, commitment: CommitMessage): void {
    const state = this.getRound(round);
    if (state.phase !== 'COMMIT') {
      throw new Error('round is not accepting commits');
    }
    if (!state.committee.has(commitment.validator.address)) {
      throw new Error('validator not part of committee');
    }
    state.commits.set(commitment.validator.address, commitment);
    eventBus.emit('CommitLogged', commitment);
  }

  submitReveal(round: number, reveal: RevealMessage): void {
    const state = this.getRound(round);
    if (state.phase !== 'REVEAL') {
      throw new Error('round is not accepting reveals');
    }
    if (!state.committee.has(reveal.validator.address)) {
      throw new Error('validator not part of committee');
    }
    const commit = state.commits.get(reveal.validator.address);
    if (!commit) {
      throw new Error('validator did not submit commit');
    }
    const computed = computeCommitment(reveal.vote, reveal.salt);
    if (computed !== commit.commitment) {
      throw new Error('commitment mismatch on reveal');
    }
    state.reveals.set(reveal.validator.address, reveal);
    eventBus.emit('RevealLogged', reveal);
  }

  finalize(round: number, truthfulVote: VoteValue): {
    outcome: VoteValue;
    governance: GovernanceParameters;
    slashed: string[];
  } {
    const state = this.getRound(round);
    if (state.phase !== 'REVEAL') {
      throw new Error('round must be in reveal phase before finalize');
    }
    const governance = this.governance.getParameters();
    const reveals = Array.from(state.reveals.values());
    if (reveals.length * 100 < state.committee.size * governance.quorumPercentage) {
      throw new Error('quorum not reached');
    }
    const approvals = reveals.filter((item) => item.vote === 'APPROVE').length;
    const rejects = reveals.length - approvals;
    const outcome: VoteValue = approvals >= rejects ? 'APPROVE' : 'REJECT';

    const slashed: string[] = [];
    for (const validator of state.committee.values()) {
      if (!state.reveals.has(validator.address)) {
        this.stakes.slash(validator.address, governance.nonRevealPenaltyBps, 'NON_REVEAL');
        slashed.push(validator.address);
      }
    }
    for (const reveal of reveals) {
      if (reveal.vote !== truthfulVote) {
        this.stakes.slash(reveal.validator.address, governance.slashPenaltyBps, 'FALSE_ATTESTATION');
        slashed.push(reveal.validator.address);
      }
    }
    state.phase = 'FINALIZED';
    return {
      outcome,
      governance,
      slashed,
    };
  }
}
