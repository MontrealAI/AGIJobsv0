"""Dry-run and policy validation for orchestration plans."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Tuple

from .config import format_percent, get_burn_fraction, get_fee_fraction
from .models import OrchestrationPlan, SimOut

FEE_FRACTION = get_fee_fraction()
BURN_FRACTION = get_burn_fraction()
FEE_PERCENT_LABEL = format_percent(FEE_FRACTION)
BURN_PERCENT_LABEL = format_percent(BURN_FRACTION)
_TOTAL_MULTIPLIER = Decimal("1") + FEE_FRACTION + BURN_FRACTION


def _safe_decimal(value: str | None) -> Decimal:
    if not value:
        return Decimal("0")
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _estimate_budget(plan: OrchestrationPlan) -> Tuple[Decimal, Decimal]:
    total_budget = _safe_decimal(plan.budget.max)
    if total_budget <= 0:
        return total_budget, Decimal("0")

    reward = (total_budget / _TOTAL_MULTIPLIER).quantize(Decimal("0.01"))
    fees_and_burn = (total_budget - reward).quantize(Decimal("0.01"))
    return total_budget, fees_and_burn


def _requires_budget(plan: OrchestrationPlan) -> bool:
    """Return True if the plan contains an escrow/posting step."""

    for step in plan.steps:
        if step.kind != "chain":
            continue
        parts = [step.tool, step.id, step.name]
        normalized = " ".join(
            part.lower() for part in parts if isinstance(part, str) and part
        )
        if any(keyword in normalized for keyword in ("job.post", "post job", "post_job", "escrow")):
            return True
        if step.id and step.id.lower() in {"post", "post_job"}:
            return True
        if step.name and step.name.lower() in {"post", "post job"}:
            return True
    return False


def simulate_plan(plan: OrchestrationPlan) -> SimOut:
    """Return budget/time estimates and guardrail feedback."""

    total_budget, total_fees = _estimate_budget(plan)
    needs_budget = _requires_budget(plan)

    if needs_budget:
        confirmations = [
            (
                f"You’ll escrow {format(total_budget, 'f')} {plan.budget.token} "
                f"(fee {FEE_PERCENT_LABEL}, burn {BURN_PERCENT_LABEL})."
            ),
        ]
    else:
        confirmations = ["No escrow required for this plan."]
    if plan.policies.requireValidator:
        confirmations.append("This plan requires validator quorum (3 validators).")

    risks: list[str] = []
    blockers: list[str] = []

    planned_budget = _safe_decimal(plan.budget.max)
    if planned_budget <= 0 and needs_budget:
        blockers.append("BUDGET_REQUIRED")

    budget_cap = _safe_decimal(plan.budget.cap)
    if budget_cap > 0 and planned_budget > budget_cap:
        risks.append("OVER_BUDGET")
        if "OVER_BUDGET" not in blockers:
            blockers.append("OVER_BUDGET")

    return SimOut(
        est_budget=format(total_budget, "f"),
        est_fees=format(total_fees, "f"),
        est_duration=48,
        risks=risks,
        confirmations=confirmations,
        blockers=blockers,
    )

