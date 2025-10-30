"""Finance specialist."""

from __future__ import annotations

import logging
from typing import Dict

from .base import Specialist
from ..planner import PlannerOutcome

LOGGER = logging.getLogger("agi_alpha_node_demo.specialists.finance")


class FinanceStrategist(Specialist):
    name = "finance"

    def solve(self, payload: Dict[str, str], plan: PlannerOutcome) -> Dict[str, float]:
        exposure = 0.2 if "hedge" in payload.get("objective", "").lower() else 0.4
        confidence = min(0.99, 0.7 + plan.expected_value / 10)
        result = {
            "exposure": exposure,
            "confidence": confidence,
            "summary": f"Executed capital reallocation with {confidence:.2%} confidence",
        }
        LOGGER.info("Finance strategist completed task", extra={"payload": payload, "result": result})
        return result
