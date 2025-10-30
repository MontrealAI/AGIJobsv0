from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Protocol

from ..knowledge.lake import KnowledgeLake


@dataclass(slots=True)
class SpecialistResult:
    job_id: str
    specialist: str
    summary: str
    reward_delta: float


class Specialist(Protocol):
    name: str

    def process(self, job: Dict[str, str], knowledge: KnowledgeLake) -> SpecialistResult:
        ...


class FinanceStrategist:
    name = "finance"

    def process(self, job: Dict[str, str], knowledge: KnowledgeLake) -> SpecialistResult:
        capital = float(job.get("capital", "0"))
        risk = float(job.get("risk", "0.1"))
        knowledge.add_entry("finance", f"Processed capital {capital} at risk {risk}")
        alpha = max(0.0, capital * (1 - risk)) * 0.05
        return SpecialistResult(job_id=job["id"], specialist=self.name, summary="Capital allocated", reward_delta=alpha)


class BiotechSynthesist:
    name = "biotech"

    def process(self, job: Dict[str, str], knowledge: KnowledgeLake) -> SpecialistResult:
        complexity = float(job.get("complexity", "1"))
        iterations = int(job.get("iterations", "1"))
        knowledge.add_entry("biotech", f"Ran synthesis complexity={complexity}")
        reward = max(0.0, (1.0 / (1.0 + math.exp(-complexity))) * iterations)
        return SpecialistResult(job_id=job["id"], specialist=self.name, summary="Synth pipeline completed", reward_delta=reward)


class ManufacturingOptimizer:
    name = "manufacturing"

    def process(self, job: Dict[str, str], knowledge: KnowledgeLake) -> SpecialistResult:
        throughput = float(job.get("throughput", "1"))
        waste = float(job.get("waste", "0.05"))
        score = max(0.0, throughput * (1 - waste))
        knowledge.add_entry("manufacturing", f"Optimized throughput={throughput}")
        return SpecialistResult(job_id=job["id"], specialist=self.name, summary="Line balanced", reward_delta=score)


SPECIALISTS = {
    "finance": FinanceStrategist(),
    "biotech": BiotechSynthesist(),
    "manufacturing": ManufacturingOptimizer(),
}


def get_specialist(domain: str) -> Specialist:
    try:
        return SPECIALISTS[domain]
    except KeyError as exc:  # pragma: no cover - defensive branch
        raise KeyError(f"Unsupported specialist domain: {domain}") from exc


__all__ = [
    "BiotechSynthesist",
    "FinanceStrategist",
    "ManufacturingOptimizer",
    "SPECIALISTS",
    "Specialist",
    "SpecialistResult",
    "get_specialist",
]
