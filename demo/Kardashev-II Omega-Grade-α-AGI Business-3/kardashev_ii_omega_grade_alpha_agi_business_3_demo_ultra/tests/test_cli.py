"""CLI contract tests for the ultra-grade demo wrapper."""

from __future__ import annotations

from argparse import Namespace

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.cli import (
    _apply_launch_overrides,
    _DEFAULT_CONFIG,
    build_parser,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.config import (
    load_ultra_config,
)


def test_launch_parser_defaults_are_demo_friendly() -> None:
    parser = build_parser()
    args = parser.parse_args(["launch"])

    assert args.cycles == 10
    assert args.config == _DEFAULT_CONFIG


def test_apply_launch_overrides_sets_cycle_limit() -> None:
    parser = build_parser()
    args: Namespace = parser.parse_args(["launch", "--cycles", "4"])
    config = load_ultra_config(args.config)
    config.orchestrator.max_cycles = 0

    updated = _apply_launch_overrides(config, args)

    assert updated.orchestrator.max_cycles == 4
