"""Configuration loading utilities for the Tiny Recursive Model demo."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple

import yaml


@dataclass
class TrmSettings:
    model_type: str
    input_dim: int
    latent_dim: int
    answer_dim: int
    max_outer_steps: int
    max_inner_steps: int
    halt_threshold: float
    ema_decay: float
    dropout: float
    weight_init_scale: float
    device: str


@dataclass
class TrainingSettings:
    epochs: int
    batch_size: int
    learning_rate: float
    weight_decay: float
    gradient_clip_norm: float
    dataset_size: int
    validation_split: float
    patience: int
    checkpoint_path: str
    seed: int


@dataclass
class ThermostatSettings:
    target_roi: float
    min_inner_steps: int
    max_inner_steps: int
    min_outer_steps: int
    max_outer_steps: int
    halt_threshold_bounds: Tuple[float, float]
    adjustment_rate: float
    window: int


@dataclass
class SentinelSettings:
    min_roi: float
    max_daily_cost: float
    max_latency_ms: int
    max_recursions: int
    max_consecutive_failures: int


@dataclass
class LedgerSettings:
    default_success_value: float
    base_cost_per_call: float
    cost_per_inner_step: float
    cost_per_outer_step: float


@dataclass
class DemoSettings:
    trm: TrmSettings
    training: TrainingSettings
    thermostat: ThermostatSettings
    sentinel: SentinelSettings
    ledger: LedgerSettings


def _coerce_settings(raw: Dict[str, Any]) -> DemoSettings:
    halt_bounds = raw["thermostat"].get("halt_threshold_bounds", [0.5, 0.9])
    return DemoSettings(
        trm=TrmSettings(**raw["trm"]),
        training=TrainingSettings(**raw["training"]),
        thermostat=ThermostatSettings(
            halt_threshold_bounds=(float(halt_bounds[0]), float(halt_bounds[1])),
            **{k: v for k, v in raw["thermostat"].items() if k != "halt_threshold_bounds"},
        ),
        sentinel=SentinelSettings(**raw["sentinel"]),
        ledger=LedgerSettings(**raw["ledger"]),
    )


def load_settings(path: str | Path) -> DemoSettings:
    """Load demo configuration from YAML."""
    with Path(path).open("r", encoding="utf-8") as handle:
        raw: Dict[str, Any] = yaml.safe_load(handle)
    return _coerce_settings(raw)


__all__ = [
    "DemoSettings",
    "TrmSettings",
    "TrainingSettings",
    "ThermostatSettings",
    "SentinelSettings",
    "LedgerSettings",
    "load_settings",
]
