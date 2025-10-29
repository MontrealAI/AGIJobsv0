from __future__ import annotations

import json
import math
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
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
from .zk_batch import BatchProof, JobResult, ZKBatchAttestor
from .scenario import ScenarioAgent, ScenarioSpec, load_scenario


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
    event_feed: List[Dict[str, object]]
    scenario_name: Optional[str] = None
    scenario_description: Optional[str] = None
    committee_signature: Optional[str] = None
    context: Optional[Dict[str, object]] = None
    entropy_sources: Optional[Dict[str, object]] = None
    verifying_key: Optional[str] = None


def _json_default(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serialisable")


def summary_to_dict(summary: DemoSummary) -> Dict[str, object]:
    return {
        "committee": summary.committee,
        "truthfulOutcome": summary.truthful_outcome,
        "roundResult": summary.round_result,
        "slashedValidators": summary.slashed_validators,
        "pausedDomains": summary.paused_domains,
        "batchProofRoot": summary.batch_proof_root,
        "gasSaved": summary.gas_saved,
        "indexedEvents": summary.indexed_events,
        "timeline": summary.timeline,
        "ownerActions": summary.owner_actions,
        "sentinelAlerts": summary.sentinel_alerts,
        "domainEvents": summary.domain_events,
        "eventFeed": summary.event_feed,
        "scenarioName": summary.scenario_name,
        "scenarioDescription": summary.scenario_description,
        "committeeSignature": summary.committee_signature,
        "context": summary.context,
        "entropySources": summary.entropy_sources,
        "verifyingKey": summary.verifying_key,
    }


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, default=_json_default))


def write_web_artifacts(summary: DemoSummary, output_dir: Path) -> Dict[str, Path]:
    """Export web-ready JSON artefacts for the command deck."""

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "summary.json"
    events_path = output_dir / "events.json"
    timeline_path = output_dir / "timeline.json"
    owner_actions_path = output_dir / "owner-actions.json"

    summary_data = summary_to_dict(summary)
    _write_json(summary_path, summary_data)
    _write_json(events_path, summary.event_feed)
    _write_json(timeline_path, summary.timeline)
    _write_json(owner_actions_path, summary.owner_actions)

    return {
        "summary": summary_path,
        "events": events_path,
        "timeline": timeline_path,
        "owner_actions": owner_actions_path,
    }


def _build_summary(
    *,
    event_bus: EventBus,
    domain_pause: DomainPauseController,
    owner_console: OwnerConsole,
    sentinel: SentinelMonitor,
    committee: Dict[str, str],
    truthful_outcome: bool,
    round_result: bool,
    batch_proof: BatchProof,
    gas_saved: int,
    timeline: Dict[str, Optional[int]],
    committee_signature: Optional[str] = None,
    scenario_name: Optional[str] = None,
    scenario_description: Optional[str] = None,
    context: Optional[Dict[str, object]] = None,
    entropy_sources: Optional[Dict[str, object]] = None,
    verifying_key: Optional[str] = None,
) -> DemoSummary:
    slashed = [event.payload["address"] for event in event_bus.find("ValidatorSlashed")]
    sentinel_alerts = [
        {
            "domain": event.payload.get("domain"),
            "rule": event.payload.get("rule"),
            "reason": event.payload.get("reason"),
            "severity": event.payload.get("severity"),
        }
        for event in event_bus.find("SentinelAlert")
    ]
    domain_pauses = [
        {
            "domain": event.payload.get("domain"),
            "reason": event.payload.get("reason"),
            "triggeredBy": event.payload.get("triggeredBy"),
            "timestamp": event.payload.get("timestamp"),
        }
        for event in event_bus.find("DomainPaused")
    ]
    event_feed = [
        {
            "id": index + 1,
            "type": event.type,
            "payload": event.payload,
            "timestamp": event.timestamp.isoformat(),
        }
        for index, event in enumerate(event_bus.events)
    ]

    return DemoSummary(
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        slashed_validators=slashed,
        paused_domains=sorted(domain_pause.paused_domains.keys()),
        batch_proof_root=batch_proof.batch_root,
        gas_saved=gas_saved,
        indexed_events=len(event_bus.events),
        timeline=timeline,
        owner_actions=[
            {"operator": action.operator, "action": action.action, "details": action.details}
            for action in owner_console.actions
        ],
        sentinel_alerts=sentinel_alerts,
        domain_events=domain_pauses,
        event_feed=event_feed,
        scenario_name=scenario_name,
        scenario_description=scenario_description,
        committee_signature=committee_signature,
        context=context,
        entropy_sources=entropy_sources,
        verifying_key=verifying_key,
    )


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
    finalized_event = next(event_bus.find("RoundFinalized"), None)
    timeline = dict(finalized_event.payload.get("timeline") if finalized_event else {})
    return _build_summary(
        event_bus=event_bus,
        domain_pause=domain_pause,
        owner_console=owner_console,
        sentinel=sentinel,
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        batch_proof=proof,
        gas_saved=batcher.estimate_gas_saved(len(jobs)),
        timeline=timeline,
    )


