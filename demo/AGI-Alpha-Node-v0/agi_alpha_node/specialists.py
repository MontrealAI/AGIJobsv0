"""Specialist agent implementations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Protocol
import logging
import random

from .knowledge import KnowledgeLake

LOGGER = logging.getLogger(__name__)


class Specialist(Protocol):
    domain: str

    def execute(self, job: Dict[str, object]) -> Dict[str, object]:
        ...


@dataclass
class SpecialistBase:
    domain: str
    knowledge: KnowledgeLake

    def _record_success(self, job_id: str, reward: float, insights: Dict[str, object]) -> None:
        LOGGER.info(
            "Specialist completed job",
            extra={"job_id": job_id, "domain": self.domain, "reward": reward},
        )
        self.knowledge.store(self.domain, job_id, {"reward": reward, "insights": insights})


class FinanceStrategist(SpecialistBase):
    def execute(self, job: Dict[str, object]) -> Dict[str, object]:
        alpha = random.uniform(0.01, 0.05)
        reward = float(job.get("reward", 0)) * (1 + alpha)
        insights = {
            "alpha": alpha,
            "hedge_ratio": random.uniform(0.3, 0.7),
        }
        self._record_success(str(job["job_id"]), reward, insights)
        return {"job_id": job["job_id"], "domain": self.domain, "reward": reward, "insights": insights}


class BiotechSynthesist(SpecialistBase):
    def execute(self, job: Dict[str, object]) -> Dict[str, object]:
        breakthrough = random.choice(["folded", "optimized", "stabilized"])
        reward = float(job.get("reward", 0)) * random.uniform(1.1, 1.4)
        insights = {
            "breakthrough": breakthrough,
            "protein_score": random.uniform(0.8, 0.99),
        }
        self._record_success(str(job["job_id"]), reward, insights)
        return {"job_id": job["job_id"], "domain": self.domain, "reward": reward, "insights": insights}


class ManufacturingOptimizer(SpecialistBase):
    def execute(self, job: Dict[str, object]) -> Dict[str, object]:
        efficiency_gain = random.uniform(0.05, 0.2)
        reward = float(job.get("reward", 0)) * (1 + efficiency_gain)
        insights = {
            "efficiency_gain": efficiency_gain,
            "throughput_multiplier": 1 + efficiency_gain,
        }
        self._record_success(str(job["job_id"]), reward, insights)
        return {"job_id": job["job_id"], "domain": self.domain, "reward": reward, "insights": insights}


def build_specialists(knowledge: KnowledgeLake) -> Dict[str, Specialist]:
    return {
        "finance": FinanceStrategist("finance", knowledge),
        "biotech": BiotechSynthesist("biotech", knowledge),
        "manufacturing": ManufacturingOptimizer("manufacturing", knowledge),
    }


__all__ = [
    "Specialist",
    "FinanceStrategist",
    "BiotechSynthesist",
    "ManufacturingOptimizer",
    "build_specialists",
]
