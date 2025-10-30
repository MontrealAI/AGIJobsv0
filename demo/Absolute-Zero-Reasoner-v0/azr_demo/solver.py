"""Self-improving solver used in the Absolute Zero Reasoner demo."""
from __future__ import annotations

import math
import random
from typing import Dict, Tuple

from .executor import SafeExecutor
from .tasks import AZRTask, TaskType


class SolverError(RuntimeError):
    """Raised when the solver cannot produce a valid answer."""


class SelfImprovingSolver:
    """Probabilistic solver that improves based on observed rewards."""

    def __init__(
        self,
        executor: SafeExecutor,
        *,
        initial_error_rate: float = 0.35,
        min_error_rate: float = 0.02,
        rng: random.Random | None = None,
    ) -> None:
        self._executor = executor
        self._rng = rng or random.Random(42)
        self._error_rates: Dict[TaskType, float] = {
            TaskType.DEDUCTION: initial_error_rate,
            TaskType.ABDUCTION: initial_error_rate + 0.1,
            TaskType.INDUCTION: initial_error_rate + 0.2,
        }
        self._min_error_rate = min_error_rate

    def _maybe_fail(self, task_type: TaskType, temperature: float) -> bool:
        error_rate = self._error_rates.get(task_type, 0.3)
        adjusted = min(0.95, max(self._min_error_rate, error_rate * temperature))
        return self._rng.random() < adjusted

    def solve(self, task: AZRTask, *, temperature: float) -> Tuple[Dict[str, object], bool]:
        if self._maybe_fail(task.task_type, temperature):
            return {"status": "no-answer"}, False
        if task.task_type is TaskType.DEDUCTION:
            result = self._execute(task.program, task.input_payload)
            return {"answer": result}, True
        if task.task_type is TaskType.ABDUCTION:
            solution = self._infer_input(task)
            return {"answer": solution}, True
        if task.task_type is TaskType.INDUCTION:
            program = task.metadata.get("reference_program")
            if not isinstance(program, str):
                raise SolverError("Missing reference program for induction task")
            return {"program": program}, True
        raise SolverError(f"Unsupported task type: {task.task_type}")

    def update_error_rate(self, task_type: TaskType, advantage: float) -> None:
        current = self._error_rates.get(task_type, 0.3)
        if advantage > 0:
            current = max(self._min_error_rate, current * (1 - min(0.1, advantage)))
        elif advantage < 0:
            current = min(0.95, current * (1 + min(0.1, abs(advantage))))
        self._error_rates[task_type] = current

    def _execute(self, program: str, payload: Dict[str, object]) -> object:
        result = self._executor.execute(program, payload)
        if result.timed_out:
            raise SolverError("Execution timed out")
        if result.non_deterministic:
            raise SolverError("Program is non-deterministic")
        return result.output

    def _infer_input(self, task: AZRTask) -> object:
        target = task.expected_output
        truth = task.metadata.get("ground_truth_input")
        if truth is not None:
            return truth
        # Fallback brute force search for demonstrative purposes.
        for candidate in range(-100, 101):
            payload = {"target": candidate}
            result = self._executor.execute(task.program, payload)
            if math.isclose(float(result.output), float(target)):
                return candidate
        raise SolverError("Unable to infer input")


__all__ = ["SelfImprovingSolver", "SolverError"]
