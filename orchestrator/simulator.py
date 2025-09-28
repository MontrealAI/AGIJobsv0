"""Dry-run and policy validation for orchestration plans."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Tuple

from .models import OrchestrationPlan, SimOut

FEE_PCT = Decimal("0.05")
BURN_PCT = Decimal("0.02")


def _safe_decimal(value: str | None) -> Decimal:
    if not value:
        return Decimal("0")
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _estimate_budget(plan: OrchestrationPlan) -> Tuple[Decimal, Decimal]:
    reward = _safe_decimal(plan.budget.max)
    fees = (reward * FEE_PCT).quantize(Decimal("0.01"))
    burn = (reward * BURN_PCT).quantize(Decimal("0.01"))
    return reward + fees + burn, fees + burn


def simulate_plan(plan: OrchestrationPlan) -> SimOut:
    """Return budget/time estimates and guardrail feedback."""

    total_budget, total_fees = _estimate_budget(plan)
    confirmations = [
        f"You’ll escrow {plan.budget.max} AGIALPHA (fee 5%, burn 2%).",
        "This plan requires 3 validators; est duration ~48h.",
    ]

    risks: list[str] = []
    blockers: list[str] = []
    if _safe_decimal(plan.budget.max) <= 0:
        blockers.append("BUDGET_REQUIRED")
    if total_budget > _safe_decimal(plan.budget.max):
        risks.append("OVER_BUDGET")

    return SimOut(
        est_budget=format(total_budget, "f"),
        est_fees=format(total_fees, "f"),
        est_duration=48,
        risks=risks,
        confirmations=confirmations,
        blockers=blockers,
    )

