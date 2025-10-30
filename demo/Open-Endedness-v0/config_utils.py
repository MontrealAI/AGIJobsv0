"""Owner-friendly configuration helpers for the OMNI open-endedness demo."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, MutableMapping

import yaml

CONFIG_ROOT = Path(__file__).resolve().parent / "config"
DEFAULT_CONFIG_PATH = CONFIG_ROOT / "omni_agialpha_seed.yaml"


@dataclass
class LoadedConfig:
    """Wrapper that keeps track of the resolved configuration state."""

    path: Path
    raw: Dict[str, Any]
    cohort: str | None = None

    @property
    def resolved(self) -> Dict[str, Any]:
        if not hasattr(self, "_resolved_cache"):
            base = copy.deepcopy(self.raw)
            if self.cohort:
                base = apply_cohort_overrides(base, self.cohort)
            self._resolved_cache = base  # type: ignore[attr-defined]
        return copy.deepcopy(self._resolved_cache)  # type: ignore[attr-defined]


def load_config(path: str | Path | None = None, cohort: str | None = None) -> LoadedConfig:
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(f"Config path {config_path} not found")
    with config_path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise ValueError("Configuration root must be a mapping")
    loaded = LoadedConfig(path=config_path, raw=data, cohort=cohort)
    return loaded


def save_config(config: LoadedConfig) -> None:
    with config.path.open("w", encoding="utf-8") as fh:
        yaml.safe_dump(config.raw, fh, sort_keys=False)


def parse_scalar(value: str) -> Any:
    lowered = value.strip().lower()
    if lowered in {"true", "yes", "on"}:
        return True
    if lowered in {"false", "no", "off"}:
        return False
    try:
        if lowered.startswith(("[", "{")):
            return json.loads(value)
    except json.JSONDecodeError:
        pass
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


def _resolve_parent(config: MutableMapping[str, Any], path: str) -> tuple[MutableMapping[str, Any], str]:
    segments = path.split(".")
    if not segments:
        raise ValueError("Empty path")
    parent = config
    for segment in segments[:-1]:
        if segment not in parent or not isinstance(parent[segment], MutableMapping):
            parent[segment] = {}
        parent = parent[segment]
    return parent, segments[-1]


def set_config_value(config: MutableMapping[str, Any], path: str, value: Any) -> None:
    parent, key = _resolve_parent(config, path)
    parent[key] = value


def remove_config_value(config: MutableMapping[str, Any], path: str) -> None:
    parent, key = _resolve_parent(config, path)
    if key in parent:
        del parent[key]


def owner_disabled_tasks(config: Mapping[str, Any]) -> list[str]:
    owner = config.get("owner", {})
    tasks = owner.get("disabled_tasks", [])
    return list(tasks) if isinstance(tasks, Iterable) else []


def set_owner_disabled_tasks(config: MutableMapping[str, Any], tasks: Iterable[str]) -> None:
    owner = config.setdefault("owner", {})
    owner["disabled_tasks"] = sorted(set(tasks))


def set_owner_paused(config: MutableMapping[str, Any], paused: bool) -> None:
    owner = config.setdefault("owner", {})
    owner["paused"] = paused


def apply_cohort_overrides(config: Dict[str, Any], cohort: str) -> Dict[str, Any]:
    overrides_section = config.get("cohorts", {})
    cohort_data = overrides_section.get(cohort)
    if not cohort_data:
        return config
    overrides: Mapping[str, Any]
    if isinstance(cohort_data, Mapping) and "overrides" in cohort_data:
        overrides = cohort_data["overrides"]  # type: ignore[assignment]
    else:
        overrides = cohort_data  # type: ignore[assignment]
    if not isinstance(overrides, Mapping):
        raise ValueError(f"Cohort overrides for {cohort} must be a mapping")
    updated = copy.deepcopy(config)
    for path, value in overrides.items():
        if not isinstance(path, str):
            raise ValueError("Override keys must be dot-path strings")
        set_config_value(updated, path, value)
    return updated


def summarise(config: Mapping[str, Any]) -> Dict[str, Any]:
    curriculum = config.get("curriculum", {})
    thermostat = config.get("thermostat", {})
    sentinel = config.get("sentinel", {})
    owner = config.get("owner", {})
    return {
        "curriculum": {
            "fast_beta": curriculum.get("fast_beta"),
            "slow_beta": curriculum.get("slow_beta"),
            "min_probability": curriculum.get("min_probability"),
            "moi": curriculum.get("moi"),
        },
        "thermostat": thermostat,
        "sentinel": sentinel,
        "owner": owner,
    }


__all__ = [
    "DEFAULT_CONFIG_PATH",
    "LoadedConfig",
    "apply_cohort_overrides",
    "load_config",
    "owner_disabled_tasks",
    "parse_scalar",
    "remove_config_value",
    "save_config",
    "set_config_value",
    "set_owner_disabled_tasks",
    "set_owner_paused",
    "summarise",
]
