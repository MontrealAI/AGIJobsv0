"""Continuity vault utilities for Ω-grade v6 missions."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional


@dataclass(slots=True, frozen=True)
class ContinuityReplica:
    """Single redundant snapshot target."""

    name: str
    path: Path


class ContinuityVault:
    """Persist redundant mission checkpoints for instant resumption."""

    def __init__(
        self,
        replicas: Iterable[ContinuityReplica],
        *,
        history_path: Optional[Path] = None,
        history_limit: int = 8192,
        logger,
    ) -> None:
        replica_list = [replica for replica in replicas]
        if not replica_list:
            raise ValueError("at least one continuity replica must be configured")
        self._replicas: List[ContinuityReplica] = replica_list
        self._history_path = history_path
        self._history_limit = max(1, int(history_limit))
        self._lock = asyncio.Lock()
        self._logger = logger
        for replica in self._replicas:
            replica.path.parent.mkdir(parents=True, exist_ok=True)
        if self._history_path is not None:
            self._history_path.parent.mkdir(parents=True, exist_ok=True)

    async def persist(self, payload: Dict[str, object]) -> None:
        """Persist *payload* to all replicas and record success/failure."""

        async with self._lock:
            await asyncio.to_thread(self._write_all, payload)

    def configure(
        self,
        *,
        replicas: Optional[Iterable[ContinuityReplica]] = None,
        history_limit: Optional[int] = None,
    ) -> None:
        if replicas is not None:
            replica_list = [replica for replica in replicas]
            if not replica_list:
                raise ValueError("continuity vault requires at least one replica")
            for replica in replica_list:
                replica.path.parent.mkdir(parents=True, exist_ok=True)
            self._replicas = replica_list
        if history_limit is not None:
            self._history_limit = max(1, int(history_limit))

    @property
    def replicas(self) -> List[ContinuityReplica]:
        return list(self._replicas)

    @property
    def history_limit(self) -> int:
        return int(self._history_limit)

    # ---------------------------------------------------------------------
    # internal helpers
    # ---------------------------------------------------------------------
    def _write_all(self, payload: Dict[str, object]) -> None:
        failures: Dict[str, str] = {}
        for replica in self._replicas:
            try:
                replica.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            except OSError as exc:  # pragma: no cover - filesystem failure simulation
                failures[replica.name] = str(exc)
        record = {
            "timestamp": payload.get("timestamp"),
            "replicas": [replica.name for replica in self._replicas],
            "failures": failures,
        }
        self._logger.debug(
            "continuity_vault_persist",
            extra={"event": "continuity_vault_persist", **record},
        )
        if self._history_path is not None:
            history = self._history_path.read_text(encoding="utf-8").splitlines() if self._history_path.exists() else []
            history.append(json.dumps(record, separators=(",", ":")))
            trimmed = history[-self._history_limit :]
            self._history_path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")

