"""Tests for the agent registry FastAPI router."""

from __future__ import annotations

import pytest

try:  # pragma: no cover - optional dependency guard
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - FastAPI optional in CI
    FastAPI = None  # type: ignore
    TestClient = None  # type: ignore

from orchestrator.agents import (
    AgentAssignmentError,
    AgentUnauthorizedError,
    reset_registry,
)
from routes import agents as agents_module
from routes.agents import router


@pytest.fixture
def client(tmp_path, monkeypatch):
    if FastAPI is None or TestClient is None:  # pragma: no cover - FastAPI optional
        pytest.skip("FastAPI not available")
    path = tmp_path / "registry.json"
    if path.exists():
        path.unlink()
    monkeypatch.setenv("AGENT_REGISTRY_OWNER_TOKEN", "owner-token")
    monkeypatch.setenv("AGENT_REGISTRY_PATH", str(path))
    monkeypatch.setenv("AGENT_HEARTBEAT_TIMEOUT", "0.5")
    reset_registry()
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.skipif(FastAPI is None, reason="FastAPI not available")
def test_agent_lifecycle(client: TestClient) -> None:
    registration = {
        "agent_id": "agent-a",
        "owner": "owner",
        "region": "us-east",
        "capabilities": ["execution"],
        "stake": {"amount": "100", "token": "AGIALPHA"},
        "security": {"requires_kyc": False, "multisig": False, "isolation_level": "process"},
        "router": "default",
        "operator_secret": "secret-token",
    }
    headers = {"X-Owner-Token": "owner-token"}
    resp = client.post("/agents", json=registration, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_id"] == "agent-a"

    list_resp = client.get("/agents")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    hb_resp = client.post("/agents/agent-a/heartbeat", json={"secret": "secret-token"})
    assert hb_resp.status_code == 200

    update_resp = client.put("/agents/agent-a", json={"region": "eu-west"}, headers=headers)
    assert update_resp.status_code == 200
    assert update_resp.json()["region"] == "eu-west"

    delete_resp = client.delete("/agents/agent-a", headers=headers)
    assert delete_resp.status_code == 200

    missing = client.get("/agents/agent-a")
    assert missing.status_code == 404


@pytest.mark.skipif(FastAPI is None, reason="FastAPI not available")
def test_heartbeat_secret_validation(client: TestClient) -> None:
    headers = {"X-Owner-Token": "owner-token"}
    registration = {
        "agent_id": "agent-sec",
        "owner": "owner",
        "region": "us-east",
        "capabilities": ["execution"],
        "stake": {"amount": "100", "token": "AGIALPHA"},
        "security": {"requires_kyc": False, "multisig": False, "isolation_level": "process"},
        "router": "default",
        "operator_secret": "secret-token",
    }
    client.post("/agents", json=registration, headers=headers)
    resp = client.post("/agents/agent-sec/heartbeat", json={"secret": "badsecret"})
    assert resp.status_code == 401


@pytest.mark.skipif(FastAPI is None, reason="FastAPI not available")
def test_owner_token_enforcement(client: TestClient, monkeypatch) -> None:
    registration = {
        "agent_id": "agent-owner-check",
        "owner": "owner",
        "region": "us-east",
        "capabilities": ["execution"],
        "stake": {"amount": "100", "token": "AGIALPHA"},
        "security": {"requires_kyc": False, "multisig": False, "isolation_level": "process"},
        "router": "default",
        "operator_secret": "secret-token",
    }

    headers = {"X-Owner-Token": "owner-token"}
    monkeypatch.delenv("AGENT_REGISTRY_OWNER_TOKEN", raising=False)
    response = client.post("/agents", json=registration, headers=headers)
    assert response.status_code == 503
    assert response.json()["detail"] == "OWNER_TOKEN_NOT_CONFIGURED"

    monkeypatch.setenv("AGENT_REGISTRY_OWNER_TOKEN", "owner-token")
    bad_headers = {"X-Owner-Token": "wrong"}
    response = client.post("/agents", json=registration, headers=bad_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "OWNER_TOKEN_INVALID"


@pytest.mark.skipif(FastAPI is None, reason="FastAPI not available")
def test_error_mapping_for_registry_failures(client: TestClient, monkeypatch) -> None:
    class ExplodingRegistry:
        def update(self, agent_id, payload):
            raise AgentAssignmentError("busy")

        def record_heartbeat(self, agent_id, payload):
            raise AgentUnauthorizedError("bad secret")

    monkeypatch.setattr(agents_module, "get_registry", lambda: ExplodingRegistry())

    headers = {"X-Owner-Token": "owner-token"}
    resp = client.put("/agents/agent-a", json={"region": "eu"}, headers=headers)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "busy"

    hb_resp = client.post("/agents/agent-a/heartbeat", json={"secret": "token-123"})
    assert hb_resp.status_code == 401
    assert hb_resp.json()["detail"] == "bad secret"
