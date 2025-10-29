"""Configuration helpers for the Huxley–Gödel Machine demo."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple


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


def load_config(path: Path) -> Config:
    """Load the demo configuration from ``path``."""
    data = json.loads(path.read_text())
    return Config(data)


DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "hgm_config.json"


def load_default_config() -> Config:
    return load_config(DEFAULT_CONFIG_PATH)
