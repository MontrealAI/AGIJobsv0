"""Synthetic environment used by the demo."""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Dict

from .config import DemoConfig


@dataclass(slots=True)
class ExpansionOutcome:
    parent_id: str
    quality_delta: float
    description: str
    metadata: Dict[str, float]


@dataclass(slots=True)
class EvaluationOutcome:
    agent_id: str
    success: bool
    reward: float
    cost: float

    @property
    def roi(self) -> float:
        return (self.reward / self.cost) if self.cost else float("inf")


class Simulator:
    """Generates stochastic expansion and evaluation results."""

    def __init__(self, config: DemoConfig, rng: random.Random) -> None:
        self.config = config
        self._rng = rng
        self._qualities: Dict[str, float] = {}

    def set_initial_quality(self, agent_id: str, quality: float) -> None:
        self._qualities[agent_id] = quality

    async def expand(self, parent_id: str) -> ExpansionOutcome:
        await asyncio.sleep(0)
        parent_quality = self._qualities.get(parent_id, 0.5)
        delta = self._rng.gauss(0, 0.08)
        child_quality = min(0.99, max(0.01, parent_quality + delta))
        metadata = {
            "parent_quality": parent_quality,
            "child_quality": child_quality,
            "expected_roi": (child_quality * self.config.success_reward) / self.config.evaluation_cost,
        }
        description = "Autonomous self-modification"
        return ExpansionOutcome(parent_id, delta, description, metadata)

    async def evaluate(self, agent_id: str) -> EvaluationOutcome:
        await asyncio.sleep(0)
        quality = self._qualities.get(agent_id, 0.5)
        success = self._rng.random() < quality
        reward = self.config.success_reward if success else 0.0
        cost = self.config.evaluation_cost
        return EvaluationOutcome(agent_id, success, reward, cost)

    def register_child(self, child_id: str, parent_id: str, delta: float) -> None:
        parent_quality = self._qualities.get(parent_id, 0.5)
        child_quality = min(0.99, max(0.01, parent_quality + delta))
        self._qualities[child_id] = child_quality

