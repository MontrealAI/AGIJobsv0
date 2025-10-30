"""Tests for configuration loading utilities."""

from __future__ import annotations

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from hgm_v0_demo.config_loader import load_config


def _config_path() -> Path:
    return Path("demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json")


def test_load_config_override_existing_field() -> None:
    config = load_config(_config_path(), overrides=[("simulation.total_steps", 64)])
    assert config.simulation["total_steps"] == 64


def test_load_config_override_nested_creation() -> None:
    override_value = [0.0, 0.0]
    config = load_config(
        _config_path(),
        overrides=[("simulation.evaluation_latency", override_value)],
    )
    assert config.simulation["evaluation_latency"] == override_value


def test_owner_controls_section_present() -> None:
    config = load_config(_config_path())
    owner_controls = config.owner_controls
    assert isinstance(owner_controls, dict)
    assert owner_controls["pause_all"] is False
