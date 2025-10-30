"""Configuration helpers for the Huxley–Gödel Machine demo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple

import yaml


@dataclass(slots=True)
class DemoConfig:
    """Typed configuration loaded from a YAML file."""

    seed: int
    total_iterations: int
    max_expansions: int
    max_evaluations: int
    tau: float
    alpha: float
    epsilon: float
    concurrency: int
    thermostat_interval: int
    roi_target: float
    roi_floor: float
    max_cost: float
    max_failures_per_agent: int
    expansion_cost: float
    evaluation_cost: float
    success_reward: float
    baseline_eagerness: float
    concurrency_bounds: Tuple[int, int]


class ConfigError(RuntimeError):
    """Raised when a configuration file is invalid."""


def _require(raw: Dict[str, Any], key: str) -> Any:
    if key not in raw:
        raise ConfigError(f"Missing required configuration key: {key}")
    return raw[key]


def load_config(path: str | Path) -> DemoConfig:
    """Load and validate the demo configuration file."""

    with open(path, "r", encoding="utf-8") as handle:
        raw: Dict[str, Any] = yaml.safe_load(handle)

    try:
        bounds = tuple(_require(raw, "concurrency_bounds"))
        config = DemoConfig(
            seed=int(raw.get("seed", 42)),
            total_iterations=int(_require(raw, "total_iterations")),
            max_expansions=int(_require(raw, "max_expansions")),
            max_evaluations=int(_require(raw, "max_evaluations")),
            tau=float(_require(raw, "tau")),
            alpha=float(_require(raw, "alpha")),
            epsilon=float(raw.get("epsilon", 0.05)),
            concurrency=int(raw.get("concurrency", 2)),
            thermostat_interval=int(raw.get("thermostat_interval", 5)),
            roi_target=float(raw.get("roi_target", 2.0)),
            roi_floor=float(raw.get("roi_floor", 1.0)),
            max_cost=float(raw.get("max_cost", 5000.0)),
            max_failures_per_agent=int(raw.get("max_failures_per_agent", 10)),
            expansion_cost=float(raw.get("expansion_cost", 50.0)),
            evaluation_cost=float(raw.get("evaluation_cost", 10.0)),
            success_reward=float(raw.get("success_reward", 100.0)),
            baseline_eagerness=float(raw.get("baseline_eagerness", 0.25)),
            concurrency_bounds=(int(bounds[0]), int(bounds[1])),
        )
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        raise ConfigError(f"Invalid configuration in {path}: {exc}") from exc

    if config.alpha <= 0:
        raise ConfigError("alpha must be strictly positive")
    if config.tau <= 0:
        raise ConfigError("tau must be strictly positive")
    if config.total_iterations <= 0:
        raise ConfigError("total_iterations must be greater than zero")
    if config.concurrency_bounds[0] <= 0 or config.concurrency_bounds[0] > config.concurrency_bounds[1]:
        raise ConfigError("concurrency_bounds must be positive and ordered")

    return config

