"""Telemetry helpers for AlphaEvolve demo metrics."""

from __future__ import annotations

from typing import Mapping

try:  # pragma: no cover - exercised indirectly
    from prometheus_client import Gauge, Counter, start_http_server
except Exception:  # pragma: no cover - fallback for environments without prometheus
    class _Dummy:  # type: ignore[too-few-public-methods]
        def __init__(self, *_: object, **__: object) -> None:  # noqa: D401
            self._value = 0.0

        def set(self, value: float) -> None:
            self._value = value

        def inc(self, value: float = 1.0) -> None:
            self._value += value

        def labels(self, *args: object, **kwargs: object) -> "_Dummy":
            return self

    Gauge = Counter = _Dummy  # type: ignore

    def start_http_server(*_: object, **__: object) -> None:  # type: ignore
        return None


class MetricsRecorder:
    def __init__(self) -> None:
        self.utility = Gauge("alphaevolve_utility", "Current Utility score")
        self.cost = Gauge("alphaevolve_cost", "Current cost score")
        self.gmv = Gauge("alphaevolve_gmv", "Current GMV")
        self.fairness = Gauge("alphaevolve_fairness", "Fairness index")
        self.latency = Gauge("alphaevolve_latency", "Latency in ms")
        self.risk = Gauge("alphaevolve_risk", "Risk index")
        self.acceptance = Gauge("alphaevolve_acceptance", "Acceptance rate")
        self.owner_revenue = Gauge("alphaevolve_owner_revenue", "Owner revenue")
        self.operator_revenue = Gauge("alphaevolve_operator_revenue", "Operator revenue")
        self.generation = Gauge("alphaevolve_generation", "Current generation")
        self.candidates_total = Counter("alphaevolve_candidates_total", "Total candidates evaluated")
        self.candidates_accepted = Counter("alphaevolve_candidates_accepted", "Candidates promoted")

    def update(self, metrics: Mapping[str, float], *, generation: int, accepted: bool) -> None:
        self.utility.set(metrics.get("Utility", 0.0))
        self.cost.set(metrics.get("Cost", 0.0))
        self.gmv.set(metrics.get("GMV", 0.0))
        self.fairness.set(metrics.get("Fairness", 0.0))
        self.latency.set(metrics.get("Latency", 0.0))
        self.risk.set(metrics.get("Risk", 0.0))
        self.acceptance.set(metrics.get("AcceptanceRate", 0.0))
        self.owner_revenue.set(metrics.get("OwnerRevenue", 0.0))
        self.operator_revenue.set(metrics.get("OperatorRevenue", 0.0))
        self.generation.set(generation)
        self.candidates_total.inc()
        if accepted:
            self.candidates_accepted.inc()

    def start_exporter(self, port: int = 9405) -> None:
        start_http_server(port)


__all__ = ["MetricsRecorder"]
