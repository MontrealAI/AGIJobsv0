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
import math


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


def _resolve_path(path: Path) -> Path:
    """Return an absolute path, falling back to the repo root when needed.

    The demo is often invoked from ``demo/`` rather than the repository root,
    which makes relative paths like ``demo/Huxley-Godel-Machine-v0/config``
    appear missing. Anchoring lookups to the project root keeps the experience
    robust regardless of the current working directory.
    """

    if path.is_absolute() or path.exists():
        return path

    repo_root = Path(__file__).resolve().parents[4]
    candidate = repo_root / path
    return candidate if candidate.exists() else path


def load_config(path: Path, overrides: Iterable[Tuple[str, Any]] | None = None) -> DemoConfig:
    """Load a :class:`DemoConfig` from ``path``.

    Args:
        path: Path to the JSON configuration file.

    Returns:
        An immutable :class:`DemoConfig` wrapper that performs lightweight
        validation and exposes convenience accessors.
    """
    path = _resolve_path(path)

    if not path.exists():
        raise ConfigError(f"Configuration file '{path}' does not exist.")

    try:
        raw_config = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Failed to parse configuration: {exc}") from exc

    if not isinstance(raw_config, dict):
        raise ConfigError("Configuration must be a JSON object.")
    if overrides:
        raw_config = _apply_overrides(raw_config, overrides)

    validate_config(raw_config)
    return DemoConfig(raw=raw_config)


__all__ = ["ConfigError", "DemoConfig", "load_config"]


def validate_config(raw: Any) -> None:
    if not isinstance(raw, dict):
        raise ConfigError("Configuration must be a JSON object.")
    schema = {
        "seed": (0, 2**32 - 1, True),
        "simulation": {"total_steps": (1, 100000, True), "baseline_total_steps": (1, 100000, True), "report_interval": (1, 100000, True), "evaluation_latency": "latency", "expansion_latency": "latency"},
        "economics": {"success_value": (0, 1e9, False), "evaluation_cost": (0.000001, 1e9, False), "expansion_cost": (0.000001, 1e9, False), "max_budget": (0.000001, 1e12, False), "target_roi": (0, 1e9, False), "min_roi": (0, 1e9, False)},
        "hgm": {"tau": (0.05, 10, False), "alpha": (0.2, 5, False), "epsilon": (0.000001, 0.999999, False), "max_agents": (1, 1000, True), "max_expansions": (0, 100000, True), "max_evaluations": (0, 100000, True), "concurrency": {"evaluation": (1, 1000, True), "expansion": (1, 1000, True)}, "quality": {"root": (0, 1, False), "mutation_std": (0, 1, False), "min_quality": (0, 1, False), "max_quality": (0, 1, False)}},
        "thermostat": {"roi_window": (1, 100000, True), "tau_adjustment": (0, 1, False), "alpha_adjustment": (0, 1, False), "concurrency_step": (1, 1000, True), "max_concurrency": (1, 1000, True), "min_concurrency": (1, 1000, True), "roi_upper_margin": (0, 100, False), "roi_lower_margin": (0, 1, False)},
        "sentinel": {"max_failures_per_agent": (1, 100000, True), "roi_recovery_steps": (1, 100000, True), "hard_budget_ratio": (0.000001, 1, False)},
        "baseline": {"mutation_std": (0, 1, False), "quality_floor": (0, 1, False), "quality_ceiling": (0, 1, False)},
        "owner_controls": {"pause_all": "bool", "pause_expansions": "bool", "pause_evaluations": "bool", "max_actions": "cap", "note": "text"},
    }
    def check(value, rules, label):
        if isinstance(rules, dict):
            if not isinstance(value, dict):
                raise ConfigError(f"{label} must be an object.")
            for key, item in value.items():
                if key not in rules:
                    raise ConfigError(f"Unknown configuration key: {label}.{key}")
                check(item, rules[key], f"{label}.{key}")
        elif isinstance(rules, tuple):
            low, high, integer = rules
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high or (integer and not isinstance(value, int)):
                raise ConfigError(f"{label} must be a finite {'integer' if integer else 'number'} in [{low}, {high}].")
        elif rules == "latency":
            values = value if isinstance(value, list) else [value]
            if len(values) not in (1, 2):
                raise ConfigError(f"{label} must contain one or two latency values.")
            for item in values:
                check(item, (0, 100000, False), label)
            if len(values) == 2 and values[0] > values[1]:
                raise ConfigError(f"{label} lower bound exceeds upper bound.")
        elif rules == "bool" and not isinstance(value, bool):
            raise ConfigError(f"{label} must be a JSON boolean.")
        elif rules == "cap" and value is not None:
            check(value, (0, 100000, True), label)
        elif rules == "text" and value is not None and (not isinstance(value, str) or len(value) > 2000):
            raise ConfigError(f"{label} must be text of at most 2000 characters.")
    check(raw, schema, "config")
    config = DemoConfig(raw)
    for section in ("simulation", "economics", "hgm", "thermostat", "sentinel", "baseline"):
        config.require_section(section)
    for section, keys in {"simulation": ("total_steps",), "economics": ("max_budget",), "hgm": ("tau", "alpha")}.items():
        for key in keys:
            if key not in raw[section]:
                raise ConfigError(f"Missing {section}.{key}")
    q = raw["hgm"].get("quality", {})
    if not q.get("min_quality", 0.01) <= q.get("root", 0.5) <= q.get("max_quality", 0.99):
        raise ConfigError("Root quality must lie within ordered quality bounds.")
    b, t = raw["baseline"], raw["thermostat"]
    if b.get("quality_floor", 0.01) > b.get("quality_ceiling", 0.99):
        raise ConfigError("Baseline quality bounds must be ordered.")
    if t.get("min_concurrency", 1) > t.get("max_concurrency", 8):
        raise ConfigError("Thermostat concurrency bounds must be ordered.")
