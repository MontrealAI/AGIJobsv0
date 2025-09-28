"""Black-box tests for the meta-orchestrator router."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("fastapi.testclient")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.meta_orchestrator import router as meta_router


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
