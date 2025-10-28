"""Scenario configuration loader for the Meta-Agentic α-AGI Jobs Demo V4."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Sequence

from meta_agentic_alpha_demo.v3.configuration import (
    AgentConfiguration,
    MetaAgenticV3Configuration,
    MissionProfile,
    PhaseDefinition,
    PlanSettings,
    ScenarioMetadata,
    load_configuration as load_v3_configuration,
)


@dataclass(frozen=True)
class ControlTower:
    """Owner console controls and guardian mesh metadata."""

    console_panels: Sequence[Mapping[str, Any]]
    owner_actions: Sequence[str]
    guardian_mesh: Mapping[str, Any]
    compliance_matrix: Mapping[str, Any]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "ControlTower":
        console_panels = tuple(payload.get("console_panels", []) or [])
        owner_actions = tuple(str(action) for action in payload.get("owner_actions", []) or [])
        guardian_mesh = dict(payload.get("guardian_mesh", {}))
        compliance_matrix = dict(payload.get("compliance_matrix", {}))
        return cls(
            console_panels=console_panels,
            owner_actions=owner_actions,
            guardian_mesh=guardian_mesh,
            compliance_matrix=compliance_matrix,
        )


@dataclass(frozen=True)
class AlphaPipeline:
    """Reference to the cross-phase alpha orchestration pipeline."""

    identify: Mapping[str, Any]
    learn: Mapping[str, Any]
    design: Mapping[str, Any]
    strategise: Mapping[str, Any]
    execute: Mapping[str, Any]

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "AlphaPipeline":
        return cls(
            identify=dict(payload.get("identify", {})),
            learn=dict(payload.get("learn", {})),
            design=dict(payload.get("design", {})),
            strategise=dict(payload.get("strategise", {})),
            execute=dict(payload.get("execute", {})),
        )


@dataclass(frozen=True)
class MetaAgenticV4Configuration:
    """Aggregated view of the V4 scenario YAML."""

    base: MetaAgenticV3Configuration
    control_tower: ControlTower
    alpha_pipeline: AlphaPipeline

    @property
    def path(self) -> Path:  # pragma: no cover - passthrough
        return self.base.path

    @property
    def payload(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.payload

    @property
    def scenario(self) -> ScenarioMetadata:  # pragma: no cover - passthrough
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
    def base_dir(self) -> Path:  # pragma: no cover - passthrough
        return self.base.base_dir

    @property
    def attachments(self) -> Sequence[str]:  # pragma: no cover - passthrough
        return self.base.attachments

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

    @property
    def mission(self) -> MissionProfile:  # pragma: no cover - passthrough
        return self.base.mission

    @property
    def unstoppable(self) -> Mapping[str, Any]:  # pragma: no cover - passthrough
        return self.base.unstoppable

    def phase_map(self) -> Mapping[str, PhaseDefinition]:  # pragma: no cover - passthrough
        return self.base.phase_map()

    def copy_payload(self) -> MutableMapping[str, Any]:
        return dict(self.payload)


def load_configuration(path: str | Path) -> MetaAgenticV4Configuration:
    """Load and enrich the scenario configuration for the V4 demo."""

    base = load_v3_configuration(path)
    payload = base.payload
    control_tower = ControlTower.from_mapping(payload.get("control_tower", {}))
    alpha_pipeline = AlphaPipeline.from_mapping(payload.get("alpha_pipeline", {}))
    return MetaAgenticV4Configuration(
        base=base,
        control_tower=control_tower,
        alpha_pipeline=alpha_pipeline,
    )


__all__ = [
    "AgentConfiguration",
    "AlphaPipeline",
    "ControlTower",
    "MetaAgenticV4Configuration",
    "MissionProfile",
    "PhaseDefinition",
    "PlanSettings",
    "ScenarioMetadata",
    "load_configuration",
]
