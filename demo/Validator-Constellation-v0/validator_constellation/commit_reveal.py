"""Commit-reveal voting machinery."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

from decimal import Decimal

from .config import SystemConfig
from .events import EventBus
from .staking import StakeManager


class RoundPhase(str, Enum):
    COMMIT = "commit"
    REVEAL = "reveal"
    FINALIZED = "finalized"


@dataclass(slots=True, frozen=True)
class VoteCommitment:
    commitment: str
    block_number: int


@dataclass(slots=True, frozen=True)
class VoteReveal:
    vote: bool
    salt: str
    block_number: int


class CommitRevealRound:
    """Handles a single commit–reveal voting round."""

    def __init__(
        self,
        round_id: str,
        committee: Dict[str, str],
        config: SystemConfig,
        stake_manager: StakeManager,
        event_bus: EventBus,
        start_block: int = 0,
        truthful_outcome: bool = True,
    ) -> None:
        self.round_id = round_id
        self.committee = {address.lower(): ens for address, ens in committee.items()}
        self.config = config
        self.stake_manager = stake_manager
        self.event_bus = event_bus
        self.start_block = start_block
        self.commitments: Dict[str, VoteCommitment] = {}
        self.reveals: Dict[str, VoteReveal] = {}
        self.truthful_outcome = truthful_outcome
        self.phase = RoundPhase.COMMIT
        self._block_offset = 0
        self._reveal_started_block: Optional[int] = None

    @property
    def commit_deadline(self) -> int:
        return self.start_block + self.config.commit_phase_blocks

    @property
    def reveal_deadline(self) -> int:
        return self.commit_deadline + self.config.reveal_phase_blocks

    def _hash_vote(self, vote: bool, salt: str) -> str:
        hasher = hashlib.blake2b(digest_size=32)
        hasher.update(b"validator-constellation::commit")
        hasher.update(b"1::")
        hasher.update(str(int(vote)).encode())
        hasher.update(salt.encode())
        return hasher.hexdigest()

    def _assert_member(self, address: str) -> str:
        normalized = address.lower()
        if normalized not in self.committee:
            raise PermissionError(f"Validator {address} not in committee")
        return normalized

    def _current_block(self) -> int:
        return self.start_block + self._block_offset

    def _increment_block(self) -> None:
        self._block_offset += 1

    def advance_blocks(self, blocks: int = 1) -> int:
        if blocks < 0:
            raise ValueError("Cannot rewind blocks")
        for _ in range(blocks):
            self._increment_block()
            self._maybe_transition_to_reveal()
        return self._current_block()

    def force_reveal_phase(self) -> None:
        if self.phase == RoundPhase.COMMIT:
            self._transition_to_reveal(reason="force")

    def commit(self, address: str, vote: bool, salt: str) -> VoteCommitment:
        normalized = self._assert_member(address)
        if self.phase != RoundPhase.COMMIT:
            raise RuntimeError("Commit phase closed")
        if self._current_block() >= self.commit_deadline:
            raise RuntimeError("Commit window elapsed")
        if normalized in self.commitments:
            raise RuntimeError("Commitment already submitted")
        commitment = self._hash_vote(vote, salt)
        block_number = self._current_block()
        commitment_record = VoteCommitment(commitment=commitment, block_number=block_number)
        self.commitments[normalized] = commitment_record
        self.event_bus.publish(
            "VoteCommitted",
            {
                "roundId": self.round_id,
                "validator": normalized,
                "ens": self.committee[normalized],
                "commitment": commitment,
                "block": block_number,
            },
        )
        self._increment_block()
        self._maybe_transition_to_reveal()
        return commitment_record

    def reveal(self, address: str, vote: bool, salt: str) -> VoteReveal:
        normalized = self._assert_member(address)
        self._maybe_transition_to_reveal()
        if self.phase == RoundPhase.COMMIT:
            raise RuntimeError("Reveal phase not started")
        if self.phase == RoundPhase.FINALIZED:
            raise RuntimeError("Round already finalized")
        if normalized not in self.commitments:
            raise RuntimeError("No commitment for validator")
        expected = self.commitments[normalized].commitment
        actual = self._hash_vote(vote, salt)
        if actual != expected:
            raise ValueError("Reveal does not match commitment")
        if self._current_block() >= self.reveal_deadline:
            raise RuntimeError("Reveal window elapsed")
        block_number = self._current_block()
        reveal_record = VoteReveal(vote=vote, salt=salt, block_number=block_number)
        self.reveals[normalized] = reveal_record
        self.event_bus.publish(
            "VoteRevealed",
            {
                "roundId": self.round_id,
                "validator": normalized,
                "ens": self.committee[normalized],
                "vote": vote,
                "block": block_number,
            },
        )
        self._increment_block()
        return reveal_record

    def finalize(self) -> bool:
        if self.phase == RoundPhase.FINALIZED:
            raise RuntimeError("Round already finalized")
        if self.phase == RoundPhase.COMMIT:
            raise RuntimeError("Cannot finalize during commit phase")
        if len(self.reveals) < len(self.commitments) and self._current_block() < self.reveal_deadline:
            raise RuntimeError("Reveal phase still active")
        self.phase = RoundPhase.FINALIZED
        truth_votes = sum(1 for reveal in self.reveals.values() if reveal.vote == self.truthful_outcome)
        total_reveals = len(self.reveals)
        if truth_votes < self.config.quorum:
            outcome = False
        else:
            outcome = truth_votes * 2 >= total_reveals * 1
        for validator, commitment in self.commitments.items():
            if validator not in self.reveals:
                self.stake_manager.slash(
                    validator,
                    self.config.slash_fraction_non_reveal,
                    reason=f"non-reveal in {self.round_id}",
                )
        for validator, reveal in self.reveals.items():
            if reveal.vote != self.truthful_outcome:
                self.stake_manager.slash(
                    validator,
                    self.config.slash_fraction_incorrect_vote,
                    reason=f"incorrect vote in {self.round_id}",
                )
            else:
                self.stake_manager.reward(
                    validator,
                    Decimal("0.1"),
                    reason=f"accurate validation in {self.round_id}",
                )
        self.event_bus.publish(
            "RoundFinalized",
            {
                "roundId": self.round_id,
                "truthfulOutcome": self.truthful_outcome,
                "totalReveals": total_reveals,
                "truthVotes": truth_votes,
                "result": outcome,
                "timeline": {
                    "commitStartBlock": self.start_block,
                    "commitDeadlineBlock": self.commit_deadline,
                    "revealStartBlock": self._reveal_started_block,
                    "revealDeadlineBlock": self.reveal_deadline,
                    "finalizedAtBlock": self._current_block(),
                },
            },
        )
        return outcome

    def _maybe_transition_to_reveal(self) -> None:
        if self.phase != RoundPhase.COMMIT:
            return
        if len(self.commitments) >= len(self.committee):
            self._transition_to_reveal(reason="committee-complete")
            return
        if self._current_block() >= self.commit_deadline:
            self._transition_to_reveal(reason="timeout")

    def _transition_to_reveal(self, reason: str) -> None:
        if self.phase != RoundPhase.COMMIT:
            return
        self.phase = RoundPhase.REVEAL
        self._reveal_started_block = self._current_block()
        self.event_bus.publish(
            "PhaseTransition",
            {
                "roundId": self.round_id,
                "phase": RoundPhase.REVEAL.value,
                "reason": reason,
                "commitDeadline": self.commit_deadline,
                "revealDeadline": self.reveal_deadline,
            },
        )
