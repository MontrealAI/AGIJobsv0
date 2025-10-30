from __future__ import annotations

from pathlib import Path

import pytest

from hgm_demo.config import ConfigError, load_config


def test_load_config_success(tmp_path: Path) -> None:
    config_path = Path("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    config = load_config(config_path)
    assert config.tau > 0
    assert config.concurrency_bounds[0] <= config.concurrency_bounds[1]


def test_load_config_invalid(tmp_path: Path) -> None:
    bad_file = tmp_path / "invalid.yml"
    bad_file.write_text("tau: -1\n", encoding="utf-8")
    with pytest.raises(ConfigError):
        load_config(bad_file)
