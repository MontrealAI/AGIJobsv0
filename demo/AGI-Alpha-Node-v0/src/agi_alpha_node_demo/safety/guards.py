"""Safety rails and antifragility drills."""
from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from typing import Dict

from ..metrics.hub import MetricsHub

LOGGER = logging.getLogger(__name__)


@dataclass
class SafetySnapshot:
    paused: bool
    last_drill_timestamp: float
    antifragility_score: float

    def as_dict(self) -> Dict[str, float | bool]:
        return {
            "paused": self.paused,
            "last_drill_timestamp": self.last_drill_timestamp,
            "antifragility_score": round(self.antifragility_score, 4),
        }


class SafetyManager:
    """Applies safety rules and orchestrates regular drills."""

    def __init__(self, metrics: MetricsHub) -> None:
        self._metrics = metrics
        self._last_drill = 0.0
        self._antifragility_score = 0.8

    def evaluate(self, paused: bool, stake_ok: bool, ens_verified: bool) -> SafetySnapshot:
        penalty = 0.0
        if paused:
            penalty += 0.3
        if not stake_ok:
            penalty += 0.4
        if not ens_verified:
            penalty += 0.5
        antifragility = max(min(self._antifragility_score - penalty, 1.0), 0.0)
        LOGGER.debug(
            "Safety evaluation paused=%s stake_ok=%s ens_verified=%s antifragility=%.2f",
            paused,
            stake_ok,
            ens_verified,
            antifragility,
        )
        self._antifragility_score = antifragility
        return SafetySnapshot(paused=paused, last_drill_timestamp=self._last_drill, antifragility_score=antifragility)

    def run_drill(self) -> SafetySnapshot:
        LOGGER.info("Executing antifragility drill: pause/resume simulation")
        self._metrics.record_event("Safety drill executed")
        jitter = random.uniform(0.0, 0.05)
        self._antifragility_score = min(1.0, self._antifragility_score + 0.1 - jitter)
        self._last_drill = time.time()
        return SafetySnapshot(paused=False, last_drill_timestamp=self._last_drill, antifragility_score=self._antifragility_score)
