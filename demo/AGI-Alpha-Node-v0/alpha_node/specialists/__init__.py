"""Specialist agent implementations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

from ..knowledge import KnowledgeLake, KnowledgeRecord
from ..logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class SpecialistResult:
    job_id: str
    domain: str
    strategy: str
    insight: str
    reward_delta: float


class SpecialistAgent:
    def __init__(self, name: str, description: str, risk_limit: float) -> None:
        self.name = name
        self.description = description
        self.risk_limit = risk_limit

    def execute(self, job_id: str, payload: Dict[str, float], knowledge: KnowledgeLake) -> SpecialistResult:
        raise NotImplementedError


class FinanceStrategist(SpecialistAgent):
    def execute(self, job_id: str, payload: Dict[str, float], knowledge: KnowledgeLake) -> SpecialistResult:
        baseline = sum(entry.reward_delta for entry in knowledge.search("finance")) or 1.0
        leverage = min(self.risk_limit, payload.get("capital_multiplier", 1.0))
        reward = baseline * leverage * 1.1
        insight = f"Optimized treasury flow with leverage={leverage:.2f}"
        LOGGER.info("Finance strategist executed | job=%s reward=%.2f", job_id, reward)
        return SpecialistResult(job_id, "finance", "treasury-optimizer", insight, reward)


class BiotechSynthesist(SpecialistAgent):
    def execute(self, job_id: str, payload: Dict[str, float], knowledge: KnowledgeLake) -> SpecialistResult:
        synthesis_efficiency = payload.get("synthesis_efficiency", 0.8)
        knowledge_bonus = len(knowledge.search("biotech")) + 1
        reward = synthesis_efficiency * knowledge_bonus
        insight = "Auto-synthesized candidate molecule with optimal yield"
        LOGGER.info("Biotech synthesist executed | job=%s reward=%.2f", job_id, reward)
        return SpecialistResult(job_id, "biotech", "synthesis-flow", insight, reward)


class ManufacturingOptimizer(SpecialistAgent):
    def execute(self, job_id: str, payload: Dict[str, float], knowledge: KnowledgeLake) -> SpecialistResult:
        throughput = payload.get("throughput", 100)
        waste_reduction = payload.get("waste_reduction", 0.1)
        reward = throughput * (1 - waste_reduction) * self.risk_limit
        insight = "Optimized production line with digital twin feedback"
        LOGGER.info("Manufacturing optimizer executed | job=%s reward=%.2f", job_id, reward)
        return SpecialistResult(job_id, "manufacturing", "digital-twin", insight, reward)


SPECIALIST_REGISTRY = {
    "finance": FinanceStrategist,
    "biotech": BiotechSynthesist,
    "manufacturing": ManufacturingOptimizer,
}


def build_specialist(domain: str, name: str, description: str, risk_limit: float) -> SpecialistAgent:
    cls = SPECIALIST_REGISTRY.get(domain)
    if not cls:
        raise ValueError(f"Unknown specialist domain: {domain}")
    return cls(name=name, description=description, risk_limit=risk_limit)


__all__ = [
    "SpecialistAgent",
    "FinanceStrategist",
    "BiotechSynthesist",
    "ManufacturingOptimizer",
    "SpecialistResult",
    "build_specialist",
]
