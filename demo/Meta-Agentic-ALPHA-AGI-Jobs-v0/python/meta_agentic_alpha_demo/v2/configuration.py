"""Structured configuration loader for the Meta-Agentic α-AGI Jobs V2 demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence

import yaml


@dataclass
class ScenarioMetadata:
    """Owner, treasury, and dashboard metadata for the demo."""

    identifier: str
    title: str
    narrative: str
    owner: Mapping[str, Any]
    treasury: Mapping[str, Any]
    gasless: Mapping[str, Any]
    dashboards: Sequence[Mapping[str, Any]]
    attachments: Sequence[str]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "ScenarioMetadata":
        identifier = str(payload.get("id", "meta-agentic-alpha-v2"))
        title = str(payload.get("title", "Meta-Agentic α-AGI Jobs Demo V2"))
        narrative = str(payload.get("narrative", ""))
        owner = dict(payload.get("owner", {}))
        treasury = dict(payload.get("treasury", {}))
        gasless = dict(payload.get("gasless", {}))
        dashboards = tuple(payload.get("dashboards", []) or [])
        attachments = tuple(str(item) for item in payload.get("attachments", []) or [])
        return cls(
            identifier=identifier,
            title=title,
            narrative=narrative,
            owner=owner,
            treasury=treasury,
            gasless=gasless,
            dashboards=dashboards,
            attachments=attachments,
        )


@dataclass
class AgentConfiguration:
    """Declarative registration payload for an agent."""

    agent_id: str
    payload: Mapping[str, Any]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "AgentConfiguration":
        agent_id = str(payload.get("agent_id"))
        if not agent_id:
            raise ValueError("Agent configuration requires an `agent_id`")
        return cls(agent_id=agent_id, payload=dict(payload))


@dataclass
class PhaseDefinition:
    """Represents a scenario phase and the orchestrator step template."""

    identifier: str
    label: str
    description: str
    weight: float
    success_metric: str
    step_payload: MutableMapping[str, Any]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "PhaseDefinition":
        identifier = str(payload.get("id"))
        if not identifier:
            raise ValueError("Phase definition is missing an `id`")
        label = str(payload.get("label", identifier))
        description = str(payload.get("description", ""))
        weight = float(payload.get("weight", 1.0))
        success_metric = str(payload.get("success_metric", "alpha_score"))
        step_payload = dict(payload.get("step", {}))
        if not step_payload:
            raise ValueError(f"Phase `{identifier}` must define a `step` payload")
        return cls(
            identifier=identifier,
            label=label,
            description=description,
            weight=weight,
            success_metric=success_metric,
            step_payload=step_payload,
        )


@dataclass
class PlanSettings:
    """Top-level plan controls for approvals, budgets, antifragility, confirmations."""

    approvals: Sequence[str] = field(default_factory=tuple)
    budget: Mapping[str, Any] = field(default_factory=dict)
    antifragility: Mapping[str, Any] = field(default_factory=dict)
    confirmations: Sequence[str] = field(default_factory=tuple)

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "PlanSettings":
        approvals = tuple(str(entry) for entry in payload.get("approvals", []) or [])
        confirmations = tuple(str(entry) for entry in payload.get("confirmations", []) or [])
        budget = dict(payload.get("budget", {}))
        antifragility = dict(payload.get("antifragility", {}))
        return cls(
            approvals=approvals,
            budget=budget,
            antifragility=antifragility,
            confirmations=confirmations,
        )


@dataclass
class MetaAgenticV2Configuration:
    """Aggregated view of the V2 scenario YAML."""

    path: Path
    payload: Mapping[str, Any]
    scenario: ScenarioMetadata
    agents: Sequence[AgentConfiguration]
    phases: Sequence[PhaseDefinition]
    plan: PlanSettings

    @property
    def base_dir(self) -> Path:
        return self.path.parent.parent

    @property
    def attachments(self) -> Iterable[str]:
        return self.scenario.attachments

    @property
    def dashboards(self) -> Sequence[Mapping[str, Any]]:
        return self.scenario.dashboards

    @property
    def owner(self) -> Mapping[str, Any]:
        return self.scenario.owner

    @property
    def treasury(self) -> Mapping[str, Any]:
        return self.scenario.treasury

    @property
    def gasless(self) -> Mapping[str, Any]:
        return self.scenario.gasless

    @property
    def approvals(self) -> Sequence[str]:
        return self.plan.approvals

    @property
    def confirmations(self) -> Sequence[str]:
        return self.plan.confirmations

    def phase_map(self) -> Dict[str, PhaseDefinition]:
        return {phase.identifier: phase for phase in self.phases}


def _load_yaml(path: Path) -> Mapping[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ValueError("Configuration payload must be a mapping")
    return payload


def load_configuration(path: str | Path) -> MetaAgenticV2Configuration:
    """Load and validate the scenario configuration for the V2 demo."""

    config_path = Path(path).resolve()
    payload = _load_yaml(config_path)

    scenario = ScenarioMetadata.from_mapping(payload.get("scenario", {}))
    agents = [AgentConfiguration.from_mapping(entry) for entry in payload.get("agents", []) or []]
    phases = [PhaseDefinition.from_mapping(entry) for entry in payload.get("phases", []) or []]
    if not phases:
        raise ValueError("At least one phase must be defined in the configuration")
    plan = PlanSettings.from_mapping(payload.get("plan", {}))

    return MetaAgenticV2Configuration(
        path=config_path,
        payload=payload,
        scenario=scenario,
        agents=tuple(agents),
        phases=tuple(phases),
        plan=plan,
    )


__all__ = [
    "AgentConfiguration",
    "MetaAgenticV2Configuration",
    "PhaseDefinition",
    "PlanSettings",
    "ScenarioMetadata",
    "load_configuration",
]
