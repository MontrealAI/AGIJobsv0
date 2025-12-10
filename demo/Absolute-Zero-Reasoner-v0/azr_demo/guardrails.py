"""Thermostat and sentinel style guardrails for the demo loop."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class GuardrailState:
    difficulty_bias: float = 0.0
    unsafe_events: int = 0
    iterations: int = 0
    paused: bool = False


class GuardrailManager:
    """Adaptive controller enforcing learning stability and safety."""

    def __init__(
        self,
        *,
        target_success: float = 0.5,
        tolerance: float = 0.15,
        difficulty_step: float = 0.1,
        max_bias: float = 1.0,
        unsafe_threshold: int = 5,
        max_iterations: int = 500,
    ) -> None:
        self._target_success = target_success
        self._tolerance = tolerance
        self._difficulty_step = difficulty_step
        self._max_bias = max_bias
        self._unsafe_threshold = unsafe_threshold
        self._max_iterations = max_iterations
        self._state = GuardrailState()

    @property
    def state(self) -> GuardrailState:
        return self._state

    def register_iteration(self, success_rate: float) -> Dict[str, float]:
        if self._state.paused:
            return {"difficulty_bias": self._state.difficulty_bias}
        self._state.iterations += 1
        if success_rate > self._target_success + self._tolerance:
            self._state.difficulty_bias = min(
                self._max_bias, self._state.difficulty_bias + self._difficulty_step
            )
        elif success_rate < self._target_success - self._tolerance:
            self._state.difficulty_bias = max(
                -self._max_bias, self._state.difficulty_bias - self._difficulty_step
            )
        if self._state.iterations >= self._max_iterations:
            self._state.paused = True
        return {"difficulty_bias": self._state.difficulty_bias}

    def register_violation(self) -> None:
        self._state.unsafe_events += 1
        if self._state.unsafe_events >= self._unsafe_threshold:
            self._state.paused = True

    def pause(self) -> None:
        """Force a pause due to external constraints."""

        self._state.paused = True

    def should_pause(self) -> bool:
        return self._state.paused

    def snapshot(self) -> Dict[str, float]:
        return {
            "difficulty_bias": self._state.difficulty_bias,
            "unsafe_events": float(self._state.unsafe_events),
            "iterations": float(self._state.iterations),
            "paused": 1.0 if self._state.paused else 0.0,
        }


__all__ = ["GuardrailManager", "GuardrailState"]
