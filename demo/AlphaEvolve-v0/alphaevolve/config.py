from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, MutableMapping, Optional


@dataclass(slots=True)
class ThermostatConfig:
    success_window: int
    low_success_threshold: float
    high_success_threshold: float
    min_temperature: float
    max_temperature: float


@dataclass(slots=True)
class GuardrailConfig:
    max_cost_pct_baseline: float
    min_utility_pct_baseline: float
    min_fairness: float
    rollback_on_latency_ms: float


@dataclass(slots=True)
class PromptConfig:
    explicit_context: str
    include_metrics: List[str]
    stochastic_templates: Mapping[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ModelConfig:
    fast_model: str
    strong_model: str
    strong_invoke_ratio: float


@dataclass(slots=True)
class ControllerConfig:
    max_parallel_evaluations: int
    max_generations_per_run: int
    wallclock_time_limit_min: int


@dataclass(slots=True)
class AlphaEvolveConfig:
    evolvable_functions: List[str]
    prompt: PromptConfig
    models: ModelConfig
    controller: ControllerConfig
    thermostat: ThermostatConfig
    guardrails: GuardrailConfig
    baseline_metrics: Mapping[str, float]

    @staticmethod
    def from_dict(data: Mapping[str, Any]) -> "AlphaEvolveConfig":
        return AlphaEvolveConfig(
            evolvable_functions=list(data.get("evolvable_functions", [])),
            prompt=PromptConfig(**data["prompt"]),
            models=ModelConfig(**data["models"]),
            controller=ControllerConfig(**data["controller"]),
            thermostat=ThermostatConfig(**data["thermostat"]),
            guardrails=GuardrailConfig(**data["guardrails"]),
            baseline_metrics=dict(data.get("baseline_metrics", {})),
        )


_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "alphaevolve.json"


def load_config(path: Optional[Path | str] = None) -> AlphaEvolveConfig:
    cfg_path = Path(path) if path else _DEFAULT_CONFIG_PATH
    if not cfg_path.exists():
        raise FileNotFoundError(f"AlphaEvolve config not found: {cfg_path}")
    with cfg_path.open("r", encoding="utf-8") as fp:
        data: MutableMapping[str, Any] = json.load(fp)
    return AlphaEvolveConfig.from_dict(data)


__all__ = ["AlphaEvolveConfig", "ThermostatConfig", "GuardrailConfig", "PromptConfig", "ModelConfig", "ControllerConfig", "load_config"]
