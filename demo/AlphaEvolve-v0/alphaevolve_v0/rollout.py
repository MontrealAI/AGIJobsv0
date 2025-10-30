"""Shadow and canary rollout simulation for the AlphaEvolve demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Mapping


@dataclass(frozen=True)
class RolloutDecision:
    mode: str
    canary_percent: float
    rationale: str


class RolloutManager:
    def __init__(self, config: Mapping[str, object]) -> None:
        self._shadow_generations_required = int(config.get("shadow_to_canary_generations", 3))
        self._history: List[tuple[bool, Mapping[str, float]]] = []
        self._mode = "shadow"
        self._canary_percent = 0.0

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def canary_percent(self) -> float:
        return self._canary_percent

    def register(self, metrics: Mapping[str, float], *, guardrails_ok: bool) -> RolloutDecision:
        self._history.append((guardrails_ok, metrics))
        rationale = ""
        if not guardrails_ok:
            self._mode = "halted"
            self._canary_percent = 0.0
            rationale = "Guardrail breach detected; reverting to baseline."
            return RolloutDecision(self._mode, self._canary_percent, rationale)
        if self._mode == "shadow" and len(self._history) >= self._shadow_generations_required:
            if all(result for result, _ in self._history[-self._shadow_generations_required:]):
                self._mode = "canary"
                self._canary_percent = 0.15
                rationale = "Shadow validations clean; activating 15% canary."
        elif self._mode == "canary":
            previous_utility = None
            if len(self._history) >= 2:
                previous_metrics = self._history[-2][1]
                previous_utility = previous_metrics.get("Utility", 0.0)
            current_utility = metrics.get("Utility", 0.0)
            if previous_utility is not None and current_utility >= 1.02 * previous_utility:
                self._canary_percent = min(1.0, self._canary_percent + 0.3)
                rationale = f"Utility uplift sustained; expanding canary to {self._canary_percent:.0%}."
                if self._canary_percent >= 1.0:
                    self._mode = "full"
                    rationale = "Utility uplift compounding; promoting to full rollout."
        elif self._mode == "full":
            rationale = "Full rollout sustained."
        else:
            rationale = "Shadow validation in progress."
        return RolloutDecision(self._mode, self._canary_percent, rationale)


__all__ = ["RolloutManager", "RolloutDecision"]
