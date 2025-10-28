from __future__ import annotations

from pathlib import Path

import pytest

from agi_alpha_node.config import ConfigError, load_config


def test_load_config_success(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(Path("demo/AGI-Alpha-Node-v0/config/operator.example.yaml").read_text())
    config = load_config(config_path)
    assert config.operator.ens_domain == "demo.alpha.node.agi.eth"
    assert config.network.chain_id == 1
    assert config.staking.minimum_stake == 10000.0


def test_load_config_missing(tmp_path: Path) -> None:
    with pytest.raises(ConfigError):
        load_config(tmp_path / "missing.yaml")


def test_load_config_invalid(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        Path("demo/AGI-Alpha-Node-v0/config/operator.example.yaml").read_text().replace(
            "0x1111111111111111111111111111111111111111", "invalid"
        )
    )
    with pytest.raises(ConfigError):
        load_config(config_path)
