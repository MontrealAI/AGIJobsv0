"""Scenario loader for the Omega-grade Kardashev-II α-AGI Business 3 demo."""

from __future__ import annotations

import json
import math
import textwrap
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.governance import (
    GovernanceParameters,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobSpec
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    OrchestratorConfig,
)


@dataclass(slots=True)
class JobPlanNode:
    """Declarative description of a job and its recursive children."""

    job_id: str
    payload: Dict[str, Any]
    children: List["JobPlanNode"] = field(default_factory=list)

    def flatten(self, parent_id: Optional[str] = None) -> Iterator[Dict[str, Any]]:
        """Yield flattened job payloads understood by :class:`JobSpec`."""

        spec = dict(self.payload)
        spec.setdefault("metadata", {})
        spec["metadata"] = dict(spec["metadata"])
        spec["metadata"].setdefault("job_id", self.job_id)
        if parent_id is not None:
            spec["parent_id"] = parent_id
        else:
            spec.setdefault("parent_id", None)
        yield spec
        for child in self.children:
            yield from child.flatten(self.job_id)


@dataclass(slots=True)
class Scenario:
    """Fully parsed scenario, ready to initialise the orchestrator."""

    config: OrchestratorConfig
    jobs: List[JobPlanNode]
    raw_payload: Dict[str, Any]

    @property
    def job_specs(self) -> List[Dict[str, Any]]:
        flattened: List[Dict[str, Any]] = []
        for node in self.jobs:
            flattened.extend(list(node.flatten()))
        return flattened


class ScenarioError(ValueError):
    """Raised when a configuration file is invalid."""


