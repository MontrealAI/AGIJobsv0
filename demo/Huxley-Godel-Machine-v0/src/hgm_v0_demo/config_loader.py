"""Configuration utilities for the Huxley–Gödel Machine demo.

The loader intentionally keeps dependencies minimal so that a non-technical
user can run the demo with the standard Python library only. Configuration
values are validated defensively to ensure robust behaviour even when users
experiment with custom settings.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple
import copy
import json


class ConfigError(RuntimeError):
    """Raised when the configuration file is missing or invalid."""


@dataclass(frozen=True)
class DemoConfig:
    raw: Dict[str, Any]

    @property
    def seed(self) -> int:
        value = int(self.raw.get("seed", 0))
        if value < 0:
            raise ConfigError("Seed must be a non-negative integer.")
        return value

    def require_section(self, key: str) -> Dict[str, Any]:
        if key not in self.raw or not isinstance(self.raw[key], dict):
            raise ConfigError(f"Configuration section '{key}' is required.")
        return self.raw[key]

    @property
    def simulation(self) -> Dict[str, Any]:
        section = self.require_section("simulation")
        if section.get("total_steps", 0) <= 0:
            raise ConfigError("simulation.total_steps must be positive.")
        return section

    @property
    def economics(self) -> Dict[str, Any]:
        section = self.require_section("economics")
        max_budget = float(section.get("max_budget", 0.0))
        if max_budget <= 0:
            raise ConfigError("economics.max_budget must be positive.")
        return section

    @property
    def hgm(self) -> Dict[str, Any]:
        section = self.require_section("hgm")
        if section.get("tau", 0) <= 0:
            raise ConfigError("hgm.tau must be positive.")
        if section.get("alpha", 0) <= 0:
            raise ConfigError("hgm.alpha must be positive.")
        return section

    @property
    def thermostat(self) -> Dict[str, Any]:
        return self.require_section("thermostat")

    @property
    def sentinel(self) -> Dict[str, Any]:
        return self.require_section("sentinel")

    @property
    def baseline(self) -> Dict[str, Any]:
        return self.require_section("baseline")

    @property
    def owner_controls(self) -> Dict[str, Any]:
        section = self.raw.get("owner_controls")
        if section is None:
            return {}
        if not isinstance(section, dict):
            raise ConfigError("Configuration section 'owner_controls' must be a mapping if provided.")
        return section


def _apply_override(payload: Dict[str, Any], key: str, value: Any) -> None:
    parts = key.split(".") if key else []
    if not parts:
        raise ConfigError("Override keys must not be empty.")
    cursor: Dict[str, Any] = payload
    for part in parts[:-1]:
        existing = cursor.get(part)
        if existing is None or not isinstance(existing, dict):
            existing = {}
            cursor[part] = existing
        cursor = existing
    cursor[parts[-1]] = value


def _apply_overrides(payload: Dict[str, Any], overrides: Iterable[Tuple[str, Any]]) -> Dict[str, Any]:
    updated = copy.deepcopy(payload)
    for key, value in overrides:
        _apply_override(updated, key, value)
    return updated


def load_config(path: Path, overrides: Iterable[Tuple[str, Any]] | None = None) -> DemoConfig:
    """Load a :class:`DemoConfig` from ``path``.

    Args:
        path: Path to the JSON configuration file.

    Returns:
        An immutable :class:`DemoConfig` wrapper that performs lightweight
        validation and exposes convenience accessors.
    """
    if not path.exists():
        raise ConfigError(f"Configuration file '{path}' does not exist.")

    try:
        raw_config = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Failed to parse configuration: {exc}") from exc

    if overrides:
        raw_config = _apply_overrides(raw_config, overrides)

    return DemoConfig(raw=raw_config)


__all__ = ["ConfigError", "DemoConfig", "load_config"]
