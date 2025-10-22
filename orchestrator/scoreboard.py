"""Lightweight on-disk scoreboard tracking arena outcomes."""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List

_DEFAULT_SCOREBOARD_PATH = Path(
    os.environ.get("ORCHESTRATOR_SCOREBOARD_PATH", "storage/orchestrator/scoreboard.json")
)


@dataclass
class ScoreRecord:
    wins: int = 0
    losses: int = 0
    slashes: int = 0
    notes: List[str] = field(default_factory=list)
    updated_at: float = field(default_factory=lambda: time.time())

    def to_json(self) -> Dict[str, object]:
        return {
            "wins": self.wins,
            "losses": self.losses,
            "slashes": self.slashes,
            "notes": list(self.notes),
            "updatedAt": self.updated_at,
        }


class Scoreboard:
    """Thread-safe scoreboard backed by a JSON file."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = (path or _DEFAULT_SCOREBOARD_PATH).resolve()
        self._lock = threading.Lock()
        self._records: Dict[str, ScoreRecord] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            return
        try:
            with self._path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):  # pragma: no cover - corrupted file
            self._records = {}
            return
        records: Dict[str, ScoreRecord] = {}
        for agent, entry in payload.items():
            record = ScoreRecord(
                wins=int(entry.get("wins", 0)),
                losses=int(entry.get("losses", 0)),
                slashes=int(entry.get("slashes", 0)),
                notes=[str(note) for note in entry.get("notes", [])],
                updated_at=float(entry.get("updatedAt", time.time())),
            )
            records[agent] = record
        self._records = records

    def _persist(self) -> None:
        payload = {agent: record.to_json() for agent, record in self._records.items()}
        tmp_path = self._path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2)
        tmp_path.replace(self._path)

    def _record(self, agent: str) -> ScoreRecord:
        if agent not in self._records:
            self._records[agent] = ScoreRecord()
        record = self._records[agent]
        record.updated_at = time.time()
        return record

    def record_result(self, agents: Iterable[str], *, success: bool, context: str) -> None:
        clean_agents = [agent for agent in agents if agent]
        if not clean_agents:
            return
        with self._lock:
            for agent in clean_agents:
                record = self._record(agent)
                if success:
                    record.wins += 1
                else:
                    record.losses += 1
                record.notes.append(f"{time.strftime('%Y-%m-%dT%H:%MZ')}: {context} -> {'win' if success else 'loss'}")
            self._persist()

    def record_slash(self, agents: Iterable[str], *, reason: str, amount: int | float | None = None) -> str:
        clean_agents = [agent for agent in agents if agent]
        if not clean_agents:
            return ""
        message_parts: List[str] = []
        with self._lock:
            for agent in clean_agents:
                record = self._record(agent)
                record.slashes += 1
                descriptor = f"{reason}"
                if amount is not None:
                    descriptor += f" ({amount})"
                record.notes.append(
                    f"{time.strftime('%Y-%m-%dT%H:%MZ')}: slash recorded -> {descriptor}"
                )
                message_parts.append(f"{agent} slashed: {descriptor}")
            self._persist()
        return ", ".join(message_parts)

    def snapshot(self) -> Dict[str, Dict[str, object]]:
        with self._lock:
            return {agent: record.to_json() for agent, record in self._records.items()}


_SCOREBOARD_SINGLETON: Scoreboard | None = None
_SCOREBOARD_LOCK = threading.Lock()


def get_scoreboard() -> Scoreboard:
    global _SCOREBOARD_SINGLETON
    with _SCOREBOARD_LOCK:
        if _SCOREBOARD_SINGLETON is None:
            _SCOREBOARD_SINGLETON = Scoreboard()
        return _SCOREBOARD_SINGLETON


__all__ = ["Scoreboard", "ScoreRecord", "get_scoreboard"]

