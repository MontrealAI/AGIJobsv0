"""Black-box tests for the meta-orchestrator router."""

from decimal import Decimal

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("fastapi.testclient")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from orchestrator.config import get_burn_fraction, get_fee_fraction
from orchestrator.models import JobIntent, OrchestrationPlan, Step
from routes.meta_orchestrator import router as meta_router

FEE_FRACTION = get_fee_fraction()
BURN_FRACTION = get_burn_fraction()


def create_app() -> FastAPI:
    app = FastAPI()
    app.include_router(meta_router)
    return app


def test_plan_simulate_execute_flow():
    app = create_app()
    client = TestClient(app)

    plan_resp = client.post(
        "/onebox/plan",
        json={"input_text": "Label 500 images for 5 AGI in 7 days"},
    )
    assert plan_resp.status_code == 200
    plan_data = plan_resp.json()
    assert plan_data["intent"]["kind"] == "post_job"
    assert plan_data["plan"]["steps"], "expected at least one step"
    assert plan_data["requiresConfirmation"] is True
    assert isinstance(plan_data["warnings"], list)
    assert plan_data["preview_summary"].endswith("Proceed?")
    assert plan_data["simulation"]["est_budget"] == plan_data["plan"]["budget"]["max"]

    simulate_resp = client.post("/onebox/simulate", json={"plan": plan_data["plan"]})
    assert simulate_resp.status_code == 200
    simulate_data = simulate_resp.json()
    assert "est_budget" in simulate_data
    assert simulate_data["confirmations"], "confirmations should be populated"

    execute_resp = client.post("/onebox/execute", json={"plan": plan_data["plan"]})
    assert execute_resp.status_code == 200
    run_id = execute_resp.json()["run_id"]

    # Poll for completion; the in-memory runner completes quickly.
    final_status = None
    for _ in range(10):
        status_resp = client.get(f"/onebox/status?run_id={run_id}")
        assert status_resp.status_code == 200
        final_status = status_resp.json()
        if final_status["run"]["state"] == "succeeded":
            break
    assert final_status is not None
    assert final_status["run"]["state"] == "succeeded"
    assert final_status["receipts"]["plan_id"] == plan_data["plan"]["plan_id"]


def _serialize_plan(plan: OrchestrationPlan) -> dict:
    return plan.model_dump(mode="json")


def _build_post_job_plan() -> OrchestrationPlan:
    intent = JobIntent(kind="post_job", title="Job", reward_agialpha="25.00", deadline_days=7)
    steps = [
        Step(id="pin_spec", name="Pin", kind="pin", tool="ipfs.pin"),
        Step(id="post_job", name="Post job", kind="chain", tool="job.post"),
    ]
    reward_decimal = Decimal("25.00")
    total_budget = (
        reward_decimal * (Decimal("1") + FEE_FRACTION + BURN_FRACTION)
    ).quantize(Decimal("0.01"))
    return OrchestrationPlan.from_intent(intent, steps, format(total_budget, "f"))


def _build_finalize_plan() -> OrchestrationPlan:
    intent = JobIntent(kind="finalize", job_id=42)
    steps = [Step(id="finalize_payout", name="Finalize", kind="finalize", tool="job.finalize")]
    return OrchestrationPlan.from_intent(intent, steps, "0")


def test_simulate_allows_finalize_with_zero_budget():
    app = create_app()
    client = TestClient(app)

    plan = _build_finalize_plan()
    response = client.post("/onebox/simulate", json={"plan": _serialize_plan(plan)})

    assert response.status_code == 200
    payload = response.json()
    assert payload["blockers"] == []


def test_simulate_blocks_post_job_without_budget():
    app = create_app()
    client = TestClient(app)

    plan = _build_post_job_plan()
    plan.budget.max = "0"
    response = client.post("/onebox/simulate", json={"plan": _serialize_plan(plan)})

    assert response.status_code == 422
    payload = response.json()
    assert payload["detail"]["code"] == "BLOCKED"
    assert "BUDGET_REQUIRED" in payload["detail"]["blockers"]
