from __future__ import annotations

import json
from dataclasses import fields
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.governance import (
    GovernanceParameters,
)
from kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    OrchestratorConfig,
)


class ConfigError(RuntimeError):
    """Raised when configuration payloads are invalid."""


class UpgradeV3Paths:
    """Filesystem artefact layout for the upgraded demo."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.control_channel = root / "control" / "command-stream.jsonl"
        self.control_ack = root / "control" / "acknowledged-commands.jsonl"
        self.status_stream = root / "status" / "mission-feed.jsonl"
        self.dashboard = root / "status" / "dashboard.json"
        self.metrics_history = root / "status" / "history.jsonl"
        self.energy_oracle = root / "status" / "energy-oracle.jsonl"
        self.supervisor_summary = root / "status" / "supervisor.json"
        self.telemetry = root / "status" / "omega-upgrade-v3" / "telemetry.json"
        self.telemetry_ui = root / "status" / "omega-upgrade-v3" / "telemetry-ui.json"
        self.mermaid = root / "status" / "omega-upgrade-v3" / "job-graph.mmd"
        self.long_run_ledger = root / "status" / "omega-upgrade-v3" / "long-run-ledger.jsonl"
        self.guardian_plan = root / "status" / "omega-upgrade-v3" / "autonomy-plan.json"
        self.guardian_history = root / "status" / "omega-upgrade-v3" / "autonomy-history.jsonl"
        self.autonomy_checkpoint = root / "status" / "omega-upgrade-v3" / "autonomy-checkpoint.json"
        for path in (
            self.control_channel,
            self.control_ack,
            self.status_stream,
            self.dashboard,
            self.metrics_history,
            self.energy_oracle,
            self.supervisor_summary,
            self.telemetry,
            self.telemetry_ui,
            self.mermaid,
            self.long_run_ledger,
            self.guardian_plan,
            self.guardian_history,
            self.autonomy_checkpoint,
        ):
            path.parent.mkdir(parents=True, exist_ok=True)


class OmegaOrchestratorV3Config(OrchestratorConfig):
    """Configuration envelope extended with v3 upgrade artefacts."""


_PATH_FIELDS = {
    "checkpoint_path",
    "control_channel_file",
    "audit_log_path",
    "status_output_path",
    "status_dashboard_path",
    "metrics_history_path",
    "owner_command_ack_path",
    "supervisor_summary_path",
    "energy_oracle_path",
    "telemetry_output_path",
    "telemetry_ui_payload_path",
    "mermaid_output_path",
    "long_run_ledger_path",
    "guardian_plan_path",
    "guardian_history_path",
    "autonomy_checkpoint_path",
}


def build_config(overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV3Config:
    """Build an :class:`OmegaOrchestratorV3Config` from overrides."""

    config = OmegaOrchestratorV3Config()
    defaults: Dict[str, Any] = {
        "checkpoint_path": Path("artifacts/state/checkpoint.json"),
        "audit_log_path": Path("artifacts/status/audit.jsonl"),
        "status_output_path": Path("artifacts/status/mission-feed.jsonl"),
        "status_dashboard_path": Path("artifacts/status/dashboard.json"),
        "metrics_history_path": Path("artifacts/status/history.jsonl"),
        "energy_oracle_path": Path("artifacts/status/energy-oracle.jsonl"),
        "owner_command_ack_path": Path("artifacts/control/acknowledged-commands.jsonl"),
        "supervisor_summary_path": Path("artifacts/status/supervisor.json"),
        "control_channel_file": Path("artifacts/control/command-stream.jsonl"),
        "telemetry_output_path": Path("artifacts/status/omega-upgrade-v3/telemetry.json"),
        "telemetry_ui_payload_path": Path("artifacts/status/omega-upgrade-v3/telemetry-ui.json"),
        "mermaid_output_path": Path("artifacts/status/omega-upgrade-v3/job-graph.mmd"),
        "long_run_ledger_path": Path("artifacts/status/omega-upgrade-v3/long-run-ledger.jsonl"),
        "guardian_plan_path": Path("artifacts/status/omega-upgrade-v3/autonomy-plan.json"),
        "guardian_history_path": Path("artifacts/status/omega-upgrade-v3/autonomy-history.jsonl"),
        "autonomy_checkpoint_path": Path("artifacts/status/omega-upgrade-v3/autonomy-checkpoint.json"),
        "supervisor_interval_seconds": 12.0,
        "owner_poll_interval_seconds": 3.0,
        "mission_target_hours": 48.0,
        "energy_oracle_interval_seconds": 45.0,
        "telemetry_interval_seconds": 15.0,
        "resilience_interval_seconds": 20.0,
        "resilience_retention_lines": 2048,
        "mermaid_max_nodes": 72,
        "forecast_horizon_hours": 24.0,
        "guardian_interval_seconds": 12.0,
        "guardian_deadline_threshold_minutes": 60.0,
        "guardian_history_lines": 4096,
        "resource_feedback_interval_seconds": 25.0,
        "resource_target_utilization": 0.75,
        "resource_price_floor": 0.25,
        "resource_price_ceiling": 12.0,
        "autonomy_price_smoothing": 0.35,
    }
    for key, value in defaults.items():
        if not overrides or key not in overrides:
            setattr(config, key, value)

    if overrides:
        dataclass_fields = {field_info.name for field_info in fields(OmegaOrchestratorV3Config)}
        for name, value in overrides.items():
            target_value = value
            if name in _PATH_FIELDS and value is not None:
                target_value = Path(value)
            elif name == "governance" and not isinstance(value, GovernanceParameters):
                if not isinstance(value, dict):
                    raise ConfigError("governance configuration must be a mapping")
                target_value = _coerce_governance(value)
            elif name in {
                "telemetry_interval_seconds",
                "resilience_interval_seconds",
                "mission_target_hours",
                "resilience_retention_lines",
                "mermaid_max_nodes",
                "forecast_horizon_hours",
                "guardian_interval_seconds",
                "guardian_deadline_threshold_minutes",
                "guardian_history_lines",
                "resource_feedback_interval_seconds",
                "resource_target_utilization",
                "resource_price_floor",
                "resource_price_ceiling",
                "autonomy_price_smoothing",
            }:
                if name in {"resilience_retention_lines", "mermaid_max_nodes", "guardian_history_lines"}:
                    target_value = int(value)
                else:
                    target_value = float(value)
            if name in dataclass_fields or hasattr(config, name) or name in defaults:
                setattr(config, name, target_value)
            else:
                setattr(config, name, target_value)
    return config


def load_config_payload(path: Path) -> Dict[str, Any]:
    """Load raw configuration payload from JSON or YAML."""

    if not path.exists():
        raise ConfigError(f"Configuration file not found: {path}")
    text = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    if suffix in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ConfigError("PyYAML is required to parse YAML configuration files") from exc
        data: Any = yaml.safe_load(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict):
        raise ConfigError("Configuration payload must be a mapping")
    return data


def load_config(path: Path, overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV3Config:
    """Load configuration from *path* and apply CLI overrides."""

    payload = load_config_payload(path)
    if overrides:
        payload = {**payload, **overrides}
    return build_config(payload)


def _coerce_governance(payload: Dict[str, Any]) -> GovernanceParameters:
    data = dict(payload)
    for field in ("validator_commit_window", "validator_reveal_window"):
        value = data.get(field)
        if value is None:
            continue
        if isinstance(value, timedelta):
            continue
        data[field] = timedelta(seconds=float(value))
    return GovernanceParameters(**data)


__all__ = [
    "ConfigError",
    "UpgradeV3Paths",
    "OmegaOrchestratorV3Config",
    "build_config",
    "load_config",
    "load_config_payload",
]
