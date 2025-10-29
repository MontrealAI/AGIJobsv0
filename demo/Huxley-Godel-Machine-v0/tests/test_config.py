from __future__ import annotations

import pytest

from hgm_demo.config import DEFAULT_CONFIG_PATH, load_config_with_overrides


def test_override_scalar_value() -> None:
    config = load_config_with_overrides(DEFAULT_CONFIG_PATH, ["engine.tau=3.2"])
    assert config.engine["tau"] == pytest.approx(3.2)


def test_override_list_value() -> None:
    config = load_config_with_overrides(
        DEFAULT_CONFIG_PATH,
        ["simulation.evaluation_latency=[0.0, 0.0]"],
    )
    assert config.simulation["evaluation_latency"] == [0.0, 0.0]


def test_override_invalid_key_raises() -> None:
    with pytest.raises(ValueError):
        load_config_with_overrides(DEFAULT_CONFIG_PATH, ["engine.unknown=1"])
