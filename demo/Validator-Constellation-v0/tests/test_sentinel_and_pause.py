from __future__ import annotations

from validator_constellation.events import EventBus
from validator_constellation.sentinel import (
    AgentAction,
    DomainPauseController,
    SentinelMonitor,
    _hash_target,
)


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


def test_hashed_target_allowlist_and_metadata_hash():
    bus = EventBus()
    controller = DomainPauseController(
        bus,
        domains=[
            {
                "domain": "quantum",
                "human_name": "Quantum Domain",
                "budget_limit": 5_000,
                "allowed_targets": ["0xquantum-safe"],
            }
        ],
    )
    sentinel = SentinelMonitor(pause_controller=controller, event_bus=bus)
    allowed_hash = _hash_target("0xquantum-safe")

    hashed_action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="quantum",
        spend=100.0,
        call="hedge",
        target=f"0x{allowed_hash}",
        metadata={"budget": 1000.0, "targetHash": allowed_hash},
    )
    assert sentinel.evaluate(hashed_action) is None
    assert not controller.is_paused("quantum")

    metadata_only_action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="quantum",
        spend=120.0,
        call="hedge",
        metadata={"budget": 1000.0, "targetHash": allowed_hash},
    )
    assert sentinel.evaluate(metadata_only_action) is None
    assert not controller.is_paused("quantum")

    rogue_hash = _hash_target("0xunauthorized")
    rogue_action = AgentAction(
        agent="eve.agent.agi.eth",
        domain="quantum",
        spend=150.0,
        call="hedge",
        metadata={"budget": 1000.0, "targetHash": rogue_hash},
    )
    alert = sentinel.evaluate(rogue_action)
    assert alert is not None
    assert alert.rule == "UNAUTHORIZED_TARGET"
