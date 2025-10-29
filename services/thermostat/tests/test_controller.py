from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import sys

ROOT = Path(__file__).resolve().parents[2]
HGM_CORE_SRC = ROOT / "packages" / "hgm-core" / "src"
if str(HGM_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(HGM_CORE_SRC))

from hgm_core.config import EngineConfig

from services.thermostat import (
    MetricSample,
    ThermostatAdjustment,
    ThermostatConfig,
    ThermostatController,
)


class DummyWorkflow:
    def __init__(self) -> None:
        self._config = EngineConfig()
        self.calls: list[Dict[str, float]] = []

    async def engine_config(self) -> EngineConfig:
        return replace(self._config)

    async def update_engine_parameters(
        self,
        *,
        widening_alpha: float | None = None,
        min_visitations: int | None = None,
        thompson_prior: float | None = None,
    ) -> EngineConfig:
        if widening_alpha is not None:
            self._config.widening_alpha = widening_alpha
        if min_visitations is not None:
            self._config.min_visitations = min_visitations
        if thompson_prior is not None:
            self._config.thompson_prior = thompson_prior
        payload: Dict[str, float] = {}
        if widening_alpha is not None:
            payload["widening_alpha"] = widening_alpha
        if min_visitations is not None:
            payload["min_visitations"] = min_visitations
        if thompson_prior is not None:
            payload["thompson_prior"] = thompson_prior
        if payload:
            self.calls.append(payload)
        return replace(self._config)


def make_sample(roi: float) -> MetricSample:
    return MetricSample(
        timestamp=datetime.now(tz=timezone.utc),
        roi=roi,
        gmv=roi * 100.0,
        cost=100.0,
    )


def test_controller_increases_exploration_on_roi_dip() -> None:
    workflow = DummyWorkflow()
    config = ThermostatConfig(
        target_roi=1.5,
        lower_margin=0.1,
        upper_margin=0.2,
        roi_window=3,
        widening_step=0.2,
        min_widening_alpha=0.1,
        max_widening_alpha=1.0,
        thompson_step=0.5,
        min_thompson_prior=0.1,
        max_thompson_prior=2.0,
        cooldown_steps=1,
    )
    controller = ThermostatController(workflow, config)

    async def scenario() -> ThermostatAdjustment | None:
        adjustment = None
        await controller.initialize()
        for roi in (0.8, 0.7, 0.75):
            adjustment = await controller.ingest(make_sample(roi))
        return adjustment

    adjustment = asyncio.run(scenario())

    assert adjustment is not None
    assert adjustment.reason == "roi_dip"
    assert adjustment.parameters["widening_alpha"][1] > adjustment.parameters["widening_alpha"][0]
    assert adjustment.parameters["thompson_prior"][1] > adjustment.parameters["thompson_prior"][0]
    assert workflow.calls, "Expected the workflow to receive updates"


def test_controller_decreases_exploration_on_roi_surge() -> None:
    workflow = DummyWorkflow()
    workflow._config.widening_alpha = 1.0
    workflow._config.thompson_prior = 2.0
    config = ThermostatConfig(
        target_roi=1.5,
        lower_margin=0.1,
        upper_margin=0.2,
        roi_window=4,
        widening_step=0.1,
        min_widening_alpha=0.2,
        max_widening_alpha=1.5,
        thompson_step=0.2,
        min_thompson_prior=0.5,
        max_thompson_prior=3.0,
        cooldown_steps=1,
    )
    controller = ThermostatController(workflow, config)

    async def scenario() -> ThermostatAdjustment | None:
        adjustment = None
        await controller.initialize()
        for roi in (2.2, 2.3, 2.4, 2.1):
            adjustment = await controller.ingest(make_sample(roi))
        return adjustment

    adjustment = asyncio.run(scenario())

    assert adjustment is not None
    assert adjustment.reason == "roi_surge"
    assert adjustment.parameters["widening_alpha"][1] < adjustment.parameters["widening_alpha"][0]
    assert adjustment.parameters["thompson_prior"][1] < adjustment.parameters["thompson_prior"][0]
    assert workflow.calls, "Expected the workflow to receive updates"


def test_controller_honours_cooldown_before_next_adjustment() -> None:
    workflow = DummyWorkflow()
    config = ThermostatConfig(
        target_roi=1.5,
        lower_margin=0.05,
        upper_margin=0.2,
        roi_window=3,
        widening_step=0.1,
        min_widening_alpha=0.2,
        max_widening_alpha=1.2,
        thompson_step=0.2,
        min_thompson_prior=0.5,
        max_thompson_prior=3.0,
        cooldown_steps=2,
    )
    controller = ThermostatController(workflow, config)

    async def scenario() -> tuple[ThermostatAdjustment | None, ThermostatAdjustment | None, ThermostatAdjustment | None, ThermostatAdjustment | None]:
        await controller.initialize()
        first = None
        for roi in (0.9, 0.85, 0.8):
            first = await controller.ingest(make_sample(roi))
        second = await controller.ingest(make_sample(0.82))
        third = await controller.ingest(make_sample(0.81))
        fourth = await controller.ingest(make_sample(0.78))
        return first, second, third, fourth

    first, second, third, fourth = asyncio.run(scenario())
    assert first is not None
    assert second is None
    assert third is None
    assert fourth is not None
    assert len(workflow.calls) == 2


def test_controller_dry_run_skips_workflow_updates() -> None:
    workflow = DummyWorkflow()
    config = ThermostatConfig(
        target_roi=1.2,
        lower_margin=0.05,
        upper_margin=0.2,
        roi_window=3,
        widening_step=0.1,
        min_widening_alpha=0.2,
        max_widening_alpha=1.2,
        thompson_step=0.2,
        min_thompson_prior=0.5,
        max_thompson_prior=3.0,
        cooldown_steps=0,
    )
    controller = ThermostatController(workflow, config, apply_updates=False)

    async def scenario() -> ThermostatAdjustment | None:
        adjustment = None
        await controller.initialize()
        for roi in (0.9, 0.88, 0.86):
            adjustment = await controller.ingest(make_sample(roi))
        return adjustment

    adjustment = asyncio.run(scenario())

    assert adjustment is not None
    assert not workflow.calls
