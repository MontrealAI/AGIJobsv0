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


class UpgradeV5Paths:
    """Filesystem artefact layout for the Kardashev-II Ω Upgrade v5 demo."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.control_channel = root / "control" / "command-stream.jsonl"
        self.control_ack = root / "control" / "acknowledged-commands.jsonl"
        self.status_stream = root / "status" / "mission-feed.jsonl"
        self.dashboard = root / "status" / "dashboard.json"
        self.metrics_history = root / "status" / "history.jsonl"
        self.energy_oracle = root / "status" / "energy-oracle.jsonl"
        self.supervisor_summary = root / "status" / "supervisor.json"
        self.telemetry = root / "status" / "omega-upgrade-v5" / "telemetry.json"
        self.telemetry_ui = root / "status" / "omega-upgrade-v5" / "telemetry-ui.json"
        self.mermaid = root / "status" / "omega-upgrade-v5" / "job-graph.mmd"
        self.long_run_ledger = root / "status" / "omega-upgrade-v5" / "long-run-ledger.jsonl"
        self.guardian_plan = root / "status" / "omega-upgrade-v5" / "autonomy-plan.json"
        self.guardian_history = root / "status" / "omega-upgrade-v5" / "autonomy-history.jsonl"
        self.autonomy_checkpoint = root / "status" / "omega-upgrade-v5" / "autonomy-checkpoint.json"
        self.storyboard = root / "status" / "omega-upgrade-v5" / "storyboard.json"
        self.storyboard_history = root / "status" / "omega-upgrade-v5" / "storyboard-history.jsonl"
        self.insight_journal = root / "status" / "omega-upgrade-v5" / "insights.jsonl"
        self.mission_manifest = root / "status" / "omega-upgrade-v5" / "mission-manifest.json"
        self.state_history = root / "status" / "omega-upgrade-v5" / "state-history.jsonl"
        self.state_checkpoint = root / "status" / "omega-upgrade-v5" / "state-checkpoint.json"
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
            self.storyboard,
            self.storyboard_history,
            self.insight_journal,
            self.mission_manifest,
            self.state_history,
            self.state_checkpoint,
        ):
            path.parent.mkdir(parents=True, exist_ok=True)


class OmegaOrchestratorV5Config(OrchestratorConfig):
    """Configuration envelope extended with v5 upgrade artefacts."""


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
    "storyboard_path",
    "storyboard_history_path",
    "insight_journal_path",
    "mission_manifest_path",
    "state_history_path",
    "state_checkpoint_path",
}


def build_config(overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV5Config:
    """Build an :class:`OmegaOrchestratorV5Config` from overrides."""

    config = OmegaOrchestratorV5Config()
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
        "telemetry_output_path": Path("artifacts/status/omega-upgrade-v5/telemetry.json"),
        "telemetry_ui_payload_path": Path("artifacts/status/omega-upgrade-v5/telemetry-ui.json"),
        "mermaid_output_path": Path("artifacts/status/omega-upgrade-v5/job-graph.mmd"),
        "long_run_ledger_path": Path("artifacts/status/omega-upgrade-v5/long-run-ledger.jsonl"),
        "guardian_plan_path": Path("artifacts/status/omega-upgrade-v5/autonomy-plan.json"),
        "guardian_history_path": Path("artifacts/status/omega-upgrade-v5/autonomy-history.jsonl"),
        "autonomy_checkpoint_path": Path("artifacts/status/omega-upgrade-v5/autonomy-checkpoint.json"),
        "storyboard_path": Path("artifacts/status/omega-upgrade-v5/storyboard.json"),
        "storyboard_history_path": Path("artifacts/status/omega-upgrade-v5/storyboard-history.jsonl"),
        "insight_journal_path": Path("artifacts/status/omega-upgrade-v5/insights.jsonl"),
        "mission_manifest_path": Path("artifacts/status/omega-upgrade-v5/mission-manifest.json"),
        "state_history_path": Path("artifacts/status/omega-upgrade-v5/state-history.jsonl"),
        "state_checkpoint_path": Path("artifacts/status/omega-upgrade-v5/state-checkpoint.json"),
        "storyboard_history_lines": 2048,
        "insight_history_lines": 4096,
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
        "checkpoint_interval_seconds": 120.0,
        "state_history_lines": 4096,
        "background_task_limit": 64,
        "delegation_max_depth": 8,
        "delegation_retry_seconds": 90.0,
        "validator_vote_timeout_seconds": 600.0,
        "simulation_tick_seconds": 45.0,
        "simulation_hours_per_tick": 4.0,
    }
    for key, value in defaults.items():
        if not overrides or key not in overrides:
            setattr(config, key, value)

    if overrides:
        dataclass_fields = {field_info.name for field_info in fields(OmegaOrchestratorV5Config)}
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
                "storyboard_history_lines",
                "insight_history_lines",
            }:
                if name in {
                    "resilience_retention_lines",
                    "mermaid_max_nodes",
                    "guardian_history_lines",
                    "storyboard_history_lines",
                    "insight_history_lines",
                }:
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


def load_config(path: Path, overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorV5Config:
    """Load configuration from *path* and apply CLI overrides."""

    payload = load_config_payload(path)
    data = dict(payload)
    cli_overrides = dict(overrides or {})
    if "paths" in data:
        root = Path(data.pop("paths"))
        artefacts = UpgradeV5Paths(root)
        cli_overrides.setdefault("control_channel_file", artefacts.control_channel)
        cli_overrides.setdefault("owner_command_ack_path", artefacts.control_ack)
        cli_overrides.setdefault("status_output_path", artefacts.status_stream)
        cli_overrides.setdefault("status_dashboard_path", artefacts.dashboard)
        cli_overrides.setdefault("metrics_history_path", artefacts.metrics_history)
        cli_overrides.setdefault("energy_oracle_path", artefacts.energy_oracle)
        cli_overrides.setdefault("supervisor_summary_path", artefacts.supervisor_summary)
        cli_overrides.setdefault("telemetry_output_path", artefacts.telemetry)
        cli_overrides.setdefault("telemetry_ui_payload_path", artefacts.telemetry_ui)
        cli_overrides.setdefault("mermaid_output_path", artefacts.mermaid)
        cli_overrides.setdefault("long_run_ledger_path", artefacts.long_run_ledger)
        cli_overrides.setdefault("guardian_plan_path", artefacts.guardian_plan)
        cli_overrides.setdefault("guardian_history_path", artefacts.guardian_history)
        cli_overrides.setdefault("autonomy_checkpoint_path", artefacts.autonomy_checkpoint)
        cli_overrides.setdefault("storyboard_path", artefacts.storyboard)
        cli_overrides.setdefault("storyboard_history_path", artefacts.storyboard_history)
        cli_overrides.setdefault("insight_journal_path", artefacts.insight_journal)
        cli_overrides.setdefault("mission_manifest_path", artefacts.mission_manifest)
        cli_overrides.setdefault("state_history_path", artefacts.state_history)
        cli_overrides.setdefault("state_checkpoint_path", artefacts.state_checkpoint)
    data.update(cli_overrides)
    return build_config(data)


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
    "UpgradeV5Paths",
    "OmegaOrchestratorV5Config",
    "build_config",
    "load_config",
    "load_config_payload",
]
