from __future__ import annotations

import pytest

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.cli import (
    DEFAULT_CONFIG_PATH,
    build_config,
    parse_args,
)


def test_default_cycles_are_finite():
    args = parse_args([])
    config = build_config(args)

    assert config.max_cycles == 5


def test_zero_cycles_runs_indefinitely():
    args = parse_args(["--cycles", "0"])
    config = build_config(args)

    assert config.max_cycles is None


def test_default_config_paths_resolve_from_module_root() -> None:
    args = parse_args([])
    config = build_config(args)

    module_root = DEFAULT_CONFIG_PATH.parent.parent

    assert config.status_output_path == module_root / "logs/omega-status.jsonl"
    assert config.audit_log_path == module_root / "logs/omega-audit.jsonl"
    assert config.energy_oracle_path == module_root / "logs/omega-energy-oracle.jsonl"
    assert config.checkpoint_path == module_root / "checkpoint.json"


@pytest.mark.parametrize(
    "flag,value,message",
    [
        ("--cycles", "-1", "non-negative"),
        ("--heartbeat-interval", "0", "positive"),
    ],
)
def test_invalid_numeric_inputs_raise(flag: str, value: str, message: str) -> None:
    args = parse_args([flag, value])

    with pytest.raises(ValueError, match=message):
        build_config(args)
