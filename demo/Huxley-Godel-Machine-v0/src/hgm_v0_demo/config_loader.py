"""Configuration utilities for the Huxley–Gödel Machine demo.

The loader intentionally keeps dependencies minimal so that a non-technical
user can run the demo with the standard Python library only. Configuration
values are validated defensively to ensure robust behaviour even when users
experiment with custom settings.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict
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


def load_config(path: Path) -> DemoConfig:
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

    return DemoConfig(raw=raw_config)


__all__ = ["ConfigError", "DemoConfig", "load_config"]
