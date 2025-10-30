from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(slots=True)
class RolloutState:
    shadow_enabled: bool = True
    canary_percentage: float = 0.0
    paused: bool = False


def shadow_decision(state: RolloutState, job_id: str) -> bool:
    return state.shadow_enabled and not state.paused


def canary_decision(state: RolloutState, job_id: str, rng_value: float) -> bool:
    if state.paused:
        return False
    return rng_value < state.canary_percentage


def promote(state: RolloutState, step: float = 0.25) -> RolloutState:
    if state.canary_percentage >= 1.0:
        return RolloutState(shadow_enabled=False, canary_percentage=1.0, paused=False)
    new_percentage = min(1.0, state.canary_percentage + step)
    return RolloutState(shadow_enabled=new_percentage < 1.0, canary_percentage=new_percentage, paused=False)


def pause(state: RolloutState) -> RolloutState:
    return RolloutState(shadow_enabled=state.shadow_enabled, canary_percentage=state.canary_percentage, paused=True)


__all__ = ["RolloutState", "shadow_decision", "canary_decision", "promote", "pause"]
