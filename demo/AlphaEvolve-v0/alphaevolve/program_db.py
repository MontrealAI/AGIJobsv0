from __future__ import annotations

import bisect
import itertools
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional


@dataclass(slots=True)
class ProgramRecord:
    generation: int
    code: str
    metrics: Mapping[str, float]
    diff_metadata: Mapping[str, str]
    is_champion: bool = False
    niche: str = "global"

    def dominates(self, other: "ProgramRecord", primary_metric: str) -> bool:
        if self.metrics[primary_metric] < other.metrics[primary_metric]:
            return False
        return all(self.metrics.get(k, 0) >= other.metrics.get(k, 0) for k in other.metrics)


class ProgramAtlas:
    """Stores evaluated programs and offers Pareto sampling."""

    def __init__(self, primary_metric: str) -> None:
        self.primary_metric = primary_metric
        self._records: List[ProgramRecord] = []
        self._champion: Optional[ProgramRecord] = None

    @property
    def champion(self) -> Optional[ProgramRecord]:
        return self._champion

    def add(self, record: ProgramRecord) -> None:
        self._records.append(record)
        if not self._champion or record.metrics[self.primary_metric] > self._champion.metrics[self.primary_metric]:
            if self._champion:
                self._champion.is_champion = False
            record.is_champion = True
            self._champion = record

    def pareto_front(self) -> List[ProgramRecord]:
        front: List[ProgramRecord] = []
        for record in self._records:
            dominated = False
            for other in self._records:
                if other is record:
                    continue
                if other.dominates(record, self.primary_metric):
                    dominated = True
                    break
            if not dominated:
                front.append(record)
        return sorted(front, key=lambda r: r.metrics[self.primary_metric], reverse=True)

    def sample_parents(self, k: int = 3) -> List[ProgramRecord]:
        if not self._records:
            raise ValueError("Program atlas empty")
        front = self.pareto_front()
        if len(front) >= k:
            return front[:k]
        tail = [rec for rec in self._records if rec not in front]
        tail.sort(key=lambda r: r.metrics[self.primary_metric], reverse=True)
        return front + tail[: max(0, k - len(front))]

    def to_dict(self) -> List[dict]:
        return [
            {
                "generation": rec.generation,
                "metrics": dict(rec.metrics),
                "niche": rec.niche,
                "is_champion": rec.is_champion,
            }
            for rec in self._records
        ]


__all__ = ["ProgramAtlas", "ProgramRecord"]
