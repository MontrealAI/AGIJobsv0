"""Shared data structures for thermostat metrics ingestion."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping


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
            timestamp = datetime.fromisoformat(timestamp_raw)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
        else:
            timestamp = datetime.now(tz=timezone.utc)

        roi = float(payload.get("roi", 0.0))
        gmv = float(payload.get("gmv", payload.get("revenue", 0.0)))
        cost = float(payload.get("cost", payload.get("spend", 0.0)))
        successes = int(payload.get("successes", 0))
        failures = int(payload.get("failures", 0))
        return cls(
            timestamp=timestamp,
            roi=roi,
            gmv=gmv,
            cost=cost,
            successes=successes,
            failures=failures,
        )


__all__ = ["MetricSample"]
