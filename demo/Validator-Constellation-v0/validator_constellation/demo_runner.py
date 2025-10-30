from __future__ import annotations

import json
import hashlib
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

import yaml

from .commit_reveal import CommitRevealRound
from .config import SystemConfig
from .events import EventBus
from .governance import OwnerConsole
from .identity import ENSIdentityVerifier
from .sentinel import AgentAction, DomainPauseController, SentinelAlert, SentinelMonitor, _hash_target
from .staking import StakeManager
from .subgraph import SubgraphIndexer
from .vrf import VRFCoordinator
from .zk_batch import JobResult, ZKBatchAttestor


@dataclass
class DemoSummary:
    committee: List[str]
    round_result: Any
    paused_domains: List[str]
    gas_saved: int
    batch_proof_root: str
    indexed_events: int
    timeline: Dict[str, Any]
    owner_actions: List[Dict[str, Any]]
    sentinel_alerts: List[Dict[str, Any]]
    domain_events: List[Dict[str, Any]]
    event_feed: List[Dict[str, Any]]
    truthful_outcome: Any
    verifying_key: str
    entropy_sources: Optional[Dict[str, Any]] = None
    scenario_name: Optional[str] = None
    committee_signature: Optional[str] = None
    gas_metrics: Optional[Dict[str, Any]] = None
    context: Dict[str, Any] = field(default_factory=dict)


def _opposite_choice(choice: Any) -> Any:
    if isinstance(choice, bool):
        return not choice
    if isinstance(choice, str):
        return "REJECT" if choice.upper() != "REJECT" else "APPROVE"
    return choice


