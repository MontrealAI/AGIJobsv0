"""High level orchestration for running TRM powered decisions."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional

import torch

from .config import TinyRecursiveModelConfig
from .engine import TRMEngine
from .ledger import EconomicLedger
from .sentinel import Sentinel
from .thermostat import Thermostat


@dataclass(slots=True)
class OrchestratorResult:
    success: bool
    value: float
    cost: float
    latency_ms: float
    metadata: Dict[str, float]


class TrmOrchestrator:
    """Coordinates TRM usage, thermostat adjustments and sentinel guardrails."""

    def __init__(
        self,
        config: TinyRecursiveModelConfig,
        *,
        ledger: Optional[EconomicLedger] = None,
        sentinel: Optional[Sentinel] = None,
        thermostat: Optional[Thermostat] = None,
        cost_per_ms: float = 0.0005,
        value_per_conversion: float = 100.0,
    ) -> None:
        self.engine = TRMEngine(config)
        self.ledger = ledger or EconomicLedger()
        self.sentinel = sentinel or Sentinel()
        self.thermostat = thermostat or Thermostat()
        self.cost_per_ms = cost_per_ms
        self.value_per_conversion = value_per_conversion

    def train(self, dataset: torch.utils.data.Dataset, *, callback: Optional[Callable[[int, int, float], None]] = None) -> None:
        self.engine.train_model(dataset, progress_callback=callback)
        self.sentinel.reset_period()

    def run_inference(self, features: torch.Tensor, *, ground_truth: int) -> OrchestratorResult:
        self.sentinel.before_run()
        start = time.perf_counter()
        result = self.engine.infer(features.unsqueeze(0))
        latency_ms = (time.perf_counter() - start) * 1000.0
        cost = latency_ms * self.cost_per_ms
        predicted = int(result.predicted_class.item())
        success = predicted == int(ground_truth)
        value = self.value_per_conversion if success and ground_truth == 1 else 0.0
        roi = float("inf") if cost == 0 else (value / cost if success else 0.0)
        metadata = {
            "steps_used": float(result.steps_used),
            "halted_early": 1.0 if result.halted_early else 0.0,
            "latency_ms": latency_ms,
            "roi": roi,
        }
        if success:
            self.ledger.record_success(value=value, cost=cost, steps_used=result.steps_used, halted_early=result.halted_early)
        else:
            self.ledger.record_failure(cost=cost, steps_used=result.steps_used, halted_early=result.halted_early)
        self.sentinel.after_run(cost=cost, latency_ms=latency_ms, steps_used=result.steps_used, roi=roi)
        self.thermostat.update(self.ledger, self.engine)
        return OrchestratorResult(success, value, cost, latency_ms, metadata)

