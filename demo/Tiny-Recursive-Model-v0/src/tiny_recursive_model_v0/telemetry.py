"""Telemetry utilities for TRM demo."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from .utils import ensure_parent, write_jsonl


@dataclass
class TelemetryEvent:
    event_type: str
    payload: dict

    def to_dict(self) -> dict:
        return asdict(self)


class TelemetryWriter:
    """Structured telemetry writer."""

    def __init__(self, path: Path | str, enabled: bool = True) -> None:
        self.path = Path(path)
        self.enabled = enabled
        if self.enabled:
            ensure_parent(self.path)

    def emit(self, events: Iterable[TelemetryEvent]) -> None:
        if not self.enabled:
            return
        write_jsonl(self.path, (event.to_dict() for event in events))


__all__ = ["TelemetryEvent", "TelemetryWriter"]
