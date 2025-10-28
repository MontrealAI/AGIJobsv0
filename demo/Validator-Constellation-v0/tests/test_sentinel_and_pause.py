from __future__ import annotations

from validator_constellation.events import EventBus
from validator_constellation.sentinel import AgentAction, DomainPauseController, SentinelMonitor, SentinelRule


def test_sentinel_triggers_pause():
    bus = EventBus()
    controller = DomainPauseController(bus)
    sentinel = SentinelMonitor(
        rules=[
            SentinelRule(
                name="budget-overrun",
                description="Agent spend exceeded allocated budget",
                predicate=lambda action: action.spend > action.metadata.get("budget", 0),
            )
        ],
        pause_controller=controller,
        event_bus=bus,
    )
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
    controller = DomainPauseController(bus)
    sentinel = SentinelMonitor([], controller, bus)
    controller.pause("bio", "test")
    assert controller.is_paused("bio")
    sentinel.resume_domain("bio", "owner")
    assert not controller.is_paused("bio")
    resume_events = list(bus.find("DomainResumed"))
    assert resume_events and resume_events[0].payload["operator"] == "owner"