def _normalize_domains(domains: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for domain in domains:
        normalized.append(
            {
                "domain": domain.get("id") or domain.get("domain"),
                "human_name": domain.get("humanName") or domain.get("human_name"),
                "budget_limit": domain.get("budgetLimit") or domain.get("budget_limit", 0),
                "unsafe_opcodes": list(domain.get("unsafeOpcodes") or domain.get("unsafe_opcodes", [])),
                "allowed_targets": list(domain.get("allowedTargets") or domain.get("allowed_targets", [])),
                "max_calldata_bytes": domain.get("maxCalldataBytes") or domain.get("max_calldata_bytes", 4096),
                "forbidden_selectors": list(domain.get("forbiddenSelectors") or domain.get("forbidden_selectors", [])),
            }
        )
    return normalized


def _setup_core(seed: str, config: SystemConfig) -> Dict[str, Any]:
    bus = EventBus()
    indexer = SubgraphIndexer(bus)
    pause_controller = DomainPauseController(bus, config.default_domains)
    sentinel = SentinelMonitor(pause_controller=pause_controller, event_bus=bus)
    stake_manager = StakeManager(bus, config.owner_address)
    identity = ENSIdentityVerifier(
        config.allowed_validator_roots,
        config.allowed_agent_roots,
        config.allowed_node_roots,
        blacklist=config.blacklist,
    )
    owner = OwnerConsole(config.owner_address, config, pause_controller, stake_manager, bus)
    vrf = VRFCoordinator(stake_manager, domain="validator-constellation-demo")
    attestor = ZKBatchAttestor(config)
    return {
        "bus": bus,
        "indexer": indexer,
        "pause_controller": pause_controller,
        "sentinel": sentinel,
        "stake_manager": stake_manager,
        "identity": identity,
        "owner": owner,
        "vrf": vrf,
        "attestor": attestor,
    }


def _register_validators(
    stake_manager: StakeManager,
    identity: ENSIdentityVerifier,
    validators: Sequence[Mapping[str, Any]],
) -> None:
    for validator in validators:
        address = validator["address"].lower()
        ens = validator["ens"]
        stake = Decimal(str(validator.get("stake", "32")))
        proof = identity.sign(ens, address)
        identity.verify_validator(address, proof)
        stake_manager.register_validator(address, ens, stake)


def _build_jobs(prefix: str, count: int) -> List[JobResult]:
    jobs: List[JobResult] = []
    for idx in range(count):
        job_id = f"{prefix}-{idx:04d}"
        outcome_hash = hashlib.sha3_256(job_id.encode()).hexdigest()
        execution_digest = hashlib.sha3_256(f"exec::{job_id}".encode()).hexdigest()
        jobs.append(JobResult(job_id, outcome_hash, execution_digest))
    return jobs


def _collect_domain_events(bus: EventBus) -> List[Dict[str, Any]]:
    return [event.payload for event in bus.find("DomainPaused")] + [
        event.payload for event in bus.find("DomainResumed")
    ]


def run_validator_constellation_demo(
    seed: str,
    truthful_outcome: Any,
    *,
    committee_size: Optional[int] = None,
    job_count: Optional[int] = None,
    config_overrides: Optional[Mapping[str, object]] = None,
    budget_limit: Optional[float] = None,
) -> DemoSummary:
    config = SystemConfig()
    if config_overrides:
        config = config.clone(**dict(config_overrides))
    if committee_size is not None:
        config = config.clone(committee_size=int(committee_size))
        if config.quorum > config.committee_size:
            config = config.clone(quorum=config.committee_size)
    if job_count is not None:
        desired_capacity = max(1, int(job_count))
        config = config.clone(batch_proof_capacity=max(config.batch_proof_capacity, desired_capacity))
    core = _setup_core(seed, config)
    bus: EventBus = core["bus"]
    indexer: SubgraphIndexer = core["indexer"]
    pause_controller: DomainPauseController = core["pause_controller"]
    sentinel: SentinelMonitor = core["sentinel"]
    stake_manager: StakeManager = core["stake_manager"]
    identity: ENSIdentityVerifier = core["identity"]
    owner: OwnerConsole = core["owner"]
    vrf: VRFCoordinator = core["vrf"]
    attestor: ZKBatchAttestor = core["attestor"]

    validators = [
        {"address": "0x1", "ens": "atlas.club.agi.eth", "stake": "32"},
        {"address": "0x2", "ens": "zephyr.club.agi.eth", "stake": "32"},
        {"address": "0x3", "ens": "nova.club.agi.eth", "stake": "32"},
        {"address": "0x4", "ens": "orion.club.agi.eth", "stake": "32"},
        {"address": "0x5", "ens": "hyperion.club.agi.eth", "stake": "32"},
    ]
    _register_validators(stake_manager, identity, validators)

    if budget_limit is not None:
        for domain in list(pause_controller.domains):
            pause_controller.update_domain(domain, budget_limit=float(budget_limit))

    committee_size_value = committee_size if committee_size is not None else config.committee_size
    committee_addresses = vrf.select_committee(seed, committee_size_value)
    committee = {address: stake_manager.get(address).ens for address in committee_addresses}
    round_engine = CommitRevealRound(
        round_id=f"demo::{seed}",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=truthful_outcome,
    )
    for idx, address in enumerate(committee_addresses):
        salt = f"{seed}:{idx}"
        choice = truthful_outcome if idx != 0 else _opposite_choice(truthful_outcome)
        round_engine.commit(address, choice, salt)
    for idx, address in enumerate(committee_addresses):
        salt = f"{seed}:{idx}"
        choice = truthful_outcome if idx != 0 else _opposite_choice(truthful_outcome)
        if idx == 0:
            try:
                round_engine.reveal(address, choice, salt)
            except RuntimeError:
                continue
        else:
            round_engine.reveal(address, choice, salt)
    round_result = round_engine.finalize()

    target_job_count = int(job_count if job_count is not None else config.batch_proof_capacity)
    jobs = _build_jobs(seed, target_job_count)
    proof = attestor.create_batch_proof(jobs)
    attestor.verify_batch_proof(jobs, proof)

    alerts: List[SentinelAlert] = []
    alerts.append(
        sentinel.evaluate(
            AgentAction(
                agent="nova.agent.agi.eth",
                domain="synthetic-biology",
                spend=2_000_000.0,
                call="allocate_budget",
                metadata={"budget": 2_000_000.0},
            )
        )
    )
    alerts.append(
        sentinel.evaluate(
            AgentAction(
                agent="sentinel.agent.agi.eth",
                domain="synthetic-biology",
                spend=500.0,
                call="execute_opcode",
                metadata={"opcode": "DELEGATECALL"},
            )
        )
    )
    alerts.append(
        sentinel.evaluate(
            AgentAction(
                agent="nova.agent.agi.eth",
                domain="synthetic-biology",
                spend=150.0,
                call="invoke_target",
                target="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                metadata={"targetHash": _hash_target("0xunauthorised")},
            )
        )
    )
    alerts = [alert for alert in alerts if alert is not None]

    owner.update_config(config.owner_address, quorum=4)

    domain_events = _collect_domain_events(bus)
    summary = DemoSummary(
        committee=[committee[address] for address in committee_addresses],
        round_result=round_result,
        paused_domains=list(pause_controller.paused.keys()),
        gas_saved=proof.gas_saved,
        batch_proof_root=proof.digest,
        indexed_events=indexer.count(),
        timeline=round_engine.timeline,
        owner_actions=[asdict(action) for action in owner.actions],
        sentinel_alerts=[asdict(alert) for alert in alerts],
        domain_events=domain_events,
        event_feed=indexer.feed(),
        truthful_outcome=truthful_outcome,
        verifying_key=config.verifying_key,
        entropy_sources={
            "seed": seed,
            "recentBeacon": hashlib.sha3_256(seed.encode()).hexdigest(),
        },
        scenario_name=None,
        committee_signature=hashlib.sha3_256("".join(committee.values()).encode()).hexdigest(),
        gas_metrics={"estimatedProofGas": proof.gas_saved // 10},
        context={
            "operator": "Non-technical mission director",
            "committeeSize": committee_size_value,
            "batchSize": target_job_count,
            "budgetLimit": budget_limit
            if budget_limit is not None
            else pause_controller.domains[next(iter(pause_controller.domains))]["budget_limit"],
            "configOverrides": dict(config_overrides or {}),
        },
    )
    return summary


def summary_to_dict(summary: DemoSummary) -> Dict[str, Any]:
    return {
        "committee": summary.committee,
        "roundResult": summary.round_result,
        "pausedDomains": summary.paused_domains,
        "gasSaved": summary.gas_saved,
        "batchProofRoot": summary.batch_proof_root,
        "indexedEvents": summary.indexed_events,
        "timeline": summary.timeline,
        "ownerActions": summary.owner_actions,
        "sentinelAlerts": summary.sentinel_alerts,
        "domainEvents": summary.domain_events,
        "eventFeed": summary.event_feed,
        "truthfulOutcome": summary.truthful_outcome,
        "verifyingKey": summary.verifying_key,
        "entropySources": summary.entropy_sources,
        "scenarioName": summary.scenario_name,
        "committeeSignature": summary.committee_signature,
        "gasMetrics": summary.gas_metrics,
        "context": summary.context,
    }


def write_web_artifacts(summary: DemoSummary, output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "events": output_dir / "events.json",
        "summary": output_dir / "summary.json",
        "timeline": output_dir / "timeline.json",
        "owner_actions": output_dir / "owner-actions.json",
    }
    manifest["events"].write_text(json.dumps(summary.event_feed, indent=2))
    manifest["summary"].write_text(json.dumps(summary_to_dict(summary), indent=2))
    manifest["timeline"].write_text(json.dumps(summary.timeline, indent=2))
    manifest["owner_actions"].write_text(json.dumps(summary.owner_actions, indent=2))
    return manifest


def run_validator_constellation_scenario(
    path: Path,
    seed_override: Optional[str] = None,
    truthful_override: Optional[Any] = None,
) -> DemoSummary:
    document = yaml.safe_load(path.read_text())
    config = SystemConfig()
    base = document.get("baseSetup", {})
    config.verifying_key = base.get("verifyingKey", config.verifying_key)
    config.committee_size = base.get("governance", {}).get("committeeSize", config.committee_size)
    config.quorum = int(base.get("governance", {}).get("quorumPercentage", 75) * config.committee_size / 100)
    config.default_domains = tuple(_normalize_domains(document.get("domains", [])))
    config.batch_proof_capacity = max(config.batch_proof_capacity, document.get("job", {}).get("count", 1))

    core = _setup_core(seed_override or base.get("recentBeacon", "scenario"), config)
    bus: EventBus = core["bus"]
    indexer: SubgraphIndexer = core["indexer"]
    pause_controller: DomainPauseController = core["pause_controller"]
    sentinel: SentinelMonitor = core["sentinel"]
    stake_manager: StakeManager = core["stake_manager"]
    identity: ENSIdentityVerifier = core["identity"]
    owner: OwnerConsole = core["owner"]
    vrf: VRFCoordinator = core["vrf"]
    attestor: ZKBatchAttestor = core["attestor"]

    _register_validators(stake_manager, identity, document.get("validators", []))

    seed = seed_override or base.get("recentBeacon", "scenario")
    committee_addresses = vrf.select_committee(seed, config.committee_size)
    committee = {address: stake_manager.get(address).ens for address in committee_addresses}

    job = document.get("job", {})
    truthful_outcome = truthful_override if truthful_override is not None else job.get("truthfulVote", True)
    round_engine = CommitRevealRound(
        round_id=f"scenario::{job.get('round', 0)}",
        committee=committee,
        config=config,
        stake_manager=stake_manager,
        event_bus=bus,
        truthful_outcome=truthful_outcome,
    )
    vote_overrides = {key: value for key, value in document.get("overrides", {}).get("voteByEns", {}).items()}
    non_reveal = set(document.get("overrides", {}).get("nonRevealValidators", []))
    for idx, address in enumerate(committee_addresses):
        ens = committee[address]
        choice = vote_overrides.get(ens, truthful_outcome)
        salt = f"scenario::{idx}::{seed}"
        round_engine.commit(address, choice, salt)
    for idx, address in enumerate(committee_addresses):
        ens = committee[address]
        if ens in non_reveal:
            continue
        choice = vote_overrides.get(ens, truthful_outcome)
        salt = f"scenario::{idx}::{seed}"
        round_engine.reveal(address, choice, salt)
    if non_reveal:
        round_engine.advance_blocks(config.reveal_phase_blocks)
    round_result = round_engine.finalize()

    jobs = _build_jobs("scenario", job.get("count", 1))
    proof = attestor.create_batch_proof(jobs)
    attestor.verify_batch_proof(jobs, proof)

    agents_by_ens = {entry["ens"]: entry for entry in document.get("agents", [])}
    alerts: List[SentinelAlert] = []
    for anomaly in document.get("anomalies", []):
        agent_entry = agents_by_ens.get(anomaly.get("agentEns"))
        domain = agent_entry.get("domainId") if agent_entry else config.default_domains[0]["domain"]
        metadata: Dict[str, Any] = {"description": anomaly.get("description")}
        target = anomaly.get("target")
        spend = float(anomaly.get("amount", anomaly.get("calldataBytes", 0)))
        if anomaly.get("kind") == "budget-overrun":
            metadata["budget"] = anomaly.get("amount")
        if anomaly.get("kind") == "unsafe-opcode":
            metadata["opcode"] = anomaly.get("opcode")
            metadata["calldataBytes"] = anomaly.get("calldataBytes", 0)
        if anomaly.get("kind") == "unauthorized-target":
            metadata["targetHash"] = _hash_target(target or "")
        if anomaly.get("kind") == "calldata-spike":
            metadata["calldataBytes"] = anomaly.get("calldataBytes", 0)
            metadata["targetHash"] = _hash_target(anomaly.get("target", ""))
        if anomaly.get("kind") == "forbidden-selector":
            metadata["selector"] = anomaly.get("selector")
            metadata["targetHash"] = _hash_target(anomaly.get("target", ""))
        alert = sentinel.evaluate(
            AgentAction(
                agent=anomaly.get("agentEns", "unknown"),
                domain=domain,
                spend=spend or float(agent_entry.get("budget", 0) if agent_entry else 0),
                call=anomaly.get("kind", "action"),
                metadata=metadata,
                target=target,
                calldata_bytes=anomaly.get("calldataBytes"),
            )
        )
        if alert:
            alerts.append(alert)

    owner_actions = owner.execute_script(config.owner_address, document.get("ownerActions", {}))

    entropy_sources = {
        "onChainEntropy": base.get("onChainEntropy"),
        "recentBeacon": base.get("recentBeacon"),
    }
    for action in owner_actions:
        if action.action == "update-entropy":
            entropy_sources.update(action.details)  # type: ignore[arg-type]

    domain_events = _collect_domain_events(bus)
    summary = DemoSummary(
        committee=[committee[address] for address in committee_addresses],
        round_result=round_result,
        paused_domains=list(pause_controller.paused.keys()),
        gas_saved=proof.gas_saved,
        batch_proof_root=proof.digest,
        indexed_events=indexer.count(),
        timeline=round_engine.timeline,
        owner_actions=[asdict(action) for action in owner.actions],
        sentinel_alerts=[asdict(alert) for alert in alerts],
        domain_events=domain_events,
        event_feed=indexer.feed(),
        truthful_outcome=truthful_outcome,
        verifying_key=config.verifying_key,
        entropy_sources=entropy_sources,
        scenario_name=document.get("name"),
        committee_signature=job.get("committeeSignature"),
        gas_metrics={"estimatedProofGas": proof.gas_saved // 12},
        context=document.get("context", {}),
    )
    return summary
