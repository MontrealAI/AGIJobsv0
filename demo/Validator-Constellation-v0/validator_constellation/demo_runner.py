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
    sentinel_alerts: List[Dict[str, object]]
    domain_events: List[Dict[str, object]]


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
    domain_pause = DomainPauseController(
        event_bus,
        domains=[
            {
                "domain": "synthetic-biology",
                "human_name": "Synthetic Biology AGI Lab",
                "budget_limit": Decimal(budget_limit),
                "unsafe_opcodes": ["SELFDESTRUCT", "DELEGATECALL"],
                "allowed_targets": ["vault.sentinel.agi"],
                "max_calldata_bytes": 4096,
                "forbidden_selectors": ["0xd0e30db0"],
            },
            {
                "domain": "quantum-trade",
                "human_name": "Quantum Trade Network",
                "budget_limit": Decimal("500"),
                "unsafe_opcodes": ["CREATE2"],
                "allowed_targets": ["0xquantum-safe"],
                "max_calldata_bytes": 2048,
                "forbidden_selectors": ["0xa9059cbb"],
            },
        ],
    )
    sentinel = SentinelMonitor(
        pause_controller=domain_pause,
        event_bus=event_bus,
        budget_grace_ratio=0.05,
        custom_rules=[
            SentinelRule(
                name="RISK_SPIKE",
                description="Agent risk score exceeded threshold",
                predicate=lambda action, _state: isinstance(action.metadata.get("riskScore"), (int, float))
                and action.metadata["riskScore"] > 90,
                severity="HIGH",
            )
        ],
    )
    owner_console = OwnerConsole(
        owner_address=config.owner_address,
        config=config,
        pause_controller=domain_pause,
        stake_manager=stake_manager,
        event_bus=event_bus,
        sentinel=sentinel,
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

    action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="synthetic-biology",
        spend=1_200.0,
        call="allocate_funds",
        metadata={"budget": budget_limit},
        opcode="DELEGATECALL",
        block_number=11,
    )
    sentinel.evaluate(action)

    quantum_action = AgentAction(
        agent="quinn.agent.agi.eth",
        domain="quantum-trade",
        spend=320.0,
        call="swap_derivative",
        target="0xshadow-vault",
        metadata={"budget": 400.0, "calldataBytes": 1024},
        block_number=12,
    )
    sentinel.evaluate(quantum_action)

    owner_console.update_domain_policy(
        config.owner_address,
        "quantum-trade",
        allowed_targets=["0xquantum-safe", "0xshadow-vault"],
    )
    owner_console.resume_domain(config.owner_address, "quantum-trade")

    quantum_follow_up = AgentAction(
        agent="quinn.agent.agi.eth",
        domain="quantum-trade",
        spend=450.0,
        call="swap_derivative",
        target="0xshadow-vault",
        metadata={"budget": 450.0, "riskScore": 95},
        block_number=13,
    )
    if sentinel.evaluate(quantum_follow_up):
        owner_console.resume_domain(config.owner_address, "quantum-trade")

    owner_console.update_sentinel(config.owner_address, budget_grace_ratio=0.08)

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

    domain_pauses = [
        {
            "domain": event.payload["domain"],
            "reason": event.payload["reason"],
            "triggeredBy": event.payload.get("triggeredBy"),
            "timestamp": event.payload.get("timestamp"),
        }
        for event in event_bus.find("DomainPaused")
    ]

    sentinel_alerts = [
        {
            "domain": event.payload["domain"],
            "rule": event.payload.get("rule", ""),
            "reason": event.payload["reason"],
            "severity": event.payload.get("severity", ""),
        }
        for event in event_bus.find("SentinelAlert")
    ]

    return DemoSummary(
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        slashed_validators=slashed,
        paused_domains=sorted(domain_pause.paused_domains.keys()),
        batch_proof_root=proof.batch_root,
        gas_saved=batcher.estimate_gas_saved(len(jobs)),
        indexed_events=len(event_bus.events),
        timeline=dict(timeline or {}),
        owner_actions=[{"action": action.action, "details": action.details} for action in owner_console.actions],
        sentinel_alerts=sentinel_alerts,
        domain_events=domain_pauses,
    )

