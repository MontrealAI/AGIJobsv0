from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any, Dict

import yaml


@dataclass
class AZRConfig:
    raw: Dict[str, Any]

    @property
    def iterations(self) -> int:
        return int(self.raw["azr"].get("iterations", 50))

    @property
    def tasks_per_iteration(self) -> int:
        return int(self.raw["azr"].get("tasks_per_iteration", 5))

    @property
    def random_seed(self) -> int:
        return int(self.raw["azr"].get("random_seed", 0))

    @property
    def proposer(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("proposer", {}))

    @property
    def solver(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("solver", {}))

    @property
    def buffers(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("buffers", {}))

    @property
    def rewards(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("rewards", {}))

    @property
    def market(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("market", {}))

    @property
    def guardrails(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("guardrails", {}))

    @property
    def telemetry(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("telemetry", {}))

    def as_json(self) -> str:
        return json.dumps(self.raw, indent=2)


def load_config(path: str | pathlib.Path | None = None) -> AZRConfig:
    if path is None:
        path = pathlib.Path(__file__).resolve().parent / "config" / "default_config.yaml"
    else:
        path = pathlib.Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, dict) or "azr" not in raw:
        raise ValueError("Invalid AZR configuration: missing 'azr' root key")
    return AZRConfig(raw=raw)


__all__ = ["AZRConfig", "load_config"]
