from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional

from .commit_reveal import CommitRevealRound
from .config import SystemConfig
from .events import EventBus
from .governance import OwnerConsole
from .identity import ENSIdentityVerifier
from .sentinel import AgentAction, DomainPauseController, SentinelMonitor, SentinelRule
from .staking import StakeManager
from .subgraph import SubgraphIndexer
from .vrf import VRFCoordinator
from .zk_batch import JobResult, ZKBatchAttestor


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
    timeline: Dict[str, Optional[int]]
    owner_actions: List[Dict[str, object]]


def run_validator_constellation_demo(
    seed: str = "demo-seed",
    truthful_outcome: bool = True,
    *,
    committee_size: Optional[int] = None,
    job_count: Optional[int] = None,
    config_overrides: Optional[Dict[str, object]] = None,
    budget_limit: float = 1_000.0,
) -> DemoSummary:
    config = SystemConfig()
    overrides = dict(config_overrides or {})
    owner_override = overrides.pop("owner_address", None)
    if owner_override:
        config.owner_address = str(owner_override)

    event_bus = EventBus()
    SubgraphIndexer(event_bus)
    stake_manager = StakeManager(event_bus, config.owner_address)
    domain_pause = DomainPauseController(event_bus)
    owner_console = OwnerConsole(
        owner_address=config.owner_address,
        config=config,
        pause_controller=domain_pause,
        stake_manager=stake_manager,
        event_bus=event_bus,
    )

    owner_updates: Dict[str, object] = {
        "reveal_phase_blocks": max(config.reveal_phase_blocks, 6),
        "slash_fraction_non_reveal": max(config.slash_fraction_non_reveal, 0.35),
    }
    if committee_size is not None:
        owner_updates["committee_size"] = committee_size
    owner_updates.update(overrides)
    owner_console.update_config(config.owner_address, **owner_updates)

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

    salts = {address: f"salt::{i}" for i, address in enumerate(committee.keys(), start=1)}
    for address in committee:
        round_engine.commit(address, truthful_outcome, salts[address])
    for address in list(committee.keys())[:-1]:
        round_engine.reveal(address, truthful_outcome, salts[address])
    round_engine.advance_blocks(config.reveal_phase_blocks)
    round_result = round_engine.finalize()

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
        spend=1_200.0,
        call="allocate_funds",
        metadata={"budget": budget_limit},
    )
    sentinel.evaluate(action)

    batcher = ZKBatchAttestor(config)
    job_target = max(1, job_count or config.batch_proof_capacity)
    jobs = [
        JobResult(job_id=f"job-{i}", outcome_hash=f"outcome::{i % 2}", execution_digest=f"digest::{i}")
        for i in range(1, min(job_target, config.batch_proof_capacity) + 1)
    ]
    proof = batcher.create_batch_proof(jobs)

    slashed = [event.payload["address"] for event in event_bus.find("ValidatorSlashed")]
    finalized_event = next(event_bus.find("RoundFinalized"), None)
    timeline = finalized_event.payload.get("timeline") if finalized_event else {}

    return DemoSummary(
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        slashed_validators=slashed,
        paused_domains=list(domain_pause.paused_domains.keys()),
        batch_proof_root=proof.batch_root,
        gas_saved=batcher.estimate_gas_saved(len(jobs)),
        indexed_events=len(event_bus.events),
        timeline=dict(timeline or {}),
        owner_actions=[{"action": action.action, "details": action.details} for action in owner_console.actions],
    )

