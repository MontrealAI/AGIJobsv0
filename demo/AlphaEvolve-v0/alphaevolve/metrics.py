from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping


@dataclass(slots=True)
class MetricsRegistry:
    values: Dict[str, float] = field(default_factory=dict)

    def set(self, name: str, value: float) -> None:
        self.values[name] = float(value)

    def snapshot(self) -> Mapping[str, float]:
        return dict(self.values)


__all__ = ["MetricsRegistry"]
