import pytest
from fastapi import HTTPException

from orchestrator.agents import AgentAssignmentError, AgentUnauthorizedError
from routes import agents as agents_module


def test_require_owner_missing_and_invalid(monkeypatch):
    monkeypatch.delenv("AGENT_REGISTRY_OWNER_TOKEN", raising=False)
    with pytest.raises(HTTPException) as excinfo:
        agents_module.require_owner(x_owner_token="ignored")
    assert excinfo.value.status_code == 503
    assert excinfo.value.detail == "OWNER_TOKEN_NOT_CONFIGURED"

    monkeypatch.setenv("AGENT_REGISTRY_OWNER_TOKEN", "expected")
    with pytest.raises(HTTPException) as excinfo:
        agents_module.require_owner(x_owner_token="other")
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail == "OWNER_TOKEN_INVALID"


def test_handle_error_variants(monkeypatch):
    class StubRegistry:
        def update(self, agent_id, payload):
            raise AgentAssignmentError("busy")

        def record_heartbeat(self, agent_id, payload):
            raise AgentUnauthorizedError("nope")

    monkeypatch.setenv("AGENT_REGISTRY_OWNER_TOKEN", "expected")
    monkeypatch.setattr(agents_module, "get_registry", lambda: StubRegistry())

    with pytest.raises(HTTPException) as excinfo:
        agents_module.update_agent("agent-1", payload={})
    assert excinfo.value.status_code == 409
    assert excinfo.value.detail == "busy"

    with pytest.raises(HTTPException) as excinfo:
        agents_module.agent_heartbeat("agent-1", payload={"secret": "token-123"})
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "nope"
