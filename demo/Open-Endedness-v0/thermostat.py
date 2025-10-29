"""Thermostat controller for the OMNI demo.

The Thermostat mirrors PR3 of the sprint plan in a compact, testable module. It
tracks rolling ROI metrics and adjusts OMNI parameters using deterministic
rules.  The implementation is intentionally transparent so a non-technical
operator can audit and tweak the rules by editing the accompanying YAML config.
"""
from __future__ import annotations

import dataclasses
import sys
from pathlib import Path
from typing import Dict, Optional

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from omni_engine import OmniCurriculumEngine


@dataclasses.dataclass
class EconomicSnapshot:
    conversions: float = 0.0
    revenue: float = 0.0
    fm_cost: float = 0.0
    intervention_cost: float = 0.0

    def roi(self) -> float:
        total_cost = self.fm_cost + self.intervention_cost
        if total_cost <= 0:
            return float("inf") if self.revenue > 0 else 0.0
        return (self.revenue - self.intervention_cost) / total_cost


class ThermostatController:
    def __init__(
        self,
        engine: OmniCurriculumEngine,
        roi_target: float,
        roi_floor: float,
        min_moi_interval: int,
        max_moi_interval: int,
    ) -> None:
        self.engine = engine
        self.roi_target = roi_target
        self.roi_floor = roi_floor
        self.min_moi_interval = min_moi_interval
        self.max_moi_interval = max_moi_interval
        self.current_interval = max_moi_interval // 2
        self._cycles_since_refresh = 0
        self.last_snapshot: Optional[EconomicSnapshot] = None

    def should_refresh_partition(self) -> bool:
        self._cycles_since_refresh += 1
        if self._cycles_since_refresh >= self.current_interval:
            self._cycles_since_refresh = 0
            return True
        return False

    def update(self, snapshot: EconomicSnapshot) -> Dict[str, float]:
        """Adjust control knobs based on ROI performance."""
        self.last_snapshot = snapshot
        roi = snapshot.roi()
        adjustments: Dict[str, float] = {}
        if roi < self.roi_floor:
            self.current_interval = min(self.max_moi_interval, self.current_interval * 2)
            adjustments["moi_interval"] = float(self.current_interval)
            self.engine.min_probability = min(self.engine.min_probability * 2, 0.05)
            adjustments["min_probability"] = self.engine.min_probability
        elif roi >= self.roi_target:
            self.current_interval = max(self.min_moi_interval, self.current_interval // 2)
            adjustments["moi_interval"] = float(self.current_interval)
            self.engine.min_probability = max(self.engine.min_probability / 2, 1e-4)
            adjustments["min_probability"] = self.engine.min_probability
        return adjustments
