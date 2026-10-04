"""Live execution must never become successful simulation or duplicate effects."""
import subprocess
from unittest.mock import Mock

import pytest

from orchestrator.models import Step
from orchestrator.tools import executors as ex


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_MODE", "node")
    scoreboard = Mock()
    monkeypatch.setattr(ex, "_SCOREBOARD", scoreboard)
    monkeypatch.setattr(ex._PHASE6_RUNTIME, "annotate_step", lambda step: [])
    return ex.StepExecutor(ex.RetryPolicy(attempts=3, backoff=0)), scoreboard


def step(tool="job.post"):
    return Step(id="one", name="Create fixture", kind="chain", tool=tool, params={})


def test_missing_node_fails_without_success_credit(setup, monkeypatch):
    executor, scoreboard = setup
    monkeypatch.setattr(ex._NODE_BRIDGE, "_is_supported", lambda: False)
    result = executor.execute(step())
    assert not result.success
    assert result.attempts == 1
    assert "unavailable" in " ".join(result.logs)
    assert scoreboard.record_result.call_args.kwargs["success"] is False


def test_missing_bridge_fails_in_node_mode(setup, monkeypatch, tmp_path):
    executor, _ = setup
    monkeypatch.setattr(ex._NODE_BRIDGE, "_is_supported", lambda: True)
    monkeypatch.setenv("ORCHESTRATOR_JS_BRIDGE", str(tmp_path / "missing.mjs"))
    assert not executor.execute(step()).success


@pytest.mark.parametrize("mode", ["node", "auto"])
@pytest.mark.parametrize("outcome", ["timeout", "nonzero", "empty"])
def test_dispatched_failure_never_retries_or_simulates(setup, monkeypatch, tmp_path, mode, outcome):
    executor, _ = setup
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_MODE", mode)
    monkeypatch.setattr(ex._NODE_BRIDGE, "_is_supported", lambda: True)
    bridge = tmp_path / "bridge.mjs"
    bridge.write_text("// synthetic test bridge")
    monkeypatch.setenv("ORCHESTRATOR_JS_BRIDGE", str(bridge))
    invoke = Mock()
    if outcome == "timeout":
        invoke.side_effect = subprocess.TimeoutExpired("node", 120)
    else:
        invoke.return_value = subprocess.CompletedProcess([], 1 if outcome == "nonzero" else 0, b"", b"")
    monkeypatch.setattr(ex.subprocess, "run", invoke)
    result = executor.execute(step())
    assert not result.success and not result.simulated
    assert result.attempts == 1
    assert invoke.call_count == 1
    assert invoke.call_args.kwargs["timeout"] == 120
    assert "reconcile" in " ".join(result.logs)


@pytest.mark.parametrize("mode", ["auto", "python"])
def test_demo_simulation_is_explicit_and_does_not_inflate_worker_score(setup, monkeypatch, mode):
    executor, scoreboard = setup
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_MODE", mode)
    monkeypatch.setattr(ex._NODE_BRIDGE, "_is_supported", lambda: False)
    result = executor.execute(step())
    assert result.success and result.simulated
    assert "SIMULATION" in " ".join(result.logs)
    scoreboard.record_result.assert_not_called()


def test_unknown_live_tool_and_misspelled_mode_fail_closed(setup, monkeypatch):
    executor, _ = setup
    assert not executor.execute(step("unregistered")).success
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_MODE", "n ode")
    assert not executor.execute(step()).success


def test_invalid_timeout_cannot_become_auto_simulation(setup, monkeypatch, tmp_path):
    executor, _ = setup
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_MODE", "auto")
    monkeypatch.setenv("ORCHESTRATOR_BRIDGE_TIMEOUT_SECONDS", "unbounded")
    monkeypatch.setattr(ex._NODE_BRIDGE, "_is_supported", lambda: True)
    bridge = tmp_path / "bridge.mjs"
    bridge.write_text("// fixture")
    monkeypatch.setenv("ORCHESTRATOR_JS_BRIDGE", str(bridge))
    result = executor.execute(step())
    assert not result.success and not result.simulated
    assert result.attempts == 1
