"""Unit tests for the agent registry helpers."""

from __future__ import annotations

import time

import pytest

from orchestrator.agents import AgentRegistry, AgentUnauthorizedError
from orchestrator.models import (
    AgentCapability,
    AgentHeartbeatIn,
    AgentRegistrationIn,
    AgentSecurityControls,
    AgentStake,
    AgentUpdateIn,
    Step,
)


def _registry(tmp_path, timeout: float = 0.2) -> AgentRegistry:
    path = tmp_path / "registry.json"
    return AgentRegistry(path=path, heartbeat_timeout=timeout, watchdog_interval=timeout / 2.0)


def _registration_payload(agent_id: str, secret: str = "secret123") -> AgentRegistrationIn:
    return AgentRegistrationIn(
        agent_id=agent_id,
        owner="owner",
        region="us-east",
        capabilities=[AgentCapability.EXECUTION],
        stake=AgentStake(amount="100"),
        security=AgentSecurityControls(),
        router="default",
        operator_secret=secret,
    )


def test_register_and_list_agents(tmp_path) -> None:
    registry = _registry(tmp_path)
    created = registry.register(_registration_payload("agent-1"))
    assert created.agent_id == "agent-1"
    fetched = registry.get("agent-1")
    assert fetched.region == "us-east"
    listing = registry.list()
    assert listing.total == 1
    assert listing.agents[0].agent_id == "agent-1"


def test_heartbeat_requires_secret(tmp_path) -> None:
    registry = _registry(tmp_path)
    registry.register(_registration_payload("agent-1", secret="correct1"))
    with pytest.raises(AgentUnauthorizedError):
        registry.record_heartbeat("agent-1", AgentHeartbeatIn(secret="wrong000"))
    updated = registry.record_heartbeat("agent-1", AgentHeartbeatIn(secret="correct1"))
    assert updated.last_heartbeat is not None


def test_prepare_step_reassigns_offline_agent(tmp_path) -> None:
    registry = _registry(tmp_path)
    registry.register(_registration_payload("primary"))
    registry.update("primary", AgentUpdateIn(status="offline"))
    registry.register(_registration_payload("backup"))
    step = Step(
        id="step-1",
        name="Execute",
        kind="code",
        tool="execution",
        params={"agent": "primary"},
        needs=[],
    )
    agents, logs = registry.prepare_step(step, ["primary"])
    assert agents == ["backup"]
    assert any("reassigned" in entry for entry in logs)
    assert step.params["agent"] == "backup"


def test_watchdog_marks_agent_offline(tmp_path) -> None:
    registry = _registry(tmp_path, timeout=0.3)
    registry.register(_registration_payload("agent-1", secret="beatgood"))
    registry.record_heartbeat("agent-1", AgentHeartbeatIn(secret="beatgood"))
    time.sleep(0.7)
    status = registry.get("agent-1")
    assert status.status == "offline"
