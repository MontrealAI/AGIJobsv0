"""Minimal alerting facade for async sentinel notifications."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict

_LOGGER = logging.getLogger(__name__)
_ALERT_LOG = Path("monitoring/sentinel-alerts.log")


@dataclass(slots=True)
class Alert:
    """Structured alert payload emitted by guardrail services."""

    source: str
    severity: str
    message: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> Dict[str, Any]:
        payload = dict(self.metadata)
        payload.update({
            "source": self.source,
            "severity": self.severity,
            "message": self.message,
        })
        return payload


def _persist(alert: Alert) -> None:
    _ALERT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with _ALERT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(alert.to_json(), ensure_ascii=False) + "\n")


async def emit(alert: Alert) -> None:
    """Emit an alert asynchronously and persist it for operators."""

    loop = asyncio.get_running_loop()
    _LOGGER.warning("[%s] %s", alert.severity.upper(), alert.message)
    await loop.run_in_executor(None, _persist, alert)


__all__ = ["Alert", "emit"]
