"""Adaptive thermostat controlling the HGM orchestrator."""
from __future__ import annotations

import asyncio
import logging
from collections import deque
from dataclasses import dataclass, replace
from typing import AsyncIterable, Deque, Dict, Optional

from hgm_core.config import EngineConfig

from orchestrator.workflows.hgm import HGMOrchestrationWorkflow

from .metrics import MetricSample

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class ThermostatConfig:
    """Configuration parameters for :class:`ThermostatController`."""

    target_roi: float = 2.0
    lower_margin: float = 0.1
    upper_margin: float = 0.15
    roi_window: int = 12
    widening_step: float = 0.05
    min_widening_alpha: float = 0.25
    max_widening_alpha: float = 1.5
    thompson_step: float = 0.1
    min_thompson_prior: float = 0.25
    max_thompson_prior: float = 3.0
    cooldown_steps: int = 4

    def __post_init__(self) -> None:
        if self.roi_window <= 0:
            raise ValueError("roi_window must be positive")
        if not (0 < self.lower_margin < 1):
            raise ValueError("lower_margin must be between 0 and 1")
        if not (0 < self.upper_margin < 1):
            raise ValueError("upper_margin must be between 0 and 1")
        if self.target_roi <= 0:
            raise ValueError("target_roi must be positive")
        if self.cooldown_steps < 0:
            raise ValueError("cooldown_steps cannot be negative")


@dataclass(frozen=True, slots=True)
class ThermostatAdjustment:
    """Represents a thermostat driven change to the HGM parameters."""

    reason: str
    average_roi: float
    parameters: Dict[str, tuple[float, float]]
    sample: MetricSample


class ThermostatController:
    """Feedback controller that consumes ROI metrics and tunes HGM knobs."""

    def __init__(
        self,
        workflow: HGMOrchestrationWorkflow,
        config: ThermostatConfig,
        *,
        metrics_stream: AsyncIterable[MetricSample] | None = None,
        apply_updates: bool = True,
        logger: logging.Logger | None = None,
    ) -> None:
        self._workflow = workflow
        self._config = config
        self._metrics_stream = metrics_stream
        self._apply_updates = apply_updates
        self._logger = logger or LOGGER
        self._roi_history: Deque[float] = deque(maxlen=config.roi_window)
        self._lock = asyncio.Lock()
        self._cooldown = 0
        self._config_snapshot: EngineConfig | None = None
        self._task: asyncio.Task[None] | None = None

    async def initialize(self) -> EngineConfig:
        """Initialise the controller by capturing the current engine config."""

        async with self._lock:
            if self._config_snapshot is None:
                snapshot = await self._workflow.engine_config()
                self._config_snapshot = snapshot
            assert self._config_snapshot is not None
            return replace(self._config_snapshot)

    async def start(self) -> None:
        """Start consuming metrics from the configured stream."""

        if self._metrics_stream is None:
            raise RuntimeError("No metrics stream configured")
        if self._task is not None:
            raise RuntimeError("ThermostatController already running")

        await self.initialize()
        self._task = asyncio.create_task(self._consume())

    async def wait(self) -> None:
        """Block until the background consumer task finishes."""

        task = self._task
        if task is not None:
            await asyncio.shield(task)

    async def stop(self) -> None:
        """Cancel the background consumer task if it is running."""

        task = self._task
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:  # pragma: no cover - cancellation path
            pass
        finally:
            self._task = None

    async def ingest(self, sample: MetricSample) -> Optional[ThermostatAdjustment]:
        """Process a metrics sample and update parameters when necessary."""

        await self.initialize()
        adjustment: Optional[ThermostatAdjustment] = None

        async with self._lock:
            self._roi_history.append(sample.roi)
            if len(self._roi_history) < self._roi_history.maxlen:
                if self._cooldown > 0:
                    self._cooldown -= 1
                return None

            avg_roi = sum(self._roi_history) / len(self._roi_history)
            lower_bound = self._config.target_roi * (1 - self._config.lower_margin)
            upper_bound = self._config.target_roi * (1 + self._config.upper_margin)

            direction: Optional[str]
            if avg_roi < lower_bound:
                direction = "roi_dip"
            elif avg_roi > upper_bound:
                direction = "roi_surge"
            else:
                direction = None

            if direction is None:
                if self._cooldown > 0:
                    self._cooldown -= 1
                return None
            if self._cooldown > 0:
                self._cooldown -= 1
                return None

            assert self._config_snapshot is not None
            current = self._config_snapshot
            updates: Dict[str, float] = {}

            if direction == "roi_dip":
                widened = min(
                    self._config.max_widening_alpha,
                    current.widening_alpha + self._config.widening_step,
                )
                prior = min(
                    self._config.max_thompson_prior,
                    current.thompson_prior + self._config.thompson_step,
                )
            else:
                widened = max(
                    self._config.min_widening_alpha,
                    current.widening_alpha - self._config.widening_step,
                )
                prior = max(
                    self._config.min_thompson_prior,
                    current.thompson_prior - self._config.thompson_step,
                )

            if widened != current.widening_alpha:
                updates["widening_alpha"] = widened
            if prior != current.thompson_prior:
                updates["thompson_prior"] = prior

            if not updates:
                self._cooldown = self._config.cooldown_steps
                return None

            new_config = replace(current, **updates)
            self._config_snapshot = new_config
            self._cooldown = self._config.cooldown_steps

            parameters = {
                key: (getattr(current, key), value)
                for key, value in updates.items()
            }
            adjustment = ThermostatAdjustment(
                reason=direction,
                average_roi=avg_roi,
                parameters=parameters,
                sample=sample,
            )

        if adjustment is not None:
            if self._apply_updates:
                await self._workflow.update_engine_parameters(**{k: v[1] for k, v in adjustment.parameters.items()})
            self._logger.info(
                "Thermostat adjustment %s avg_roi=%.4f parameters=%s",
                adjustment.reason,
                adjustment.average_roi,
                {k: {"from": f"{v[0]:.4f}", "to": f"{v[1]:.4f}"} for k, v in adjustment.parameters.items()},
            )
        return adjustment

    async def run(self) -> None:
        """Continuously consume metrics from the configured stream."""

        if self._metrics_stream is None:
            raise RuntimeError("No metrics stream configured")
        await self.initialize()
        async for sample in self._metrics_stream:
            await self.ingest(sample)

    async def _consume(self) -> None:
        try:
            await self.run()
        finally:
            self._task = None


__all__ = [
    "ThermostatAdjustment",
    "ThermostatConfig",
    "ThermostatController",
]
