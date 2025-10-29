"""Configuration helpers for the Huxley–Gödel Machine demo."""
from __future__ import annotations

import ast
import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, MutableMapping, Sequence, Tuple


@dataclass(frozen=True)
class Config:
    """Strongly typed view over the JSON configuration."""

    raw: Dict[str, Any]

    @property
    def initial_agent(self) -> Dict[str, Any]:
        return self.raw["initial_agent"]

    @property
    def economic_model(self) -> Dict[str, float]:
        return self.raw["economic_model"]

    @property
    def engine(self) -> Dict[str, Any]:
        return self.raw["engine"]

    @property
    def thermostat(self) -> Dict[str, Any]:
        return self.raw["thermostat"]

    @property
    def sentinel(self) -> Dict[str, Any]:
        return self.raw["sentinel"]

    @property
    def simulation(self) -> Dict[str, Any]:
        return self.raw["simulation"]

    @property
    def baseline(self) -> Dict[str, Any]:
        return self.raw["baseline"]

    def latency_range(self, key: str) -> Tuple[float, float]:
        low, high = self.simulation[key]
        return float(low), float(high)


def _load_raw_config(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def load_config(path: Path) -> Config:
    """Load the demo configuration from ``path``."""
    return Config(_load_raw_config(path))


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "hgm_config.json"


def load_default_config() -> Config:
    return load_config(DEFAULT_CONFIG_PATH)


def _parse_override_value(value: str) -> Any:
    try:
        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        lowered = value.strip().lower()
        if lowered in {"true", "false"}:
            return lowered == "true"
        return value


def _coerce_type(template: Any, new_value: Any) -> Any:
    if isinstance(template, bool):
        if isinstance(new_value, str):
            return new_value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(new_value)
    if isinstance(template, int) and not isinstance(template, bool):
        if isinstance(new_value, bool):
            return int(new_value)
        if isinstance(new_value, (int, float)):
            return int(new_value)
        try:
            return int(str(new_value))
        except ValueError as exc:
            raise ValueError(f"Cannot coerce value {new_value!r} to int") from exc
    if isinstance(template, float):
        if isinstance(new_value, (int, float)):
            return float(new_value)
        try:
            return float(str(new_value))
        except ValueError as exc:
            raise ValueError(f"Cannot coerce value {new_value!r} to float") from exc
    return new_value


def _apply_override(data: MutableMapping[str, Any], override: str) -> None:
    if "=" not in override:
        raise ValueError(f"Invalid override '{override}'. Expected format section.key=value")
    path_str, raw_value = override.split("=", 1)
    keys = [part.strip() for part in path_str.split(".") if part.strip()]
    if not keys:
        raise ValueError(f"Invalid override path in '{override}'")
    cursor: MutableMapping[str, Any] = data
    for key in keys[:-1]:
        value = cursor.get(key)
        if not isinstance(value, MutableMapping):
            raise ValueError(f"Unknown configuration path '{path_str}'")
        cursor = value
    leaf = keys[-1]
    if leaf not in cursor:
        raise ValueError(f"Unknown configuration key '{path_str}'")
    parsed_value = _parse_override_value(raw_value)
    cursor[leaf] = _coerce_type(cursor[leaf], parsed_value)


def load_config_with_overrides(path: Path | None, overrides: Sequence[str]) -> Config:
    """Load configuration and apply user-provided overrides."""

    raw = copy.deepcopy(_load_raw_config(path or DEFAULT_CONFIG_PATH))
    for override in overrides:
        _apply_override(raw, override)
    return Config(raw)
