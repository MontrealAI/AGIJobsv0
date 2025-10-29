from __future__ import annotations

from validator_constellation.events import EventBus
from validator_constellation.sentinel import AgentAction, DomainPauseController, SentinelMonitor


def test_sentinel_triggers_pause():
    bus = EventBus()
    controller = DomainPauseController(
        bus,
        domains=[
            {
                "domain": "bio",
                "human_name": "Biosecurity Domain",
                "budget_limit": 1_000,
                "unsafe_opcodes": ["SELFDESTRUCT"],
            }
        ],
    )
    sentinel = SentinelMonitor(pause_controller=controller, event_bus=bus)
    action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="bio",
        spend=1200.0,
        call="allocate_funds",
        metadata={"budget": 1000.0},
    )
    alert = sentinel.evaluate(action)
    assert alert is not None
    assert controller.is_paused("bio")
    events = list(bus.find("SentinelAlert"))
    assert events and events[0].payload["domain"] == "bio"


def test_resume_domain():
    bus = EventBus()
    controller = DomainPauseController(
        bus,
        domains=[
            {
                "domain": "bio",
                "human_name": "Biosecurity Domain",
                "budget_limit": 1_000,
            }
        ],
    )
    sentinel = SentinelMonitor(pause_controller=controller, event_bus=bus)
    controller.pause("bio", reason="test", triggered_by="pytest")
    assert controller.is_paused("bio")
    sentinel.resume_domain("bio", "owner")
    assert not controller.is_paused("bio")
    resume_events = list(bus.find("DomainResumed"))
    assert resume_events and resume_events[0].payload["operator"] == "owner"
