"""Telemetry persistence for the TRM demo."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional


@dataclass
class SubgraphConfig:
    """Location and metadata for subgraph inspired telemetry."""

    path: Path = Path("trm_calls.json")


class SubgraphLogger:
    """Simple file-backed logger storing TRM call metadata."""

    def __init__(self, config: Optional[SubgraphConfig] = None) -> None:
        self.config = config or SubgraphConfig()
        self._records: list[Dict[str, float | str | bool]] = []

    def log(self, record: Dict[str, float | str | bool]) -> None:
        self._records.append(record)

    def flush(self) -> None:
        if not self._records:
            return
        self.config.path.write_text(json.dumps(self._records, indent=2))

    def extend(self, records: Iterable[Dict[str, float | str | bool]]) -> None:
        for record in records:
            self.log(record)

    def __del__(self) -> None:
        try:
            self.flush()
        except Exception:
            pass

