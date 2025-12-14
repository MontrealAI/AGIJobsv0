"""Telemetry utilities for MuZero demo."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, Iterable


class TelemetrySink:
    def __init__(self, config: Dict) -> None:
        telemetry_conf = config.get("telemetry", {})
        self.enabled = bool(telemetry_conf.get("enable", True))
        artifact_dir = Path(config.get("experiment", {}).get("artifact_dir", "demo/MuZero-style-v0/artifacts"))
        self.telemetry_dir = artifact_dir / "telemetry"
        self.telemetry_dir.mkdir(parents=True, exist_ok=True)
        self.prometheus_format = bool(telemetry_conf.get("prometheus_format", False))
        self.sample_rate = float(telemetry_conf.get("sample_rate", 1.0))
        self._buffer = []
        self.flush_interval = int(telemetry_conf.get("flush_interval", 5))
        self._last_flush = time.time()

    def __enter__(self) -> "TelemetrySink":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - simple delegation
        self.close()

    def record(self, metric_name: str, payload: Dict) -> None:
        if not self.enabled:
            return
        entry = {"metric": metric_name, "ts": time.time(), **payload}
        self._buffer.append(entry)
        if len(self._buffer) >= self.flush_interval or (time.time() - self._last_flush) > 10:
            self.flush()

    def flush(self) -> None:
        if not self.enabled or not self._buffer:
            return
        timestamp = int(time.time())
        file_path = self.telemetry_dir / f"telemetry_{timestamp}.jsonl"
        with file_path.open("a", encoding="utf-8") as handle:
            for entry in self._buffer:
                handle.write(json.dumps(entry) + "\n")
        self._buffer.clear()
        self._last_flush = time.time()

    def close(self) -> None:
        self.flush()


def summarise_runs(values: Iterable[float]) -> Dict[str, float]:
    values = list(values)
    if not values:
        return {"count": 0, "mean": 0.0, "std": 0.0}
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / max(len(values) - 1, 1)
    return {"count": len(values), "mean": mean, "std": variance ** 0.5}
