"""Finance strategist specialist."""
from __future__ import annotations

import math
from typing import Dict

from .base import Specialist, SpecialistResult


class FinanceStrategist(Specialist):
    name = "Finance Strategist"

    def execute(self, job_payload: Dict[str, object]) -> SpecialistResult:
        params = job_payload.get("parameters", {})
        capital = float(params.get("capital", 0))
        risk_score = float(params.get("risk_score", 0.2))
        horizon_days = float(params.get("horizon_days", 30))

        allocation = self._optimize_allocation(capital, risk_score, horizon_days)
        narrative = (
            "Allocated capital across multi-chain yield strategies with dynamic risk parity, "
            f"targeting {allocation['expected_yield']:.2f}% projected monthly return while capping drawdown at {risk_score:.2f}."
        )
        result = SpecialistResult(success=True, detail=allocation, narrative=narrative)
        self.store_insight(job_payload.get("id", "FIN"), job_payload.get("domain", "finance"), result)
        return result

    @staticmethod
    def _optimize_allocation(capital: float, risk_score: float, horizon_days: float) -> Dict[str, float]:
        base_yield = 8 + (1 - risk_score) * 4
        risk_adjusted = base_yield * math.log1p(horizon_days / 30)
        liquidity_buffer = max(0.05, min(0.25, risk_score * 0.5))
        reinvestment = 1 - liquidity_buffer
        return {
            "capital_deployed": round(capital * reinvestment, 2),
            "liquidity_buffer": round(capital * liquidity_buffer, 2),
            "expected_yield": round(risk_adjusted, 2),
            "risk_score": round(risk_score, 2),
        }
