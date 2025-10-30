"""In-memory program database used by the AlphaEvolve demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Mapping, Sequence

from .diff_engine import DiffProposal


@dataclass(slots=True)
class ProgramRecord:
    program_id: str
    generation: int
    source: str
    metrics: Dict[str, float]
    diff: DiffProposal | None = None
    parent_id: str | None = None
    model_origin: str | None = None


class ProgramDatabase:
    def __init__(self) -> None:
        self._records: List[ProgramRecord] = []
        self._by_id: Dict[str, ProgramRecord] = {}

    def add(self, record: ProgramRecord) -> None:
        self._records.append(record)
        self._by_id[record.program_id] = record

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self._records)

    def latest(self) -> ProgramRecord:
        if not self._records:
            raise LookupError("database is empty")
        return self._records[-1]

    def best_by(self, metric: str) -> ProgramRecord:
        return max(self._records, key=lambda record: record.metrics.get(metric, float("-inf")))

    def sample_parents(self, *, count: int = 3) -> List[ProgramRecord]:
        if not self._records:
            raise LookupError("database is empty")
        sorted_records = sorted(self._records, key=lambda record: record.metrics.get("Utility", 0), reverse=True)
        unique_records = []
        seen_sources: set[str] = set()
        for record in sorted_records:
            signature = record.source[:256]
            if signature in seen_sources:
                continue
            seen_sources.add(signature)
            unique_records.append(record)
            if len(unique_records) >= count:
                break
        return unique_records or sorted_records[:count]

    def pareto_front(self, metrics: Sequence[str]) -> List[ProgramRecord]:
        front: List[ProgramRecord] = []
        for record in self._records:
            dominated = False
            for other in self._records:
                if other is record:
                    continue
                if _dominates(other.metrics, record.metrics, metrics):
                    dominated = True
                    break
            if not dominated:
                front.append(record)
        return front

    def history(self) -> Sequence[ProgramRecord]:
        return tuple(self._records)


def _dominates(candidate: Mapping[str, float], other: Mapping[str, float], metrics: Sequence[str]) -> bool:
    better_or_equal = True
    strictly_better = False
    for metric in metrics:
        c_value = candidate.get(metric, float("-inf"))
        o_value = other.get(metric, float("-inf"))
        if c_value < o_value:
            better_or_equal = False
            break
        if c_value > o_value + 1e-9:
            strictly_better = True
    return better_or_equal and strictly_better


__all__ = ["ProgramDatabase", "ProgramRecord"]
