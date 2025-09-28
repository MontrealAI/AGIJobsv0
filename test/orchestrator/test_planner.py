import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from orchestrator.models import PlanIn
from orchestrator.planner import make_plan
from orchestrator.simulator import simulate_plan


def test_make_plan_defaults_and_summary():
    plan = make_plan(PlanIn(input_text="Post a job for image labeling"))

    assert plan.intent.kind == "post_job"
    assert plan.intent.reward_agialpha == "50.00"
    assert plan.intent.deadline_days == 7
    assert plan.preview_summary.endswith("Proceed?")
    assert "DEFAULT_REWARD_APPLIED" in plan.warnings
    assert "DEFAULT_DEADLINE_APPLIED" in plan.warnings
    assert plan.requires_confirmation is True
    assert plan.plan.budget.max == "53.50"
    assert "escrowing 50.00 AGIALPHA" in plan.preview_summary
    assert "total escrow 53.50 AGIALPHA" in plan.preview_summary


def test_make_plan_non_post_job_marks_missing_fields():
    plan = make_plan(PlanIn(input_text="Please finalize payout for job 42"))

    assert plan.intent.kind == "finalize"
    assert plan.intent.job_id == 42
    assert plan.missing_fields == []
    assert plan.preview_summary.startswith("Finalize payout")
    assert plan.requires_confirmation is True


def test_make_plan_requires_job_id_for_apply():
    plan = make_plan(PlanIn(input_text="Apply to the newest job"))

    assert plan.intent.kind == "apply"
    assert plan.missing_fields == ["job_id"]
    assert plan.intent.job_id is None
    assert plan.preview_summary.startswith("Apply to job")
    assert plan.requires_confirmation is True


def test_make_plan_requires_job_id_for_submit():
    plan = make_plan(PlanIn(input_text="Submit my work for review"))

    assert plan.intent.kind == "submit"
    assert plan.missing_fields == ["job_id"]
    assert plan.intent.job_id is None
    assert plan.preview_summary.startswith("Submit deliverable for job")
    assert plan.requires_confirmation is True


def test_make_plan_requires_job_id_for_finalize():
    plan = make_plan(PlanIn(input_text="Finalize the payout now"))

    assert plan.intent.kind == "finalize"
    assert plan.missing_fields == ["job_id"]
    assert plan.intent.job_id is None
    assert plan.preview_summary.startswith("Finalize payout for job")
    assert plan.requires_confirmation is True


def test_make_plan_invalid_reward_raises():
    with pytest.raises(Exception):
        make_plan(PlanIn(input_text="Post a job with 0 AGI reward"))
    with pytest.raises(Exception):
        make_plan(PlanIn(input_text="Post a job with -5 AGI reward"))


def test_default_plan_is_within_budget():
    plan_out = make_plan(PlanIn(input_text="Post a job for image labeling"))
    sim = simulate_plan(plan_out.plan)

    assert "OVER_BUDGET" not in sim.risks
    assert sim.est_budget == plan_out.plan.budget.max