def run_validator_constellation_scenario(
    scenario_path: Path | str,
    *,
    seed_override: Optional[str] = None,
    truthful_override: Optional[bool] = None,
) -> DemoSummary:
    spec = load_scenario(scenario_path)
    config = SystemConfig()

    event_bus = EventBus()
    SubgraphIndexer(event_bus)
    stake_manager = StakeManager(event_bus, config.owner_address)
    if spec.base_setup.treasury_address:
        stake_manager.set_treasury_recipient(spec.base_setup.treasury_address)

    if spec.domains:
        domain_definitions = [
            {
                "domain": domain.id,
                "human_name": domain.human_name,
                "budget_limit": domain.budget_limit,
                "unsafe_opcodes": domain.unsafe_opcodes,
                "allowed_targets": domain.allowed_targets,
                "max_calldata_bytes": domain.max_calldata_bytes,
                "forbidden_selectors": domain.forbidden_selectors,
            }
            for domain in spec.domains
        ]
    else:
        domain_definitions = [
            {
                "domain": "synthetic-biology",
                "human_name": "Synthetic Biology AGI Lab",
                "budget_limit": Decimal("1000000"),
                "unsafe_opcodes": ["SELFDESTRUCT", "DELEGATECALL"],
                "allowed_targets": ["vault.sentinel.agi"],
                "max_calldata_bytes": 4096,
                "forbidden_selectors": ["0xd0e30db0"],
            }
        ]
    domain_pause = DomainPauseController(event_bus, domains=domain_definitions)

    sentinel_ratio = spec.base_setup.sentinel_grace_ratio or 0.05
    sentinel = SentinelMonitor(
        pause_controller=domain_pause,
        event_bus=event_bus,
        budget_grace_ratio=sentinel_ratio,
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

    if spec.base_setup.sentinel_grace_ratio is not None:
        owner_console.update_sentinel(config.owner_address, budget_grace_ratio=spec.base_setup.sentinel_grace_ratio)

    key_mapping = {
        "commitPhaseBlocks": "commit_phase_blocks",
        "revealPhaseBlocks": "reveal_phase_blocks",
        "slashFractionNonReveal": "slash_fraction_non_reveal",
        "slashFractionIncorrectVote": "slash_fraction_incorrect_vote",
        "committeeSize": "committee_size",
        "batchProofCapacity": "batch_proof_capacity",
        "ownerAddress": "owner_address",
    }

    governance_updates: Dict[str, object] = {}
    committee_override = spec.base_setup.governance.get("committeeSize")
    if committee_override is not None:
        config.committee_size = int(committee_override)
        governance_updates["committee_size"] = int(committee_override)
    commit_blocks = spec.base_setup.governance.get("commitPhaseBlocks")
    if commit_blocks is not None:
        governance_updates["commit_phase_blocks"] = int(commit_blocks)
    reveal_blocks = spec.base_setup.governance.get("revealPhaseBlocks")
    if reveal_blocks is not None:
        governance_updates["reveal_phase_blocks"] = int(reveal_blocks)
    slash_penalty = spec.base_setup.governance.get("slashPenaltyBps")
    if slash_penalty is not None:
        penalty_fraction = max(float(slash_penalty), 0.0) / 10_000
        governance_updates["slash_fraction_incorrect_vote"] = penalty_fraction
        governance_updates["slash_fraction_non_reveal"] = max(config.slash_fraction_non_reveal, penalty_fraction)
    non_reveal_penalty = spec.base_setup.governance.get("nonRevealPenaltyBps")
    if non_reveal_penalty is not None:
        governance_updates["slash_fraction_non_reveal"] = max(float(non_reveal_penalty), 0.0) / 10_000
    quorum_percentage = spec.base_setup.governance.get("quorumPercentage")
    if quorum_percentage is not None:
        committee_base = governance_updates.get("committee_size", config.committee_size)
        quorum_value = max(1, math.ceil(float(quorum_percentage) * committee_base / 100))
        governance_updates["quorum"] = quorum_value
    if governance_updates:
        owner_console.update_config(config.owner_address, **governance_updates)

    identity = ENSIdentityVerifier(
        allowed_validator_roots=config.allowed_validator_roots,
        allowed_agent_roots=config.allowed_agent_roots,
        allowed_node_roots=config.allowed_node_roots,
        blacklist=config.blacklist,
    )

    ens_to_address: Dict[str, str] = {}
    address_to_ens: Dict[str, str] = {}
    ens_registry = set()

    validators = spec.validators
    if not validators:
        raise ValueError("Scenario must include at least one validator definition")

    for validator in validators:
        ens = validator.ens.lower()
        address = validator.address.lower()
        proof = identity.sign(ens, address)
        identity.verify_validator(address, proof)
        stake_manager.register_validator(address, ens, validator.stake)
        ens_to_address[ens] = address
        address_to_ens[address] = ens
        ens_registry.add(ens)

    agents_by_ens: Dict[str, ScenarioAgent] = {}
    agent_budgets: Dict[str, Decimal] = {}
    for agent in spec.agents:
        ens = agent.ens.lower()
        address = agent.address.lower()
        proof = identity.sign(ens, address)
        identity.verify_agent(address, proof)
        agents_by_ens[ens] = agent
        agent_budgets[ens] = agent.budget
        ens_registry.add(ens)

    for node in spec.nodes:
        proof = identity.sign(node.ens.lower(), node.address.lower())
        identity.verify_node(node.address.lower(), proof)
        ens_registry.add(node.ens.lower())

    seed = seed_override or spec.context.get("seed") or spec.name or "scenario-seed"

    def _vote_from_value(value: object, default: bool) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        text = str(value).strip().upper()
        return text in {"APPROVE", "TRUE", "YES", "1"}

    truthful_outcome = truthful_override if truthful_override is not None else _vote_from_value(
        spec.job.truthful_vote,
        True,
    )

    vrf = VRFCoordinator(stake_manager, domain=spec.job.domain_id)
    committee_addresses = vrf.select_committee(seed, config.committee_size)
    committee = {address: address_to_ens[address] for address in committee_addresses}

    round_engine = CommitRevealRound(
        round_id=f"scenario-round-{spec.job.round_id}",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=event_bus,
        truthful_outcome=truthful_outcome,
    )

    vote_overrides: Dict[str, bool] = {}
    for ens, vote in spec.overrides.vote_by_ens.items():
        address = ens_to_address.get(ens.lower())
        if address:
            vote_overrides[address] = _vote_from_value(vote, truthful_outcome)
    for address, vote in spec.overrides.vote_by_address.items():
        vote_overrides[address.lower()] = _vote_from_value(vote, truthful_outcome)

    non_reveal: set[str] = set()
    for identifier in spec.overrides.non_reveal_validators:
        normalized = identifier.lower()
        non_reveal.add(ens_to_address.get(normalized, normalized))

    salts = {address: f"salt::{index}" for index, address in enumerate(committee.keys(), start=1)}
    for address in committee:
        vote = vote_overrides.get(address, truthful_outcome)
        round_engine.commit(address, vote, salts[address])

    round_engine.force_reveal_phase()
    for address in committee:
        if address in non_reveal:
            continue
        vote = vote_overrides.get(address, truthful_outcome)
        round_engine.reveal(address, vote, salts[address])

    round_engine.advance_blocks(config.reveal_phase_blocks)
    round_result = round_engine.finalize()

    entropy_sources: Dict[str, object] = {}
    if spec.base_setup.on_chain_entropy:
        entropy_sources["onChainEntropy"] = spec.base_setup.on_chain_entropy
    if spec.base_setup.recent_beacon:
        entropy_sources["recentBeacon"] = spec.base_setup.recent_beacon

    block_number = 100
    for anomaly in spec.anomalies:
        agent_ens = anomaly.payload.get("agentEns")
        if not agent_ens:
            continue
        agent = agents_by_ens.get(str(agent_ens).lower())
        if not agent:
            continue
        budget = agent_budgets.get(agent.ens.lower(), agent.budget)
        metadata = {"budget": float(budget)}
        if anomaly.payload.get("budgetOverride") is not None:
            metadata["budget"] = float(Decimal(str(anomaly.payload["budgetOverride"])))
        if anomaly.payload.get("description"):
            metadata["description"] = anomaly.payload["description"]
        amount_value = anomaly.payload.get("amount", anomaly.payload.get("spend", budget))
        spend_amount = float(Decimal(str(amount_value)))
        domain_id = anomaly.payload.get("domainId", agent.domain_id)
        action = AgentAction(
            agent=agent.ens,
            domain=str(domain_id),
            spend=spend_amount,
            call=str(anomaly.payload.get("description", anomaly.kind.replace("-", " "))),
            metadata=metadata,
            opcode=(str(anomaly.payload.get("opcode"))).upper() if anomaly.kind == "unsafe-opcode" else None,
            target=anomaly.payload.get("target"),
            calldata_bytes=int(anomaly.payload.get("calldataBytes", anomaly.payload.get("calldata_bytes", 0)))
            if anomaly.kind == "calldata-spike"
            else None,
            function_selector=str(anomaly.payload.get("selector")) if anomaly.kind == "forbidden-selector" else None,
            block_number=block_number,
            agent_address=agent.address.lower(),
        )
        if anomaly.kind != "calldata-spike":
            maybe_size = anomaly.payload.get("calldataBytes") or anomaly.payload.get("calldata_bytes")
            if maybe_size is not None:
                action.metadata["calldataBytes"] = int(maybe_size)
        sentinel.evaluate(action)
        block_number += 1

    zk_key = spec.base_setup.verifying_key or "scenario-proof"

    if spec.owner_actions.update_sentinel:
        ratio = spec.owner_actions.update_sentinel.get("budgetGraceRatio")
        if ratio is not None:
            owner_console.update_sentinel(config.owner_address, budget_grace_ratio=float(ratio))

    for update in spec.owner_actions.update_domain_safety:
        owner_console.update_domain_policy(
            config.owner_address,
            update["domainId"],
            human_name=update.get("humanName"),
            budget_limit=update.get("budgetLimit"),
            unsafe_opcodes=update.get("unsafeOpcodes"),
            allowed_targets=update.get("allowedTargets"),
            max_calldata_bytes=update.get("maxCalldataBytes"),
            forbidden_selectors=update.get("forbiddenSelectors"),
        )

    for pause in spec.owner_actions.pause_domains:
        owner_console.pause_domain(
            config.owner_address,
            pause["domainId"],
            reason=pause.get("reason", "scenario-pause"),
        )

    for resume in spec.owner_actions.resume_domains:
        owner_console.resume_domain(config.owner_address, resume["domainId"])

    for budget_update in spec.owner_actions.set_agent_budgets:
        ens = budget_update.get("ens")
        if not ens:
            continue
        budget_value = Decimal(str(budget_update.get("budget", 0)))
        agent_budgets[ens.lower()] = budget_value
        owner_console.record_custom_action(
            action="agent-budget-update",
            details={"ens": ens, "budget": float(budget_value)},
        )

    if spec.owner_actions.update_entropy:
        if spec.owner_actions.update_entropy.get("onChainEntropy"):
            entropy_sources["onChainEntropy"] = spec.owner_actions.update_entropy["onChainEntropy"]
        if spec.owner_actions.update_entropy.get("recentBeacon"):
            entropy_sources["recentBeacon"] = spec.owner_actions.update_entropy["recentBeacon"]
        event_bus.publish(
            "EntropyUpdated",
            {"owner": config.owner_address, **entropy_sources},
        )
        owner_console.record_custom_action(action="entropy-update", details=dict(entropy_sources))

    if spec.owner_actions.update_zk_key:
        zk_key = spec.owner_actions.update_zk_key
        owner_console.record_custom_action(action="zk-key-rotated", details={"verifyingKey": zk_key})

    if spec.owner_actions.update_governance:
        normalized = {
            key_mapping.get(key, key): value
            for key, value in spec.owner_actions.update_governance.items()
        }
        owner_console.update_config(config.owner_address, **normalized)

    for distribution in spec.owner_actions.distribute_treasury:
        amount_value = distribution.get("amount")
        if amount_value is None and distribution.get("percentageBps") is not None:
            balance = stake_manager.get_treasury_balance()
            amount_value = (balance * Decimal(distribution["percentageBps"]) / Decimal(10_000)).quantize(Decimal("0.0000000001"))
        if amount_value is None:
            continue
        owner_console.distribute_treasury(
            config.owner_address,
            distribution["recipient"],
            amount=amount_value,
            note=distribution.get("note"),
        )

    if spec.owner_actions.rotate_ens_registry.get("leaves"):
        leaves = spec.owner_actions.rotate_ens_registry["leaves"]
        for leaf in leaves:
            ens_registry.add(str(leaf.get("ens", "")).lower())
        owner_console.record_custom_action(
            action="ens-registry-rotation",
            details={
                "mode": spec.owner_actions.rotate_ens_registry.get("mode", "append"),
                "leaves": leaves,
            },
        )

    batcher = ZKBatchAttestor(config)
    job_count = min(spec.job.count, config.batch_proof_capacity)
    jobs = [
        JobResult(
            job_id=f"{spec.job.domain_id}-job-{index}",
            outcome_hash=f"outcome::{index % 2}",
            execution_digest=f"digest::{index}",
        )
        for index in range(1, job_count + 1)
    ]
    proof = batcher.create_batch_proof(jobs, circuit_hash=zk_key)
    finalized_event = next(event_bus.find("RoundFinalized"), None)
    timeline = dict(finalized_event.payload.get("timeline") if finalized_event else {})

    return _build_summary(
        event_bus=event_bus,
        domain_pause=domain_pause,
        owner_console=owner_console,
        sentinel=sentinel,
        committee=committee,
        truthful_outcome=truthful_outcome,
        round_result=round_result,
        batch_proof=proof,
        gas_saved=batcher.estimate_gas_saved(len(jobs)),
        timeline=timeline,
        committee_signature=spec.job.committee_signature,
        scenario_name=spec.name,
        scenario_description=spec.description,
        context=spec.context,
        entropy_sources=entropy_sources if entropy_sources else None,
        verifying_key=zk_key,
    )

