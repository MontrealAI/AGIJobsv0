"""Configuration loader for sentinel guardrail rules."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence

_DEFAULT_PATH = Path(__file__).resolve().parents[2] / "config" / "sentinel.json"


@dataclass(slots=True)
class FailureStreakConfig:
    """Configuration for agent failure streak pruning."""

    threshold: int = 5
    success_reset: bool = True


@dataclass(slots=True)
class SentinelConfig:
    """Runtime configuration for the sentinel service."""

    roi_floor: float = 1.0
    roi_grace_period: int = 3
    budget_cap: float = 0.0
    budget_soft_ratio: float = 0.8
    failure_streak: FailureStreakConfig = field(default_factory=FailureStreakConfig)
    success_threshold: float = 0.6
    monitor_interval_seconds: float = 1.0
    alert_channels: Sequence[str] = field(default_factory=lambda: ("log",))

    def soft_budget(self) -> float:
        if self.budget_cap <= 0:
            return 0.0
        return self.budget_cap * self.budget_soft_ratio


def _coerce_float(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_int(value: object, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def _path_candidates(env: Iterable[str]) -> Sequence[Path]:
    candidates = []
    for key in env:
        raw = os.getenv(key)
        if raw:
            candidates.append(Path(raw).expanduser())
    candidates.append(_DEFAULT_PATH)
    return candidates


def _load_json(path: Path) -> dict[str, object]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def _failure_streak(payload: dict[str, object]) -> FailureStreakConfig:
    config = FailureStreakConfig()
    threshold = payload.get("threshold")
    success_reset = payload.get("successReset")
    config.threshold = max(1, _coerce_int(threshold, config.threshold))
    config.success_reset = _coerce_bool(success_reset, config.success_reset)
    return config


def _load_payload() -> dict[str, object]:
    for path in _path_candidates(("SENTINEL_CONFIG", "SENTINEL_CONFIG_PATH")):
        payload = _load_json(path)
        if payload:
            return payload
    return {}


@lru_cache(maxsize=1)
def load_config() -> SentinelConfig:
    """Load configuration from JSON and environment overrides."""

    payload = _load_payload()
    config = SentinelConfig()
    config.roi_floor = _coerce_float(payload.get("roiFloor"), config.roi_floor)
    config.roi_grace_period = max(1, _coerce_int(payload.get("roiGracePeriod"), config.roi_grace_period))
    config.budget_cap = max(0.0, _coerce_float(payload.get("budgetCap"), config.budget_cap))
    ratio = _coerce_float(payload.get("budgetSoftRatio"), config.budget_soft_ratio)
    config.budget_soft_ratio = ratio if ratio > 0 else config.budget_soft_ratio
    failure_payload = payload.get("failureStreak")
    if isinstance(failure_payload, dict):
        config.failure_streak = _failure_streak(failure_payload)
    config.success_threshold = _coerce_float(payload.get("successThreshold"), config.success_threshold)
    config.monitor_interval_seconds = max(0.01, _coerce_float(payload.get("monitorIntervalSeconds"), config.monitor_interval_seconds))
    channels = payload.get("alertChannels")
    if isinstance(channels, list):
        config.alert_channels = tuple(str(channel) for channel in channels if channel)
    return config


__all__ = ["FailureStreakConfig", "SentinelConfig", "load_config"]
