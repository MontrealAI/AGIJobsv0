"""Shared data structures for thermostat metrics ingestion."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping


def _coerce_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass(slots=True)
class MetricSample:
    """Single observation emitted by the monitoring pipeline."""

    timestamp: datetime
    roi: float
    gmv: float = 0.0
    cost: float = 0.0
    successes: int = 0
    failures: int = 0

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "MetricSample":
        """Build a sample from a dictionary payload.

        Missing optional fields default to zero which simplifies integration with
        Prometheus vector responses.
        """

        timestamp_raw = payload.get("timestamp")
        if isinstance(timestamp_raw, (int, float)):
            timestamp = datetime.fromtimestamp(float(timestamp_raw), tz=timezone.utc)
        elif isinstance(timestamp_raw, str):
            normalized = timestamp_raw.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            try:
                timestamp = datetime.fromisoformat(normalized)
            except ValueError:
                timestamp = datetime.now(tz=timezone.utc)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
        else:
            timestamp = datetime.now(tz=timezone.utc)

        roi = _coerce_float(payload.get("roi", 0.0))
        gmv = _coerce_float(payload.get("gmv", payload.get("revenue", 0.0)))
        cost = _coerce_float(payload.get("cost", payload.get("spend", 0.0)))
        successes = _coerce_int(payload.get("successes", 0))
        failures = _coerce_int(payload.get("failures", 0))
        return cls(
            timestamp=timestamp,
            roi=roi,
            gmv=gmv,
            cost=cost,
            successes=successes,
            failures=failures,
        )


__all__ = ["MetricSample"]
