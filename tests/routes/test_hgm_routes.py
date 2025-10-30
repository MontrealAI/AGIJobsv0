from __future__ import annotations

import os

from fastapi.testclient import TestClient

from backend.database import get_database
from backend.models.hgm import HgmRepository, seed_demo_run
from services.meta_api.app.main import create_app

os.environ.setdefault("RPC_URL", "http://localhost:8545")
os.environ.setdefault("AGENT_REGISTRY_OWNER_TOKEN", "test-token")


def test_rest_endpoints_expose_lineage() -> None:
    repo = HgmRepository(get_database())
    seed_demo_run(repo, run_id="demo-rest")
    app = create_app()
    client = TestClient(app)

    runs = client.get("/hgm/runs").json()
    assert any(run["run_id"] == "demo-rest" for run in runs)

    lineage = client.get("/hgm/runs/demo-rest/lineage").json()
    assert lineage
    assert lineage[0]["agentKey"] == "root"

    seeded = client.post("/hgm/runs/demo-seed").json()
    assert seeded["run_id"] == "demo-run"


def test_graphql_lineage_endpoint() -> None:
    repo = HgmRepository(get_database())
    seed_demo_run(repo, run_id="demo-graphql")
    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/hgm/graphql",
        json={"query": '{ lineage(runId: "demo-graphql") { agentKey } }'},
    )
    payload = response.json()
    assert "data" in payload
    assert payload["data"]["lineage"][0]["agentKey"] == "root"
