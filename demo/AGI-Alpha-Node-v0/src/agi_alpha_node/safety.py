"""Safety rails & pause management."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .config import SafetyConfig

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class SafetyState:
    paused: bool = False
    reason: str | None = None


class SafetyManager:
    def __init__(self, config: SafetyConfig):
        self.config = config
        self.state = SafetyState()

    def pause(self, reason: str) -> None:
        if not self.state.paused:
            LOGGER.warning("System paused", extra={"event": "safety_pause", "data": {"reason": reason}})
        self.state.paused = True
        self.state.reason = reason

    def resume(self) -> None:
        if self.state.paused:
            LOGGER.info("System resumed", extra={"event": "safety_resume"})
        self.state.paused = False
        self.state.reason = None

    def ensure_active(self) -> None:
        if self.state.paused:
            raise RuntimeError(f"Node is paused: {self.state.reason}")


__all__ = ["SafetyManager", "SafetyState"]
