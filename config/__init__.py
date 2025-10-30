"""Profile-aware configuration loader utilities."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

CONFIG_ROOT = Path(__file__).resolve().parent
"""Root directory for repository configuration files."""

PROFILE_ENV_VAR = "AGIALPHA_PROFILE"
"""Environment variable controlling the active configuration profile."""

_DEFAULT_PROFILE = "agialpha"
_DISABLED_PROFILE_VALUES = {"", "0", "false", "off", "no", "none", "null"}
_ENABLED_PROFILE_VALUES = {"1", "true", "yes", "on", "enable", "enabled"}


def _copy(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _copy(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_copy(item) for item in value]
    return value


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    result: Dict[str, Any] = {key: _copy(value) for key, value in base.items()}
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = _copy(value)
    return result


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _normalise_profile(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip().lower()
    if candidate in _DISABLED_PROFILE_VALUES:
        return None
    if candidate in _ENABLED_PROFILE_VALUES:
        return _DEFAULT_PROFILE
    return candidate or None


def _candidate_paths(name: str, *, network: str | None = None) -> Iterable[Path]:
    if network:
        yield CONFIG_ROOT / f"{name}.{network}.json"
    yield CONFIG_ROOT / f"{name}.json"


def _profile_candidate_paths(profile: Path, name: str, *, network: str | None = None) -> Iterable[Path]:
    if network:
        yield profile / f"{name}.{network}.json"
    yield profile / f"{name}.json"


def resolve_profile(profile: str | None = None) -> Path | None:
    """Resolve the active profile directory if one is enabled."""

    raw = profile if profile is not None else os.getenv(PROFILE_ENV_VAR)
    slug = _normalise_profile(raw)
    if not slug:
        return None
    candidate = CONFIG_ROOT / slug
    if candidate.is_dir():
        return candidate
    return None


def load_config_with_sources(
    name: str,
    *,
    network: str | None = None,
    profile: str | None = None,
) -> Tuple[Dict[str, Any], Tuple[Path, ...]]:
    """Load configuration merging the active profile overrides."""

    config: Dict[str, Any] = {}
    sources: list[Path] = []

    for candidate in _candidate_paths(name, network=network):
        if candidate.exists():
            config = _load_json(candidate)
            sources.append(candidate)
            break

    profile_dir = resolve_profile(profile)
    if profile_dir is not None:
        for candidate in _profile_candidate_paths(profile_dir, name, network=network):
            if candidate.exists():
                override = _load_json(candidate)
                config = _deep_merge(config, override) if config else _copy(override)
                sources.append(candidate)
                break

    return config, tuple(sources)


def load_config(
    name: str,
    *,
    network: str | None = None,
    profile: str | None = None,
) -> Dict[str, Any]:
    """Load configuration for ``name`` with profile-aware overrides."""

    config, _ = load_config_with_sources(name, network=network, profile=profile)
    return config


__all__ = [
    "CONFIG_ROOT",
    "PROFILE_ENV_VAR",
    "load_config",
    "load_config_with_sources",
    "resolve_profile",
]
