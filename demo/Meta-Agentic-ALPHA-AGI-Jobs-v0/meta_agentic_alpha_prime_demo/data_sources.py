"""Synthetic data generation and anomaly detection for the Prime demo."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from statistics import mean, pstdev
from typing import Iterable, Sequence
import json
import random


@dataclass(frozen=True)
class Signal:
    """A structured signal ingested by the Identify phase."""

    domain: str
    title: str
    value: float
    baseline: float
    timestamp: datetime
    confidence: float

    @property
    def delta(self) -> float:
        return self.value - self.baseline

    def is_anomaly(self, threshold: float) -> bool:
        if threshold <= 0:
            raise ValueError("threshold must be positive")
        return abs(self.delta) >= threshold * max(abs(self.baseline), 1.0)


@dataclass(frozen=True)
class Opportunity:
    """A potential alpha opportunity surfaced by the Identify phase."""

    domain: str
    description: str
    expected_alpha: float
    risk_score: float
    supporting_signals: tuple[Signal, ...]

    def risk_adjusted_score(self) -> float:
        if self.risk_score <= 0:
            return self.expected_alpha
        return self.expected_alpha / self.risk_score

def load_sample_signals(seed_path: Path, *, now: datetime | None = None) -> list[Signal]:
    """Load sample signals from disk and enrich with timestamps."""
    now = now or datetime.now(UTC)
    records = json.loads(seed_path.read_text())
    if not isinstance(records, list):
        raise TypeError("Signal seed file must contain a list")
    signals: list[Signal] = []
    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            raise TypeError(f"Signal record {idx} must be an object")
        timestamp = now - timedelta(minutes=record.get("minutes_ago", idx * 5))
        signals.append(
            Signal(
                domain=str(record.get("domain", "finance")),
                title=str(record.get("title", f"Signal {idx}")),
                value=float(record.get("value", 0.0)),
                baseline=float(record.get("baseline", 0.0)),
                timestamp=timestamp,
                confidence=float(record.get("confidence", 0.5)),
            )
        )
    return signals


def detect_opportunities(
    signals: Sequence[Signal],
    *,
    threshold: float,
    max_results: int = 10,
    risk_floor: float = 0.05,
) -> list[Opportunity]:
    """Derive opportunities by clustering anomalies per domain."""
    anomalies = [signal for signal in signals if signal.is_anomaly(threshold)]
    grouped: dict[str, list[Signal]] = {}
    for signal in anomalies:
        grouped.setdefault(signal.domain, []).append(signal)

    opportunities: list[Opportunity] = []
    for domain, domain_signals in grouped.items():
        deltas = [signal.delta for signal in domain_signals]
        baseline = mean(signal.baseline for signal in domain_signals)
        strength = sum(abs(delta) * signal.confidence for signal, delta in zip(domain_signals, deltas))
        variability = pstdev(deltas) if len(deltas) > 1 else abs(deltas[0])
        risk = max(risk_floor, variability / (abs(baseline) + 1e-6))
        description = (
            f"{domain.title()} domain shows {len(domain_signals)} correlated anomalies "
            f"with combined magnitude {strength:.2f}"
        )
        opportunities.append(
            Opportunity(
                domain=domain,
                description=description,
                expected_alpha=strength,
                risk_score=risk,
                supporting_signals=tuple(domain_signals),
            )
        )

    opportunities.sort(key=lambda opp: opp.risk_adjusted_score(), reverse=True)
    return opportunities[:max_results]


def synthesise_counterfactuals(opportunity: Opportunity, *, samples: int) -> list[float]:
    """Generate stress-tested alpha projections for a single opportunity."""
    rng = random.Random(42)
    projections: list[float] = []
    for _ in range(samples):
        jitter = rng.uniform(-0.2, 0.35)
        projections.append(opportunity.expected_alpha * (1 + jitter) - opportunity.risk_score)
    return projections


def summarise_projections(values: Iterable[float]) -> dict[str, float]:
    values = list(values)
    if not values:
        return {"pessimistic": 0.0, "expected": 0.0, "optimistic": 0.0}
    sorted_vals = sorted(values)
    index = len(sorted_vals) - 1
    optimistic = sorted_vals[int(index * 0.95)]
    expected = sorted_vals[int(index * 0.5)]
    pessimistic = sorted_vals[int(index * 0.1)]
    return {
        "pessimistic": pessimistic,
        "expected": expected,
        "optimistic": optimistic,
    }

