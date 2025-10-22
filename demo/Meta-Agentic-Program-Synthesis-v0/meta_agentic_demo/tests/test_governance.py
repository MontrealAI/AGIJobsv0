from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from meta_agentic_demo.admin import OwnerConsole
from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.governance import GovernanceTimelock


def test_timelock_executes_actions_after_delay() -> None:
    console = OwnerConsole(DemoConfig())
    timelock = GovernanceTimelock(default_delay=timedelta(seconds=5))
    action = timelock.schedule("update_reward_policy", {"total_reward": 2000})
    assert action.status == "QUEUED"
    timelock.execute_due(console, now=action.eta - timedelta(seconds=1))
    assert console.config.reward_policy.total_reward != 2000
    executed = list(timelock.execute_due(console, now=action.eta + timedelta(seconds=1)))
    assert executed
    assert console.config.reward_policy.total_reward == 2000
    assert executed[0].status == "EXECUTED"


def test_timelock_can_cancel_prior_to_execution() -> None:
    console = OwnerConsole(DemoConfig())
    timelock = GovernanceTimelock()
    action = timelock.schedule("set_paused", {"value": True}, delay=timedelta(seconds=10))
    cancelled = timelock.cancel(action.action_id)
    assert cancelled.status == "CANCELLED"
    timelock.execute_due(console, now=datetime.now(UTC) + timedelta(seconds=15))
    assert console.is_paused is False


def test_timelock_rejects_unknown_action() -> None:
    timelock = GovernanceTimelock()
    with pytest.raises(ValueError):
        timelock.schedule("unknown", {})


def test_timelock_handles_verification_override() -> None:
    console = OwnerConsole(DemoConfig())
    timelock = GovernanceTimelock()
    action = timelock.schedule(
        "update_verification_policy",
        {"holdout_threshold": 0.9, "divergence_tolerance": 0.1},
    )
    assert action.status == "QUEUED"
    executed = list(timelock.execute_due(console, now=action.eta))
    assert executed and executed[0].status == "EXECUTED"
    policy = console.config.verification_policy
    assert pytest.approx(policy.holdout_threshold) == 0.9
    assert pytest.approx(policy.divergence_tolerance) == 0.1


def test_timelock_applies_scenario_update() -> None:
    base_scenario = DemoScenario(
        identifier="alpha",
        title="Alpha",
        description="",
        target_metric="score",
        success_threshold=0.5,
    )
    console = OwnerConsole(DemoConfig(scenarios=[base_scenario]))
    timelock = GovernanceTimelock()
    payload = {
        "mode": "replace",
        "scenarios": [
            {
                "identifier": "gamma",
                "title": "Gamma Horizon",
                "description": "Autonomous expansion initiative",
                "target_metric": "expansion",
                "success_threshold": 0.74,
                "dataset_profile": {"length": 40, "noise": 0.05, "seed": 808},
                "stress_multiplier": 1.3,
            }
        ],
    }
    action = timelock.schedule("set_scenarios", payload)
    executed = list(timelock.execute_due(console, now=action.eta))
    assert executed and executed[0].status == "EXECUTED"
    scenarios = console.config.scenarios
    assert len(scenarios) == 1
    assert scenarios[0].identifier == "gamma"
    assert pytest.approx(scenarios[0].success_threshold) == 0.74
