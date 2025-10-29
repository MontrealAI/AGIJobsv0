"""Scenario loader for the Validator Constellation demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import yaml


def _as_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Cannot convert empty string to Decimal")
        return Decimal(cleaned)
    raise TypeError(f"Unsupported numeric type: {type(value).__name__}")


@dataclass(slots=True)
class ScenarioDomain:
    id: str
    human_name: str
    budget_limit: Decimal
    unsafe_opcodes: List[str] = field(default_factory=list)
    allowed_targets: List[str] = field(default_factory=list)
    max_calldata_bytes: int = 0
    forbidden_selectors: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ScenarioValidator:
    ens: str
    address: str
    stake: Decimal


@dataclass(slots=True)
class ScenarioAgent:
    ens: str
    address: str
    domain_id: str
    budget: Decimal


@dataclass(slots=True)
class ScenarioNode:
    ens: str
    address: str


@dataclass(slots=True)
class ScenarioJob:
    domain_id: str
    round_id: int
    truthful_vote: str
    committee_signature: Optional[str]
    count: int


@dataclass(slots=True)
class ScenarioOverrides:
    vote_by_ens: Dict[str, str] = field(default_factory=dict)
    vote_by_address: Dict[str, str] = field(default_factory=dict)
    non_reveal_validators: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ScenarioBase:
    verifying_key: Optional[str]
    sentinel_grace_ratio: Optional[float]
    on_chain_entropy: Optional[str]
    recent_beacon: Optional[str]
    treasury_address: Optional[str]
    governance: Dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class ScenarioOwnerActions:
    update_sentinel: Dict[str, object] = field(default_factory=dict)
    update_domain_safety: List[Dict[str, object]] = field(default_factory=list)
    pause_domains: List[Dict[str, object]] = field(default_factory=list)
    resume_domains: List[Dict[str, object]] = field(default_factory=list)
    set_agent_budgets: List[Dict[str, object]] = field(default_factory=list)
    update_entropy: Dict[str, object] = field(default_factory=dict)
    update_zk_key: Optional[str] = None
    update_governance: Dict[str, object] = field(default_factory=dict)
    distribute_treasury: List[Dict[str, object]] = field(default_factory=list)
    rotate_ens_registry: Dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class ScenarioAnomaly:
    kind: str
    payload: Dict[str, object]


@dataclass(slots=True)
class ScenarioSpec:
    name: Optional[str]
    description: Optional[str]
    base_setup: ScenarioBase
    domains: List[ScenarioDomain]
    validators: List[ScenarioValidator]
    agents: List[ScenarioAgent]
    nodes: List[ScenarioNode]
    job: ScenarioJob
    overrides: ScenarioOverrides
    anomalies: List[ScenarioAnomaly]
    owner_actions: ScenarioOwnerActions
    context: Dict[str, object]


def _parse_domains(items: Iterable[Dict[str, object]] | None) -> List[ScenarioDomain]:
    domains: List[ScenarioDomain] = []
    for item in items or []:
        domains.append(
            ScenarioDomain(
                id=str(item["id"]),
                human_name=str(item.get("humanName", item.get("human_name", item["id"]))),
                budget_limit=_as_decimal(item.get("budgetLimit", item.get("budget_limit", 0))),
                unsafe_opcodes=list(item.get("unsafeOpcodes", item.get("unsafe_opcodes", []))),
                allowed_targets=list(item.get("allowedTargets", item.get("allowed_targets", []))),
                max_calldata_bytes=int(item.get("maxCalldataBytes", item.get("max_calldata_bytes", 0))),
                forbidden_selectors=list(item.get("forbiddenSelectors", item.get("forbidden_selectors", []))),
            )
        )
    return domains


def _parse_validators(items: Iterable[Dict[str, object]] | None) -> List[ScenarioValidator]:
    validators: List[ScenarioValidator] = []
    for item in items or []:
        validators.append(
            ScenarioValidator(
                ens=str(item["ens"]),
                address=str(item["address"]),
                stake=_as_decimal(item.get("stake", 0)),
            )
        )
    return validators


def _parse_agents(items: Iterable[Dict[str, object]] | None) -> List[ScenarioAgent]:
    agents: List[ScenarioAgent] = []
    for item in items or []:
        agents.append(
            ScenarioAgent(
                ens=str(item["ens"]),
                address=str(item["address"]),
                domain_id=str(item.get("domainId", item.get("domain_id"))),
                budget=_as_decimal(item.get("budget", 0)),
            )
        )
    return agents


def _parse_nodes(items: Iterable[Dict[str, object]] | None) -> List[ScenarioNode]:
    nodes: List[ScenarioNode] = []
    for item in items or []:
        nodes.append(
            ScenarioNode(ens=str(item["ens"]), address=str(item["address"]))
        )
    return nodes


def _parse_job(payload: Dict[str, object]) -> ScenarioJob:
    truthful = str(payload.get("truthfulVote", payload.get("truthful_vote", "APPROVE")))
    return ScenarioJob(
        domain_id=str(payload.get("domainId", payload.get("domain_id", "synthetic-biology"))),
        round_id=int(payload.get("round", payload.get("roundId", 1))),
        truthful_vote=truthful,
        committee_signature=payload.get("committeeSignature"),
        count=int(payload.get("count", payload.get("jobCount", 1_000))),
    )


def _parse_overrides(payload: Optional[Dict[str, object]]) -> ScenarioOverrides:
    if not payload:
        return ScenarioOverrides()
    return ScenarioOverrides(
        vote_by_ens={str(k): str(v) for k, v in (payload.get("voteByEns", {}) or {}).items()},
        vote_by_address={str(k): str(v) for k, v in (payload.get("voteByAddress", {}) or {}).items()},
        non_reveal_validators=[str(item) for item in payload.get("nonRevealValidators", [])],
    )


def _parse_base(payload: Optional[Dict[str, object]]) -> ScenarioBase:
    payload = payload or {}
    governance = dict(payload.get("governance", {}))
    return ScenarioBase(
        verifying_key=payload.get("verifyingKey"),
        sentinel_grace_ratio=(
            float(payload["sentinelGraceRatio"])
            if "sentinelGraceRatio" in payload and payload["sentinelGraceRatio"] is not None
            else None
        ),
        on_chain_entropy=payload.get("onChainEntropy"),
        recent_beacon=payload.get("recentBeacon"),
        treasury_address=payload.get("treasuryAddress"),
        governance=governance,
    )


def _parse_owner_actions(payload: Optional[Dict[str, object]]) -> ScenarioOwnerActions:
    payload = payload or {}
    return ScenarioOwnerActions(
        update_sentinel=dict(payload.get("updateSentinel", {})),
        update_domain_safety=list(payload.get("updateDomainSafety", [])),
        pause_domains=list(payload.get("pauseDomains", [])),
        resume_domains=list(payload.get("resumeDomains", [])),
        set_agent_budgets=list(payload.get("setAgentBudgets", [])),
        update_entropy=dict(payload.get("updateEntropy", {})),
        update_zk_key=payload.get("updateZkKey"),
        update_governance=dict(payload.get("updateGovernance", {})),
        distribute_treasury=list(payload.get("distributeTreasury", [])),
        rotate_ens_registry=dict(payload.get("rotateEnsRegistry", {})),
    )


def _parse_anomalies(items: Iterable[Dict[str, object]] | None) -> List[ScenarioAnomaly]:
    anomalies: List[ScenarioAnomaly] = []
    for item in items or []:
        anomalies.append(ScenarioAnomaly(kind=str(item.get("kind")), payload=dict(item)))
    return anomalies


def load_scenario(path: Path | str) -> ScenarioSpec:
    """Load a scenario specification from YAML."""

    raw_path = Path(path)
    data = yaml.safe_load(raw_path.read_text())
    if not isinstance(data, dict):
        raise TypeError("Scenario file must contain a mapping at the root")

    base = _parse_base(data.get("baseSetup"))
    spec = ScenarioSpec(
        name=data.get("name"),
        description=data.get("description"),
        base_setup=base,
        domains=_parse_domains(data.get("domains")),
        validators=_parse_validators(data.get("validators")),
        agents=_parse_agents(data.get("agents")),
        nodes=_parse_nodes(data.get("nodes")),
        job=_parse_job(data.get("job", {})),
        overrides=_parse_overrides(data.get("overrides")),
        anomalies=_parse_anomalies(data.get("anomalies")),
        owner_actions=_parse_owner_actions(data.get("ownerActions")),
        context=dict(data.get("context", {})),
    )
    return spec
