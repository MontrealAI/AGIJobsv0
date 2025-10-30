from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .config import GuardrailConfig


@dataclass(slots=True)
class GuardrailOutcome:
    ok: bool
    message: str = ""


def enforce_guardrails(metrics: Mapping[str, float], config: GuardrailConfig, baseline: Mapping[str, float]) -> GuardrailOutcome:
    utility = metrics["Utility"]
    baseline_utility = baseline.get("Utility", 1.0)
    cost = metrics["Cost"]
    baseline_cost = baseline.get("Cost", 1.0)
    fairness = metrics.get("Fairness", 1.0)
    latency = metrics.get("Latency", 0.0)

    if cost > baseline_cost * config.max_cost_pct_baseline:
        return GuardrailOutcome(False, "Cost cap breached")
    if utility < baseline_utility * config.min_utility_pct_baseline:
        return GuardrailOutcome(False, "Utility regression detected")
    if fairness < config.min_fairness:
        return GuardrailOutcome(False, "Fairness floor breached")
    if latency > config.rollback_on_latency_ms / 1000:
        return GuardrailOutcome(False, "Latency SLO exceeded")
    return GuardrailOutcome(True)


__all__ = ["GuardrailOutcome", "enforce_guardrails"]
