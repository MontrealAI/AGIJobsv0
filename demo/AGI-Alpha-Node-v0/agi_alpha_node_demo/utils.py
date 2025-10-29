"""Utility helpers for the AGI Alpha Node demo."""

from __future__ import annotations

import json
import logging
import os
import random
import string
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

import yaml

LOGGER = logging.getLogger("agi_alpha_node_demo")


def read_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def write_yaml(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(payload, handle, sort_keys=False)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def random_job_id(prefix: str = "job") -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}-{suffix}"


def dataclass_to_clean_dict(instance: Any) -> Dict[str, Any]:
    return {k: v for k, v in asdict(instance).items() if v is not None}


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}
