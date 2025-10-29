"""Tests for orchestrator scheduling helpers."""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from hgm_v0_demo.engine import HGMEngine
from hgm_v0_demo.orchestrator import HGMDemoOrchestrator
from hgm_v0_demo.sentinel import Sentinel
from hgm_v0_demo.thermostat import Thermostat, ThermostatConfig


def _build_engine() -> HGMEngine:
    engine = HGMEngine(
        tau=1.0,
        alpha=1.0,
        epsilon=0.1,
        max_agents=8,
        max_expansions=8,
        max_evaluations=8,
        rng=random.Random(0),
    )
    engine.register_root(0.5)
    return engine


def _build_thermostat(engine: HGMEngine) -> Thermostat:
    return Thermostat(
        engine=engine,
        config=ThermostatConfig(
            target_roi=2.0,
            roi_window=3,
            tau_adjustment=0.1,
            alpha_adjustment=0.1,
            concurrency_step=1,
            max_concurrency=4,
            min_concurrency=1,
            roi_upper_margin=0.2,
            roi_lower_margin=0.1,
        ),
    )


def _build_sentinel(engine: HGMEngine) -> Sentinel:
    return Sentinel(
        engine=engine,
        max_budget=1_000.0,
        min_roi=1.0,
        hard_budget_ratio=0.9,
        max_failures_per_agent=10,
        roi_recovery_steps=2,
    )


def test_latency_overrides_allow_zero_duration() -> None:
    engine = _build_engine()
    thermostat = _build_thermostat(engine)
    sentinel = _build_sentinel(engine)
    orchestrator = HGMDemoOrchestrator(
        engine=engine,
        thermostat=thermostat,
        sentinel=sentinel,
        rng=random.Random(1),
        success_value=100.0,
        evaluation_cost=10.0,
        expansion_cost=20.0,
        mutation_std=0.1,
        quality_bounds=(0.0, 1.0),
        evaluation_latency_range=(0.0, 0.0),
        expansion_latency_range=(1.0, 1.0),
    )

    assert orchestrator._evaluation_duration() == 0
    assert orchestrator._expansion_duration() == 1
