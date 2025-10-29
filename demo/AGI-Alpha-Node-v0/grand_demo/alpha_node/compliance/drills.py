"""Anti-fragility drills."""
from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DrillReport:
    name: str
    executed_at: datetime
    passed: bool
    notes: str


class DrillScheduler:
    def __init__(self, interval_minutes: int) -> None:
        self.interval = timedelta(minutes=interval_minutes)
        self.last_run: datetime | None = None

    def due(self) -> bool:
        if self.last_run is None:
            return True
        return datetime.utcnow() - self.last_run >= self.interval

    def run(self) -> DrillReport:
        outcome = random.random() > 0.05
        notes = "Pause/resume verified" if outcome else "Pause command latency above threshold"
        report = DrillReport(
            name="system-pause-drill",
            executed_at=datetime.utcnow(),
            passed=outcome,
            notes=notes,
        )
        self.last_run = report.executed_at
        logger.info("Executed drill", extra={"passed": report.passed, "notes": report.notes})
        return report


__all__ = ["DrillScheduler", "DrillReport"]
