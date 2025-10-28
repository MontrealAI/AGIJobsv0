"""High-level orchestration for the Validator Constellation demo."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Iterable, List

from .commit_reveal import CommitRevealRound
from .config import SystemConfig
from .events import EventBus
from .identity import ENSIdentityVerifier
from .sentinel import AgentAction, DomainPauseController, SentinelMonitor, SentinelRule
from .staking import StakeManager
from .vrf import VRFCoordinator
from .zk_batch import JobResult, ZKBatchAttestor
from .subgraph import SubgraphIndexer


@dataclass(slots=True)
class DemoSummary:
    committee: Dict[str, str]
    truthful_outcome: bool
    round_result: bool
    slashed_validators: List[str]
    paused_domains: List[str]
    batch_proof_root: str
    gas_saved: int
    indexed_events: int


def run_validator_constellation_demo(seed: str = "demo-seed", truthful_outcome: bool = True) -> DemoSummary:
    config = SystemConfig()
    event_bus = EventBus()
    stake_manager = StakeManager(event_bus, config.owner_address)
    SubgraphIndexer(event_bus)
    identity = ENSIdentityVerifier(
        allowed_validator_roots=config.allowed_validator_roots,
        allowed_agent_roots=config.allowed_agent_roots,
        allowed_node_roots=config.allowed_node_roots,
        blacklist=config.blacklist,
    )

    validators = {
        "0xAa00000000000000000000000000000000000001": "atlas.club.agi.eth",
        "0xAa00000000000000000000000000000000000002": "zephyr.club.agi.eth",
        "0xAa00000000000000000000000000000000000003": "nova.club.agi.eth",
        "0xAa00000000000000000000000000000000000004": "orion.alpha.club.agi.eth",
    }
    validators = {address.lower(): ens for address, ens in validators.items()}

    for address, ens in validators.items():
        proof = identity.sign(ens, address)
        identity.verify_validator(address, proof)
        stake_manager.register_validator(address, ens, Decimal("32"))

    vrf = VRFCoordinator(stake_manager, domain="validator-constellation-demo")
    committee_addresses = vrf.select_committee(seed, config.committee_size)
    committee = {address: validators[address] for address in committee_addresses}

    round_engine = CommitRevealRound(
        round_id="constellation-round-1",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=event_bus,
        truthful_outcome=truthful_outcome,
    )

    salts = {
        address: f"salt::{i}" for i, address in enumerate(committee.keys(), start=1)
    }
    for address in committee:
        round_engine.commit(address, truthful_outcome, salts[address])
    for address in list(committee.keys())[:-1]:
        round_engine.reveal(address, truthful_outcome, salts[address])
    round_result = round_engine.finalize()

    domain_pause = DomainPauseController(event_bus)
    sentinel = SentinelMonitor(
        rules=[
            SentinelRule(
                name="budget-overrun",
                description="Agent spend exceeded allocated budget",
                predicate=lambda action: action.spend > action.metadata.get("budget", 0),
            ),
            SentinelRule(
                name="restricted-call",
                description="Agent invoked a restricted function",
                predicate=lambda action: action.metadata.get("restricted", False),
            ),
        ],
        pause_controller=domain_pause,
        event_bus=event_bus,
    )

    action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="synthetic-biology",
        spend=1200.0,
        call="allocate_funds",
        metadata={"budget": 1000.0},
    )
    sentinel.evaluate(action)

    batcher = ZKBatchAttestor(config)
    jobs = [
        JobResult(job_id=f"job-{i}", outcome_hash=f"outcome::{i % 2}", execution_digest=f"digest::{i}")
        for i in range(1, config.batch_proof_capacity + 1)
    ]
    proof = batcher.create_batch_proof(jobs)

    slashed = [event.payload["address"] for event in event_bus.find("ValidatorSlashed")]

    return DemoSummary(
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        slashed_validators=slashed,
        paused_domains=list(domain_pause.paused_domains.keys()),
        batch_proof_root=proof.batch_root,
        gas_saved=batcher.estimate_gas_saved(len(jobs)),
        indexed_events=len(event_bus.events),
    )
