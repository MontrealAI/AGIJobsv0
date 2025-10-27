"""Resilience utilities supporting multi-day orchestration."""

from __future__ import annotations

import asyncio
import json
from logging import Logger
from pathlib import Path
from typing import Any, Dict


class AsyncTaskRegistry:
    """Track background asyncio tasks and surface failures."""

    def __init__(self, logger: Logger) -> None:
        self._logger = logger
        self._tasks: Dict[str, asyncio.Task[None]] = {}

    def register(self, label: str, task: asyncio.Task[None]) -> None:
        """Register *task* under *label* and attach failure reporting."""

        self._tasks[label] = task
        task.add_done_callback(self._make_callback(label))

    def _make_callback(self, label: str):
        def _callback(task: asyncio.Task[None]) -> None:
            if task.cancelled():
                return
            exc = task.exception()
            if exc is not None:
                self._logger.error(
                    "background_task_failed",
                    extra={"event": "background_task_failed", "task": label, "error": str(exc)},
                )

        return _callback

    @property
    def active_tasks(self) -> int:
        """Return the number of registered tasks that are still running."""

        return sum(1 for task in self._tasks.values() if not task.done())


class LongRunResilience:
    """Maintain a long-run ledger of mission progress for restart safety."""

    def __init__(self, ledger_path: Path, *, interval_seconds: float, retention_lines: int) -> None:
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self._interval = max(1.0, float(interval_seconds))
        self._retention = max(1, int(retention_lines))
        self._lock = asyncio.Lock()

    @property
    def interval_seconds(self) -> float:
        return self._interval

    def configure(
        self,
        *,
        interval_seconds: float | None = None,
        retention_lines: int | None = None,
    ) -> None:
        if interval_seconds is not None:
            self._interval = max(1.0, float(interval_seconds))
        if retention_lines is not None:
            self._retention = max(1, int(retention_lines))

    async def persist(self, snapshot: Dict[str, Any], *, force: bool = False) -> None:
        """Append *snapshot* to the ledger and enforce retention."""

        payload = {
            "timestamp": snapshot.get("timestamp"),
            "cycle": snapshot.get("cycle"),
            "jobs": snapshot.get("jobs"),
            "long_run": snapshot.get("long_run"),
            "resources": {
                "energy_available": snapshot.get("resources", {}).get("energy_available"),
                "compute_available": snapshot.get("resources", {}).get("compute_available"),
                "token_supply": snapshot.get("resources", {}).get("token_supply"),
                "locked_supply": snapshot.get("resources", {}).get("locked_supply"),
                "energy_price": snapshot.get("resources", {}).get("energy_price"),
                "compute_price": snapshot.get("resources", {}).get("compute_price"),
            },
        }
        line = json.dumps(payload, sort_keys=True)
        async with self._lock:
            await asyncio.to_thread(self._append_line, line, force)

    def _append_line(self, line: str, force: bool) -> None:
        with self.ledger_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        self._truncate(force=force)

    def _truncate(self, *, force: bool = False) -> None:
        if self._retention <= 0:
            return
        try:
            text = self.ledger_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return
        lines = [line for line in text.splitlines() if line]
        if not lines:
            return
        if not force and len(lines) <= self._retention:
            return
        trimmed = lines[-self._retention :]
        self.ledger_path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")


__all__ = ["AsyncTaskRegistry", "LongRunResilience"]