def load_config(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - configuration guard
        snippet = path.read_text(encoding="utf-8")[:200]
        raise ScenarioError(
            f"Failed to parse JSON configuration at {path}: {exc}\nSnippet: {snippet}"
        ) from exc
    if not isinstance(data, Mapping):  # pragma: no cover - configuration guard
        raise ScenarioError("Top level of configuration must be a JSON object")
    return dict(data)


def parse_scenario(payload: Mapping[str, Any], *, config_path: Path) -> Scenario:
    mission_name = str(payload.get("mission_name", "Kardashev-II Omega-Grade α-AGI Business 3"))
    owner_account = str(payload.get("owner_account", "operator"))
    resources_section = payload.get("resources", {})
    if not isinstance(resources_section, Mapping):
        raise ScenarioError("resources must be a JSON object")
    agents_section = payload.get("agents", {})
    if not isinstance(agents_section, Mapping):
        raise ScenarioError("agents must be a JSON object")
    orchestrator_section = payload.get("orchestrator", {})
    if not isinstance(orchestrator_section, Mapping):
        raise ScenarioError("orchestrator must be a JSON object")

    governance_section = orchestrator_section.get("governance", payload.get("governance", {}))
    governance = _build_governance(governance_section)

    base_tokens = float(resources_section.get("base_agent_tokens", 10_000.0))
    energy_capacity = float(resources_section.get("energy_capacity", 1_000_000.0))
    compute_capacity = float(resources_section.get("compute_capacity", 5_000_000.0))

    scenario_dir = config_path.parent

    config = OrchestratorConfig(
        mission_name=mission_name,
        checkpoint_path=_resolve_path(
            scenario_dir, orchestrator_section.get("checkpoint_path", "storage/checkpoint.json")
        ),
        checkpoint_interval_seconds=int(orchestrator_section.get("checkpoint_interval_seconds", 60)),
        resume_from_checkpoint=bool(orchestrator_section.get("resume_from_checkpoint", True)),
        enable_simulation=bool(orchestrator_section.get("enable_simulation", True)),
        simulation_tick_seconds=float(
            orchestrator_section.get("simulation", {}).get("tick_seconds", 1.0)
        ),
        simulation_hours_per_tick=float(
            orchestrator_section.get("simulation", {}).get("hours_per_tick", 1.0)
        ),
        simulation_energy_scale=float(
            orchestrator_section.get("simulation", {}).get("energy_scale", 2.0)
        ),
        simulation_compute_scale=float(
            orchestrator_section.get("simulation", {}).get("compute_scale", 1.0)
        ),
        operator_account=owner_account,
        base_agent_tokens=base_tokens,
        energy_capacity=energy_capacity,
        compute_capacity=compute_capacity,
        governance=governance,
        validator_names=_parse_validator_names(agents_section.get("validators")),
        worker_specs=_parse_worker_specs(agents_section.get("workers")),
        strategist_names=_parse_strategists(agents_section.get("strategists")),
        cycle_sleep_seconds=float(orchestrator_section.get("cycle_sleep_seconds", 0.2)),
        max_cycles=_parse_optional_int(orchestrator_section.get("max_cycles")),
        insight_interval_seconds=int(orchestrator_section.get("insight_interval_seconds", 30)),
        control_channel_file=_resolve_path(
            scenario_dir, orchestrator_section.get("control_channel_file", "storage/control-channel.jsonl")
        ),
        audit_log_path=_resolve_optional_path(scenario_dir, orchestrator_section.get("audit_log_path")),
        initial_jobs=[],
        status_output_path=_resolve_optional_path(
            scenario_dir, orchestrator_section.get("status_output_path", "storage/status.jsonl")
        ),
        energy_oracle_path=_resolve_optional_path(
            scenario_dir, orchestrator_section.get("energy_oracle_path", "storage/energy-oracle.jsonl")
        ),
        energy_oracle_interval_seconds=float(
            orchestrator_section.get("energy_oracle_interval_seconds", 120)
        ),
        heartbeat_interval_seconds=float(orchestrator_section.get("heartbeat_interval_seconds", 5)),
        heartbeat_timeout_seconds=float(orchestrator_section.get("heartbeat_timeout_seconds", 30)),
        health_check_interval_seconds=float(
            orchestrator_section.get("health_check_interval_seconds", 5)
        ),
        integrity_check_interval_seconds=float(
            orchestrator_section.get("integrity_check_interval_seconds", 30)
        ),
    )

    jobs_section = payload.get("jobs", [])
    if not isinstance(jobs_section, Sequence):
        raise ScenarioError("jobs must be an array of job specifications")
    job_nodes = [_parse_job_node(entry, employer=owner_account) for entry in jobs_section]

    config.initial_jobs = [spec for node in job_nodes for spec in node.flatten()]

    _validate_jobs(config.initial_jobs)

    return Scenario(config=config, jobs=job_nodes, raw_payload=dict(payload))


def _build_governance(payload: Any) -> GovernanceParameters:
    if not isinstance(payload, Mapping):
        payload = {}
    worker_stake_ratio = float(payload.get("worker_stake_ratio", 0.1))
    validator_stake = float(payload.get("validator_stake", 1_000.0))
    approvals_required = int(payload.get("approvals_required", 2))
    slash_ratio = float(payload.get("slash_ratio", 0.5))
    pause_enabled = bool(payload.get("pause_enabled", True))
    commit_window = float(payload.get("validator_commit_window_seconds", payload.get("validator_commit_window", 600)))
    reveal_window = float(payload.get("validator_reveal_window_seconds", payload.get("validator_reveal_window", 600)))
    return GovernanceParameters(
        worker_stake_ratio=max(0.0, worker_stake_ratio),
        validator_stake=max(0.0, validator_stake),
        approvals_required=max(1, approvals_required),
        slash_ratio=min(1.0, max(0.0, slash_ratio)),
        pause_enabled=pause_enabled,
        validator_commit_window=timedelta(seconds=max(1.0, commit_window)),
        validator_reveal_window=timedelta(seconds=max(1.0, reveal_window)),
    )


def _parse_validator_names(value: Any) -> List[str]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        names = [str(item) for item in value if str(item)]
        return names or ["validator-1", "validator-2", "validator-3"]
    return ["validator-1", "validator-2", "validator-3"]


def _parse_worker_specs(value: Any) -> Dict[str, float]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        result: Dict[str, float] = {}
        for entry in value:
            if isinstance(entry, Mapping):
                name = str(entry.get("name", "")).strip()
                if not name:
                    continue
                efficiency = float(entry.get("efficiency", 1.0))
                result[name] = max(0.1, efficiency)
            else:
                name = str(entry)
                if name:
                    result[name] = 1.0
        if result:
            return result
    return {"energy-architect": 1.5, "supply-chain": 1.2, "validator-ops": 1.0}


def _parse_strategists(value: Any) -> List[str]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        strategists = [str(item) for item in value if str(item)]
        return strategists or ["macro-strategist"]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return ["macro-strategist"]


def _parse_optional_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        numeric = int(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric > 0 else None


def _resolve_path(base: Path, value: Any) -> Path:
    path = Path(str(value))
    if not path.is_absolute():
        path = base / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_optional_path(base: Path, value: Any) -> Optional[Path]:
    if value in (None, "", False):
        return None
    path = Path(str(value))
    if not path.is_absolute():
        path = base / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _parse_job_node(payload: Any, *, employer: str) -> JobPlanNode:
    if not isinstance(payload, Mapping):
        raise ScenarioError("Each job must be an object")
    job_id = str(payload.get("job_id") or _slugify(payload.get("title", "job")))
    required_skills = _ensure_skills(payload.get("required_skills"))
    reward_tokens = float(payload.get("reward_tokens", 1_000.0))
    if not math.isfinite(reward_tokens) or reward_tokens <= 0:
        raise ScenarioError(f"Job {job_id} must have a positive reward")
    validation_window_hours = payload.get("validation_window_hours")
    validation_window_minutes = payload.get("validation_window_minutes")
    validation_window_seconds = payload.get("validation_window_seconds")
    validation_window = (
        {"validation_window_hours": float(validation_window_hours)}
        if validation_window_hours is not None
        else (
            {"validation_window_minutes": float(validation_window_minutes)}
            if validation_window_minutes is not None
            else {
                "validation_window_seconds": float(validation_window_seconds)
                if validation_window_seconds is not None
                else 3600.0
            }
        )
    )
    deadline_spec = {}
    for field in ("deadline_hours", "deadline_minutes", "deadline_seconds"):
        if field in payload:
            deadline_spec[field] = float(payload[field])
            break
    metadata = dict(payload.get("metadata", {}))
    metadata.setdefault("employer", employer)
    metadata.setdefault("impact_score", payload.get("impact_score", 1.0))
    metadata.setdefault("mission_phase", payload.get("mission_phase", "core"))
    metadata.setdefault("job_id", job_id)
    node_payload: Dict[str, Any] = {
        "job_id": job_id,
        "title": str(payload.get("title", job_id.replace("-", " ").title())),
        "description": str(
            payload.get(
                "description",
                textwrap.dedent(
                    f"""
                    Mission-critical task automatically generated for {job_id}.
                    """
                ).strip(),
            )
        ),
        "required_skills": required_skills,
        "reward_tokens": reward_tokens,
        "stake_required": float(payload.get("stake_required", reward_tokens * 0.1)),
        "energy_budget": float(payload.get("energy_budget", 10_000.0)),
        "compute_budget": float(payload.get("compute_budget", 50_000.0)),
        "metadata": metadata,
        **deadline_spec,
        **validation_window,
    }
    parent_id = payload.get("parent_id")
    if parent_id:
        node_payload["parent_id"] = str(parent_id)
    children_payload = payload.get("children", [])
    if isinstance(children_payload, Sequence) and not isinstance(children_payload, (str, bytes)):
        children = [_parse_job_node(child, employer=employer) for child in children_payload]
    else:
        children = []
    return JobPlanNode(job_id=job_id, payload=node_payload, children=children)


def _ensure_skills(value: Any) -> List[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        skills = [str(item).strip() for item in value if str(item).strip()]
        if skills:
            return skills
    return ["macro-strategy"]


def _validate_jobs(jobs: Iterable[Dict[str, Any]]) -> None:
    seen_ids = set()
    for spec in jobs:
        job_id = str(spec.get("metadata", {}).get("job_id", spec.get("title", "")))
        if job_id in seen_ids:
            raise ScenarioError(f"Duplicate job identifier detected: {job_id}")
        seen_ids.add(job_id)
        JobSpec.from_dict(spec)  # validation for required fields


def _slugify(value: Any) -> str:
    text = str(value or "job").strip().lower()
    slug = "".join(ch if ch.isalnum() else "-" for ch in text)
    while "--" in slug:
        slug = slug.replace("--", "-")
    slug = slug.strip("-")
    return slug or "job"
