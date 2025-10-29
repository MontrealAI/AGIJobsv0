"""Finance strategist specialist."""
from __future__ import annotations

import random
from decimal import Decimal
from typing import Dict

from .base import BaseSpecialist


class FinanceStrategist(BaseSpecialist):
    name = "finance_strategist"

    def evaluate(self, job_payload: Dict[str, str]):  # type: ignore[override]
        risk = float(job_payload.get("risk", 0.2))
        capital_efficiency = float(job_payload.get("capital_efficiency", 1.5))
        base_reward = float(job_payload.get("base_reward", 10.0))
        alpha = Decimal(base_reward * capital_efficiency) * Decimal(1 - risk)
        volatility = random.uniform(0.85, 1.2)
        reward_estimate = float(alpha * Decimal(volatility))
        outcome = f"Structured reinvestment plan delivering {reward_estimate:.2f} AGIALPHA"
        metadata = {
            "capital_efficiency": f"{capital_efficiency:.2f}",
            "risk": f"{risk:.2f}",
            "volatility": f"{volatility:.3f}",
        }
        return self._result(job_payload["job_id"], outcome, reward_estimate, metadata)
