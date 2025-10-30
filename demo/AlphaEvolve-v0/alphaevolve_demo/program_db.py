"""Program database for tracking AlphaEvolve candidate programs."""
from __future__ import annotations

import dataclasses
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List, Optional

from .evaluation import EvaluationResult


@dataclass
class ProgramEntry:
    generation: int
    code: str
    diff: str
    metrics: EvaluationResult
    origin: str
    niche: str


class ProgramDatabase:
    """Stores evaluated programs and exposes utilities for selection."""

    def __init__(self, max_history: int = 200) -> None:
        self._entries: Deque[ProgramEntry] = deque(maxlen=max_history)
        self._elites: Dict[str, ProgramEntry] = {}

    def add(self, entry: ProgramEntry) -> None:
        self._entries.append(entry)
        existing = self._elites.get(entry.niche)
        if existing is None or entry.metrics.utility > existing.metrics.utility:
            self._elites[entry.niche] = entry

    def latest(self) -> Optional[ProgramEntry]:
        return self._entries[-1] if self._entries else None

    def all_entries(self) -> List[ProgramEntry]:
        return list(self._entries)

    def elites(self) -> List[ProgramEntry]:
        return list(self._elites.values())

    def sample_parents(self, limit: int = 3) -> List[ProgramEntry]:
        elites = self.elites()
        return elites[:limit]

    def best(self) -> Optional[ProgramEntry]:
        best_entry = None
        for entry in self._entries:
            if best_entry is None or entry.metrics.utility > best_entry.metrics.utility:
                best_entry = entry
        return best_entry

