"""State persistence utilities for the Omega demo."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from .jobs import JobRegistry


class StatePersistence:
    def __init__(self, checkpoint_path: Path) -> None:
        self._path = checkpoint_path

    def save(self, registry: JobRegistry, metadata: Dict[str, Any]) -> None:
        payload = {
            "jobs": registry.serialize(),
            "metadata": metadata,
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    def load(self) -> Dict[str, Any]:
        if not self._path.exists():
            return {}
        with self._path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload


__all__ = ["StatePersistence"]
