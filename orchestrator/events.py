"""Utilities for reconciling run status with gateway events."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Iterable, List

from .models import Receipt, StatusOut

_EVENTS_PATH = Path("agent-gateway/events.ts")
_EVENT_PATTERN = re.compile(r"broadcast\(wss, \{ type: '([^']+)'", re.MULTILINE)


class EventCatalogue:
    """Lightweight parser to extract event names from the gateway service."""

    def __init__(self, events_path: Path | None = None) -> None:
        self._path = (events_path or _EVENTS_PATH).resolve()
        self._events = self._parse()

    def _parse(self) -> List[str]:
        if not self._path.exists():
            return []
        contents = self._path.read_text(encoding="utf-8", errors="ignore")
        return sorted(set(_EVENT_PATTERN.findall(contents)))

    @property
    def names(self) -> List[str]:
        return list(self._events)


class EventReconciler:
    """Apply event hints to a run receipt for external consumption."""

    def __init__(self, catalogue: EventCatalogue | None = None) -> None:
        self._catalogue = catalogue or EventCatalogue()

    def build_receipt(self, status: StatusOut) -> Receipt:
        receipt = status.receipts or Receipt(
            plan_id=status.run.plan_id,
            job_id=None,
        )
        receipt.timings.setdefault("events", self._catalogue.names)
        receipt.timings.setdefault("state", status.run.state)
        return receipt

    def to_json(self) -> Dict[str, Iterable[str]]:
        return {"events": self._catalogue.names}


_DEFAULT_RECONCILER = EventReconciler()


def reconcile(status: StatusOut) -> Receipt:
    """Return an updated receipt populated with event metadata."""

    return _DEFAULT_RECONCILER.build_receipt(status)
