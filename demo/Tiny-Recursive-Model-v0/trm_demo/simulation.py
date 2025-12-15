"""Simulation harness comparing TRM to baselines."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np
import torch

from .baselines import GreedyBaseline, LLMBaseline
from .config import DemoSettings
from .dataset import OperationSequence, generate_sequence
from .engine import TrmEngine
from .ledger import EconomicLedger
from .sentinel import Sentinel
from .thermostat import Thermostat


@dataclass
class ModelMetrics:
    successes: int = 0
    trials: int = 0
    total_cost: float = 0.0
    total_value: float = 0.0
    latencies: List[float] = field(default_factory=list)
    steps_distribution: List[int] = field(default_factory=list)

    def register(
        self,
        *,
        success: bool,
        cost: float,
        value: float,
        latency_ms: float,
        steps_used: int,
    ) -> None:
        self.trials += 1
        if success:
            self.successes += 1
            self.total_value += value
        self.total_cost += cost
        self.latencies.append(latency_ms)
        self.steps_distribution.append(steps_used)

    def roi(self) -> float:
        return self.total_value / self.total_cost if self.total_cost else float("inf")

    def avg_latency(self) -> float:
        return float(np.mean(self.latencies)) if self.latencies else 0.0


@dataclass
class SimulationSummary:
    trm: ModelMetrics
    greedy: ModelMetrics
    llm: ModelMetrics
    sentinel_triggered: bool
    sentinel_reason: str | None
    thermostat_trace: List[Tuple[int, int, float]]


def _encode_sequence(sequence: OperationSequence, *, input_dim: int) -> Dict[str, torch.Tensor]:
    vocab = {
        "add": 0,
        "subtract": 1,
        "multiply": 2,
        "max": 3,
        "min": 4,
        "noop": 5,
    }
    feature_dim = input_dim
    steps: List[List[float]] = []
    for op in sequence.operations:
        vector = [0.0] * feature_dim
        vector[vocab[op.op]] = 1.0
        vector[-1] = op.arg / 10.0
        steps.append(vector)
    while len(steps) < input_dim - 1:
        vector = [0.0] * feature_dim
        vector[vocab["noop"]] = 1.0
        steps.append(vector)
    steps = steps[: input_dim - 1]
    start_tensor = torch.tensor([sequence.start], dtype=torch.float32)
    steps_tensor = torch.tensor(steps, dtype=torch.float32)
    length_tensor = torch.tensor(len(sequence.operations), dtype=torch.long)
    return {"start": start_tensor, "steps": steps_tensor, "length": length_tensor}


def run_simulation(
    *,
    engine: TrmEngine,
    thermostat: Thermostat,
    sentinel: Sentinel,
    ledger: EconomicLedger,
    settings: DemoSettings,
    trials: int = 128,
    seed: int = 0,
) -> SimulationSummary:
    rng = random.Random(seed)
    # Ensure deterministic behavior across numpy, torch, and Python's RNG so
    # the sentinel consistently reflects guardrail breaches during testing.
    np.random.seed(seed)
    torch.manual_seed(seed)
    greedy = GreedyBaseline()
    llm = LLMBaseline(rng=rng)

    trm_metrics = ModelMetrics()
    greedy_metrics = ModelMetrics()
    llm_metrics = ModelMetrics()
    thermostat_trace: List[Tuple[int, int, float]] = []
    sentinel_triggered = False
    sentinel_reason: str | None = None

    for _ in range(trials):
        sequence = generate_sequence(rng=rng)
        greedy_result = greedy.infer(sequence)
        greedy_metrics.register(
            success=greedy_result.success,
            cost=greedy_result.cost,
            value=settings.ledger.default_success_value,
            latency_ms=greedy_result.latency_ms,
            steps_used=greedy_result.steps_used,
        )

        llm_result = llm.infer(sequence)
        llm_metrics.register(
            success=llm_result.success,
            cost=llm_result.cost,
            value=settings.ledger.default_success_value,
            latency_ms=llm_result.latency_ms,
            steps_used=llm_result.steps_used,
        )

        thermostat_state = thermostat.update(ledger)
        thermostat_trace.append(
            (
                thermostat_state.inner_steps,
                thermostat_state.outer_steps,
                thermostat_state.halt_threshold,
            )
        )

        sample = _encode_sequence(sequence, input_dim=settings.trm.input_dim)
        inference = engine.infer(
            sample,
            max_inner_steps=thermostat_state.inner_steps,
            max_outer_steps=thermostat_state.outer_steps,
            halt_threshold=thermostat_state.halt_threshold,
        )
        success = inference.prediction == sequence.target
        if success:
            ledger_entry = ledger.record_success(
                steps_used=inference.steps_used,
                halted_early=inference.halted_early,
                latency_ms=inference.latency_ms,
            )
        else:
            ledger_entry = ledger.record_failure(
                steps_used=inference.steps_used,
                halted_early=inference.halted_early,
                latency_ms=inference.latency_ms,
            )

        trm_metrics.register(
            success=success,
            cost=ledger_entry.cost,
            value=ledger_entry.value,
            latency_ms=inference.latency_ms,
            steps_used=inference.steps_used,
        )

        sentinel_status = sentinel.evaluate(
            ledger=ledger,
            last_latency_ms=inference.latency_ms,
            last_steps=inference.steps_used,
            last_success=success,
        )
        if sentinel_status.halted:
            sentinel_triggered = True
            sentinel_reason = sentinel_status.reason
            break

    return SimulationSummary(
        trm=trm_metrics,
        greedy=greedy_metrics,
        llm=llm_metrics,
        sentinel_triggered=sentinel_triggered,
        sentinel_reason=sentinel_reason,
        thermostat_trace=thermostat_trace,
    )


__all__ = ["run_simulation", "SimulationSummary", "ModelMetrics"]
