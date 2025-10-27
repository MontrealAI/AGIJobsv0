"""Configuration model for the supreme Kardashev-II Omega demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


@dataclass(slots=True)
class SupremeDemoConfig:
    """Runtime configuration for the Omega-grade demo."""

    cycles: int = 0
    checkpoint_path: Path = Path("./omega_state.json")
    log_path: Path = Path("./omega_logs.jsonl")
    structured_log_level: str = "INFO"
    bus_history_path: Path = Path("./omega_bus_history.jsonl")
    owner_control_path: Path = Path("./omega_owner_commands.json")
    owner_ack_path: Path = Path("./omega_owner_ack.json")
    snapshot_interval_seconds: int = 60
    checkpoint_interval_seconds: int = 300
    validators: int = 3
    validator_commit_delay_seconds: int = 30
    validator_reveal_delay_seconds: int = 30
    mission_hours: float = 24.0
    simulation_tick_seconds: int = 15
    default_reward: int = 100
    default_stake_ratio: float = 0.1
    energy_reserve: float = 1_000_000.0
    compute_reserve: float = 5_000_000.0
    token_supply: int = 1_000_000
    enable_simulation: bool = True
    simulation_plugins: List[str] = field(default_factory=list)
    paused: bool = False
    emergency_stop: bool = False
    governance_admins: List[str] = field(default_factory=lambda: ["owner"])
    resume_from_checkpoint: bool = True
    long_run_health_window_seconds: int = 600
    name: str = "Kardashev-II Omega-Grade Upgrade for α-AGI Business 3"
    description: str = (
        "An Omega-grade orchestrator simulating recursive agent economies with "
        "planetary-scale resources, validators, and long-run governance controls."
    )
    governance_topics: List[str] = field(
        default_factory=lambda: ["stakes", "validators", "economy", "safety"]
    )
    structured_metrics_path: Path = Path("./omega_metrics.jsonl")
    mermaid_dashboard_path: Path = Path("./omega_dashboard.mmd")
    job_history_path: Path = Path("./omega_job_history.jsonl")

    def ensure_directories(self) -> None:
        """Create parent directories for all configured paths."""

        for path in [
            self.checkpoint_path,
            self.log_path,
            self.bus_history_path,
            self.owner_control_path,
            self.owner_ack_path,
            self.structured_metrics_path,
            self.mermaid_dashboard_path,
            self.job_history_path,
        ]:
            path = Path(path)
            if path.parent and not path.parent.exists():
                path.parent.mkdir(parents=True, exist_ok=True)


def update_config_from_args(config: SupremeDemoConfig, args: Optional[object]) -> SupremeDemoConfig:
    """Update configuration from CLI arguments."""

    if args is None:
        return config

    for field_name in config.__dataclass_fields__:
        if hasattr(args, field_name) and getattr(args, field_name) is not None:
            setattr(config, field_name, getattr(args, field_name))
    return config
