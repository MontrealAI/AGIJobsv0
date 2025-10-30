"""Guardrail evaluation for AlphaEvolve candidates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Mapping, Tuple


@dataclass(frozen=True)
class GuardrailConfig:
    max_cost_pct_baseline: float
    min_utility_pct_baseline: float
    min_fairness: float
    max_latency_ms: float
    max_risk: float


class GuardrailBreach(Exception):
    """Raised when guardrails are violated."""


class Guardrails:
    def __init__(self, config: GuardrailConfig, baseline: Mapping[str, float]) -> None:
        self._config = config
        self._baseline = baseline

    def evaluate(self, metrics: Mapping[str, float]) -> Tuple[bool, List[str]]:
        failures: List[str] = []
        baseline_utility = self._baseline.get("Utility", 1.0)
        baseline_cost = self._baseline.get("Cost", 1.0)
        if metrics.get("Cost", 0.0) > baseline_cost * self._config.max_cost_pct_baseline:
            failures.append("cost-exceeds-threshold")
        if metrics.get("Utility", 0.0) < baseline_utility * self._config.min_utility_pct_baseline:
            failures.append("utility-regression")
        if metrics.get("Fairness", 0.0) < self._config.min_fairness:
            failures.append("fairness-regression")
        if metrics.get("Latency", 0.0) > self._config.max_latency_ms:
            failures.append("latency-regression")
        if metrics.get("Risk", 0.0) > self._config.max_risk:
            failures.append("risk-violation")
        return (not failures, failures)


def build_guardrails(config: Mapping[str, object], baseline: Mapping[str, float]) -> Guardrails:
    guardrail_cfg = GuardrailConfig(
        max_cost_pct_baseline=float(config.get("max_cost_pct_baseline", 1.1)),
        min_utility_pct_baseline=float(config.get("min_utility_pct_baseline", 0.95)),
        min_fairness=float(config.get("min_fairness", 0.85)),
        max_latency_ms=float(config.get("max_latency_ms", 450.0)),
        max_risk=float(config.get("max_risk", 0.2)),
    )
    return Guardrails(guardrail_cfg, baseline)


__all__ = ["Guardrails", "GuardrailBreach", "build_guardrails"]
