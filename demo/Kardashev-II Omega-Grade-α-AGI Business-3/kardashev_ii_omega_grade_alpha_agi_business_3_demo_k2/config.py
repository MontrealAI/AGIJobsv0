"""Mission configuration helpers for the K2 Omega-grade demo."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.governance import GovernanceParameters
from kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import Orchestrator, OrchestratorConfig


def _resolve_path(value: Optional[str | Path], base_dir: Path) -> Optional[Path]:
    if value is None:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    return path


def _parse_timedelta(payload: Mapping[str, Any], *, seconds_key: str, fallback: float) -> timedelta:
    value = payload.get(seconds_key)
    if value is None:
        return timedelta(seconds=fallback)
    return timedelta(seconds=float(value))


@dataclass(slots=True)
class AutopilotProfile:
    """Declarative definition of how the orchestrator should operate autonomously."""

    enabled: bool = True
    checkpoint_interval_seconds: int = 60
    mission_hours: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "checkpoint_interval_seconds": self.checkpoint_interval_seconds,
            "mission_hours": self.mission_hours,
        }


@dataclass(slots=True)
class MissionPlan:
    """High-level plan describing how a non-technical operator runs the K2 demo."""

    name: str
    summary: str
    narrative: str
    orchestrator_config: OrchestratorConfig
    control_channel: Path
    status_output: Path
    autopilot: AutopilotProfile = field(default_factory=AutopilotProfile)
    documentation_links: List[str] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path) -> "MissionPlan":
        if not path.exists():
            raise FileNotFoundError(path)
        data = json.loads(path.read_text(encoding="utf-8"))
        base_dir = path.parent
        orchestration_payload = dict(data.get("orchestrator", {}))
        for key in (
            "checkpoint_path",
            "control_channel_file",
            "audit_log_path",
            "status_output_path",
            "energy_oracle_path",
        ):
            if key in orchestration_payload and orchestration_payload[key] is not None:
                orchestration_payload[key] = _resolve_path(orchestration_payload[key], base_dir)
        governance_payload = orchestration_payload.get("governance") or {}
        if governance_payload:
            governance = GovernanceParameters(
                worker_stake_ratio=float(governance_payload.get("worker_stake_ratio", 0.15)),
                validator_stake=float(governance_payload.get("validator_stake", 100.0)),
                validator_commit_window=_parse_timedelta(
                    governance_payload,
                    seconds_key="validator_commit_window_seconds",
                    fallback=300.0,
                ),
                validator_reveal_window=_parse_timedelta(
                    governance_payload,
                    seconds_key="validator_reveal_window_seconds",
                    fallback=300.0,
                ),
                approvals_required=int(governance_payload.get("approvals_required", 2)),
                pause_enabled=bool(governance_payload.get("pause_enabled", True)),
                slash_ratio=float(governance_payload.get("slash_ratio", 0.5)),
            )
            orchestration_payload["governance"] = governance
        orchestrator_config = OrchestratorConfig(**orchestration_payload)
        autopilot_data = data.get("autopilot", {})
        autopilot = AutopilotProfile(
            enabled=bool(autopilot_data.get("enabled", True)),
            checkpoint_interval_seconds=int(autopilot_data.get("checkpoint_interval_seconds", 60)),
            mission_hours=autopilot_data.get("mission_hours"),
        )
        control_channel = _resolve_path(data.get("control_channel"), base_dir) or base_dir / "control-channel.jsonl"
        status_output = _resolve_path(data.get("status_output"), base_dir) or base_dir / "status.jsonl"
        plan = cls(
            name=str(data.get("name", "Kardashev-II Omega-Grade Upgrade")),
            summary=str(data.get("summary", "")),
            narrative=str(data.get("narrative", "")),
            orchestrator_config=orchestrator_config,
            control_channel=control_channel,
            status_output=status_output,
            autopilot=autopilot,
            documentation_links=[str(item) for item in data.get("documentation", [])],
        )
        return plan

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "name": self.name,
            "summary": self.summary,
            "narrative": self.narrative,
            "control_channel": str(self.control_channel),
            "status_output": str(self.status_output),
            "autopilot": self.autopilot.to_dict(),
            "documentation": list(self.documentation_links),
        }
        orchestrator_data = self._config_to_dict(self.orchestrator_config)
        payload["orchestrator"] = orchestrator_data
        return payload

    def build_orchestrator_config(
        self,
        *,
        mission_name: Optional[str] = None,
        checkpoint_dir: Optional[Path] = None,
        overrides: Optional[Mapping[str, Any]] = None,
    ) -> OrchestratorConfig:
        config = self.orchestrator_config
        if checkpoint_dir is not None:
            checkpoint_dir.mkdir(parents=True, exist_ok=True)
            config = replace(
                config,
                checkpoint_path=(checkpoint_dir / config.checkpoint_path.name)
                if config.checkpoint_path is not None
                else checkpoint_dir / "checkpoint.json",
                control_channel_file=checkpoint_dir / self.control_channel.name,
                status_output_path=checkpoint_dir / self.status_output.name,
            )
        if mission_name is not None:
            config = replace(config, mission_name=mission_name)
        merged: MutableMapping[str, Any] = {}
        if overrides:
            merged.update(overrides)
        if merged:
            config = replace(config, **merged)
        return config

    def create_orchestrator(
        self,
        *,
        mission_name: Optional[str] = None,
        checkpoint_dir: Optional[Path] = None,
        overrides: Optional[Mapping[str, Any]] = None,
    ) -> Orchestrator:
        config = self.build_orchestrator_config(
            mission_name=mission_name or self.name,
            checkpoint_dir=checkpoint_dir,
            overrides=overrides,
        )
        return Orchestrator(config)

    def mermaid_blueprint(self, *, jobs: Optional[Iterable[Mapping[str, Any]]] = None) -> str:
        nodes: List[str] = []
        edges: List[str] = []
        base_jobs = list(jobs or self.orchestrator_config.initial_jobs)
        for entry in base_jobs:
            spec = dict(entry)
            job_id = spec.get("job_id") or spec.get("title") or spec.get("id")
            if not job_id:
                continue
            node_id = str(job_id).replace(" ", "_")
            label = spec.get("title") or spec.get("description") or str(job_id)
            nodes.append(f"    {node_id}[{label}]")
            parent = spec.get("parent_id")
            if parent:
                parent_id = str(parent).replace(" ", "_")
                edges.append(f"    {parent_id} --> {node_id}")
        return "\n".join(["graph TD"] + nodes + edges)

    @staticmethod
    def _config_to_dict(config: OrchestratorConfig) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "mission_name": config.mission_name,
            "checkpoint_path": str(config.checkpoint_path),
            "checkpoint_interval_seconds": config.checkpoint_interval_seconds,
            "resume_from_checkpoint": config.resume_from_checkpoint,
            "enable_simulation": config.enable_simulation,
            "simulation_tick_seconds": config.simulation_tick_seconds,
            "simulation_hours_per_tick": config.simulation_hours_per_tick,
            "simulation_energy_scale": config.simulation_energy_scale,
            "simulation_compute_scale": config.simulation_compute_scale,
            "operator_account": config.operator_account,
            "base_agent_tokens": config.base_agent_tokens,
            "energy_capacity": config.energy_capacity,
            "compute_capacity": config.compute_capacity,
            "validator_names": list(config.validator_names),
            "worker_specs": dict(config.worker_specs),
            "strategist_names": list(config.strategist_names),
            "cycle_sleep_seconds": config.cycle_sleep_seconds,
            "max_cycles": config.max_cycles,
            "insight_interval_seconds": config.insight_interval_seconds,
            "control_channel_file": str(config.control_channel_file),
            "status_output_path": str(config.status_output_path) if config.status_output_path else None,
            "audit_log_path": str(config.audit_log_path) if config.audit_log_path else None,
            "initial_jobs": list(config.initial_jobs),
            "energy_oracle_path": str(config.energy_oracle_path) if config.energy_oracle_path else None,
            "energy_oracle_interval_seconds": config.energy_oracle_interval_seconds,
            "heartbeat_interval_seconds": config.heartbeat_interval_seconds,
            "heartbeat_timeout_seconds": config.heartbeat_timeout_seconds,
            "health_check_interval_seconds": config.health_check_interval_seconds,
            "integrity_check_interval_seconds": config.integrity_check_interval_seconds,
        }
        governance = config.governance
        payload["governance"] = {
            "worker_stake_ratio": governance.worker_stake_ratio,
            "validator_stake": governance.validator_stake,
            "validator_commit_window_seconds": governance.validator_commit_window.total_seconds(),
            "validator_reveal_window_seconds": governance.validator_reveal_window.total_seconds(),
            "approvals_required": governance.approvals_required,
            "pause_enabled": governance.pause_enabled,
            "slash_ratio": governance.slash_ratio,
        }
        return payload


__all__ = ["MissionPlan", "AutopilotProfile"]
