"""Data structures for specialist results."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass(slots=True)
class ExecutionResult:
    summary: str
    value_delta: float
    artifacts: Dict[str, str] = field(default_factory=dict)


__all__ = ["ExecutionResult"]
