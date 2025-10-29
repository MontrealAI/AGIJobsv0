"""Validator Constellation Demo primitives.

This module implements a high-fidelity simulation of the Validator Constellation
for AGI Jobs v0 (v2).  It models deterministic VRF committee selection,
commit–reveal voting, sentinel anomaly detection with domain-scoped circuit
breakers, ENS identity enforcement, staking and slashing, and a batched ZK
attestation pipeline.

The goal is to provide a production-grade reference that a non-technical
operator can execute to observe how AGI Jobs v0 (v2) empowers them to coordinate
validators securely at galactic scale.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


def _normalize_name(name: str) -> str:
    return name.strip().lower().rstrip(".")


@dataclass
class Event:
    """Structured event emitted to the mock subgraph."""

    type: str
    payload: Dict[str, Any]
    timestamp: float = field(default_factory=lambda: time.time())


@dataclass
class SubgraphIndexer:
    """In-memory event indexer mirroring a hosted subgraph."""

    events: List[Event] = field(default_factory=list)

    def emit(self, event_type: str, **payload: Any) -> None:
        event = Event(event_type, payload)
        self.events.append(event)

    def query(self, event_type: Optional[str] = None) -> List[Event]:
        if event_type is None:
            return list(self.events)
        return [event for event in self.events if event.type == event_type]


@dataclass
class StakeLedger:
    """Tracks validator stakes and executes slashing operations."""

    owner: str
    balances: Dict[str, int] = field(default_factory=dict)
    min_stake: int = 1
    subgraph: SubgraphIndexer = field(default_factory=SubgraphIndexer)

    def set_stake(self, address: str, amount: int) -> None:
        self.balances[address] = amount

    def get_stake(self, address: str) -> int:
        return self.balances.get(address, 0)

    def ensure_minimum(self, address: str) -> None:
        if self.get_stake(address) < self.min_stake:
            raise ValueError(f"Validator {address} has insufficient stake")

    def slash(self, address: str, amount: int, reason: str, ens: str) -> None:
        current = self.get_stake(address)
        penalty = min(current, amount)
        self.balances[address] = max(0, current - penalty)
        self.subgraph.emit(
            "ValidatorSlashed",
            address=address,
            ens=ens,
            penalty=penalty,
            reason=reason,
        )


class DeterministicVRF:
    """Deterministic VRF-style randomness derived from entropy mixes."""

    def __init__(self, epoch_seed: str) -> None:
        self.epoch_seed = epoch_seed

    def _score(self, address: str) -> float:
        digest = hmac.new(
            key=self.epoch_seed.encode(),
            msg=address.lower().encode(),
            digestmod=hashlib.blake2s,
        ).digest()
        value = int.from_bytes(digest, "big")
        return value / (1 << (len(digest) * 8))

    def select_committee(
        self, validators: Sequence["Validator"], size: int
    ) -> List["Validator"]:
        sorted_validators = sorted(validators, key=lambda v: self._score(v.address))
        return list(sorted_validators[: size])


class ENSVerifier:
    """Policy-enforced ENS ownership verifier."""

    VALIDATOR_ROOTS = {"club.agi.eth", "alpha.club.agi.eth"}
    AGENT_ROOTS = {"agent.agi.eth", "alpha.agent.agi.eth"}
    NODE_ROOTS = {"node.agi.eth", "alpha.node.agi.eth"}

    def __init__(self, ownership_registry: Dict[str, str]) -> None:
        self.ownership = { _normalize_name(k): v.lower() for k, v in ownership_registry.items() }

    def _assert_owner(self, name: str, address: str) -> None:
        owner = self.ownership.get(_normalize_name(name))
        if owner != address.lower():
            raise ValueError(
                f"Address {address} is not authorized to operate ENS name {name}"
            )

    @staticmethod
    def _validate_suffix(name: str, roots: Iterable[str], label: str) -> None:
        normalized = _normalize_name(name)
        if not any(normalized.endswith(root) for root in roots):
            raise ValueError(f"{label} ENS name {name} must end with one of {roots}")
        segments = normalized.split(".")
        if len(segments) < 4:
            raise ValueError(
                f"{label} ENS name {name} must be a subdomain such as <name>.{next(iter(roots))}"
            )

    def verify_validator(self, name: str, address: str) -> None:
        self._validate_suffix(name, self.VALIDATOR_ROOTS, "Validator")
        self._assert_owner(name, address)

    def verify_agent(self, name: str, address: str) -> None:
        self._validate_suffix(name, self.AGENT_ROOTS, "Agent")
        self._assert_owner(name, address)

    def verify_node(self, name: str, address: str) -> None:
        self._validate_suffix(name, self.NODE_ROOTS, "Node")
        self._assert_owner(name, address)


@dataclass
class Validator:
    address: str
    ens: str
    stake: int


@dataclass
class Agent:
    address: str
    ens: str
    budget: int


@dataclass
class Node:
    address: str
    ens: str


def _hash_vote(choice: str, salt: str) -> str:
    digest = hashlib.sha3_256(f"{choice}:{salt}".encode()).hexdigest()
    return digest


@dataclass
class CommitRevealRound:
    round_id: int
    validators: List[Validator]
    vrf: DeterministicVRF
    committee_size: int
    reveal_deadline: float
    quorum: int
    stake_ledger: StakeLedger
    subgraph: SubgraphIndexer
    committee: List[Validator] = field(init=False)
    commits: Dict[str, str] = field(default_factory=dict)
    reveals: Dict[str, Tuple[str, str]] = field(default_factory=dict)
    finalized: bool = False

    def __post_init__(self) -> None:
        if self.committee_size > len(self.validators):
            raise ValueError("Committee size cannot exceed validator pool")
        self.committee = self.vrf.select_committee(self.validators, self.committee_size)
        for validator in self.committee:
            self.stake_ledger.ensure_minimum(validator.address)
        self.subgraph.emit(
            "CommitteeSelected",
            round_id=self.round_id,
            committee=[validator.ens for validator in self.committee],
        )

    def commit_vote(self, validator: Validator, vote_hash: str) -> None:
        if validator not in self.committee:
            raise ValueError("Validator not part of the committee")
        self.commits[validator.address] = vote_hash
        self.subgraph.emit(
            "VoteCommitted",
            round_id=self.round_id,
            validator=validator.ens,
        )

    def reveal_vote(self, validator: Validator, choice: str, salt: str) -> None:
        if validator.address not in self.commits:
            raise ValueError("Validator has not committed a vote")
        expected_hash = self.commits[validator.address]
        if expected_hash != _hash_vote(choice, salt):
            self.stake_ledger.slash(
                validator.address,
                max(1, validator.stake // 10),
                reason="Mismatched reveal",
                ens=validator.ens,
            )
            raise ValueError("Commitment mismatch")
        self.reveals[validator.address] = (choice, salt)
        self.subgraph.emit(
            "VoteRevealed",
            round_id=self.round_id,
            validator=validator.ens,
            choice=choice,
        )

    def finalize(self, truthful_outcome: str) -> str:
        if self.finalized:
            return truthful_outcome
        for validator in self.committee:
            if validator.address not in self.reveals:
                self.stake_ledger.slash(
                    validator.address,
                    max(1, validator.stake // 5),
                    reason="Non-reveal",
                    ens=validator.ens,
                )
        tally: Dict[str, int] = {}
        for choice, _ in self.reveals.values():
            tally[choice] = tally.get(choice, 0) + 1
        winner = max(tally.items(), key=lambda kv: kv[1])[0] if tally else "abstain"
        for validator in self.committee:
            revealed = self.reveals.get(validator.address)
            if not revealed:
                continue
            vote_choice, _ = revealed
            if vote_choice != truthful_outcome:
                self.stake_ledger.slash(
                    validator.address,
                    max(1, validator.stake // 4),
                    reason="Dishonest vote",
                    ens=validator.ens,
                )
        self.subgraph.emit(
            "RoundFinalized",
            round_id=self.round_id,
            decided=winner,
            truthful_outcome=truthful_outcome,
        )
        self.finalized = True
        if len(self.reveals) < self.quorum:
            raise RuntimeError("Quorum not reached")
        return winner


@dataclass
class JobResult:
    job_id: str
    commitment: str
    output_hash: str


class ZKBatchAttestor:
    """Aggregates job results and verifies them in a single proof."""

    def __init__(self, proving_key: str, verification_key: str) -> None:
        self.proving_key = proving_key
        self.verification_key = verification_key

    def prove(self, results: Sequence[JobResult]) -> Dict[str, Any]:
        if not results:
            raise ValueError("No job results to attest")
        aggregate = hashlib.sha3_256()
        for result in results:
            aggregate.update(result.job_id.encode())
            aggregate.update(result.commitment.encode())
            aggregate.update(result.output_hash.encode())
        digest = aggregate.hexdigest()
        return {
            "proof": hashlib.sha3_256(f"{self.proving_key}:{digest}".encode()).hexdigest(),
            "digest": digest,
            "size": len(results),
        }

    def verify(self, proof_blob: Dict[str, Any]) -> bool:
        recalculated = hashlib.sha3_256(
            f"{self.proving_key}:{proof_blob['digest']}".encode()
        ).hexdigest()
        if recalculated != proof_blob["proof"]:
            return False
        expected = hashlib.sha3_256(
            f"{self.verification_key}:{proof_blob['digest']}".encode()
        ).hexdigest()
        return expected.endswith(proof_blob["proof"][-16:])


@dataclass
class AgentAction:
    agent: Agent
    domain: str
    spend: int
    description: str


@dataclass
class SentinelAlert:
    domain: str
    agent_ens: str
    reason: str


class DomainPauseManager:
    def __init__(self, owner: str, subgraph: SubgraphIndexer) -> None:
        self.owner = owner
        self.subgraph = subgraph
        self.paused_domains: Dict[str, SentinelAlert] = {}

    def pause(self, domain: str, alert: SentinelAlert) -> None:
        self.paused_domains[domain] = alert
        self.subgraph.emit(
            "DomainPaused",
            domain=domain,
            agent=alert.agent_ens,
            reason=alert.reason,
        )

    def resume(self, domain: str, caller: str) -> None:
        if caller != self.owner:
            raise PermissionError("Only the contract owner may resume a domain")
        if domain in self.paused_domains:
            self.subgraph.emit(
                "DomainResumed",
                domain=domain,
            )
            del self.paused_domains[domain]

    def is_paused(self, domain: str) -> bool:
        return domain in self.paused_domains


class Sentinel:
    def __init__(
        self,
        pause_manager: DomainPauseManager,
        budget_limit_per_agent: int,
        subgraph: SubgraphIndexer,
    ) -> None:
        self.pause_manager = pause_manager
        self.budget_limit_per_agent = budget_limit_per_agent
        self.subgraph = subgraph

    def inspect(self, action: AgentAction) -> Optional[SentinelAlert]:
        if action.agent.budget <= 0:
            return None
        if action.spend > self.budget_limit_per_agent:
            alert = SentinelAlert(
                domain=action.domain,
                agent_ens=action.agent.ens,
                reason="Budget limit exceeded",
            )
            self.subgraph.emit(
                "SentinelAlert",
                domain=action.domain,
                agent=action.agent.ens,
                reason=alert.reason,
            )
            self.pause_manager.pause(action.domain, alert)
            return alert
        if "unsafe" in action.description.lower():
            alert = SentinelAlert(
                domain=action.domain,
                agent_ens=action.agent.ens,
                reason="Unsafe call signature",
            )
            self.subgraph.emit(
                "SentinelAlert",
                domain=action.domain,
                agent=action.agent.ens,
                reason=alert.reason,
            )
            self.pause_manager.pause(action.domain, alert)
            return alert
        return None


class DemoOrchestrator:
    """Orchestrates a full validator constellation run."""

    def __init__(
        self,
        owner_address: str,
        validators: List[Validator],
        agents: List[Agent],
        nodes: List[Node],
        ens_registry: ENSVerifier,
        epoch_seed: str,
    ) -> None:
        self.subgraph = SubgraphIndexer()
        self.ledger = StakeLedger(owner_address, subgraph=self.subgraph)
        self.pause_manager = DomainPauseManager(owner_address, self.subgraph)
        self.sentinal = Sentinel(self.pause_manager, budget_limit_per_agent=100, subgraph=self.subgraph)
        self.zk = ZKBatchAttestor("proving-key-demo", "verification-key-demo")
        self.ens_registry = ens_registry
        self.owner = owner_address
        self.vrf = DeterministicVRF(epoch_seed)
        self.validators = validators
        self.agents = agents
        self.nodes = nodes
        for validator in validators:
            self.ens_registry.verify_validator(validator.ens, validator.address)
            self.ledger.set_stake(validator.address, validator.stake)
        for agent in agents:
            self.ens_registry.verify_agent(agent.ens, agent.address)
        for node in nodes:
            self.ens_registry.verify_node(node.ens, node.address)

    def run_commit_reveal_round(
        self,
        truthful_outcome: str,
        dishonest_validators: int = 1,
    ) -> CommitRevealRound:
        round_instance = CommitRevealRound(
            round_id=int(time.time()),
            validators=self.validators,
            vrf=self.vrf,
            committee_size=min(5, len(self.validators)),
            reveal_deadline=time.time() + 30,
            quorum=3,
            stake_ledger=self.ledger,
            subgraph=self.subgraph,
        )
        salts: Dict[str, str] = {}
        for idx, validator in enumerate(round_instance.committee):
            salt = secrets.token_hex(8)
            salts[validator.address] = salt
            vote_choice = (
                truthful_outcome
                if idx >= dishonest_validators
                else f"not-{truthful_outcome}"
            )
            vote_hash = _hash_vote(vote_choice, salt)
            round_instance.commit_vote(validator, vote_hash)
        for idx, validator in enumerate(round_instance.committee):
            salt = salts[validator.address]
            vote_choice = (
                truthful_outcome
                if idx >= dishonest_validators
                else f"not-{truthful_outcome}"
            )
            try:
                round_instance.reveal_vote(validator, vote_choice, salt)
            except ValueError:
                # Dishonest validators may be slashed for mismatched reveals.
                continue
        round_instance.finalize(truthful_outcome)
        return round_instance

    def produce_zk_attestation(self, jobs: Sequence[JobResult]) -> Dict[str, Any]:
        proof = self.zk.prove(jobs)
        if not self.zk.verify(proof):
            raise RuntimeError("Proof verification failed")
        self.subgraph.emit(
            "BatchFinalized",
            batch_size=proof["size"],
            digest=proof["digest"],
        )
        return proof

    def simulate_action(self, action: AgentAction) -> Optional[SentinelAlert]:
        return self.sentinal.inspect(action)

    def resume_domain(self, domain: str) -> None:
        self.pause_manager.resume(domain, self.owner)


__all__ = [
    "Agent",
    "AgentAction",
    "CommitRevealRound",
    "DemoOrchestrator",
    "DeterministicVRF",
    "DomainPauseManager",
    "ENSVerifier",
    "JobResult",
    "Sentinel",
    "SentinelAlert",
    "StakeLedger",
    "SubgraphIndexer",
    "Validator",
    "ZKBatchAttestor",
]
