from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.cli import build_config, parse_args


def test_default_cycles_are_finite():
    args = parse_args([])
    config = build_config(args)

    assert config.max_cycles == 5


def test_zero_cycles_runs_indefinitely():
    args = parse_args(["--cycles", "0"])
    config = build_config(args)

    assert config.max_cycles is None
