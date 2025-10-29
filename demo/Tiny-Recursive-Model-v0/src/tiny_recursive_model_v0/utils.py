"""Utility functions for the Tiny Recursive Model demo."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Iterable, List, Sequence

import numpy as np
import torch


def set_global_seed(seed: int) -> None:
    """Set deterministic seeds across libraries."""

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def ensure_parent(path: Path | str) -> None:
    """Create parent directories for a path."""

    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def softmax(logits: torch.Tensor) -> torch.Tensor:
    """Stable softmax for telemetry purposes."""

    return torch.nn.functional.softmax(logits, dim=-1)


def rolling_mean(values: Sequence[float], window: int) -> List[float]:
    """Compute rolling mean for plotting/thermostat."""

    result: List[float] = []
    for index in range(len(values)):
        start = max(0, index - window + 1)
        subset = values[start : index + 1]
        result.append(sum(subset) / len(subset))
    return result


def quantize(value: float, precision: int = 4) -> float:
    """Round values for telemetry/UX."""

    if math.isnan(value) or math.isinf(value):
        return 0.0
    return round(value, ndigits=precision)


def write_jsonl(path: Path | str, rows: Iterable[dict]) -> None:
    """Append rows to a JSONL file."""

    ensure_parent(path)
    with Path(path).open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, default=_tensor_serializer))
            handle.write("\n")


def _tensor_serializer(value):  # type: ignore[override]
    if isinstance(value, torch.Tensor):
        return value.detach().cpu().tolist()
    if isinstance(value, (np.ndarray,)):
        return value.tolist()
    raise TypeError(f"Unsupported type for JSON serialization: {type(value)!r}")


__all__ = [
    "ensure_parent",
    "quantize",
    "rolling_mean",
    "set_global_seed",
    "softmax",
    "write_jsonl",
]
