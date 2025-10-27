"""Energy oracle publishing planetary resource telemetry."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict


class EnergyOracle:
    """Append-only JSONL oracle for energy and compute telemetry."""

    def __init__(self, path: Path, *, ensure_parent: bool = True) -> None:
        self.path = path
        if ensure_parent:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    async def publish(self, payload: Dict[str, Any]) -> None:
        """Persist a telemetry record asynchronously."""

        record = {
            **payload,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(self._write_record, record)

    def _write_record(self, record: Dict[str, Any]) -> None:
        line = json.dumps(record, ensure_ascii=False)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
                handle.flush()

    async def close(self) -> None:
        """Provided for API symmetry; no resources to release."""

        return None
