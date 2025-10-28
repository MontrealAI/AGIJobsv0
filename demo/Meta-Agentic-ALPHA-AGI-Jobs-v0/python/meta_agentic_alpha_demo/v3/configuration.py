"""Structured configuration loader for the Meta-Agentic α-AGI Jobs V3 demo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from meta_agentic_alpha_demo.v2.configuration import (
    AgentConfiguration,
    MetaAgenticV2Configuration,
    PhaseDefinition,
    PlanSettings,
    ScenarioMetadata,
    load_configuration as load_v2_configuration,
)


@dataclass(frozen=True)
class MissionProfile:
    """High-level mission directives that guide compounding alpha."""

    alpha_goal: str
    ica_score_target: float
    antifragility_focus: str
    sovereign_controls: Mapping[str, Any]
    opportunity_domains: Sequence[str]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "MissionProfile":
        alpha_goal = str(payload.get("alpha_goal", "compound-alpha"))
        ica_score_target = float(payload.get("ica_score_target", 0.0))
        antifragility_focus = str(payload.get("antifragility_focus", "antifragility"))
        sovereign_controls = dict(payload.get("sovereign_controls", {}))
        opportunity_domains = tuple(str(entry) for entry in payload.get("opportunity_domains", []) or [])
        return cls(
            alpha_goal=alpha_goal,
            ica_score_target=ica_score_target,
            antifragility_focus=antifragility_focus,
            sovereign_controls=sovereign_controls,
            opportunity_domains=opportunity_domains,
        )


@dataclass(frozen=True)
class MetaAgenticV3Configuration:
    """Aggregated view of the V3 scenario YAML."""

    base: MetaAgenticV2Configuration
    mission: MissionProfile
    unstoppable: Mapping[str, Any]

    @property
    def path(self) -> Path:  # pragma: no cover - passthrough
        return self.base.path

    @property
    def payload(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.payload

    @property
    def scenario(self) -> ScenarioMetadata:
        return self.base.scenario

    @property
    def agents(self) -> Sequence[AgentConfiguration]:  # pragma: no cover - passthrough
        return self.base.agents

    @property
    def phases(self) -> Sequence[PhaseDefinition]:  # pragma: no cover - passthrough
        return self.base.phases

    @property
    def plan(self) -> PlanSettings:  # pragma: no cover - passthrough
        return self.base.plan

    @property
    def base_dir(self) -> Path:
        return self.base.base_dir

    @property
    def attachments(self) -> Sequence[str]:
        return tuple(self.base.attachments)

    @property
    def dashboards(self) -> Sequence[Mapping[str, Any]]:  # pragma: no cover - passthrough
        return self.base.dashboards

    @property
    def owner(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.owner

    @property
    def treasury(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.treasury

    @property
    def gasless(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.gasless

    @property
    def approvals(self) -> Sequence[str]:  # pragma: no cover - passthrough
        return self.base.approvals

    @property
    def confirmations(self) -> Sequence[str]:  # pragma: no cover - passthrough
        return self.base.confirmations

    def phase_map(self) -> Mapping[str, PhaseDefinition]:  # pragma: no cover - passthrough
        return self.base.phase_map()


def load_configuration(path: str | Path) -> MetaAgenticV3Configuration:
    """Load and enrich the scenario configuration for the V3 demo."""

    base = load_v2_configuration(path)
    payload = base.payload
    mission = MissionProfile.from_mapping(payload.get("mission", {}))
    unstoppable = dict(payload.get("unstoppable", {}))
    return MetaAgenticV3Configuration(base=base, mission=mission, unstoppable=unstoppable)


__all__ = [
    "AgentConfiguration",
    "MetaAgenticV3Configuration",
    "MissionProfile",
    "PhaseDefinition",
    "PlanSettings",
    "ScenarioMetadata",
    "load_configuration",
]
