"""Utility helpers for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import json
import math
import statistics
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


@dataclass
class Task:
    """Represents a single AZR-style task."""

    program: str
    input_payload: str
    expected_output: str
    task_type: str = "deduction"
    description: Optional[str] = None

    def as_prompt(self) -> str:
        """Return markdown representation used in prompts."""

        return (
            "```python\n# program\n"
            f"{self.program.strip()}\n```\n"
            "```json\n# input\n"
            f"{self.input_payload.strip()}\n```\n"
            "```json\n# output\n"
            f"{self.expected_output.strip()}\n```"
        )


@dataclass
class ExecutionResult:
    """Result of executing a program inside the sandbox."""

    output: Optional[str]
    error: Optional[str]
    runtime_seconds: float

    @property
    def succeeded(self) -> bool:
        return self.error is None


def parse_json_payload(raw: str) -> Dict[str, object]:
    """Parse JSON payloads with clear error reporting."""

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc


def normalise_output(raw: str) -> str:
    """Normalize whitespace for deterministic comparison."""

    try:
        parsed = json.loads(raw)
        return json.dumps(parsed, sort_keys=True)
    except json.JSONDecodeError:
        return raw.strip()


def rolling_mean(data: Iterable[float]) -> float:
    """Safely compute the mean of an iterable."""

    values = list(data)
    if not values:
        return 0.0
    return statistics.fmean(values)


def timestamp_ms() -> int:
    """Return a millisecond timestamp for telemetry."""

    return int(time.time() * 1000)


def sigmoid(x: float) -> float:
    """Stable sigmoid used in reward shaping."""

    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)
