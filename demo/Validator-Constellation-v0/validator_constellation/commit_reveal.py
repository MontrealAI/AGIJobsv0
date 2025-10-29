from __future__ import annotations

import hashlib
from collections import Counter
from typing import Dict, Mapping

from .config import SystemConfig
from .events import EventBus
from .staking import StakeManager


def _hash_vote(vote: object, salt: str) -> str:
    return hashlib.sha3_256(f"{vote}:{salt}".encode()).hexdigest()


class CommitRevealRound:
    def __init__(
        self,
        round_id: str,
        *,
        committee: Mapping[str, str],
        config: SystemConfig,
        stake_manager: StakeManager,
        event_bus: EventBus,
        truthful_outcome: object,
    ) -> None:
        self.round_id = round_id
        self.committee = {address.lower(): ens for address, ens in committee.items()}
        self.config = config
        self.stake_manager = stake_manager
        self.bus = event_bus
        self.truthful_outcome = truthful_outcome
        self.commits: Dict[str, str] = {}
        self.reveals: Dict[str, object] = {}
        self.salts: Dict[str, str] = {}
        self.timeline = {
            "roundId": round_id,
            "commitStartBlock": self.bus.current_block,
            "commitDeadlineBlock": self.bus.current_block + config.commit_phase_blocks,
            "revealDeadlineBlock": self.bus.current_block + config.commit_phase_blocks + config.reveal_phase_blocks,
        }
        self.finalized = False
        self.bus.emit(
            "CommitteeSelected",
            round_id=self.round_id,
            committee=[self.committee[address] for address in self.committee],
        )

    def advance_blocks(self, blocks: int) -> None:
        self.bus.advance_block(blocks)
        self.timeline["currentBlock"] = self.bus.current_block

    def commit(self, address: str, vote: object, salt: str) -> None:
        address = address.lower()
        if address not in self.committee:
            raise PermissionError("validator not in committee")
        if self.bus.current_block >= self.timeline["commitDeadlineBlock"]:
            raise RuntimeError("commit phase closed")
        hashed = _hash_vote(vote, salt)
        self.commits[address] = hashed
        self.salts[address] = salt
        self.bus.emit(
            "VoteCommitted",
            round_id=self.round_id,
            address=address,
            ens=self.committee[address],
            voteHash=hashed,
        )

    def reveal(self, address: str, vote: object, salt: str) -> None:
        address = address.lower()
        if address not in self.committee:
            raise PermissionError("validator not in committee")
        if address not in self.commits:
            raise RuntimeError("validator has not committed")
        expected = self.commits[address]
        if expected != _hash_vote(vote, salt):
            self.stake_manager.slash(address, self.config.slash_fraction_dishonest, reason="Mismatched reveal")
            raise RuntimeError("commitment mismatch")
        self.reveals[address] = vote
        self.bus.emit(
            "VoteRevealed",
            round_id=self.round_id,
            address=address,
            ens=self.committee[address],
            choice=vote,
        )

    def finalize(self) -> object:
        if self.finalized:
            return self.truthful_outcome
        if len(self.reveals) < self.config.quorum and self.bus.current_block < self.timeline["commitDeadlineBlock"]:
            raise RuntimeError("quorum not reached")
        # Slash non-revealing validators once reveal deadline expires or quorum reached
        for address in self.committee:
            if address not in self.reveals:
                self.stake_manager.slash(
                    address,
                    self.config.slash_fraction_non_reveal,
                    reason="Non-reveal",
                )
        tally = Counter(self.reveals.values())
        decided, _ = tally.most_common(1)[0] if tally else (self.truthful_outcome, 0)
        for address, choice in self.reveals.items():
            if choice != self.truthful_outcome:
                self.stake_manager.slash(
                    address,
                    self.config.slash_fraction_dishonest,
                    reason="Dishonest vote",
                )
        self.finalized = True
        self.bus.emit(
            "RoundFinalized",
            round_id=self.round_id,
            result=decided,
            truthful=self.truthful_outcome,
            timeline=self.timeline,
        )
        return decided
