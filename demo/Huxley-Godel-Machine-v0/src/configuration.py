"""Configuration loading utilities for the Huxley–Gödel Machine demo."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

try:  # pragma: no cover - optional dependency for YAML support
    import yaml  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - PyYAML not installed in minimal envs
    yaml = None


@dataclass(slots=True)
class BudgetConfig:
    max_iterations: int
    max_cost: float


@dataclass(slots=True)
class InitialAgentConfig:
    label: str
    base_quality: float
    description: str


@dataclass(slots=True)
class HGMConfig:
    tau: float
    alpha: float
    epsilon: float
    max_concurrency: int
    min_concurrency: int
    warmup_iterations: int
    allow_expansions: bool


@dataclass(slots=True)
class ThermostatConfig:
    roi_target: float
    roi_floor: float
    smoothing_window: int
    tau_step: float
    alpha_step: float
    concurrency_step: int
    evaluation_enhancement_threshold: float


@dataclass(slots=True)
class SentinelConfig:
    roi_hard_floor: float
    cost_ceiling: float
    max_failures_per_agent: int
    cooldown_iterations: int


@dataclass(slots=True)
class BaselineConfig:
    expansion_interval: int
    evaluation_batch: int


@dataclass(slots=True)
class SimulationConfig:
    success_value: float
    base_task_cost: float
    quality_drift_mean: float
    quality_drift_stddev: float
    min_quality: float
    max_quality: float
    concurrency_penalty: float


@dataclass(slots=True)
class ReportingConfig:
    export_markdown: bool
    export_json: bool
    export_mermaid: bool
    artifact_directory: str


@dataclass(slots=True)
class DemoConfiguration:
    run_name: str
    random_seed: int
    budget: BudgetConfig
    initial_agent: InitialAgentConfig
    hgm: HGMConfig
    thermostat: ThermostatConfig
    sentinel: SentinelConfig
    baseline: BaselineConfig
    simulation: SimulationConfig
    reporting: ReportingConfig

    @classmethod
    def load(cls, path: Path) -> "DemoConfiguration":
        data = _read_config(path)
        return cls(
            run_name=data["run_name"],
            random_seed=int(data["random_seed"]),
            budget=BudgetConfig(**data["budget"]),
            initial_agent=InitialAgentConfig(**data["initial_agent"]),
            hgm=HGMConfig(**data["hgm"]),
            thermostat=ThermostatConfig(**data["thermostat"]),
            sentinel=SentinelConfig(**data["sentinel"]),
            baseline=BaselineConfig(**data["baseline"]),
            simulation=SimulationConfig(**data["simulation"]),
            reporting=ReportingConfig(**data["reporting"]),
        )


def _read_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8")
    if suffix == ".json":
        return json.loads(text)
    if suffix in {".yaml", ".yml"}:
        if yaml is None:
            raise ModuleNotFoundError(
                "PyYAML is required to parse YAML configuration files. "
                "Install PyYAML or provide a JSON configuration."
            )
        return yaml.safe_load(text)
    raise ValueError(f"Unsupported configuration format for {path}")


__all__ = [
    "DemoConfiguration",
    "BudgetConfig",
    "InitialAgentConfig",
    "HGMConfig",
    "ThermostatConfig",
    "SentinelConfig",
    "BaselineConfig",
    "SimulationConfig",
    "ReportingConfig",
]
