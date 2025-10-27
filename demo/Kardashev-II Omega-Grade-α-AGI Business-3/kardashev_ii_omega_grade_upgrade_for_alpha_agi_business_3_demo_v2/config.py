"""Configuration helpers for the Omega-Grade Upgrade v2 demo."""

from __future__ import annotations

import json
from dataclasses import fields
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


class UpgradeV2Paths:
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
        self.telemetry = root / "status" / "omega-upgrade-v2" / "telemetry.json"
        self.telemetry_ui = root / "status" / "omega-upgrade-v2" / "telemetry-ui.json"
        self.mermaid = root / "status" / "omega-upgrade-v2" / "job-graph.mmd"
        self.long_run_ledger = root / "status" / "omega-upgrade-v2" / "long-run-ledger.jsonl"
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
        ):
            path.parent.mkdir(parents=True, exist_ok=True)


class OmegaOrchestratorV2Config(OrchestratorConfig):
    """Configuration envelope extended with v2 upgrade artefacts."""


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
}


def build_config(overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV2Config:
    """Build an :class:`OmegaOrchestratorV2Config` from overrides."""

    config = OmegaOrchestratorV2Config()
    defaults = {
        "checkpoint_path": Path("artifacts/state/checkpoint.json"),
        "audit_log_path": Path("artifacts/status/audit.jsonl"),
        "status_output_path": Path("artifacts/status/mission-feed.jsonl"),
        "status_dashboard_path": Path("artifacts/status/dashboard.json"),
        "metrics_history_path": Path("artifacts/status/history.jsonl"),
        "energy_oracle_path": Path("artifacts/status/energy-oracle.jsonl"),
        "owner_command_ack_path": Path("artifacts/control/acknowledged-commands.jsonl"),
        "supervisor_summary_path": Path("artifacts/status/supervisor.json"),
        "control_channel_file": Path("artifacts/control/command-stream.jsonl"),
        "telemetry_output_path": Path("artifacts/status/omega-upgrade-v2/telemetry.json"),
        "telemetry_ui_payload_path": Path("artifacts/status/omega-upgrade-v2/telemetry-ui.json"),
        "mermaid_output_path": Path("artifacts/status/omega-upgrade-v2/job-graph.mmd"),
        "long_run_ledger_path": Path("artifacts/status/omega-upgrade-v2/long-run-ledger.jsonl"),
        "supervisor_interval_seconds": 15.0,
        "owner_poll_interval_seconds": 3.0,
        "mission_target_hours": 36.0,
        "energy_oracle_interval_seconds": 60.0,
        "telemetry_interval_seconds": 20.0,
        "resilience_interval_seconds": 30.0,
        "resilience_retention_lines": 1024,
        "mermaid_max_nodes": 48,
        "forecast_horizon_hours": 18.0,
    }
    for key, value in defaults.items():
        if not overrides or key not in overrides:
            setattr(config, key, value)

    if overrides:
        dataclass_fields = {field_info.name for field_info in fields(OmegaOrchestratorV2Config)}
        for name, value in overrides.items():
            target_value = value
            if name in _PATH_FIELDS and value is not None:
                target_value = Path(value)
            elif name == "governance" and not isinstance(value, GovernanceParameters):
                if not isinstance(value, dict):
                    raise ConfigError("governance configuration must be a mapping")
                target_value = GovernanceParameters(**value)
            elif name in {
                "telemetry_interval_seconds",
                "resilience_interval_seconds",
                "mission_target_hours",
                "resilience_retention_lines",
                "mermaid_max_nodes",
                "forecast_horizon_hours",
            }:
                target_value = float(value) if name != "resilience_retention_lines" and name != "mermaid_max_nodes" else int(value)
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


def load_config(path: Path, overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV2Config:
    """Load configuration from *path* and apply CLI overrides."""

    payload = load_config_payload(path)
    if overrides:
        payload = {**payload, **overrides}
    return build_config(payload)
