"""Configuration loading for the Tiny Recursive Model demo."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from pydantic import BaseModel, Field, ValidationInfo, field_validator


class ModelConfig(BaseModel):
    input_dim: int = 8
    latent_dim: int = 24
    answer_dim: int = 2
    hidden_dim: int = 48
    inner_cycles: int = 6
    outer_steps: int = 3
    halt_threshold: float = Field(0.5, ge=0.0, le=1.0)
    learning_rate: float = Field(0.05, gt=0.0)
    ema_decay: float = Field(0.999, gt=0.0, lt=1.0)
    weight_scale: float = Field(0.2, gt=0.0)
    max_grad_norm: float = Field(5.0, gt=0.0)

    @property
    def max_total_cycles(self) -> int:
        return self.inner_cycles * self.outer_steps


class TrainingConfig(BaseModel):
    epochs: int = Field(40, gt=0)
    batch_size: int = Field(128, gt=0)
    seed: int = 42
    checkpoint_interval: int = Field(10, gt=0)
    log_interval: int = Field(5, gt=0)
    validation_split: float = Field(0.2, ge=0.0, lt=1.0)
    deep_supervision_weight: float = Field(0.4, ge=0.0)
    halt_loss_weight: float = Field(0.2, ge=0.0)


class EconomicsConfig(BaseModel):
    value_per_success: float = Field(100.0, ge=0.0)
    cost_per_call: float = Field(0.001, ge=0.0)
    target_roi: float = Field(2.0, ge=0.0)
    roi_floor: float = Field(1.2, ge=0.0)
    daily_cost_cap: float = Field(50.0, ge=0.0)
    max_latency_ms: float = Field(2000.0, ge=0.0)
    max_recursion: int = Field(18, gt=0)


class ThermostatConcurrency(BaseModel):
    min: int = Field(1, ge=1)
    max: int = Field(6, ge=1)

    @field_validator("max")
    def check_bounds(cls, value: int, info: ValidationInfo) -> int:
        min_value = info.data.get("min") if info.data else None
        if min_value is not None and value < min_value:
            raise ValueError("concurrency.max must be >= concurrency.min")
        return value


class ThermostatConfig(BaseModel):
    window: int = Field(50, gt=0)
    min_inner_cycles: int = Field(3, gt=0)
    max_inner_cycles: int = Field(9, gt=0)
    min_outer_steps: int = Field(2, gt=0)
    max_outer_steps: int = Field(5, gt=0)
    min_halt_threshold: float = Field(0.4, ge=0.0, le=1.0)
    max_halt_threshold: float = Field(0.9, ge=0.0, le=1.0)
    adjustment_rate: float = Field(0.1, gt=0.0)
    concurrency: ThermostatConcurrency = Field(default_factory=ThermostatConcurrency)


class SentinelConfig(BaseModel):
    roi_floor: float = Field(1.0, ge=0.0)
    max_cost: float = Field(500.0, ge=0.0)
    max_latency_ms: float = Field(2500.0, ge=0.0)
    max_recursions: int = Field(24, gt=0)
    failure_limit: int = Field(8, ge=0)


class BaselineConfig(BaseModel):
    greedy_accuracy: float = Field(0.3, ge=0.0, le=1.0)
    llm_accuracy: float = Field(0.45, ge=0.0, le=1.0)
    llm_cost: float = Field(0.05, ge=0.0)


class SimulationConfig(BaseModel):
    trials: int = Field(1000, gt=0)
    seed: int = 7


class DemoConfig(BaseModel):
    model: ModelConfig = Field(default_factory=ModelConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    economics: EconomicsConfig = Field(default_factory=EconomicsConfig)
    thermostat: ThermostatConfig = Field(default_factory=ThermostatConfig)
    sentinel: SentinelConfig = Field(default_factory=SentinelConfig)
    baseline: BaselineConfig = Field(default_factory=BaselineConfig)
    simulation: SimulationConfig = Field(default_factory=SimulationConfig)

    @classmethod
    def from_file(cls, path: Optional[Path]) -> "DemoConfig":
        if path is None:
            return cls()
        data = yaml.safe_load(Path(path).read_text())
        return cls.model_validate(data)

    def merged(self, overrides: Optional[Dict[str, Any]] = None) -> "DemoConfig":
        if not overrides:
            return self
        data = self.model_dump()
        for section, values in overrides.items():
            if section not in data:
                raise KeyError(f"Unknown config section '{section}'")
            data[section].update(values)
        return DemoConfig.model_validate(data)
