"""Thermostat controller for economic governance.

The original demo shipped with a minimalist thermostat placeholder.  The
simulation, notebooks and tests expect a richer controller that can react to
economic signals, adjust OMNI sampling cadence, and surface operator-visible
events.  This module now exposes a concrete EconomicSnapshot payload and a
ThermostatController that tunes the model-of-interestingness (MoI) parameters
in place while guarding against runaway costs—mirroring how a Kardashev-II
governor would redistribute energy to stabilise sentient-aligned production.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional

# The demo is executed as a loose script (the folder name includes hyphens), so
# relative imports fail unless we provide a graceful fallback. Mirror the
# sentinel module's approach so the thermostat works both when imported in
# tests and when the CLI runs directly from the demo directory.
try:  # pragma: no cover - exercised during CLI execution
    from .omni_engine import OmniCurriculumEngine
except ImportError:  # pragma: no cover - executed when run as a script
    from omni_engine import OmniCurriculumEngine  # type: ignore[import-not-found]


@dataclass
class ThermostatConfig:
    """Configuration helper for the thermostat controller."""

    roi_target: float
    roi_floor: float
    min_moi_interval: int
    max_moi_interval: int
    smoothing_beta: float = 0.65
    min_boring_weight: float = 1e-3
    max_boring_weight: float = 0.5
    fm_cost_per_call: float = 0.0
    max_daily_fm_cost: float = float("inf")
    epsilon_range: Mapping[str, float] = field(default_factory=lambda: {"min": 0.0, "max": 1.0})
    moi_interval_bounds: Mapping[str, int] = field(default_factory=lambda: {"min": 1, "max": 1})
    adjust_every: int = 1
    gmvs_smoothing_beta: float = 0.65
    cost_smoothing_beta: float = 0.65


@dataclass
class EconomicSnapshot:
    """Minimal set of economic metrics for a single step."""

    conversions: float
    revenue: float
    fm_cost: float
    intervention_cost: float

    @property
    def roi(self) -> float:
        cost = self.fm_cost + self.intervention_cost
        if cost <= 0:
            return float("inf") if self.revenue > 0 else 0.0
        return self.revenue / cost


class ThermostatController:
    """Adjusts OMNI parameters based on economic performance.

    The controller intentionally nudges exploration vs. exploitation by
    manipulating the MoI boring weight (akin to changing a Hamiltonian term)
    and the cadence at which the engine refreshes its MoI prompts.  Smoothing
    keeps the system stable in the face of noisy signals, while explicit event
    logs give operators an auditable trail.
    """

    def __init__(
        self,
        *,
        engine: OmniCurriculumEngine,
        roi_target: Optional[float] = None,
        roi_floor: Optional[float] = None,
        min_moi_interval: Optional[int] = None,
        max_moi_interval: Optional[int] = None,
        smoothing_beta: Optional[float] = None,
        min_boring_weight: Optional[float] = None,
        max_boring_weight: Optional[float] = None,
        config: Optional[ThermostatConfig] = None,
        **_: object,
    ) -> None:
        if config:
            roi_target = roi_target if roi_target is not None else config.roi_target
            roi_floor = roi_floor if roi_floor is not None else config.roi_floor
            min_moi_interval = min_moi_interval if min_moi_interval is not None else config.min_moi_interval
            max_moi_interval = max_moi_interval if max_moi_interval is not None else config.max_moi_interval
            smoothing_beta = smoothing_beta if smoothing_beta is not None else config.smoothing_beta
            min_boring_weight = min_boring_weight if min_boring_weight is not None else config.min_boring_weight
            max_boring_weight = max_boring_weight if max_boring_weight is not None else config.max_boring_weight

        if None in (roi_target, roi_floor, min_moi_interval, max_moi_interval):
            raise ValueError("ThermostatController requires roi and interval bounds")
        if min_moi_interval <= 0 or max_moi_interval < min_moi_interval:
            raise ValueError("Invalid MoI interval bounds")
        self.engine = engine
        self.roi_target = float(roi_target)
        self.roi_floor = float(roi_floor)
        self.min_moi_interval = int(min_moi_interval)
        self.max_moi_interval = int(max_moi_interval)
        self.smoothing_beta = smoothing_beta if smoothing_beta is not None else 0.65
        self.min_boring_weight = min_boring_weight if min_boring_weight is not None else 1e-3
        self.max_boring_weight = max_boring_weight if max_boring_weight is not None else 0.5

        self.events: list[Mapping[str, object]] = []
        self._rolling_roi = 0.0
        self._adjustments = 0
        self._fm_calls_today = 0
        self._gmv_ema = 0.0
        self._cost_ema = 0.0
        self.config = config or ThermostatConfig(
            roi_target=self.roi_target,
            roi_floor=self.roi_floor,
            min_moi_interval=self.min_moi_interval,
            max_moi_interval=self.max_moi_interval,
            smoothing_beta=self.smoothing_beta,
            min_boring_weight=self.min_boring_weight,
            max_boring_weight=self.max_boring_weight,
        )
        self.epsilon_range = dict(self.config.epsilon_range)
        self.moi_interval_bounds = dict(self.config.moi_interval_bounds)
        self.fm_cost_per_call = float(self.config.fm_cost_per_call)
        self.max_daily_fm_cost = float(self.config.max_daily_fm_cost)
        self.gmvs_smoothing_beta = float(self.config.gmvs_smoothing_beta)
        self.cost_smoothing_beta = float(self.config.cost_smoothing_beta)
        self._epsilon = float(self.epsilon_range.get("max", 1.0))
        self.current_interval = max(self.min_moi_interval, (self.min_moi_interval + self.max_moi_interval) // 2)

    # ------------------------------------------------------------------
    @property
    def rolling_roi(self) -> float:
        return self._rolling_roi

    # ------------------------------------------------------------------
    def _update_rolling_roi(self, instantaneous_roi: float) -> None:
        if self._adjustments == 0:
            self._rolling_roi = instantaneous_roi
        else:
            beta = self.smoothing_beta
            self._rolling_roi = beta * self._rolling_roi + (1 - beta) * instantaneous_roi

    def _adjust_boring_weight(self, factor: float) -> float:
        next_weight = max(self.min_boring_weight, min(self.engine.moi_client.boring_weight * factor, self.max_boring_weight))
        self.engine.moi_client.boring_weight = next_weight
        return next_weight

    def _clamp_epsilon(self, epsilon: float) -> float:
        bounds = self.epsilon_range or {"min": 0.0, "max": 1.0}
        return max(bounds.get("min", 0.0), min(epsilon, bounds.get("max", 1.0)))

    # ------------------------------------------------------------------
    def update(self, snapshot: EconomicSnapshot, *, ledger, step: int) -> Dict[str, float]:
        """Ingest metrics and produce MoI/interval adjustments.

        Args:
            snapshot: Point-in-time economic metrics.
            ledger: EconomicLedger containing cumulative stats.
            step: Current simulation step for event logs.
        """

        instantaneous_roi = snapshot.roi
        self._update_rolling_roi(instantaneous_roi)
        totals = ledger.totals()
        overall_roi = totals.get("roi_overall", 0.0)

        adjustments: Dict[str, float] = {}
        underperforming = (
            instantaneous_roi < self.roi_floor
            or (overall_roi != float("inf") and overall_roi < self.roi_floor)
        )
        overperforming = instantaneous_roi > self.roi_target and overall_roi > self.roi_target

        if underperforming:
            new_weight = self._adjust_boring_weight(2.0)
            self.current_interval = min(self.current_interval * 2, self.max_moi_interval)
            adjustments = {"boring_weight": new_weight, "moi_interval": float(self.current_interval)}
            self.events.append(
                {
                    "action": "thermostat_roi_recovery",
                    "step": step,
                    "rolling_roi": self._rolling_roi,
                    "overall_roi": overall_roi,
                    "boring_weight": new_weight,
                    "moi_interval": self.current_interval,
                }
            )
        elif overperforming:
            new_weight = self._adjust_boring_weight(0.75)
            self.current_interval = max(self.current_interval // 2, self.min_moi_interval)
            adjustments = {"boring_weight": new_weight, "moi_interval": float(self.current_interval)}
            self.events.append(
                {
                    "action": "thermostat_roi_compound",
                    "step": step,
                    "rolling_roi": self._rolling_roi,
                    "overall_roi": overall_roi,
                    "boring_weight": new_weight,
                    "moi_interval": self.current_interval,
                }
            )

        self._adjustments += 1
        # The refreshed partition ensures any boring weight changes propagate.
        self.engine.refresh_partition(force=True)
        return adjustments

    # ------------------------------------------------------------------
    # Backwards-compatible interface expected by the simulator.
    def ingest_metrics(
        self,
        *,
        roi: float,
        fm_calls_today: int,
        cumulative_gmv: float,
        cumulative_cost: float,
    ) -> None:
        """Smooth incoming telemetry for subsequent adjustment decisions."""

        self._fm_calls_today = fm_calls_today
        # Use exponential smoothing to avoid reacting to single outliers.
        if self._adjustments == 0:
            self._gmv_ema = cumulative_gmv
            self._cost_ema = cumulative_cost
            self._rolling_roi = roi
        else:
            self._gmv_ema = (
                self.config.gmvs_smoothing_beta * self._gmv_ema
                + (1 - self.config.gmvs_smoothing_beta) * cumulative_gmv
            )
            self._cost_ema = (
                self.config.cost_smoothing_beta * self._cost_ema
                + (1 - self.config.cost_smoothing_beta) * cumulative_cost
            )
            self._update_rolling_roi(roi)

    def adjust(self) -> Dict[str, float]:
        """Return epsilon and MoI interval knobs tuned to ROI and cost."""

        epsilon = self._epsilon
        # If we're overspending on FM calls, stretch the interval to cool off.
        if (self._fm_calls_today * self.config.fm_cost_per_call) > self.config.max_daily_fm_cost:
            self.current_interval = min(self.current_interval + 1, self.max_moi_interval)
            self.events.append(
                {
                    "action": "thermostat_fm_budget_guard",
                    "fm_calls": self._fm_calls_today,
                    "interval": self.current_interval,
                }
            )

        if self._rolling_roi < self.roi_floor:
            epsilon = self._clamp_epsilon(epsilon * 1.2)
            self.current_interval = min(self.current_interval + 1, self.max_moi_interval)
            self.events.append(
                {
                    "action": "thermostat_roi_recovery",
                    "roi": self._rolling_roi,
                    "epsilon": epsilon,
                    "interval": self.current_interval,
                }
            )
        elif self._rolling_roi > self.roi_target:
            epsilon = self._clamp_epsilon(epsilon * 0.9)
            self.current_interval = max(self.current_interval - 1, self.min_moi_interval)
            self.events.append(
                {
                    "action": "thermostat_roi_compound",
                    "roi": self._rolling_roi,
                    "epsilon": epsilon,
                    "interval": self.current_interval,
                }
            )

        self._epsilon = epsilon
        self._adjustments += 1
        return {"epsilon": epsilon, "moi_interval": float(self.current_interval)}
