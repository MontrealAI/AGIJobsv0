"""Validator constellation core logic.

The module models a validator staking network that uses commit–reveal voting,
VRF-inspired committee selection, slashing, and batched ZK attestations. All
behaviour is deterministic for reproducibility while remaining faithful to the
expected production flows.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import math
import random
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .identities import EnsIdentity, IdentityError, MockEnsRegistry, ensure_validator_identity


def keccak(data: str) -> str:
    return hashlib.sha3_256(data.encode()).hexdigest()


@dataclass
class Validator:
    address: str
    ens: str
    stake: int
    active: bool = True
    slash_count: int = 0

    def __hash__(self) -> int:  # pragma: no cover - dataclass default, but explicit.
        return hash(self.address.lower())

    def identity(self) -> EnsIdentity:
        return EnsIdentity(address=self.address, name=self.ens)


@dataclass
class VoteCommitment:
    validator: Validator
    commitment: str
    revealed: bool = False
    vote: Optional[bool] = None


@dataclass
class ValidationRoundConfig:
    quorum: int
    reveal_deadline_blocks: int
    penalty_missed_reveal: int
    penalty_incorrect_vote: int
    reward_truthful_vote: int


class StakeManager:
    """Tracks stakes and slashing for validators."""

    def __init__(self, validators: Iterable[Validator]) -> None:
        self.validators: Dict[str, Validator] = {v.address.lower(): v for v in validators}
        self.treasury: int = 0
        self.event_log: List[Tuple[str, Dict[str, str]]] = []

    def get_validator(self, address: str) -> Validator:
        key = address.lower()
        if key not in self.validators:
            raise KeyError(f"Validator {address} is not registered")
        return self.validators[key]

    def adjust_stake(self, validator: Validator, delta: int) -> None:
        validator.stake = max(0, validator.stake + delta)

    def slash(self, validator: Validator, amount: int, reason: str) -> None:
        delta = -min(amount, validator.stake)
        self.adjust_stake(validator, delta)
        validator.slash_count += 1
        self.treasury += -delta
        self.event_log.append(
            (
                "ValidatorSlashed",
                {
                    "validator": validator.address,
                    "ens": validator.ens,
                    "amount": str(amount),
                    "reason": reason,
                },
            )
        )

    def reward(self, validator: Validator, amount: int) -> None:
        self.adjust_stake(validator, amount)
        self.event_log.append(
            (
                "ValidatorRewarded",
                {
                    "validator": validator.address,
                    "ens": validator.ens,
                    "amount": str(amount),
                },
            )
        )


class VRFCommitteeSelector:
    """Deterministic VRF-style committee selection."""

    def __init__(self, seed: str) -> None:
        self.seed = seed

    def select(self, validators: Sequence[Validator], committee_size: int, round_id: str) -> List[Validator]:
        if committee_size > len(validators):
            raise ValueError("Committee size cannot exceed total validators")
        vrf_input = f"{self.seed}:{round_id}:{len(validators)}"
        randomness = keccak(vrf_input)
        rng = random.Random(int(randomness, 16))
        ordered = list(validators)
        rng.shuffle(ordered)
        return ordered[:committee_size]


class CommitRevealRound:
    """Handles the commit and reveal flow for a validation round."""

    def __init__(
        self,
        round_id: str,
        committee: Sequence[Validator],
        config: ValidationRoundConfig,
        stake_manager: StakeManager,
    ) -> None:
        self.round_id = round_id
        self.committee = list(committee)
        self.config = config
        self.stake_manager = stake_manager
        self.commits: Dict[str, VoteCommitment] = {}
        self.reveals: Dict[str, bool] = {}

    def commit_vote(self, validator: Validator, vote: bool, salt: str) -> VoteCommitment:
        if validator not in self.committee:
            raise PermissionError("Validator is not part of the committee for this round")
        commitment = keccak(f"{self.round_id}:{validator.address}:{vote}:{salt}")
        record = VoteCommitment(validator=validator, commitment=commitment)
        self.commits[validator.address.lower()] = record
        return record

    def reveal_vote(self, validator: Validator, vote: bool, salt: str) -> None:
        key = validator.address.lower()
        if key not in self.commits:
            raise PermissionError("Validator did not commit a vote")
        commitment = keccak(f"{self.round_id}:{validator.address}:{vote}:{salt}")
        record = self.commits[key]
        if record.commitment != commitment:
            raise IdentityError("Vote reveal does not match commitment")
        record.revealed = True
        record.vote = vote
        self.reveals[key] = vote

    def finalize(self, truthful_outcome: bool) -> bool:
        if len(self.reveals) < self.config.quorum:
            raise RuntimeError("Quorum not met")

        votes_for = sum(1 for vote in self.reveals.values() if vote)
        votes_against = len(self.reveals) - votes_for
        outcome = votes_for >= votes_against

        for record in self.commits.values():
            validator = record.validator
            if not record.revealed:
                self.stake_manager.slash(
                    validator,
                    self.config.penalty_missed_reveal,
                    reason="missed_reveal",
                )
            elif record.vote != truthful_outcome:
                self.stake_manager.slash(
                    validator,
                    self.config.penalty_incorrect_vote,
                    reason="incorrect_vote",
                )
            else:
                self.stake_manager.reward(validator, self.config.reward_truthful_vote)
        return outcome


@dataclass
class JobResult:
    job_id: str
    payload_hash: str
    truthful: bool


class ZKBatchAttestor:
    """Simulated ZK proof aggregation for job attestations."""

    def __init__(self, batch_capacity: int = 1000) -> None:
        self.batch_capacity = batch_capacity
        self.current_batch: List[JobResult] = []
        self.verified_batches: List[List[JobResult]] = []

    def queue_job(self, job: JobResult) -> None:
        if len(self.current_batch) >= self.batch_capacity:
            raise RuntimeError("Batch capacity exceeded before proof generation")
        self.current_batch.append(job)

    def prove_and_submit(self) -> str:
        if not self.current_batch:
            raise RuntimeError("No jobs queued for attestation")
        digest = keccak(
            ":".join(job.job_id + job.payload_hash for job in self.current_batch)
        )
        self.verified_batches.append(list(self.current_batch))
        self.current_batch.clear()
        return digest


@dataclass
class DomainPauseState:
    is_paused: bool = False
    reason: Optional[str] = None


class DomainPauseController:
    """Controls scoped emergency pauses."""

    def __init__(self) -> None:
        self.domains: Dict[str, DomainPauseState] = {}

    def pause(self, domain: str, reason: str) -> None:
        state = self.domains.setdefault(domain, DomainPauseState())
        state.is_paused = True
        state.reason = reason

    def resume(self, domain: str) -> None:
        state = self.domains.setdefault(domain, DomainPauseState())
        state.is_paused = False
        state.reason = None

    def is_paused(self, domain: str) -> bool:
        return self.domains.get(domain, DomainPauseState()).is_paused


@dataclass
class SentinelAlert:
    domain: str
    message: str
    severity: str


class SentinelMonitor:
    """Monitors agent actions and triggers emergency pauses."""

    def __init__(self, pause_controller: DomainPauseController) -> None:
        self.pause_controller = pause_controller
        self.alerts: List[SentinelAlert] = []

    def check_budget(self, domain: str, spent: int, budget: int) -> Optional[SentinelAlert]:
        if spent > budget:
            alert = SentinelAlert(
                domain=domain,
                message=f"Budget overrun detected: spent {spent} > budget {budget}",
                severity="critical",
            )
            self.alerts.append(alert)
            self.pause_controller.pause(domain, alert.message)
            return alert
        return None

    def unsafe_call(self, domain: str, call: str) -> SentinelAlert:
        alert = SentinelAlert(domain=domain, message=f"Unsafe call detected: {call}", severity="high")
        self.alerts.append(alert)
        self.pause_controller.pause(domain, alert.message)
        return alert


class Governance:
    """Simplified governance module that can resume operations."""

    def __init__(self, pause_controller: DomainPauseController) -> None:
        self.pause_controller = pause_controller

    def resume_domain(self, domain: str) -> None:
        self.pause_controller.resume(domain)


class SubgraphIndexer:
    """Captures events for external dashboards."""

    def __init__(self) -> None:
        self.events: List[Tuple[str, Dict[str, str]]] = []

    def ingest(self, events: Iterable[Tuple[str, Dict[str, str]]]) -> None:
        self.events.extend(events)

    def query_slashes(self) -> List[Dict[str, str]]:
        return [payload for name, payload in self.events if name == "ValidatorSlashed"]


def bootstrap_validators(
    registry: MockEnsRegistry,
    validator_specs: Sequence[Tuple[str, str, int]],
) -> List[Validator]:
    validators: List[Validator] = []
    for address, ens, stake in validator_specs:
        identity = ensure_validator_identity(EnsIdentity(address=address, name=ens), registry)
        validators.append(Validator(address=identity.address, ens=identity.name, stake=stake))
    return validators


__all__ = [
    "Validator",
    "StakeManager",
    "CommitRevealRound",
    "VRFCommitteeSelector",
    "ValidationRoundConfig",
    "ZKBatchAttestor",
    "JobResult",
    "SentinelMonitor",
    "DomainPauseController",
    "Governance",
    "SubgraphIndexer",
    "bootstrap_validators",
]
