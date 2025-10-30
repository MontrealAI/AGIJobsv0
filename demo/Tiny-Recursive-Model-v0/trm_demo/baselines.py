"""Baseline policies to benchmark the Tiny Recursive Model."""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Sequence

from .dataset import Operation, OperationSequence


@dataclass
class BaselineResult:
    prediction: int
    success: bool
    cost: float
    steps_used: int
    latency_ms: float


class GreedyBaseline:
    """Heuristic baseline that only applies the first available operation."""

    def __init__(self, *, cost_per_call: float = 0.0001) -> None:
        self.cost_per_call = cost_per_call

    def infer(self, sequence: OperationSequence) -> BaselineResult:
        value = sequence.start
        if sequence.operations:
            value = self._apply(sequence.start, sequence.operations[:1])
        success = value == sequence.target
        return BaselineResult(
            prediction=value,
            success=success,
            cost=self.cost_per_call,
            steps_used=1,
            latency_ms=5.0,
        )

    @staticmethod
    def _apply(start: int, operations: Sequence[Operation]) -> int:
        value = start
        for op in operations:
            if op.op == "add":
                value += op.arg
            elif op.op == "subtract":
                value -= op.arg
            elif op.op == "multiply":
                value *= op.arg
            elif op.op == "max":
                value = max(value, op.arg)
            elif op.op == "min":
                value = min(value, op.arg)
        return value


class LLMBaseline:
    """Simulated large model baseline with higher accuracy and cost."""

    def __init__(
        self,
        *,
        rng: random.Random,
        cost_per_call: float = 0.05,
        accuracy_boost: float = 0.1,
    ) -> None:
        self.rng = rng
        self.cost_per_call = cost_per_call
        self.accuracy_boost = accuracy_boost

    def infer(self, sequence: OperationSequence) -> BaselineResult:
        ideal = GreedyBaseline._apply(sequence.start, sequence.operations)
        # Inject occasional reasoning errors even for a large model.
        if self.rng.random() > (0.5 + self.accuracy_boost):
            noise = self.rng.randint(-3, 3)
            prediction = max(0, ideal + noise)
        else:
            prediction = ideal
        success = prediction == sequence.target
        return BaselineResult(
            prediction=prediction,
            success=success,
            cost=self.cost_per_call,
            steps_used=len(sequence.operations),
            latency_ms=350.0,
        )


__all__ = ["GreedyBaseline", "LLMBaseline", "BaselineResult"]
