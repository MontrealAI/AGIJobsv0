from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from meta_agentic_demo.admin import OwnerConsole
from meta_agentic_demo.config import DemoConfig
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
