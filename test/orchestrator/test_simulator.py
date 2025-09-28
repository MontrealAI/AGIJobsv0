import os
import sys
from decimal import Decimal

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

pytest.importorskip("pydantic")

from orchestrator.config import get_burn_fraction, get_fee_fraction
from orchestrator.models import JobIntent, OrchestrationPlan, Step
from orchestrator.simulator import simulate_plan

FEE_FRACTION = get_fee_fraction()
BURN_FRACTION = get_burn_fraction()


def _build_plan(reward: str = "50.00") -> OrchestrationPlan:
    intent = JobIntent(kind="post_job", title="Test", reward_agialpha=reward, deadline_days=7)
    steps = [
        Step(id="pin", name="Pin", kind="pin"),
        Step(id="post", name="Post", kind="chain", tool="job.post"),
    ]
    reward_decimal = Decimal(reward)
    total_budget = (
        reward_decimal * (Decimal("1") + FEE_FRACTION + BURN_FRACTION)
    ).quantize(Decimal("0.01"))
    return OrchestrationPlan.from_intent(intent, steps, format(total_budget, "f"))


def _build_finalize_plan() -> OrchestrationPlan:
    intent = JobIntent(kind="finalize", job_id=123)
    steps = [
        Step(id="finalize", name="Finalize", kind="finalize", tool="job.finalize"),
    ]
    return OrchestrationPlan.from_intent(intent, steps, "0")


def test_simulator_returns_budget_and_confirmation():
    plan = _build_plan()
    result = simulate_plan(plan)

    assert result.est_budget == "53.50"
    assert result.est_fees == "3.50"
    assert "You’ll escrow" in result.confirmations[0]
    assert not result.blockers
    assert not result.risks


def test_simulator_detects_missing_budget():
    plan = _build_plan()
    plan.budget.max = "0"
    result = simulate_plan(plan)

    assert "BUDGET_REQUIRED" in result.blockers


def test_simulator_detects_over_budget():
    plan = _build_plan(reward="150.00")
    result = simulate_plan(plan)

    assert "OVER_BUDGET" in result.risks
    assert "OVER_BUDGET" in result.blockers


def test_simulator_allows_zero_budget_for_finalize_plan():
    plan = _build_finalize_plan()
    result = simulate_plan(plan)

    assert "BUDGET_REQUIRED" not in result.blockers
    assert result.confirmations[0] == "No escrow required for this plan."
