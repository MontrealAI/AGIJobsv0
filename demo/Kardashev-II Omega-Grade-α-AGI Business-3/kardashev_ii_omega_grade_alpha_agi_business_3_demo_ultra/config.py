"""Configuration loader for the Kardashev-II Omega-Grade Ultra demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobSpec
from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.config import (
    OmegaOrchestratorConfig,
    build_config as build_omega_config,
    load_config_payload as load_omega_payload,
)


class UltraConfigError(RuntimeError):
    """Raised when the ultra mission configuration is invalid."""


@dataclass
class MissionJobPlan:
    """Declarative DAG node describing a job and its child sub-jobs."""

    spec_payload: Dict[str, Any]
    children: List["MissionJobPlan"] = field(default_factory=list)
    plan_path: str = ""

    def instantiate(self, parent_id: Optional[str] = None) -> JobSpec:
        payload = dict(self.spec_payload)
        if parent_id is not None:
            payload["parent_id"] = parent_id
        payload.setdefault("metadata", {})
        metadata = dict(payload["metadata"])
        metadata.setdefault("plan_path", self.plan_path)
        payload["metadata"] = metadata
        return JobSpec.from_dict(payload)

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any], *, path: str = "") -> "MissionJobPlan":
        if not isinstance(payload, Mapping):
            raise UltraConfigError("Job plan entries must be mappings")
        children_payload = payload.get("children", [])
        if isinstance(children_payload, Mapping):
            children_iter: Iterable[Mapping[str, Any]] = [children_payload]
        elif isinstance(children_payload, Iterable):
            children_iter = [child for child in children_payload if isinstance(child, Mapping)]
        else:
            children_iter = []
        spec_payload: Dict[str, Any] = {
            key: value for key, value in payload.items() if key != "children"
        }
        node = cls(spec_payload=spec_payload, plan_path=path)
        node.children = [
            cls.from_payload(child, path=f"{path}.{index}" if path else str(index))
            for index, child in enumerate(children_iter)
        ]
        return node


@dataclass
class UltraMissionProfile:
    """High-level mission directives for the ultra demo."""

    name: str
    vision: str
    runtime_hours: float
    autopilot_cycles: int
    checkpoint_rotation: int
    archive_path: Path
    deadline_warning_minutes: float
    archive_interval_seconds: float
    job_plan: List[MissionJobPlan]


@dataclass
class UltraDemoConfig:
    """Bundled configuration for the ultra-grade demo."""

    orchestrator: OmegaOrchestratorConfig
    mission: UltraMissionProfile


_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "mission.json"


def _parse_job_plan(entries: Iterable[Mapping[str, Any]]) -> List[MissionJobPlan]:
    plan: List[MissionJobPlan] = []
    for index, entry in enumerate(entries):
        plan.append(MissionJobPlan.from_payload(entry, path=str(index)))
    return plan


def _load_mission_profile(payload: Mapping[str, Any]) -> UltraMissionProfile:
    if "mission" not in payload:
        raise UltraConfigError("Configuration missing 'mission' section")
    mission_payload = payload["mission"]
    if not isinstance(mission_payload, Mapping):
        raise UltraConfigError("'mission' section must be a mapping")
    name = str(mission_payload.get("name", "Kardashev-II Omega-Grade Ultra Mission"))
    vision = str(
        mission_payload.get(
            "vision",
            "Autonomously construct and govern a Dyson-swarm scale enterprise network.",
        )
    )
    runtime_hours = float(mission_payload.get("runtime_hours", 72.0))
    autopilot_cycles = int(mission_payload.get("autopilot_cycles", 0))
    checkpoint_rotation = int(mission_payload.get("checkpoint_rotation", 12))
    archive_path = Path(mission_payload.get("archive_path", "artifacts/status/archive"))
    deadline_warning_minutes = float(mission_payload.get("deadline_warning_minutes", 90.0))
    archive_interval_seconds = float(mission_payload.get("archive_interval_seconds", 300.0))
    jobs_payload = mission_payload.get("jobs", [])
    if not isinstance(jobs_payload, Iterable) or isinstance(jobs_payload, (str, bytes)):
        raise UltraConfigError("'jobs' must be a list of job definitions")
    job_plan = _parse_job_plan(
        [entry for entry in jobs_payload if isinstance(entry, Mapping)]
    )
    if not job_plan:
        raise UltraConfigError("Mission plan must include at least one job entry")
    return UltraMissionProfile(
        name=name,
        vision=vision,
        runtime_hours=runtime_hours,
        autopilot_cycles=autopilot_cycles,
        checkpoint_rotation=checkpoint_rotation,
        archive_path=archive_path,
        deadline_warning_minutes=deadline_warning_minutes,
        archive_interval_seconds=archive_interval_seconds,
        job_plan=job_plan,
    )


def load_ultra_config(
    path: Optional[Path] = None,
    overrides: Optional[MutableMapping[str, Any]] = None,
) -> UltraDemoConfig:
    """Load an :class:`UltraDemoConfig` from *path* or the default mission file."""

    target_path = path or _DEFAULT_CONFIG_PATH
    payload = load_omega_payload(target_path)
    if overrides:
        payload = {**payload, **overrides}
    mission = _load_mission_profile(payload)
    orchestrator_payload: Mapping[str, Any] = payload.get("orchestrator", {})
    if not isinstance(orchestrator_payload, Mapping):
        raise UltraConfigError("'orchestrator' section must be a mapping")
    orchestrator_overrides = dict(orchestrator_payload)
    governance_payload = orchestrator_overrides.get("governance")
    if isinstance(governance_payload, Mapping):
        gov_overrides = dict(governance_payload)
        for key in ("validator_commit_window", "validator_reveal_window"):
            if key in gov_overrides and not isinstance(gov_overrides[key], timedelta):
                gov_overrides[key] = timedelta(seconds=float(gov_overrides[key]))
        orchestrator_overrides["governance"] = gov_overrides
    orchestrator_config = build_omega_config(orchestrator_overrides)
    if mission.autopilot_cycles > 0:
        orchestrator_config.max_cycles = mission.autopilot_cycles
    orchestrator_config.checkpoint_interval_seconds = min(
        orchestrator_config.checkpoint_interval_seconds,
        max(5.0, mission.archive_interval_seconds),
    )
    return UltraDemoConfig(orchestrator=orchestrator_config, mission=mission)


__all__ = [
    "UltraConfigError",
    "UltraDemoConfig",
    "UltraMissionProfile",
    "MissionJobPlan",
    "load_ultra_config",
]
