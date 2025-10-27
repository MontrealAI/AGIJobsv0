"""Configuration utilities for the Kardashev-II Omega-Grade Upgrade demo."""

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
    """Raised when a configuration file is invalid."""


class OmegaConfigPaths:
    """Centralised definition of filesystem artefacts for the demo."""

    control_channel: Path
    control_ack: Path
    status_stream: Path
    dashboard: Path
    metrics_history: Path
    supervisor_summary: Path

    def __init__(self, root: Path) -> None:
        self.control_channel = root / "control" / "command-stream.jsonl"
        self.control_ack = root / "control" / "acknowledged-commands.jsonl"
        self.status_stream = root / "status" / "mission-feed.jsonl"
        self.dashboard = root / "status" / "dashboard.json"
        self.metrics_history = root / "status" / "history.jsonl"
        self.supervisor_summary = root / "status" / "supervisor.json"
        for path in (
            self.control_channel,
            self.control_ack,
            self.status_stream,
            self.dashboard,
            self.metrics_history,
            self.supervisor_summary,
        ):
            path.parent.mkdir(parents=True, exist_ok=True)


class OmegaOrchestratorConfig(OrchestratorConfig):
    """Extended orchestrator configuration with upgrade-specific artefacts."""


_PATH_FIELDS = {
    "checkpoint_path",
    "control_channel_file",
    "audit_log_path",
    "status_output_path",
    "status_dashboard_path",
    "metrics_history_path",
    "owner_command_ack_path",
    "supervisor_summary_path",
}


def build_config(overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorConfig:
    """Create an :class:`OmegaOrchestratorConfig` from overrides."""

    config = OmegaOrchestratorConfig()
    defaults = {
        "checkpoint_path": Path("artifacts/state/checkpoint.json"),
        "audit_log_path": Path("artifacts/status/audit.jsonl"),
        "status_output_path": Path("artifacts/status/mission-feed.jsonl"),
        "status_dashboard_path": Path("artifacts/status/dashboard.json"),
        "metrics_history_path": Path("artifacts/status/history.jsonl"),
        "owner_command_ack_path": Path("artifacts/control/acknowledged-commands.jsonl"),
        "supervisor_summary_path": Path("artifacts/status/supervisor.json"),
        "control_channel_file": Path("artifacts/control/command-stream.jsonl"),
        "supervisor_interval_seconds": 15.0,
        "owner_poll_interval_seconds": 3.0,
        "mission_target_hours": 24.0,
    }
    for key, value in defaults.items():
        if not overrides or key not in overrides:
            setattr(config, key, value)
    if overrides:
        for field_info in fields(OmegaOrchestratorConfig):
            name = field_info.name
            if name not in overrides:
                continue
            value = overrides[name]
            if name in _PATH_FIELDS and value is not None:
                value = Path(value)
            if name == "governance" and not isinstance(value, GovernanceParameters):
                if not isinstance(value, dict):
                    raise ConfigError("governance configuration must be a mapping")
                value = GovernanceParameters(**value)
            setattr(config, name, value)
        for key, value in overrides.items():
            if key not in defaults and key not in {field_info.name for field_info in fields(OmegaOrchestratorConfig)}:
                setattr(config, key, value)
    return config


def load_config_payload(path: Path) -> Dict[str, Any]:
    """Load raw configuration payload from JSON or YAML."""

    if not path.exists():
        raise ConfigError(f"Configuration file not found: {path}")
    text = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    data: Any
    if suffix in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ConfigError("PyYAML is required to parse YAML configuration files") from exc
        data = yaml.safe_load(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict):
        raise ConfigError("Configuration payload must be a mapping")
    return data


def load_config(path: Path, overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorConfig:
    """Load configuration from *path* and apply CLI overrides."""

    payload = load_config_payload(path)
    if overrides:
        payload = {**payload, **overrides}
    return build_config(payload)
