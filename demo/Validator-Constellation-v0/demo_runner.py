"""High level orchestration for the Validator Constellation demo.

The runner showcases the full lifecycle from identity onboarding, commit–reveal
validation, zk-batched attestations, sentinel monitoring, and governance-driven
recoveries. It is intentionally verbose to help non-technical operators
understand every step executed by the platform.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from .identities import EnsIdentity, MockEnsRegistry, deterministic_registry, ensure_agent_identity
from .validation import (
    CommitRevealRound,
    DomainPauseController,
    Governance,
    JobResult,
    SentinelMonitor,
    StakeManager,
    SubgraphIndexer,
    VRFCommitteeSelector,
    ValidationRoundConfig,
    ZKBatchAttestor,
    bootstrap_validators,
)


@dataclass
class Agent:
    address: str
    ens: str
    domain: str
    budget: int
    spent: int = 0

    def identity(self) -> EnsIdentity:
        return EnsIdentity(address=self.address, name=self.ens)


class DemoState:
    def __init__(self) -> None:
        self.registry = MockEnsRegistry()
        self.validators = []
        self.agents: List[Agent] = []
        self.validator_registry_seed = "validator_constellation_v0"

    def initialise_registry(self, validators: Iterable[Agent], nodes: Iterable[Agent], agents: Iterable[Agent]) -> None:
        entries = [participant.identity() for participant in (*validators, *nodes, *agents)]
        seeded = deterministic_registry(self.validator_registry_seed, entries)
        self.registry = seeded


class Demo:
    """End-to-end scenario for the Validator Constellation."""

    def __init__(self, state: DemoState) -> None:
        self.state = state
        self.pause_controller = DomainPauseController()
        self.sentinel = SentinelMonitor(self.pause_controller)
        self.governance = Governance(self.pause_controller)
        self.subgraph = SubgraphIndexer()

    def onboard_validators(self, specs: Iterable[Tuple[str, str, int]]) -> StakeManager:
        validators = bootstrap_validators(self.state.registry, specs)
        stake_manager = StakeManager(validators)
        self.subgraph.ingest(stake_manager.event_log)
        return stake_manager

    def onboard_agents(self, agents: Iterable[Agent]) -> List[Agent]:
        onboarded = []
        for agent in agents:
            ensure_agent_identity(agent.identity(), self.state.registry)
            onboarded.append(agent)
        return onboarded

    def run_validation_round(
        self,
        stake_manager: StakeManager,
        committee_size: int,
        truthful_outcome: bool,
        round_id: str,
    ) -> Dict[str, str]:
        selector = VRFCommitteeSelector(seed="constellation")
        committee = selector.select(list(stake_manager.validators.values()), committee_size, round_id)
        config = ValidationRoundConfig(
            quorum=max(1, committee_size // 2 + 1),
            reveal_deadline_blocks=3,
            penalty_missed_reveal=50,
            penalty_incorrect_vote=25,
            reward_truthful_vote=10,
        )

        round_ctx = CommitRevealRound(round_id, committee, config, stake_manager)

        for validator in committee:
            salt = f"salt-{validator.address}-{round_id}"
            vote = truthful_outcome if validator.address.endswith("1") else truthful_outcome
            round_ctx.commit_vote(validator, vote=vote, salt=salt)
            round_ctx.reveal_vote(validator, vote=vote, salt=salt)

        round_ctx.finalize(truthful_outcome)
        self.subgraph.ingest(stake_manager.event_log)

        return {
            "round": round_id,
            "committee": [validator.ens for validator in committee],
            "truthful_outcome": truthful_outcome,
        }

    def demonstrate_batch_attestation(self, job_count: int = 1000) -> str:
        attestor = ZKBatchAttestor(batch_capacity=job_count)
        for index in range(job_count):
            job = JobResult(job_id=f"job-{index}", payload_hash=str(index ** 2), truthful=True)
            attestor.queue_job(job)
        proof_digest = attestor.prove_and_submit()
        return proof_digest

    def trigger_budget_overrun(self, agent: Agent, overrun: int) -> Dict[str, str]:
        agent.spent = agent.budget + overrun
        alert = self.sentinel.check_budget(agent.domain, agent.spent, agent.budget)
        return {
            "domain": agent.domain,
            "alert": alert.message if alert else "",
            "paused": self.pause_controller.is_paused(agent.domain),
        }

    def governance_resume(self, domain: str) -> None:
        self.governance.resume_domain(domain)

    def export_report(self, path: Path, payload: Dict[str, object]) -> None:
        path.write_text(json.dumps(payload, indent=2))


__all__ = ["Agent", "DemoState", "Demo"]
