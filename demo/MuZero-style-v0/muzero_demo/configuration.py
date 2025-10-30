"""Configuration loader for the MuZero-style demo."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Optional

import yaml

from .environment import EnvironmentConfig, vector_size
from .mcts import PlannerSettings
from .network import NetworkConfig

if TYPE_CHECKING:  # pragma: no cover
    from .training import TrainingConfig


@dataclass
class ThermostatConfig:
    """Controls the ROI-aware planning thermostat."""

    min_simulations: int = 24
    max_simulations: int = 160
    low_entropy: float = 0.55
    high_entropy: float = 1.35
    budget_pressure_ratio: float = 0.35
    endgame_horizon_ratio: float = 0.8


@dataclass
class SentinelConfig:
    """Safety sentinels guarding value alignment and budgets."""

    window: int = 64
    alert_mae: float = 25.0
    fallback_mae: float = 45.0
    min_episodes: int = 6
    budget_floor: float = 5.0


@dataclass
class DemoConfig:
    """Container bundling every subsystem configuration."""

    environment: EnvironmentConfig
    network: NetworkConfig
    planner: PlannerSettings
    training: TrainingConfig
    thermostat: ThermostatConfig
    sentinel: SentinelConfig


def load_demo_config(path: Optional[Path]) -> DemoConfig:
    """Load configuration from ``path`` and materialise dataclasses."""

    from .training import TrainingConfig

    if path is None:
        data: Dict[str, Any] = {}
    else:
        with Path(path).expanduser().open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}

    env_cfg = EnvironmentConfig(**data.get("environment", {}))
    observation_dim = vector_size(env_cfg)
    action_space = env_cfg.max_jobs + 1

    network_cfg = NetworkConfig(
        observation_dim=observation_dim,
        action_space_size=action_space,
        **data.get("network", {}),
    )

    planner_cfg = PlannerSettings(**data.get("planner", {}))

    training_overrides = data.get("training", {})
    training_cfg = TrainingConfig(
        environment=env_cfg,
        network=network_cfg,
        planner=planner_cfg,
        **{k: v for k, v in training_overrides.items() if k not in {"environment", "network", "planner"}},
    )

    thermostat_cfg = ThermostatConfig(**data.get("thermostat", {}))
    sentinel_cfg = SentinelConfig(**data.get("sentinel", {}))

    return DemoConfig(
        environment=env_cfg,
        network=network_cfg,
        planner=planner_cfg,
        training=training_cfg,
        thermostat=thermostat_cfg,
        sentinel=sentinel_cfg,
    )


__all__ = ["DemoConfig", "SentinelConfig", "ThermostatConfig", "load_demo_config"]
